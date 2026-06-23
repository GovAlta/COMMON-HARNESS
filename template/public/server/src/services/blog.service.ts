import crypto from 'crypto';
import * as blogModel from '../models/blog.model';
import * as userModel from '../models/user.model';
import { AppError } from '../utils/app-error';
import { logAuditEvent } from '../utils/audit-logger';
import type { BlogPostRecord, CreateBlogPostInput, UpdateBlogPostInput } from '../models/blog.model';

export async function listPublished(page: number, limit: number, tag?: string) {
  return blogModel.listPublished({ page, limit, tag });
}

export async function findPublishedBySlug(slug: string): Promise<BlogPostRecord> {
  const post = await blogModel.findPublishedBySlug(slug);
  if (!post) {
    throw AppError.notFound('Post not found');
  }
  return post;
}

export async function listAll(page: number, limit: number, publishedOnly: boolean) {
  return blogModel.listAll({ page, limit, publishedOnly });
}

export async function findById(id: string): Promise<BlogPostRecord> {
  const post = await blogModel.findById(id);
  if (!post) {
    throw AppError.notFound('Post not found');
  }
  return post;
}

interface CreateInput {
  slug: string;
  title: string;
  excerpt?: string | null;
  body: string;
  heroImageUrl?: string | null;
  tags?: string[];
  isPublished?: boolean;
  publishedAt?: string | null;
}

/**
 * Resolve "author name" automatically from the actor's user_account row if
 * one isn't supplied. Keeps the admin form simple while still recording the
 * authorship trail.
 */
async function resolveAuthor(userId: string, providedName?: string | null): Promise<{ name: string | null; userId: string }> {
  if (providedName) return { name: providedName, userId };
  const user = await userModel.findById(userId);
  return { name: user?.user_display_name || null, userId };
}

