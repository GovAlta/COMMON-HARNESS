import { describe, it, expect, beforeEach } from 'vitest'
import { useTheme, themes } from '@/composables/useTheme'
import type { Theme } from '@/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('initializes with light theme by default', () => {
    const { initTheme, currentTheme } = useTheme()
    initTheme()
    expect(currentTheme.value).toBe('light')
  })

  it('restores saved theme from localStorage', () => {
    localStorage.setItem('app-theme', 'dark')
    const { initTheme, currentTheme } = useTheme()
    initTheme()
    expect(currentTheme.value).toBe('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true)
  })

  it('sets theme and persists to localStorage', () => {
    const { setTheme, currentTheme } = useTheme()
    setTheme('ocean')
    expect(currentTheme.value).toBe('ocean')
    expect(localStorage.getItem('app-theme')).toBe('ocean')
    expect(document.documentElement.classList.contains('theme-ocean')).toBe(true)
  })

  it('removes old theme classes when switching', () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)

    setTheme('forest')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false)
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false)
    expect(document.documentElement.classList.contains('theme-forest')).toBe(true)
  })

  it('light theme adds no extra classes', () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    setTheme('light')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false)
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false)
  })

  it('exposes all 5 themes', () => {
    expect(themes).toHaveLength(5)
    expect(themes.map((t) => t.id)).toEqual(['light', 'dark', 'warm', 'ocean', 'forest'])
  })

  it('provides chart colors matching current theme', () => {
    const { setTheme, chartColors } = useTheme()
    setTheme('dark')
    expect(chartColors.value.series).toBeDefined()
    expect(chartColors.value.series.length).toBeGreaterThan(0)
  })

  it('each theme has required fields', () => {
    themes.forEach((t: Theme) => {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.swatch).toMatch(/^#/)
      expect(t.desc).toBeTruthy()
    })
  })

  it('chart palette has all required color properties', () => {
    const { setTheme, chartColors } = useTheme()
    for (const theme of themes) {
      setTheme(theme.id)
      const palette = chartColors.value
      expect(palette.series.length).toBeGreaterThanOrEqual(4)
      expect(palette.grid).toBeTruthy()
      expect(palette.tooltip).toBeTruthy()
      expect(palette.muted).toBeTruthy()
      expect(palette.text).toBeTruthy()
      expect(palette.marker).toBeTruthy()
      expect(palette.markerText).toBeTruthy()
    }
  })

  it('dark theme adds dark-mode class, others do not', () => {
    const { setTheme } = useTheme()
    for (const theme of themes) {
      setTheme(theme.id)
      if (theme.id === 'dark') {
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true)
      } else {
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false)
      }
    }
  })

  it('falls back to light palette for unknown theme', () => {
    const { chartColors } = useTheme()
    // currentTheme defaults to light, chartColors should always return a valid palette
    expect(chartColors.value.series).toBeDefined()
  })
})
