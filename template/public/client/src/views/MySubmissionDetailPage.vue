<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import Message from 'primevue/message'
import { ArrowLeft, Send, Pencil, XCircle } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import SubmissionDetailView from '@/components/submissions/SubmissionDetailView.vue'
import { useUserSubmissions } from '@/composables/useUserSubmissions'
import { useToast } from '@/composables/useToast'
import type { SubmissionDetail } from '@/types/admin'

const route = useRoute()
const router = useRouter()
const { getById, submitDraft, retract, loading, error } = useUserSubmissions()
const { success, error: notifyError } = useToast()

const detail = ref<SubmissionDetail | null>(null)
const initialLoaded = ref(false)
const actionBusy = ref(false)

const submissionId = computed(() => route.params.id as string)

const status = computed(() => detail.value?.submission.submission_status)
const isDraft = computed(() => status.value === 'draft')
const isSubmitted = computed(() => status.value === 'submitted')

async function load(): Promise<void> {
  const result = await getById(submissionId.value)
  initialLoaded.value = true
  if (result) detail.value = result
}

async function onSubmitDraft(): Promise<void> {
  if (!detail.value) return
  actionBusy.value = true
  const ok = await submitDraft(submissionId.value)
  actionBusy.value = false
  if (ok) {
    success('Submitted', 'Your draft has been submitted.')
    await load()
  } else {
    notifyError('Could not submit draft', error.value ?? '')
  }
}

async function onRetract(): Promise<void> {
  if (!detail.value) return
  actionBusy.value = true
  const ok = await retract(submissionId.value)
  actionBusy.value = false
  if (ok) {
    success('Retracted', 'Your submission has been retracted.')
    await load()
  } else {
    notifyError('Could not retract submission', error.value ?? '')
  }
}

function onEditDraft(): void {
  if (!detail.value) return
  // FormSubmitPage takes a form id, not a submission id. Routing the user
  // there lets them re-fill the form; prefilling from an existing draft is
  // a separate enhancement on FormSubmitPage and is tracked as a follow-up.
  router.push(`/forms/${detail.value.form.pk_form_definition}`)
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <RouterLink
        to="/submissions"
        class="inline-flex items-center gap-2 text-sm font-geist text-slate-600 hover:text-indigo-600 mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        Back to my submissions
      </RouterLink>

      <Message
        v-if="error && initialLoaded && !detail"
        severity="error"
        :closable="false"
        class="mb-6"
      >
        {{ error }}
      </Message>

      <LoadingSkeleton v-if="loading && !detail" type="text" :lines="8" />

      <section
        v-else-if="detail"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8"
        aria-label="Submission detail"
      >
        <SubmissionDetailView :detail="detail">
          <template #actions>
            <div v-if="isDraft" class="space-y-3">
              <h3 class="text-sm font-jakarta font-semibold uppercase tracking-wide text-slate-500">
                Draft actions
              </h3>
              <p class="text-xs text-slate-500 font-geist">
                This submission is still a draft. You can submit it for review
                or re-open the form to make changes.
              </p>
              <div class="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="actionBusy"
                  :aria-label="`Submit draft ${detail.submission.submission_reference_number}`"
                  @click="onSubmitDraft"
                >
                  <Send :size="14" aria-hidden="true" />
                  {{ actionBusy ? 'Submitting…' : 'Submit' }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="actionBusy"
                  :aria-label="`Edit draft ${detail.submission.submission_reference_number}`"
                  @click="onEditDraft"
                >
                  <Pencil :size="14" aria-hidden="true" />
                  Edit draft
                </button>
              </div>
            </div>

            <div v-else-if="isSubmitted" class="space-y-3">
              <h3 class="text-sm font-jakarta font-semibold uppercase tracking-wide text-slate-500">
                Submitted actions
              </h3>
              <p class="text-xs text-slate-500 font-geist">
                You can retract this submission while it has not yet been
                accepted into review.
              </p>
              <button
                type="button"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 text-amber-700 text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="actionBusy"
                :aria-label="`Retract submission ${detail.submission.submission_reference_number}`"
                @click="onRetract"
              >
                <XCircle :size="14" aria-hidden="true" />
                {{ actionBusy ? 'Retracting…' : 'Retract' }}
              </button>
            </div>

            <p v-else class="text-xs text-slate-500 font-geist italic">
              No actions are available for submissions in
              <span class="font-mono">{{ status }}</span> status.
            </p>
          </template>
        </SubmissionDetailView>
      </section>
    </div>
  </main>
</template>
