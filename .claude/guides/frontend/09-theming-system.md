# Skill: Theming System & Dark Mode

This skill covers the complete theming architecture used in the template: CSS variable overrides for Tailwind v4, a Vue composable with localStorage persistence, PrimeVue dark mode integration, chart color palettes, FormKit theming, and accessibility considerations.

---

## 1. CSS Variable Theming via Tailwind v4

Tailwind v4 maps every utility to CSS custom properties (`--color-*`). By overriding these properties on `<html>` via a class selector, **every Tailwind class that references those tokens changes automatically**: no rebuild, no conditional class logic, no duplication.

### Base theme tokens (`@theme` block)

Define the default (light) palette inside the Tailwind `@theme` directive in `main.css`:

```css
@import "tailwindcss";

@theme {
  --font-sans: 'Inter', sans-serif;
  --font-jakarta: 'Plus Jakarta Sans', sans-serif;
  --font-geist: 'Geist', sans-serif;
  --color-primary-50: #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-200: #c7d2fe;
  --color-primary-300: #a5b4fc;
  --color-primary-400: #818cf8;
  --color-primary-500: #6366f1;
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;
  --color-primary-800: #3730a3;
  --color-primary-900: #312e81;
  --color-brand-accent: #0d9488;
  --color-brand-dark: #0f172a;
}
```

### Theme override strategy

Each theme adds a class to `<html>` (e.g. `theme-dark`, `theme-warm`) and overrides the `--color-*` custom properties. Because Tailwind v4 utilities resolve through these properties, **all existing `bg-slate-50`, `text-indigo-600`, etc. classes update automatically**.

#### Dark theme

The dark theme **inverts the slate scale** (50 becomes the darkest, 900 becomes the lightest) and shifts indigo/accent colors to lighter variants suitable for dark backgrounds:

```css
html.theme-dark {
  color-scheme: dark;
  /* Invert the slate scale */
  --color-slate-50: #0f172a;
  --color-slate-100: #1e293b;
  --color-slate-200: #334155;
  --color-slate-300: #475569;
  --color-slate-400: #94a3b8;
  --color-slate-500: #94a3b8;
  --color-slate-600: #cbd5e1;
  --color-slate-700: #e2e8f0;
  --color-slate-800: #f1f5f9;
  --color-slate-900: #f8fafc;
  /* Shift indigo to lighter variants */
  --color-indigo-50: #1e1b4b;
  --color-indigo-100: #312e81;
  --color-indigo-200: #3730a3;
  --color-indigo-300: #4338ca;
  --color-indigo-400: #6366f1;
  --color-indigo-500: #818cf8;
  --color-indigo-600: #818cf8;
  --color-indigo-700: #a5b4fc;
  --color-white: #0f172a;
  /* Other color adjustments for dark backgrounds */
  --color-teal-50: #042f2e;
  --color-teal-100: #134e4a;
  --color-teal-600: #2dd4bf;
  --color-purple-50: #2e1065;
  --color-purple-100: #3b0764;
  --color-purple-600: #a78bfa;
  --color-amber-50: #451a03;
  --color-amber-100: #78350f;
  --color-amber-200: #92400e;
  --color-amber-600: #fbbf24;
  --color-amber-700: #f59e0b;
  --color-amber-800: #fbbf24;
  --color-green-50: #052e16;
  --color-green-100: #14532d;
  --color-green-400: #4ade80;
  --color-green-500: #22c55e;
  --color-green-700: #86efac;
  --color-green-900: #dcfce7;
  --color-rose-50: #4c0519;
  --color-rose-600: #fb7185;
  --color-blue-100: #1e3a5f;
  --color-blue-700: #93c5fd;
  --color-primary-50: #1e1b4b;
  --color-primary-100: #312e81;
  --color-primary-600: #818cf8;
}

html.theme-dark .code-block {
  background: #1e293b;
  border: 1px solid #334155;
}

html.theme-dark .leaflet-container {
  filter: invert(1) hue-rotate(180deg);
}
```

#### Warm theme (amber palette)

