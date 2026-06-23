import { describe, it, expect } from 'vitest'
import { dashboards, dashboardCategories } from '@/data/dashboards'

describe('dashboards', () => {
  it('has 6 dashboards', () => {
    expect(dashboards).toHaveLength(6)
  })

  it('each dashboard has required fields', () => {
    for (const d of dashboards) {
      expect(d.id).toBeGreaterThan(0)
      expect(d.slug).toBeTruthy()
      expect(d.slug).not.toContain(' ')
      expect(d.title).toBeTruthy()
      expect(d.description.length).toBeGreaterThan(20)
      expect(['Sales', 'Operations', 'Marketing', 'Analytics']).toContain(d.category)
      expect(d.icon).toBeTruthy()
      expect(['line', 'bar', 'scatter']).toContain(d.chartType)
      expect(d.features.length).toBeGreaterThan(0)
      expect(d.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('slugs are unique', () => {
    const slugs = dashboards.map((d) => d.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('IDs are unique', () => {
    const ids = dashboards.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mockChartConfig has labels and datasets', () => {
    for (const d of dashboards) {
      expect(d.mockChartConfig.labels.length).toBeGreaterThan(0)
      expect(d.mockChartConfig.datasets.length).toBeGreaterThan(0)
      for (const ds of d.mockChartConfig.datasets) {
        expect(ds.label).toBeTruthy()
        expect(ds.color).toMatch(/^#/)
        expect(ds.data.length).toBe(d.mockChartConfig.labels.length)
      }
    }
  })
})

describe('dashboardCategories', () => {
  it('has 5 items (All + 4 categories)', () => {
    expect(dashboardCategories).toHaveLength(5)
  })

  it('first item is All Dashboards', () => {
    expect(dashboardCategories[0]).toEqual({ value: 'all', label: 'All Dashboards' })
  })

  it('includes all categories present in dashboards', () => {
    const usedCategories = [...new Set(dashboards.map((d) => d.category))].sort()
    const available = dashboardCategories.map((c) => c.value).filter((v) => v !== 'all').sort()
    for (const cat of usedCategories) {
      expect(available).toContain(cat)
    }
  })
})
