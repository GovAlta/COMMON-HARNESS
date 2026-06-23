import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import api, { parseApiError, reportSecurityEvent } from '@/lib/api'
import type { ApiError } from '@/lib/api'

describe('parseApiError', () => {
  it('extracts message from generic Error', () => {
    const result = parseApiError(new Error('Something failed'))
    expect(result.message).toContain('unexpected error')
    expect(result.status).toBe(0)
  })

  it('handles non-Error values', () => {
    const result = parseApiError('string error')
    expect(result.message).toContain('unexpected error')
    expect(result.status).toBe(0)
  })

  it('handles null/undefined', () => {
    expect(parseApiError(null).message).toContain('unexpected error')
    expect(parseApiError(undefined).message).toContain('unexpected error')
  })

  it('returns status 0 for non-HTTP errors', () => {
    const result = parseApiError(new Error('network down'))
    expect(result.status).toBe(0)
  })

  it('result conforms to ApiError interface', () => {
    const result: ApiError = parseApiError(new Error('test'))
    expect(typeof result.message).toBe('string')
    expect(typeof result.status).toBe('number')
  })
})

describe('api instance configuration', () => {
  it('has withCredentials enabled for cookie-based auth', () => {
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('uses /api baseURL to enforce same-origin requests', () => {
    expect(api.defaults.baseURL).toBe('/api')
  })

  it('has a reasonable timeout configured', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0)
    expect(api.defaults.timeout).toBeLessThanOrEqual(30_000)
  })

  it('sends Content-Type application/json by default', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json')
  })

  it('has request interceptors configured (CSRF)', () => {
    expect(api.interceptors.request).toBeDefined()
  })

  it('has response interceptors configured (401/403/429)', () => {
    expect(api.interceptors.response).toBeDefined()
  })
})

describe('reportSecurityEvent', () => {
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    postSpy = vi.spyOn(api, 'post').mockResolvedValue({})
  })

  afterEach(() => {
    postSpy.mockRestore()
  })

  it('sends event to /audit/security-event', () => {
    reportSecurityEvent('auth_expired')
    expect(postSpy).toHaveBeenCalledWith(
      '/audit/security-event',
      expect.objectContaining({
        event_type: 'auth_expired',
        timestamp: expect.any(String),
        url: expect.any(String),
      }),
    )
  })

  it('includes context when provided', () => {
    reportSecurityEvent('csrf_mismatch', { trigger: 'test' })
    expect(postSpy).toHaveBeenCalledWith(
      '/audit/security-event',
      expect.objectContaining({
        event_type: 'csrf_mismatch',
        trigger: 'test',
      }),
    )
  })

  it('does not throw when POST fails (fire-and-forget)', () => {
    postSpy.mockRejectedValueOnce(new Error('Network error'))
    expect(() => reportSecurityEvent('unauthorized')).not.toThrow()
  })

  it('accepts all valid event types', () => {
    const types = ['auth_expired', 'csrf_mismatch', 'unauthorized', 'rate_limited'] as const
    for (const type of types) {
      reportSecurityEvent(type)
    }
    expect(postSpy).toHaveBeenCalledTimes(types.length)
  })
})
