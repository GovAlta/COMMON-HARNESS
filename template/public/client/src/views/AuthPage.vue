<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { BarChart3, ArrowLeft, ShieldCheck } from 'lucide-vue-next'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRedirect } from '@/router'

const route = useRoute()
const auth = useAuthStore()

/**
 * Build the absolute URL the OAuth callback should redirect to after success.
 * We pass it as ?redirect=... so the backend can return the user to where they
 * started after the SSO round-trip.
 */
function ssoUrl(provider: 'google' | 'microsoft'): string {
  const safe = sanitizeRedirect(route.query.redirect) || '/'
  const back = encodeURIComponent(safe)
  return `/api/auth/${provider}?redirect=${back}`
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
    <div class="w-full max-w-md">
      <!-- Logo & Branding -->
      <div class="text-center mb-8">
        <RouterLink to="/" class="inline-flex items-center gap-2 mb-6">
          <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <BarChart3 class="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <span class="text-xl font-jakarta font-bold text-slate-900">App Template</span>
        </RouterLink>
        <h1 class="text-2xl font-jakarta font-bold text-slate-900 mb-1">Sign in</h1>
        <p class="text-sm text-slate-500 font-geist">
          Continue with the identity provider used by your organisation.
        </p>
      </div>

      <!-- Auth Card -->
      <section
        class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm"
        aria-labelledby="sso-heading"
      >
        <h2 id="sso-heading" class="sr-only">Choose a sign-in provider</h2>

        <div class="space-y-3">
          <a
            :href="ssoUrl('google')"
            class="block"
            data-testid="sso-google"
            aria-label="Continue with Google"
          >
            <Button
              label="Continue with Google"
              outlined
              class="w-full justify-center"
              tabindex="-1"
            >
              <template #icon>
                <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </template>
            </Button>
          </a>

          <a
            :href="ssoUrl('microsoft')"
            class="block"
            data-testid="sso-microsoft"
            aria-label="Continue with Microsoft"
          >
            <Button
              label="Continue with Microsoft"
              outlined
              class="w-full justify-center"
              tabindex="-1"
              :disabled="auth.microsoftDisabled"
            >
              <template #icon>
                <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#00A4EF" aria-hidden="true" focusable="false">
                  <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                </svg>
              </template>
            </Button>
          </a>
        </div>

        <p class="mt-6 flex items-start gap-2 text-xs text-slate-500 font-geist">
          <ShieldCheck class="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            We never see or store your password. Authentication happens entirely with your
            identity provider; we receive only a verified email, name, and a profile image.
          </span>
        </p>
      </section>

      <!-- Back to Home -->
      <div class="text-center mt-6">
        <RouterLink
          to="/"
          class="inline-flex items-center gap-1 text-sm font-geist text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" aria-hidden="true" />
          Back to home
        </RouterLink>
      </div>
    </div>
  </main>
</template>
