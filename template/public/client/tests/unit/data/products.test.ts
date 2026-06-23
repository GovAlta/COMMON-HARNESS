import { describe, it, expect } from 'vitest'
import { products, productCategories, topProducts } from '@/data/products'

describe('products', () => {
  it('has 20 products', () => {
    expect(products).toHaveLength(20)
  })

  it('each product has required fields', () => {
    for (const p of products) {
      expect(p.id).toMatch(/^prod-\d{3}$/)
      expect(p.name).toBeTruthy()
      expect(['Electronics', 'Software', 'Services', 'Hardware']).toContain(p.category)
      expect(p.price).toBeGreaterThan(0)
      expect(p.description).toBeTruthy()
      expect(typeof p.inStock).toBe('boolean')
    }
  })

  it('product IDs are unique', () => {
    const ids = products.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers all 4 categories', () => {
    const categories = [...new Set(products.map((p) => p.category))]
    expect(categories.sort()).toEqual(['Electronics', 'Hardware', 'Services', 'Software'])
  })

  it('has 5 products per category', () => {
    for (const cat of productCategories) {
      const count = products.filter((p) => p.category === cat).length
      expect(count).toBe(5)
    }
  })
})

describe('productCategories', () => {
  it('has exactly 4 categories', () => {
    expect(productCategories).toHaveLength(4)
  })

  it('matches actual categories in products', () => {
    const actual = [...new Set(products.map((p) => p.category))].sort()
    expect([...productCategories].sort()).toEqual(actual)
  })
})

describe('topProducts', () => {
  it('has at most 10 items', () => {
    expect(topProducts.length).toBeLessThanOrEqual(10)
  })

  it('only includes in-stock products', () => {
    for (const p of topProducts) {
      expect(p.inStock).toBe(true)
    }
  })

  it('is sorted by price descending', () => {
    for (let i = 1; i < topProducts.length; i++) {
      expect(topProducts[i].price).toBeLessThanOrEqual(topProducts[i - 1].price)
    }
  })

  it('does not include out-of-stock products', () => {
    const outOfStock = products.filter((p) => !p.inStock)
    for (const oos of outOfStock) {
      expect(topProducts.find((t) => t.id === oos.id)).toBeUndefined()
    }
  })
})
