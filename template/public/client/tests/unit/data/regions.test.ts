import { describe, it, expect } from 'vitest'
import { regions, regionTypes } from '@/data/regions'

describe('regions', () => {
  it('has 12 regions', () => {
    expect(regions).toHaveLength(12)
  })

  it('each region has required fields', () => {
    for (const r of regions) {
      expect(r.id).toMatch(/^reg-\d{3}$/)
      expect(r.name).toBeTruthy()
      expect(r.country).toBe('US')
      expect(r.lat).toBeGreaterThan(-90)
      expect(r.lat).toBeLessThan(90)
      expect(r.lng).toBeGreaterThan(-180)
      expect(r.lng).toBeLessThan(180)
      expect(['office', 'warehouse', 'retail']).toContain(r.type)
      expect(r.siteCount).toBeGreaterThan(0)
    }
  })

  it('region IDs are unique', () => {
    const ids = regions.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('region names are unique', () => {
    const names = regions.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('covers all 3 region types', () => {
    const types = [...new Set(regions.map((r) => r.type))]
    expect(types.sort()).toEqual(['office', 'retail', 'warehouse'])
  })
})

describe('regionTypes', () => {
  it('has 4 items (All + 3 types)', () => {
    expect(regionTypes).toHaveLength(4)
  })

  it('first item is All Types with null value', () => {
    expect(regionTypes[0]).toEqual({ label: 'All Types', value: null })
  })

  it('includes office, warehouse, retail', () => {
    const values = regionTypes.map((rt) => rt.value).filter(Boolean)
    expect(values.sort()).toEqual(['office', 'retail', 'warehouse'])
  })
})