```css
html.theme-warm {
  --color-slate-50: #faf7f2;
  --color-slate-100: #f5f0e8;
  --color-slate-200: #e7dfd3;
  --color-slate-300: #c8bba8;
  --color-slate-400: #a89985;
  --color-slate-500: #8a7a66;
  --color-slate-600: #5c4f3d;
  --color-slate-700: #44382a;
  --color-slate-800: #33291d;
  --color-slate-900: #271e14;
  --color-indigo-50: #fffbeb;
  --color-indigo-100: #fef3c7;
  --color-indigo-200: #fde68a;
  --color-indigo-300: #fcd34d;
  --color-indigo-400: #fbbf24;
  --color-indigo-500: #f59e0b;
  --color-indigo-600: #d97706;
  --color-indigo-700: #b45309;
  --color-white: #fffcf7;
  --color-primary-50: #fffbeb;
  --color-primary-100: #fef3c7;
  --color-primary-600: #d97706;
}
```

#### Ocean theme (teal/cyan palette)

```css
html.theme-ocean {
  --color-slate-50: #f0f9ff;
  --color-slate-100: #e0f2fe;
  --color-indigo-50: #ecfeff;
  --color-indigo-100: #cffafe;
  --color-indigo-200: #a5f3fc;
  --color-indigo-300: #67e8f9;
  --color-indigo-400: #22d3ee;
  --color-indigo-500: #06b6d4;
  --color-indigo-600: #0891b2;
  --color-indigo-700: #0e7490;
  --color-primary-50: #ecfeff;
  --color-primary-100: #cffafe;
  --color-primary-600: #0891b2;
}
```

#### Forest theme (green palette)

```css
html.theme-forest {
  --color-slate-50: #f6f7f4;
  --color-slate-100: #ecefe8;
  --color-indigo-50: #ecfdf5;
  --color-indigo-100: #d1fae5;
  --color-indigo-200: #a7f3d0;
  --color-indigo-300: #6ee7b7;
  --color-indigo-400: #34d399;
  --color-indigo-500: #10b981;
  --color-indigo-600: #059669;
  --color-indigo-700: #047857;
  --color-primary-50: #ecfdf5;
  --color-primary-100: #d1fae5;
  --color-primary-600: #059669;
}
```

#### Smooth transition between themes

```css
html {
  transition: background-color 0.3s ease, color 0.3s ease;
}
```

---

## 2. Theme Composable with localStorage Persistence

The composable uses module-level state (singleton pattern) so every component shares the same reactive `currentTheme` ref.

**File: `src/composables/useTheme.ts`**

```ts
import { ref, computed } from 'vue'

const STORAGE_KEY = 'app-theme'

export interface Theme {
  id: string
  label: string
  swatch: string   // hex color for UI preview
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
  // Remove all theme classes first
  html.classList.remove('theme-dark', 'theme-warm', 'theme-ocean', 'theme-forest', 'dark-mode')
  // Add the new theme class (light has no class)
  if (id !== 'light') {
    html.classList.add(`theme-${id}`)
  }
  // PrimeVue dark mode support
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
```

### Key design decisions

- **Module-level `currentTheme` ref**: Declared outside the composable function so it acts as a singleton. Every call to `useTheme()` shares the same reactive state.
- **`applyTheme` vs `setTheme`**: `applyTheme` is internal (no localStorage write) used during `initTheme`. `setTheme` is the public API that persists.
- **No system preference detection by default**: The template defaults to `'light'`. To add system preference detection, modify `initTheme`:

```ts
function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    applyTheme(saved)
    return
  }
  // Fall back to system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}
```

### Initialization

Call `initTheme()` once in `App.vue` or `main.ts`:

```ts
const { initTheme } = useTheme()
initTheme()
```

---

## 3. Dark Mode Integration with PrimeVue

PrimeVue 4.x dark mode is controlled by `darkModeSelector` in `main.ts`. The template uses `.dark-mode` as the selector (configured via `darkModeSelector: '.dark-mode'`), matching the class added by `applyTheme`:

```ts
if (id === 'dark') {
  html.classList.add('dark-mode')
}
```

> **Note:** PrimeVue's default selector is `.p-dark`. The template overrides this to `.dark-mode` so the same class drives both Tailwind and PrimeVue dark styles. If you change the selector in `main.ts`, update `applyTheme` to match.

