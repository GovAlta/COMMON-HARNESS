import { describe, it, expect } from 'vitest'
import { blogPosts } from '@/data/blogPosts'

describe('blogPosts', () => {
  it('has 5 blog posts', () => {
    expect(blogPosts).toHaveLength(5)
  })

  it('each post has required fields', () => {
    for (const post of blogPosts) {
      expect(post.id).toBeGreaterThan(0)
      expect(post.slug).toBeTruthy()
      expect(post.slug).not.toContain(' ')
      expect(post.title).toBeTruthy()
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(post.author).toBeTruthy()
      expect(post.category).toBeTruthy()
      expect(post.excerpt.length).toBeGreaterThan(20)
      expect(post.content.length).toBeGreaterThan(100)
      expect(typeof post.featured).toBe('boolean')
    }
  })

  it('slugs are unique', () => {
    const slugs = blogPosts.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('IDs are unique', () => {
    const ids = blogPosts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has at least one featured post', () => {
    const featured = blogPosts.filter((p) => p.featured)
    expect(featured.length).toBeGreaterThan(0)
  })

  it('has diverse categories', () => {
    const categories = [...new Set(blogPosts.map((p) => p.category))]
    expect(categories.length).toBeGreaterThanOrEqual(3)
  })
})
