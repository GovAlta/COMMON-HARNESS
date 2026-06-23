import type { DefaultConfigOptions } from '@formkit/vue'
import { generateClasses } from '@formkit/themes'

/**
 * FormKit Tailwind theme matching our design system.
 *
 * Structure follows FormKit's theme spec:
 *  - `global`       → applies to every input type
 *  - `family:text`  → text, email, password, url, tel, number, search, date, etc.
 *  - `family:box`   → checkbox, radio
 *  - `family:button` → submit, button
 *  - `textarea`     → textarea specifically
 *  - `form`         → the <form> wrapper
 *
 * `$reset` strips inherited genesis/global classes so our overrides are clean.
 */
const theme: Record<string, Record<string, string>> = {
  global: {
    // `formkit-outer` is FormKit's wrapper. The `formkit-required-asterisk`
    // class wires the required indicator to a CSS rule in main.css that
    // appends a red `*` to required-field labels — keeps the label text
    // clean and avoids HTML escaping inside FormKit's label slot.
    outer: 'formkit-outer mb-5',
    label: 'formkit-required-asterisk block text-sm font-medium text-slate-700 mb-1.5',
    help: 'text-xs text-slate-500 mt-1.5',
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
  // FormKit's <select> input is NOT in any family-tagged group by default
  // (the built-in families are text, box, button, date). Targeting it via
  // `family:dropdown` is silently a no-op — that was the cause of the
  // "blank/no-border dropdown" bug. Use the input-type key `select`.
  select: {
    inner:
      'flex items-center rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    // `formkit-select` is a hook for the appearance-stripping + custom caret
    // in main.css. Without it, the native <select> renders the browser's
    // default chevron inside our styled wrapper and looks inconsistent.
    input:
      'formkit-select w-full px-4 py-3 pr-10 border-none bg-transparent text-sm text-slate-900 ' +
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