The CSS variable overrides in `html.theme-dark` handle Tailwind utilities. PrimeVue components that reference `--color-*` properties (through the PrimeVue overrides in `main.css`) also pick up the dark values automatically.

---

## 4. Theme Switcher Component

**File: `src/components/layout/ThemeSwitcher.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { Palette } from 'lucide-vue-next'
import { useTheme, themes } from '@/composables/useTheme'
import Select from 'primevue/select'

const { currentTheme, setTheme } = useTheme()
const selectedTheme = ref(currentTheme.value)

watch(selectedTheme, (id) => {
  if (id) setTheme(id)
})
</script>

<template>
  <div class="flex items-center gap-2">
    <Palette :size="16" class="text-slate-400" aria-hidden="true" />
    <Select
      v-model="selectedTheme"
      :options="themes"
      option-label="label"
      option-value="id"
      placeholder="Theme"
      class="w-32 text-sm"
      aria-label="Select color theme"
    >
      <template #option="slotProps">
        <div class="flex items-center gap-2">
          <span
            class="w-3 h-3 rounded-full inline-block shrink-0"
            :style="{ background: slotProps.option.swatch }"
            aria-hidden="true"
          />
          <span>{{ slotProps.option.label }}</span>
        </div>
      </template>
    </Select>
  </div>
</template>
```

The swatch dot gives users an immediate color preview. The component uses PrimeVue's `Select` for consistent styling with the rest of the UI.

---

## 5. Chart Color Palettes per Theme

The `chartColors` computed property from `useTheme()` provides a reactive palette object that changes whenever the theme changes. Use it to configure Chart.js options:

```ts
const { chartColors } = useTheme()

const chartOptions = computed(() => ({
  scales: {
    x: {
      grid: { color: chartColors.value.grid },
      ticks: { color: chartColors.value.text },
    },
    y: {
      grid: { color: chartColors.value.grid },
      ticks: { color: chartColors.value.text },
    },
  },
  plugins: {
    tooltip: {
      backgroundColor: chartColors.value.tooltip,
    },
    legend: {
      labels: { color: chartColors.value.text },
    },
  },
}))

// Use chartColors.value.series for dataset backgroundColor / borderColor arrays
```

Each palette provides:
- `series`; array of 6 colors for chart datasets
- `grid`; gridline color
- `tooltip`; tooltip background
- `muted`; semi-transparent color for disabled/inactive elements
- `text`; axis label / legend text color
- `marker` / `markerText`; annotation marker colors

---

## 6. FormKit Theme with `generateClasses`

**File: `src/formkit.config.ts`**

FormKit's `generateClasses` maps Tailwind utility strings to FormKit's DOM sections. Structure follows FormKit's theme spec:
- `global`; applies to every input type
- `family:text`; text, email, password, url, tel, number, search, date, etc.
- `family:box`; checkbox, radio
- `family:button`; submit, button
- `textarea`; textarea specifically
- `form`; the `<form>` wrapper

`$reset` strips inherited genesis/global classes so overrides are clean.

```ts
import type { DefaultConfigOptions } from '@formkit/vue'
import { generateClasses } from '@formkit/themes'

const theme: Record<string, Record<string, string>> = {
  global: {
    outer: 'mb-5',
    label: 'block text-sm font-medium text-slate-700 mb-1.5',
    help: 'text-xs text-slate-400 mt-1.5',
    messages: 'list-none p-0 mt-1.5',
    message: 'text-xs text-red-600',
    inner: '',
    input: 'font-[Geist,sans-serif]',
  },
  'family:text': {
    inner:
      'flex items-center rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    input:
      'w-full px-4 py-3 border-none bg-transparent text-sm text-slate-900 ' +
      'placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:shadow-none',
  },
  'family:date': {
    inner:
      'flex items-center rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    input:
      'w-full px-4 py-3 border-none bg-transparent text-sm text-slate-900 ' +
      'placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:shadow-none',
  },
  'family:dropdown': {
    inner:
      'flex items-center rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    input:
      'w-full px-4 py-3 border-none bg-transparent text-sm text-slate-900 ' +
      'placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:shadow-none',
  },
  'family:box': {
    wrapper: 'flex items-center gap-2.5 mb-1',
    label: 'text-sm text-slate-700 select-none !mb-0',
    inner: 'flex items-center',
    input:
      'w-4 h-4 rounded border-slate-300 text-indigo-600 ' +
      'focus:ring-2 focus:ring-indigo-500/20 cursor-pointer',
    decorator: 'hidden',
  },
  'family:button': {
    input:
      'inline-flex items-center justify-center w-full px-6 py-3 ' +
      'bg-indigo-600 text-white text-sm font-medium rounded-xl ' +
      'hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ' +
      'transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    wrapper: '',
    outer: 'mb-5',
  },
  textarea: {
    inner:
      'flex items-start rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    input:
      'w-full px-4 py-3 border-none bg-transparent text-sm text-slate-900 ' +
      'placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:shadow-none ' +
      'resize-y min-h-[120px]',
  },
  form: {
    form: '',
    messages: 'list-none p-0 mb-4',
    message:
      'text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-2',
  },
}

const config: DefaultConfigOptions = {
  config: {
    classes: generateClasses(theme),
  },
}

export default config
```

