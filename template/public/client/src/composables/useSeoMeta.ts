import { onMounted, onUnmounted, watch } from 'vue'

/**
 * Lightweight per-route SEO meta sync. Sets document.title and updates the
 * standard meta tags (description, canonical, og:*, twitter:*) without
 * pulling in a head-management library.
 *
 * Why no library: the base set we need (title + description + canonical + og)
 * is six string updates. A library adds 6–10 KB gzip for not much beyond
 * SSR-time hydration, which this template doesn't ship. The functions below
 * mutate existing tags in place and restore the previous values on unmount
 * so quick navigation doesn't leave stale meta on the page.
 */

export interface SeoMetaOptions {
  /** Page title appended to ` | App Template`. */
  title?: string
  /** 50–160 char description. */
  description?: string
  /** og:image override; defaults to /pwa-512x512.png. */
  image?: string
}

const SITE_NAME = 'App Template'
const FALLBACK_IMAGE = '/pwa-512x512.png'

function setMeta(selector: string, attribute: 'content' | 'href', value: string): () => void {
  if (typeof document === 'undefined') return () => {}
  const el = document.querySelector<HTMLMetaElement | HTMLLinkElement>(selector)
  if (!el) return () => {}
  const previous = el.getAttribute(attribute) ?? ''
  el.setAttribute(attribute, value)
  return () => el.setAttribute(attribute, previous)
}

export function useSeoMeta(opts: SeoMetaOptions | (() => SeoMetaOptions)) {
  let restore: Array<() => void> = []

  function apply() {
    // Roll back any meta changes from the previous apply() before stacking new ones.
    for (const undo of restore) undo()
    restore = []

    const o = typeof opts === 'function' ? opts() : opts
    const title = o.title ? `${o.title} | ${SITE_NAME}` : SITE_NAME
    const description = o.description ?? ''
    const image = o.image ?? FALLBACK_IMAGE
    const url = typeof location !== 'undefined' ? location.href : '/'

    if (typeof document !== 'undefined') {
      document.title = title
    }

    if (description) {
      restore.push(setMeta('meta[name="description"]', 'content', description))
      restore.push(setMeta('meta[property="og:description"]', 'content', description))
      restore.push(setMeta('meta[name="twitter:description"]', 'content', description))
    }
    restore.push(setMeta('meta[property="og:title"]', 'content', title))
    restore.push(setMeta('meta[name="twitter:title"]', 'content', title))
    restore.push(setMeta('meta[property="og:url"]', 'content', url))
    restore.push(setMeta('link#canonical-link', 'href', url))
    restore.push(setMeta('meta[property="og:image"]', 'content', image))
    restore.push(setMeta('meta[name="twitter:image"]', 'content', image))
  }

  // Re-apply when the source is reactive (function form).
  if (typeof opts === 'function') {
    watch(opts, apply, { deep: true })
  }

  onMounted(apply)
  onUnmounted(() => {
    for (const undo of restore) undo()
    restore = []
  })
}
