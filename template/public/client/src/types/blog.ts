/**
 * Client-side blog post types.
 * Mirrors the server-side blog post entity (snake_case fields).
 */

export interface BlogPost {
  pk_blog_post: string
  post_slug: string
  post_title: string
  post_excerpt: string | null
  post_body: string
  post_hero_image_url: string | null
  post_author_name: string | null
  post_tags: string[]
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface BlogListParams {
  page?: number
  limit?: number
  tag?: string
}

export interface AdminBlogListParams {
  page?: number
  limit?: number
  publishedOnly?: boolean
}

export interface CreateBlogPostPayload {
  slug: string
  title: string
  excerpt?: string | null
  body: string
  heroImageUrl?: string | null
  authorName?: string | null
  tags?: string[]
  isPublished?: boolean
  publishedAt?: string | null
}

export type UpdateBlogPostPayload = Partial<CreateBlogPostPayload>