export async function create(
  input: CreateInput & { authorName?: string | null },
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<BlogPostRecord> {
  const { name: authorName, userId: authorUserId } = await resolveAuthor(actorUserId, input.authorName);

  const data: CreateBlogPostInput = {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt ?? null,
    body: input.body,
    heroImageUrl: input.heroImageUrl ?? null,
    authorName,
    authorUserId,
    tags: input.tags ?? [],
    isPublished: input.isPublished ?? false,
    publishedAt: input.isPublished
      ? (input.publishedAt ? new Date(input.publishedAt) : new Date())
      : null,
    createdBy: actorUserId,
  };

  let created: BlogPostRecord;
  try {
    created = await blogModel.create(data);
  } catch (err) {
    // 23505 = unique constraint violation on post_slug
    if ((err as { code?: string }).code === '23505') {
      throw AppError.validation([{ field: 'slug', message: 'A post with this slug already exists.' }]);
    }
    throw err;
  }

  await logAuditEvent({
    action: 'INSERT',
    tableName: 'blog_post',
    recordId: created.pk_blog_post,
    userId: actorUserId,
    ipAddress,
    userAgent,
    newData: { slug: created.post_slug, title: created.post_title, isPublished: created.is_published },
  });

  return created;
}

export async function update(
  id: string,
  input: Partial<CreateInput> & { authorName?: string | null },
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<BlogPostRecord> {
  const existing = await blogModel.findById(id);
  if (!existing) throw AppError.notFound('Post not found');

  const data: UpdateBlogPostInput = { updatedBy: actorUserId };
  if (input.slug !== undefined)         data.slug = input.slug;
  if (input.title !== undefined)        data.title = input.title;
  if (input.excerpt !== undefined)      data.excerpt = input.excerpt;
  if (input.body !== undefined)         data.body = input.body;
  if (input.heroImageUrl !== undefined) data.heroImageUrl = input.heroImageUrl;
  if (input.authorName !== undefined)   data.authorName = input.authorName;
  if (input.tags !== undefined)         data.tags = input.tags;

  if (input.isPublished !== undefined) {
    data.isPublished = input.isPublished;
    if (input.isPublished && !existing.is_published) {
      // Flipping to published — stamp published_at unless caller supplied one.
      data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
    } else if (!input.isPublished) {
      data.publishedAt = null;
    } else if (input.publishedAt !== undefined) {
      data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
    }
  } else if (input.publishedAt !== undefined) {
    data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  }

  let updated: BlogPostRecord | null;
  try {
    updated = await blogModel.update(id, data);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw AppError.validation([{ field: 'slug', message: 'A post with this slug already exists.' }]);
    }
    throw err;
  }
  if (!updated) throw AppError.notFound('Post not found');

  await logAuditEvent({
    action: 'UPDATE',
    tableName: 'blog_post',
    recordId: id,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: { slug: existing.post_slug, title: existing.post_title, isPublished: existing.is_published },
    newData: { slug: updated.post_slug, title: updated.post_title, isPublished: updated.is_published },
  });

  return updated;
}

/**
 * Clone an existing blog post. The new row:
 *   - gets a fresh pk_blog_post (DB default)
 *   - title gets " (DRAFT)" appended
 *   - is_published = false; published_at cleared
 *   - slug becomes `${original}-draft`; on UNIQUE collision we retry once with
 *     a 6-char hex suffix. A second collision raises a clear validation error
 *     rather than looping indefinitely (per spec).
 *   - created_by / updated_by stamped to the actor
 *   - audit row INSERT with metadata { clone_of: <originalId> }
 */
export async function cloneBlogPost(
  originalId: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<BlogPostRecord> {
  const foundOriginal = await blogModel.findById(originalId);
  if (!foundOriginal) throw AppError.notFound('Post not found');
  // Local alias whose type stays narrow inside the nested closure below; TS
  // does not propagate narrowing of `let`-style locals into inner functions.
  const original: BlogPostRecord = foundOriginal;

  const baseSlug = `${original.post_slug}-draft`;

  // Slug generation strategy: try `${slug}-draft` first; on UNIQUE violation
  // retry once with a 6-char hex suffix; surface a clean error on the second
  // collision. We don't loop further — the suffix space is 16M, a third
  // collision indicates something genuinely wrong (or someone is fuzzing).
  async function attemptCreate(slugAttempt: string): Promise<BlogPostRecord> {
    return blogModel.create({
      slug: slugAttempt,
      title: `${original.post_title} (DRAFT)`,
      excerpt: original.post_excerpt,
      body: original.post_body,
      heroImageUrl: original.post_hero_image_url,
      authorName: original.post_author_name,
      authorUserId: original.fk_blog_post_author,
      tags: Array.isArray(original.post_tags) ? original.post_tags : [],
      isPublished: false,
      publishedAt: null,
      createdBy: actorUserId,
    });
  }

  let clone: BlogPostRecord;
  try {
    clone = await attemptCreate(baseSlug);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      // First collision — append 6 hex chars of randomness and retry once.
      const suffix = crypto.randomBytes(3).toString('hex');
      try {
        clone = await attemptCreate(`${baseSlug}-${suffix}`);
      } catch (err2) {
        if ((err2 as { code?: string }).code === '23505') {
          throw AppError.validation([{
            field: 'slug',
            message: 'Could not generate a unique slug for the cloned post. Please try again.',
          }]);
        }
        throw err2;
      }
    } else {
      throw err;
    }
  }

  await logAuditEvent({
    action: 'INSERT',
    tableName: 'blog_post',
    recordId: clone.pk_blog_post,
    userId: actorUserId,
    ipAddress,
    userAgent,
    newData: { slug: clone.post_slug, title: clone.post_title, isPublished: clone.is_published },
    metadata: { clone_of: originalId },
  });

  return clone;
}

export async function softDelete(
  id: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const existing = await blogModel.findById(id);
  if (!existing) throw AppError.notFound('Post not found');
  const ok = await blogModel.softDelete(id, actorUserId);
  if (!ok) throw AppError.notFound('Post not found');
  await logAuditEvent({
    action: 'DELETE',
    tableName: 'blog_post',
    recordId: id,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: { slug: existing.post_slug, title: existing.post_title },
  });
}
