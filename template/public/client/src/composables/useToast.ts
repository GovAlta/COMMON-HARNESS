import { useToast as usePrimeVueToast } from 'primevue/usetoast'

/**
 * Thin wrapper around PrimeVue's toast service exposing convenient
 * severity-specific helpers. Use this for ephemeral feedback (success,
 * error, warn, info) — for the persistent per-user notification feed
 * (backed by /api/v1/notifications) see useUserNotifications.
 */
export function useToast() {
  const toast = usePrimeVueToast()

  function success(summary: string, detail?: string): void {
    toast.add({ severity: 'success', summary, detail, life: 4000 })
  }

  function error(summary: string, detail?: string): void {
    toast.add({ severity: 'error', summary, detail, life: 6000 })
  }

  function warn(summary: string, detail?: string): void {
    toast.add({ severity: 'warn', summary, detail, life: 5000 })
  }

  function info(summary: string, detail?: string): void {
    toast.add({ severity: 'info', summary, detail, life: 4000 })
  }

  return { success, error, warn, info }
}
