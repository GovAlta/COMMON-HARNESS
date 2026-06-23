import { describe, it, expect } from 'vitest'
import { apiEndpoints, rateLimits } from '@/data/apiEndpoints'

describe('apiEndpoints', () => {
  it('has at least 5 endpoints', () => {
    expect(apiEndpoints.length).toBeGreaterThanOrEqual(5)
  })

  it('each endpoint has required fields', () => {
    for (const ep of apiEndpoints) {
      expect(ep.id).toBeTruthy()
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(ep.method)
      expect(ep.path).toMatch(/^\/api\//)
      expect(ep.summary).toBeTruthy()
      expect(ep.description.length).toBeGreaterThan(20)
      expect(Array.isArray(ep.parameters)).toBe(true)
      expect(ep.exampleResponse).toBeTruthy()
      expect(ep.curlExample).toBeTruthy()
    }
  })

  it('endpoint IDs are unique', () => {
    const ids = apiEndpoints.map((ep) => ep.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('parameters have required fields', () => {
    for (const ep of apiEndpoints) {
      for (const param of ep.parameters) {
        expect(param.name).toBeTruthy()
        expect(param.type).toBeTruthy()
        expect(typeof param.required).toBe('boolean')
        expect(param.description).toBeTruthy()
      }
    }
  })

  it('exampleResponse is valid JSON', () => {
    for (const ep of apiEndpoints) {
      expect(() => JSON.parse(ep.exampleResponse)).not.toThrow()
    }
  })

  it('curl examples contain the endpoint path', () => {
    for (const ep of apiEndpoints) {
      // The curl example uses the full URL, so check for the path segment
      const pathSegment = ep.path.split('/').pop()
      expect(ep.curlExample).toContain(pathSegment!)
    }
  })
})

describe('rateLimits', () => {
  it('has free, standard, and enterprise tiers', () => {
    expect(rateLimits.free).toBeDefined()
    expect(rateLimits.standard).toBeDefined()
    expect(rateLimits.enterprise).toBeDefined()
  })

  it('each tier has required fields', () => {
    for (const tier of Object.values(rateLimits)) {
      expect(tier.requests_per_minute).toBeGreaterThan(0)
      expect(tier.requests_per_day).toBeGreaterThan(0)
      expect(tier.max_per_page).toBeGreaterThan(0)
      expect(tier.description).toBeTruthy()
    }
  })

  it('tiers increase in capacity', () => {
    expect(rateLimits.standard.requests_per_minute).toBeGreaterThan(rateLimits.free.requests_per_minute)
    expect(rateLimits.enterprise.requests_per_minute).toBeGreaterThan(rateLimits.standard.requests_per_minute)
    expect(rateLimits.standard.requests_per_day).toBeGreaterThan(rateLimits.free.requests_per_day)
    expect(rateLimits.enterprise.requests_per_day).toBeGreaterThan(rateLimits.standard.requests_per_day)
  })
})
