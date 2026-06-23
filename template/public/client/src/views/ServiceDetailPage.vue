<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Message from 'primevue/message'
import { ArrowLeft, Phone, Mail, FileCheck, ListChecks, Send } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useServices } from '@/composables/useServices'
import type { ServiceWithCategory } from '@/types/service'

const route = useRoute()
const { fetchOne, error } = useServices()
const service = ref<ServiceWithCategory | null>(null)
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true
  service.value = await fetchOne(route.params.id as string)
  loading.value = false
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <RouterLink
        to="/services"
        class="inline-flex items-center gap-2 text-sm font-geist text-slate-600 hover:text-indigo-600 mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        Back to services
      </RouterLink>

      <div v-if="loading"><LoadingSkeleton type="text" :lines="6" /></div>
      <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>
      <div
        v-else-if="!service"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <h1 class="font-jakarta font-bold text-slate-900 mb-2">Service not found</h1>
        <p class="text-slate-500 font-geist text-sm">
          The service you requested does not exist.
        </p>
      </div>

      <article v-else>
        <header class="mb-8">
          <span
            class="inline-block text-[10px] font-geist font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 mb-3"
          >
            {{ service.category_name }}
          </span>
          <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-3">
            {{ service.service_title }}
          </h1>
          <p class="text-lg text-slate-600 font-geist leading-relaxed">
            {{ service.service_description_brief }}
          </p>
        </header>

        <section
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 mb-6"
          aria-label="Service details"
        >
          <h2 class="font-jakarta font-bold text-slate-900 mb-3">About this service</h2>
          <p class="text-slate-700 font-geist whitespace-pre-wrap leading-relaxed">
            {{ service.service_description_full }}
          </p>
        </section>

        <section
          v-if="service.service_eligibility"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 mb-6"
        >
          <h2 class="font-jakarta font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ListChecks :size="18" aria-hidden="true" />
            Eligibility
          </h2>
          <p class="text-slate-700 font-geist whitespace-pre-wrap">
            {{ service.service_eligibility }}
          </p>
        </section>

        <section
          v-if="service.service_how_to_apply"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 mb-6"
        >
          <h2 class="font-jakarta font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Send :size="18" aria-hidden="true" />
            How to apply
          </h2>
          <p class="text-slate-700 font-geist whitespace-pre-wrap">
            {{ service.service_how_to_apply }}
          </p>
        </section>

        <section
          v-if="service.service_required_documents"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 mb-6"
        >
          <h2 class="font-jakarta font-bold text-slate-900 mb-3 flex items-center gap-2">
            <FileCheck :size="18" aria-hidden="true" />
            Required documents
          </h2>
          <p class="text-slate-700 font-geist whitespace-pre-wrap">
            {{ service.service_required_documents }}
          </p>
        </section>

        <section
          v-if="service.service_contact_phone || service.service_contact_email"
          class="bg-indigo-50 border border-indigo-100 rounded-2xl p-6"
          aria-label="Contact"
        >
          <h2 class="font-jakarta font-bold text-slate-900 mb-3">Contact</h2>
          <ul class="space-y-2 text-sm font-geist">
            <li v-if="service.service_contact_phone" class="flex items-center gap-2 text-slate-700">
              <Phone :size="14" aria-hidden="true" />
              <a
                :href="`tel:${service.service_contact_phone}`"
                class="hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                {{ service.service_contact_phone }}
              </a>
            </li>
            <li v-if="service.service_contact_email" class="flex items-center gap-2 text-slate-700">
              <Mail :size="14" aria-hidden="true" />
              <a
                :href="`mailto:${service.service_contact_email}`"
                class="hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                {{ service.service_contact_email }}
              </a>
            </li>
          </ul>
        </section>
      </article>
    </div>
  </main>
</template>