### Validation error styling

FormKit adds `data-invalid` to fields with errors. Custom CSS targets this attribute to highlight the border:

```css
/* FormKit validation error styling: border is on .formkit-inner, not .formkit-input */
[data-invalid] .formkit-inner {
  border-color: var(--color-red-500, #ef4444) !important;
  --tw-ring-color: rgba(239, 68, 68, 0.2) !important;
}

[data-invalid] .formkit-label {
  color: var(--color-red-600, #dc2626);
}
```

---

## 7. Reduced Motion Media Query

Respects the user's OS-level animation preference:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This is a global rule in `main.css`. It effectively disables all CSS animations and transitions when the user has enabled "Reduce motion" in their operating system settings.

---

## 8. Complete CSS Architecture

The full `main.css` file is organized into distinct sections:

1. **Tailwind import + `@theme` block**: base design tokens (fonts, primary palette, brand colors)
2. **PrimeVue component overrides**: DataTable headers/rows, tabs, inputs, buttons, dialogs, menubar, cards
3. **Leaflet overrides**: border radius, z-index
4. **Custom scrollbar**: thin 6px scrollbar with slate-300 thumb
5. **Code block styling**: dark background with syntax highlighting classes (`.key`, `.string`, `.number`, `.comment`, `.method`)
6. **Skip navigation**: accessibility link hidden until focused
7. **Reduced motion**: disables animations for `prefers-reduced-motion`
8. **Theme overrides**: CSS custom property overrides per theme class on `<html>`
9. **Theme transition**: smooth `background-color` and `color` transition on `<html>`

### PrimeVue overrides (key patterns)

```css
/* DataTable header styling */
.p-datatable .p-datatable-thead > tr > th {
  background: var(--color-slate-50);
  color: var(--color-slate-700);
  font-family: 'Geist', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--color-slate-200);
}

/* Consistent rounded inputs across PrimeVue components */
.p-multiselect, .p-dropdown, .p-select, .p-inputtext, .p-calendar, .p-datepicker-input {
  border-radius: 0.75rem !important;
  border-color: var(--color-slate-300) !important;
  font-family: 'Geist', sans-serif !important;
}
```

Because these reference `var(--color-slate-*)`, they automatically adapt when a theme class overrides those properties.

---

## Adding a New Theme

To add a new theme (e.g. "sunset"):

1. Add the theme definition to the `themes` array in `useTheme.ts`:
   ```ts
   { id: 'sunset', label: 'Sunset', swatch: '#e11d48', desc: 'Rose gradient' }
   ```

2. Add a chart palette to `themePalettes` in `useTheme.ts`.

3. Add `theme-sunset` to the classList removal in `applyTheme`:
   ```ts
   html.classList.remove('theme-dark', 'theme-warm', 'theme-ocean', 'theme-forest', 'theme-sunset', 'dark-mode')
   ```

4. Add CSS variable overrides in `main.css`:
   ```css
   html.theme-sunset {
     --color-slate-50: #fff1f2;
     --color-primary-600: #e11d48;
     /* ... */
   }
   ```

No other changes needed; the composable, switcher component, and all Tailwind utilities pick up the new theme automatically.
