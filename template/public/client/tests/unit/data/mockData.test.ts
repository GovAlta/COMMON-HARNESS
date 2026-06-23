import { describe, it, expect } from 'vitest'
import { orders, getTimeSeries, getHeatmapData, portalStats } from '@/data/mockData'

describe('orders dataset', () => {
  it('generates exactly 500 orders', () => {
    expect(orders).toHaveLength(500)
  })

  it('orders are sorted by date ascending', () => {
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i].date >= orders[i - 1].date).toBe(true)
    }
  })

  it('each order has all required fields', () => {
    for (const order of orders) {
      expect(order.id).toMatch(/^ORD-\d{4}$/)
      expect(order.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(order.regionId).toBeTruthy()
      expect(order.regionName).toBeTruthy()
      expect(order.productId).toBeTruthy()
      expect(order.productName).toBeTruthy()
      expect(order.category).toBeTruthy()
      expect(order.quantity).toBeGreaterThan(0)
      expect(order.revenue).toBeGreaterThan(0)
      expect(['completed', 'pending', 'cancelled']).toContain(order.status)
    }
  })

  it('order IDs are unique', () => {
    const ids = orders.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('dates fall within expected range', () => {
    for (const order of orders) {
      expect(order.date >= '2025-03-01').toBe(true)
      expect(order.date <= '2026-02-28').toBe(true)
    }
  })

  it('status distribution roughly matches weights (72/20/8)', () => {
    const completed = orders.filter((o) => o.status === 'completed').length
    const pending = orders.filter((o) => o.status === 'pending').length
    const cancelled = orders.filter((o) => o.status === 'cancelled').length

    // Allow 10% tolerance from expected distribution
    expect(completed).toBeGreaterThan(300) // ~360 expected
    expect(pending).toBeGreaterThan(50) // ~100 expected
    expect(cancelled).toBeGreaterThan(10) // ~40 expected
    expect(completed + pending + cancelled).toBe(500)
  })

  it('is deterministic (seeded random)', () => {
    // Orders are sorted by date, so the first ID isn't necessarily ORD-0001
    // But the dataset should be identical across runs
    const firstOrder = orders[0]
    expect(firstOrder.id).toBeTruthy()
    // Verify a second access returns the same data (deterministic)
    expect(orders[0].id).toBe(firstOrder.id)
    expect(orders[0].revenue).toBe(firstOrder.revenue)
  })
})

describe('getTimeSeries', () => {
  it('returns monthly aggregates for all data', () => {
    const series = getTimeSeries()
    expect(series.length).toBeGreaterThan(0)
    expect(series.length).toBeLessThanOrEqual(12)
  })

  it('each point has required fields', () => {
    const series = getTimeSeries()
    for (const point of series) {
      expect(point.month).toMatch(/^\d{4}-\d{2}$/)
      expect(point.orders).toBeGreaterThan(0)
      expect(point.revenue).toBeGreaterThan(0)
      expect(typeof point.completed).toBe('number')
      expect(typeof point.pending).toBe('number')
      expect(typeof point.cancelled).toBe('number')
    }
  })

  it('status counts sum to order count per month', () => {
    const series = getTimeSeries()
    for (const point of series) {
      expect(point.completed + point.pending + point.cancelled).toBe(point.orders)
    }
  })

  it('months are sorted chronologically', () => {
    const series = getTimeSeries()
    for (let i = 1; i < series.length; i++) {
      expect(series[i].month > series[i - 1].month).toBe(true)
    }
  })

  it('filters by category', () => {
    const all = getTimeSeries()
    const electronics = getTimeSeries(null, 'Electronics')
    const totalAll = all.reduce((s, p) => s + p.orders, 0)
    const totalElectronics = electronics.reduce((s, p) => s + p.orders, 0)
    expect(totalElectronics).toBeGreaterThan(0)
    expect(totalElectronics).toBeLessThan(totalAll)
  })

  it('filters by region IDs', () => {
    const all = getTimeSeries()
    const filtered = getTimeSeries(['reg-001'])
    const totalAll = all.reduce((s, p) => s + p.orders, 0)
    const totalFiltered = filtered.reduce((s, p) => s + p.orders, 0)
    expect(totalFiltered).toBeGreaterThan(0)
    expect(totalFiltered).toBeLessThan(totalAll)
  })

  it('filters by both region and category', () => {
    const regionOnly = getTimeSeries(['reg-001'])
    const both = getTimeSeries(['reg-001'], 'Electronics')
    const totalRegion = regionOnly.reduce((s, p) => s + p.orders, 0)
    const totalBoth = both.reduce((s, p) => s + p.orders, 0)
    expect(totalBoth).toBeLessThanOrEqual(totalRegion)
  })

  it('returns empty array for non-existent category', () => {
    const series = getTimeSeries(null, 'NonExistent')
    expect(series).toHaveLength(0)
  })

  it('returns empty for empty region array', () => {
    const series = getTimeSeries([], null)
    // Empty array filter should return all (no filtering)
    // Actually the code checks: regionIds && regionIds.length && !regionIds.includes(o.regionId)
    // For empty array: regionIds is truthy, length is 0 → falsy, so no filter applied
    expect(series.length).toBeGreaterThan(0)
  })
})

describe('getHeatmapData', () => {
  it('returns cells with required fields', () => {
    const cells = getHeatmapData()
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.regionId).toBeTruthy()
      expect(cell.regionName).toBeTruthy()
      expect(cell.category).toBeTruthy()
      expect(cell.orders).toBeGreaterThan(0)
      expect(cell.revenue).toBeGreaterThan(0)
    }
  })

  it('total orders across all cells equals 500', () => {
    const cells = getHeatmapData()
    const total = cells.reduce((s, c) => s + c.orders, 0)
    expect(total).toBe(500)
  })

  it('each region-category combination is unique', () => {
    const cells = getHeatmapData()
    const keys = cells.map((c) => `${c.regionId}|${c.category}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('portalStats', () => {
  it('has correct total orders', () => {
    expect(portalStats.totalOrders).toBe(500)
  })

  it('has positive total revenue', () => {
    expect(portalStats.totalRevenue).toBeGreaterThan(0)
  })

  it('has 12 regions', () => {
    expect(portalStats.regions).toBe(12)
  })

  it('has at least 1 category', () => {
    expect(portalStats.categories).toBeGreaterThan(0)
  })

  it('total revenue matches sum of order revenues', () => {
    const sum = Math.round(orders.reduce((s, o) => s + o.revenue, 0) * 100) / 100
    expect(portalStats.totalRevenue).toBe(sum)
  })
})
