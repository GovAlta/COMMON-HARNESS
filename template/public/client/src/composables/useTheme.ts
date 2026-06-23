import { ref, computed } from 'vue'

const STORAGE_KEY = 'app-theme'

export interface Theme {
  id: string
  label: string
  swatch: string
  desc: string
}

export const themes: Theme[] = [
  { id: 'light', label: 'Light', swatch: '#6366f1', desc: 'Default indigo' },
  { id: 'dark', label: 'Dark', swatch: '#818cf8', desc: 'Dark mode' },
  { id: 'warm', label: 'Warm', swatch: '#d97706', desc: 'Warm amber' },
  { id: 'ocean', label: 'Ocean', swatch: '#0891b2', desc: 'Cool teal' },
  { id: 'forest', label: 'Forest', swatch: '#059669', desc: 'Earthy green' },
]

export interface ChartPalette {
  series: string[]
  grid: string
  tooltip: string
  muted: string
  text: string
  marker: string
  markerText: string
}

const currentTheme = ref('light')

const themePalettes: Record<string, ChartPalette> = {
  light: {
    series: ['#6366f1', '#0d9488', '#8b5cf6', '#f59e0b', '#ef4444', '#94a3b8'],
    grid: '#f1f5f9',
    tooltip: '#0f172a',
    muted: 'rgba(148, 163, 184, 0.4)',
    text: '#64748b',
    marker: '#4f46e5',
    markerText: '#ffffff',
  },
  dark: {
    series: ['#818cf8', '#2dd4bf', '#a78bfa', '#fbbf24', '#fb7185', '#94a3b8'],
    grid: '#334155',
    tooltip: '#1e293b',
    muted: 'rgba(148, 163, 184, 0.25)',
    text: '#94a3b8',
    marker: '#818cf8',
    markerText: '#0f172a',
  },
  warm: {
    series: ['#d97706', '#b45309', '#92400e', '#dc2626', '#9333ea', '#a8a29e'],
    grid: '#e7dfd3',
    tooltip: '#271e14',
    muted: 'rgba(168, 162, 158, 0.4)',
    text: '#8a7a66',
    marker: '#d97706',
    markerText: '#ffffff',
  },
  ocean: {
    series: ['#0891b2', '#0d9488', '#6366f1', '#0ea5e9', '#8b5cf6', '#94a3b8'],
    grid: '#e0f2fe',
    tooltip: '#0c4a6e',
    muted: 'rgba(148, 163, 184, 0.35)',
    text: '#64748b',
    marker: '#0891b2',
    markerText: '#ffffff',
  },
  forest: {
    series: ['#059669', '#047857', '#10b981', '#d97706', '#8b5cf6', '#94a3b8'],
    grid: '#ecefe8',
    tooltip: '#14532d',
    muted: 'rgba(148, 163, 184, 0.35)',
    text: '#64748b',
    marker: '#059669',
    markerText: '#ffffff',
  },
}

const chartColors = computed(() => themePalettes[currentTheme.value] || themePalettes.light)

function applyTheme(id: string): void {
  const html = document.documentElement
  html.classList.remove('theme-dark', 'theme-warm', 'theme-ocean', 'theme-forest', 'dark-mode')
  if (id !== 'light') {
    html.classList.add(`theme-${id}`)
  }
  if (id === 'dark') {
    html.classList.add('dark-mode')
  }
  currentTheme.value = id
}

export function useTheme() {
  function setTheme(id: string): void {
    applyTheme(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  function initTheme(): void {
    const saved = localStorage.getItem(STORAGE_KEY) || 'light'
    applyTheme(saved)
  }

  return { currentTheme, themes, setTheme, initTheme, chartColors }
}
