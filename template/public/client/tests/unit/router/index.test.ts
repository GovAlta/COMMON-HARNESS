import { describe, it, expect } from 'vitest'
import { sanitizeRedirect } from '@/router'

describe('sanitizeRedirect', () => {
  it('allows safe relative paths', () => {
    expect(sanitizeRedirect('/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('/settings?tab=profile')).toBe('/settings?tab=profile')
    expect(sanitizeRedirect('/blog/my-post')).toBe('/blog/my-post')
  })

  it('blocks protocol-relative URLs', () => {
    expect(sanitizeRedirect('//evil.com')).toBeUndefined()
    expect(sanitizeRedirect('//evil.com/steal')).toBeUndefined()
  })

  it('blocks absolute URLs with protocol', () => {
    expect(sanitizeRedirect('https://evil.com')).toBeUndefined()
    expect(sanitizeRedirect('http://evil.com')).toBeUndefined()
  })

  it('blocks javascript: protocol', () => {
    expect(sanitizeRedirect('javascript:alert(1)')).toBeUndefined()
  })

  it('blocks URLs with embedded credentials', () => {
    expect(sanitizeRedirect('/foo@evil.com')).toBeUndefined()
  })

  it('blocks paths with colon (protocol-like)', () => {
    expect(sanitizeRedirect('/data:text/html')).toBeUndefined()
  })

  it('rejects non-string values', () => {
    expect(sanitizeRedirect(null)).toBeUndefined()
    expect(sanitizeRedirect(undefined)).toBeUndefined()
    expect(sanitizeRedirect(123)).toBeUndefined()
    expect(sanitizeRedirect(['array'])).toBeUndefined()
  })

  it('allows query strings with special characters', () => {
    expect(sanitizeRedirect('/search?q=user@example.com')).toBe('/search?q=user@example.com')
    expect(sanitizeRedirect('/search?time=12:00')).toBe('/search?time=12:00')
  })

  it('blocks triple-slash redirect', () => {
    expect(sanitizeRedirect('///evil.com')).toBeUndefined()
  })

  it('blocks empty string', () => {
    expect(sanitizeRedirect('')).toBeUndefined()
  })

  it('allows deeply nested safe paths', () => {
    expect(sanitizeRedirect('/a/b/c/d/e/f')).toBe('/a/b/c/d/e/f')
  })

  it('allows paths with hash fragments', () => {
    expect(sanitizeRedirect('/page#section')).toBe('/page#section')
  })

  it('blocks object type coercion attempts', () => {
    expect(sanitizeRedirect({ toString: () => '//evil.com' })).toBeUndefined()
  })

  it('blocks backslash-based redirects', () => {
    expect(sanitizeRedirect('\\\\evil.com')).toBeUndefined()
  })

  it('blocks data: scheme in path', () => {
    expect(sanitizeRedirect('/data:text/html,<h1>xss</h1>')).toBeUndefined()
  })
})
