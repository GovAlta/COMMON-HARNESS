<script setup lang="ts">
import { ref, computed } from 'vue'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { Megaphone, CheckCircle2, Send } from 'lucide-vue-next'
import { useAdmin } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import type {
  BroadcastPayload,
  NotificationMessageType,
} from '@/types/notification'

const { broadcast, error, loading } = useAdmin()
const { success, error: notifyError } = useToast()

// Form state — plain refs bound to plain inputs. The whole point of this
// rewrite is to remove every layer between the user's keystrokes and the
// payload that gets POSTed. If the 422 ever returns we will know exactly
// what shape we sent because we constructed it by hand right here.
const title = ref('')
const body = ref('')
const regionFilter = ref('')
const selectedType = ref<NotificationMessageType>('general')

// Field-level errors keyed by server field name ('title', 'body', etc.).
// Cleared on every submit so stale red text never lingers across attempts.
const fieldErrors = ref<Record<string, string>>({})

const lastSent = ref<BroadcastPayload | null>(null)

const typeOptions: { label: string; value: NotificationMessageType }[] = [
  { label: 'General', value: 'general' },
  { label: 'Announcement', value: 'announcement' },
  { label: 'Service update', value: 'service_update' },
  { label: 'Emergency broadcast', value: 'emergency_broadcast' },
]

// Mirror the server's character caps from
// server/src/validators/admin.validator.ts broadcastNotificationSchema. The
// client cap is the same as the server cap — we trust the server, but
// stopping the user before the round-trip is friendlier.
const TITLE_MAX = 300
const BODY_MAX = 5000
const REGION_MAX = 200

const titleLen = computed(() => title.value.length)
const bodyLen = computed(() => body.value.length)

function clearFieldError(name: string): void {
  if (fieldErrors.value[name]) {
    const next = { ...fieldErrors.value }
    delete next[name]
    fieldErrors.value = next
  }
}

/**
 * Client-side guard: trim + require title & body. Returns true on pass.
 * Populates fieldErrors with messages that mirror the server's wording so
 * the UX is consistent whichever side rejects the input.
 */
function clientValidate(): boolean {
  const errs: Record<string, string> = {}
  if (!title.value.trim()) {
    errs.title = 'Title is required.'
  } else if (title.value.length > TITLE_MAX) {
    errs.title = `Title must be at most ${TITLE_MAX} characters.`
  }
  if (!body.value.trim()) {
    errs.body = 'Body is required.'
  } else if (body.value.length > BODY_MAX) {
    errs.body = `Body must be at most ${BODY_MAX} characters.`
  }
  if (regionFilter.value.length > REGION_MAX) {
    errs.regionFilter = `Region filter must be at most ${REGION_MAX} characters.`
  }
  fieldErrors.value = errs
  return Object.keys(errs).length === 0
}

