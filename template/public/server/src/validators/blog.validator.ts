import { z } from 'zod';

// Slugs must match the DB CHECK: ^[a-z0-9]+(?:-[a-z0-9]+)*$ — lowercase
// alphanumeric and dashes, no leading/trailing/double-dashes.
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseBody = {
  slug: z.string().trim().min(1).max(200).regex(slugRegex, 'Slug must be lowercase a-z, 0-9, dashes only'),
  title: z.string().trim().min(1).max(300),
  excerpt: z.string().trim().max(800).nullable().optional(),
  body: z.string().min(1),
  heroImageUrl: z.string().trim().url().max(2048).nullable().optional(),
  authorName: z.string().trim().max(255).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
};

export const listPublicSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    tag: z.string().trim().min(1).max(60).optional(),
  }),
};

export const slugParamSchema = {
  params: z.object({
    slug: z.string().regex(slugRegex, 'Invalid slug'),
  }),
};

export const adminIdParamSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid post id'),
  }),
};

export const listAdminSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    publishedOnly: z.coerce.boolean().optional(),
  }),
};

export const createPostSchema = {
  body: z.object(baseBody),
};

export const updatePostSchema = {
  params: z.object({ id: z.string().regex(uuidRegex, 'Invalid post id') }),
  body: z.object({
    slug: baseBody.slug.optional(),
    title: baseBody.title.optional(),
    excerpt: baseBody.excerpt,
    body: baseBody.body.optional(),
    heroImageUrl: baseBody.heroImageUrl,
    authorName: baseBody.authorName,
    tags: baseBody.tags,
    isPublished: baseBody.isPublished,
    publishedAt: baseBody.publishedAt,
  }),
};
