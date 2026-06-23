import { pool } from '../config/database';

export interface BlogPostRecord {
  pk_blog_post: string;
  post_slug: string;
  post_title: string;
  post_excerpt: string | null;
  post_body: string;
  post_hero_image_url: string | null;
  post_author_name: string | null;
  fk_blog_post_author: string | null;
  post_tags: string[];
  is_published: boolean;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * Public list — published posts only, paginated, newest first.
 */
export async function listPublished(opts: {
  page: number;
  limit: number;
  tag?: string;
}): Promise<{ items: BlogPostRecord[]; total: number }> {
  const where: string[] = ['is_deleted = false', 'is_published = true', 'published_at <= NOW()'];
  const params: unknown[] = [];
  if (opts.tag) {
    params.push(JSON.stringify([opts.tag]));
    where.push(`post_tags @> $${params.length}::jsonb`);
  }
  const offset = (opts.page - 1) * opts.limit;
  params.push(opts.limit, offset);

  const sql = `
    SELECT *, COUNT(*) OVER() AS _total_count
    FROM blog_post
    WHERE ${where.join(' AND ')}
    ORDER BY published_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await pool.query<BlogPostRecord & { _total_count: string }>(sql, params);
  const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count, 10) : 0;
  const items = result.rows.map((row) => {
    const { _total_count: _t, ...rest } = row;
    return rest as BlogPostRecord;
  });
  return { items, total };
}

/**
 * Public — fetch a published post by slug. Returns null for drafts so the
 * public API never reveals the existence of unpublished URLs.
 */
export async function findPublishedBySlug(slug: string): Promise<BlogPostRecord | null> {
  const result = await pool.query<BlogPostRecord>(
    `SELECT * FROM blog_post
     WHERE post_slug = $1
       AND is_deleted = false
       AND is_published = true
       AND published_at <= NOW()`,
    [slug]
  );
  return result.rows[0] || null;
}

/**
 * Admin — list all posts including drafts.
 */
export async function listAll(opts: {
  page: number;
  limit: number;
  publishedOnly?: boolean;
}): Promise<{ items: BlogPostRecord[]; total: number }> {
  const where: string[] = ['is_deleted = false'];
  const params: unknown[] = [];
  if (opts.publishedOnly) {
    where.push('is_published = true');
  }
  const offset = (opts.page - 1) * opts.limit;
  params.push(opts.limit, offset);

  const sql = `
    SELECT *, COUNT(*) OVER() AS _total_count
    FROM blog_post
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(published_at, created_at) DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await pool.query<BlogPostRecord & { _total_count: string }>(sql, params);
  const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count, 10) : 0;
  const items = result.rows.map((row) => {
    const { _total_count: _t, ...rest } = row;
    return rest as BlogPostRecord;
  });
  return { items, total };
}

export async function findById(id: string): Promise<BlogPostRecord | null> {
  const result = await pool.query<BlogPostRecord>(
    'SELECT * FROM blog_post WHERE pk_blog_post = $1 AND is_deleted = false',
    [id]
  );
  return result.rows[0] || null;
}

export interface CreateBlogPostInput {
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  heroImageUrl: string | null;
  authorName: string | null;
  authorUserId: string | null;
  tags: string[];
  isPublished: boolean;
  publishedAt: Date | null;
  createdBy: string;
}

export async function create(data: CreateBlogPostInput): Promise<BlogPostRecord> {
  const result = await pool.query<BlogPostRecord>(
    `INSERT INTO blog_post (
       post_slug, post_title, post_excerpt, post_body, post_hero_image_url,
       post_author_name, fk_blog_post_author, post_tags,
       is_published, published_at, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
     RETURNING *`,
    [
      data.slug,
      data.title,
      data.excerpt,
      data.body,
      data.heroImageUrl,
      data.authorName,
      data.authorUserId,
      JSON.stringify(data.tags),
      data.isPublished,
      data.publishedAt,
      data.createdBy,
    ]
  );
  return result.rows[0];
}

export type UpdateBlogPostInput = Partial<Omit<CreateBlogPostInput, 'createdBy'>> & {
  updatedBy: string;
};

export async function update(id: string, data: UpdateBlogPostInput): Promise<BlogPostRecord | null> {
  const set: string[] = [];
  const params: unknown[] = [];
  function add(column: string, value: unknown) {
    params.push(value);
    set.push(`${column} = $${params.length}`);
  }
  if (data.slug !== undefined)         add('post_slug', data.slug);
  if (data.title !== undefined)        add('post_title', data.title);
  if (data.excerpt !== undefined)      add('post_excerpt', data.excerpt);
  if (data.body !== undefined)         add('post_body', data.body);
  if (data.heroImageUrl !== undefined) add('post_hero_image_url', data.heroImageUrl);
  if (data.authorName !== undefined)   add('post_author_name', data.authorName);
  if (data.authorUserId !== undefined) add('fk_blog_post_author', data.authorUserId);
  if (data.tags !== undefined) {
    params.push(JSON.stringify(data.tags));
    set.push(`post_tags = $${params.length}::jsonb`);
  }
  if (data.isPublished !== undefined)  add('is_published', data.isPublished);
  if (data.publishedAt !== undefined)  add('published_at', data.publishedAt);
  add('updated_by', data.updatedBy);

  if (set.length === 1 /* only updated_by */) {
    return findById(id);
  }

  params.push(id);
  const sql = `UPDATE blog_post SET ${set.join(', ')} WHERE pk_blog_post = $${params.length} AND is_deleted = false RETURNING *`;
  const result = await pool.query<BlogPostRecord>(sql, params);
  return result.rows[0] || null;
}

export async function softDelete(id: string, deletedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE blog_post SET is_deleted = true, updated_by = $2, is_published = false
     WHERE pk_blog_post = $1 AND is_deleted = false`,
    [id, deletedBy]
  );
  return (result.rowCount || 0) > 0;
}