async function onSubmit(): Promise<void> {
  fieldErrors.value = {}
  if (!clientValidate()) {
    // Surface the first error to the user via toast so screen readers
    // catch the live region; the inline messages handle sighted users.
    const first = Object.values(fieldErrors.value)[0]
    notifyError('Please check the form', first ?? 'Some fields are invalid.')
    return
  }

  // Build the payload by hand. Empty regionFilter → null (NOT empty string),
  // matching the server schema `regionFilter: z.string().max(200).nullable().optional()`.
  // A bare empty string would also pass the schema, but null is the more
  // honest "not filtering by region" signal and avoids any string-vs-null
  // ambiguity downstream.
  const payload: BroadcastPayload = {
    title: title.value.trim(),
    body: body.value.trim(),
    type: selectedType.value,
    regionFilter:
      regionFilter.value.trim().length > 0 ? regionFilter.value.trim() : null,
  }

  const result = await broadcast(payload)

  if (result) {
    success('Broadcast sent', `Type: ${payload.type}`)
    lastSent.value = { ...payload }
    // Reset just the message fields; keep type + regionFilter so a follow-up
    // broadcast to the same audience needs only the new text.
    title.value = ''
    body.value = ''
  } else {
    // useAdmin().broadcast already parsed the axios error and stored the
    // user-friendly message on `error`. The raw `details: [{field, message}]`
    // list never reaches this page because parseApiError discards it — but
    // the matching server-side diagnostic in middleware/validate.ts logs
    // the exact Zod path + offending body when NODE_ENV !== 'production',
    // so any future 422 on /broadcast is now reproducible from logs.
    notifyError('Broadcast failed', error.value ?? 'Please try again.')
  }
}
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8 flex items-center gap-3">
        <div
          class="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center"
        >
          <Megaphone :size="24" class="text-indigo-600" aria-hidden="true" />
        </div>
        <div>
          <h1
            class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-1"
          >
            Broadcast
          </h1>
          <p class="text-slate-600 font-geist">
            Send a notification to subscribed users.
          </p>
        </div>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <Message
        v-if="lastSent"
        severity="success"
        :closable="true"
        class="mb-6"
        aria-live="polite"
      >
        <div class="flex items-start gap-2">
          <CheckCircle2 :size="18" class="mt-0.5" aria-hidden="true" />
          <div>
            <p class="font-semibold">Last broadcast sent</p>
            <p class="text-sm">{{ lastSent.title }}</p>
          </div>
        </div>
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8"
        aria-label="Compose broadcast"
      >
        <form class="space-y-5" novalidate @submit.prevent="onSubmit">
          <div>
            <label
              for="broadcast-title"
              class="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Title
            </label>
            <input
              id="broadcast-title"
              v-model="title"
              type="text"
              :maxlength="TITLE_MAX"
              required
              autocomplete="off"
              class="w-full rounded-lg border bg-white px-3 py-2 text-sm font-geist text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              :class="
                fieldErrors.title
                  ? 'border-red-400 focus-visible:ring-red-500'
                  : 'border-slate-300'
              "
              :aria-invalid="fieldErrors.title ? 'true' : undefined"
              :aria-describedby="
                fieldErrors.title ? 'broadcast-title-err' : 'broadcast-title-help'
              "
              placeholder="A short, clear headline"
              @input="clearFieldError('title')"
            />
            <p
              id="broadcast-title-help"
              class="mt-1 text-xs font-geist text-slate-500"
            >
              {{ titleLen }} / {{ TITLE_MAX }}
            </p>
            <p
              v-if="fieldErrors.title"
              id="broadcast-title-err"
              class="mt-1 text-xs font-geist text-red-600"
              aria-live="polite"
            >
              {{ fieldErrors.title }}
            </p>
          </div>

          <div>
            <label
              for="broadcast-body"
              class="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Body
            </label>
            <textarea
              id="broadcast-body"
              v-model="body"
              :maxlength="BODY_MAX"
              required
              rows="6"
              class="w-full rounded-lg border bg-white px-3 py-2 text-sm font-geist text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              :class="
                fieldErrors.body
                  ? 'border-red-400 focus-visible:ring-red-500'
                  : 'border-slate-300'
              "
              :aria-invalid="fieldErrors.body ? 'true' : undefined"
              :aria-describedby="
                fieldErrors.body ? 'broadcast-body-err' : 'broadcast-body-help'
              "
              placeholder="Plain text only — keep it concise and actionable."
              @input="clearFieldError('body')"
            />
            <p
              id="broadcast-body-help"
              class="mt-1 text-xs font-geist text-slate-500"
            >
              {{ bodyLen }} / {{ BODY_MAX }}
            </p>
            <p
              v-if="fieldErrors.body"
              id="broadcast-body-err"
              class="mt-1 text-xs font-geist text-red-600"
              aria-live="polite"
            >
              {{ fieldErrors.body }}
            </p>
          </div>

          <div>
            <label
              for="broadcast-type-select"
              class="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Type
            </label>
            <Select
              v-model="selectedType"
              input-id="broadcast-type-select"
              :options="typeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              aria-label="Broadcast type"
            />
            <p
              v-if="fieldErrors.type"
              class="mt-1 text-xs font-geist text-red-600"
              aria-live="polite"
            >
              {{ fieldErrors.type }}
            </p>
          </div>

          <div>
            <label
              for="broadcast-region"
              class="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Region filter (optional)
            </label>
            <input
              id="broadcast-region"
              v-model="regionFilter"
              type="text"
              :maxlength="REGION_MAX"
              autocomplete="off"
              class="w-full rounded-lg border bg-white px-3 py-2 text-sm font-geist text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              :class="
                fieldErrors.regionFilter
                  ? 'border-red-400 focus-visible:ring-red-500'
                  : 'border-slate-300'
              "
              :aria-invalid="fieldErrors.regionFilter ? 'true' : undefined"
              :aria-describedby="
                fieldErrors.regionFilter
                  ? 'broadcast-region-err'
                  : 'broadcast-region-help'
              "
              placeholder="e.g. Northeast"
              @input="clearFieldError('regionFilter')"
            />
            <p
              id="broadcast-region-help"
              class="mt-1 text-xs font-geist text-slate-500"
            >
              Limit delivery to subscribers of a specific region; leave blank for everyone.
            </p>
            <p
              v-if="fieldErrors.regionFilter"
              id="broadcast-region-err"
              class="mt-1 text-xs font-geist text-red-600"
              aria-live="polite"
            >
              {{ fieldErrors.regionFilter }}
            </p>
          </div>

          <div class="pt-2">
            <button
              type="submit"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              :aria-label="loading ? 'Sending broadcast' : 'Send broadcast'"
            >
              <Send :size="16" aria-hidden="true" />
              {{ loading ? 'Sending…' : 'Send broadcast' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>
