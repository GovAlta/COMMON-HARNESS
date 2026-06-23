<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Message from 'primevue/message'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Paginator from 'primevue/paginator'
import Tag from 'primevue/tag'
import { Search, MapPin, Phone, Mail, Clock } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { stripHtml } from '@/lib/sanitize'
import { useServiceLocations } from '@/composables/useServiceLocations'
import type { ServiceLocationStatus } from '@/types/service-location'

const { items, markers, pagination, loading, error, refresh } = useServiceLocations()

const search = ref('')
const status = ref<ServiceLocationStatus | null>(null)
const page = ref(1)
const limit = ref(50)

const statusOptions: { label: string; value: ServiceLocationStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Limited', value: 'limited' },
  { label: 'Closed', value: 'closed' },
]

async function load(): Promise<void> {
  await refresh({
    page: page.value,
    limit: limit.value,
    search: search.value || undefined,
    status: status.value || undefined,
  })
}

function onSearchInput(): void {
  page.value = 1
  load()
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

watch(status, () => {
  page.value = 1
  load()
})

// Map setup ─────────────────────────────────────────────────────────────────
const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let markerLayer: L.LayerGroup | null = null

const statusColors: Record<ServiceLocationStatus, string> = {
  open: '#10b981',
  limited: '#f59e0b',
  closed: '#ef4444',
}

function statusSeverity(s: ServiceLocationStatus): 'success' | 'warn' | 'danger' {
  if (s === 'open') return 'success'
  if (s === 'limited') return 'warn'
  return 'danger'
}

function initMap(): void {
  if (!mapContainer.value || map) return
  map = L.map(mapContainer.value, {
    center: [39.8, -98.5],
    zoom: 4,
    zoomControl: true,
  })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  drawMarkers()
}

function drawMarkers(): void {
  if (!markerLayer || !map) return
  markerLayer.clearLayers()
  markers.value.forEach((m) => {
    const color = statusColors[m.status] || '#94a3b8'
    const marker = L.circleMarker([m.lat, m.lng], {
      radius: 8,
      fillColor: color,
      fillOpacity: 0.85,
      color: '#fff',
      weight: 2,
    })
    marker.bindPopup(
      `<div style="font-family: 'Geist', sans-serif; min-width: 180px;">
        <strong>${stripHtml(m.name)}</strong><br/>
        <span style="color: #64748b; font-size: 0.8rem;">${stripHtml(m.city || '')}${m.city && m.region ? ', ' : ''}${stripHtml(m.region || '')}</span><br/>
        <span style="color: #64748b; font-size: 0.8rem; text-transform: capitalize;">${stripHtml(m.status)}</span>
      </div>`,
    )
    marker.addTo(markerLayer!)
  })
  if (markers.value.length > 0) {
    const bounds = L.latLngBounds(markers.value.map((m) => [m.lat, m.lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }
}

watch(markers, drawMarkers)

onMounted(async () => {
  await load()
  nextTick(initMap)
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Service Locations
        </h1>
        <p class="text-slate-600 font-geist">
          Find service locations on the map and view their contact details.
        </p>
      </header>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-8"
        aria-label="Filter locations"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="location-search" class="block text-sm font-medium text-slate-700 mb-1.5">
              Search
            </label>
            <span class="relative block">
              <Search
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <InputText
                id="location-search"
                v-model="search"
                placeholder="Name, city, region"
                class="w-full !pl-10"
                aria-label="Search locations"
                @keyup.enter="onSearchInput"
              />
            </span>
          </div>
          <div>
            <label for="location-status" class="block text-sm font-medium text-slate-700 mb-1.5">
              Status
            </label>
            <Select
              input-id="location-status"
              v-model="status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              placeholder="All statuses"
              show-clear
              class="w-full"
            />
          </div>
        </div>
      </section>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <div v-if="loading"><LoadingSkeleton type="text" :lines="8" /></div>

      <div v-else class="grid gap-6 lg:grid-cols-3">
        <!-- Map -->
        <div class="lg:col-span-2 relative">
          <div
            ref="mapContainer"
            class="w-full h-[500px] rounded-2xl border border-slate-200"
            role="region"
            aria-label="Map of service locations"
          />
          <div
            class="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-sm border border-slate-100 z-[400]"
          >
            <p class="text-[10px] font-geist font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Status
            </p>
            <ul class="space-y-1.5">
              <li
                v-for="(color, key) in statusColors"
                :key="key"
                class="flex items-center gap-2"
              >
                <span
                  class="w-3 h-3 rounded-full"
                  :style="{ background: color }"
                  aria-hidden="true"
                />
                <span class="text-xs font-geist text-slate-600 capitalize">{{ key }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- List -->
        <aside class="space-y-4 max-h-[500px] overflow-y-auto pr-1" aria-label="Locations list">
          <div
            v-if="items.length === 0"
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center text-sm text-slate-500 font-geist"
          >
            No locations match your filters.
          </div>
          <article
            v-for="loc in items"
            :key="loc.pk_service_location"
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <h2 class="font-jakarta font-semibold text-slate-900 text-sm">
                {{ loc.location_name }}
              </h2>
              <Tag :value="loc.location_status" :severity="statusSeverity(loc.location_status)" />
            </div>
            <p
              v-if="loc.location_address || loc.location_city"
              class="text-xs text-slate-500 font-geist flex items-start gap-1.5 mb-1"
            >
              <MapPin :size="12" class="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>
                {{ loc.location_address }}{{ loc.location_address && loc.location_city ? ', ' : '' }}{{ loc.location_city }}{{ loc.location_region ? ', ' + loc.location_region : '' }}
              </span>
            </p>
            <p
              v-if="loc.location_phone"
              class="text-xs text-slate-500 font-geist flex items-center gap-1.5 mb-1"
            >
              <Phone :size="12" aria-hidden="true" />
              <a
                :href="`tel:${loc.location_phone}`"
                class="hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                {{ loc.location_phone }}
              </a>
            </p>
            <p
              v-if="loc.location_email"
              class="text-xs text-slate-500 font-geist flex items-center gap-1.5 mb-1"
            >
              <Mail :size="12" aria-hidden="true" />
              <a
                :href="`mailto:${loc.location_email}`"
                class="hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                {{ loc.location_email }}
              </a>
            </p>
            <p
              v-if="loc.location_hours"
              class="text-xs text-slate-500 font-geist flex items-start gap-1.5"
            >
              <Clock :size="12" class="mt-0.5 flex-shrink-0" aria-hidden="true" />
              {{ loc.location_hours }}
            </p>
          </article>
        </aside>
      </div>

      <!-- Paginator -->
      <div v-if="pagination && pagination.total > limit" class="mt-8">
        <Paginator
          :rows="limit"
          :total-records="pagination.total"
          :first="(page - 1) * limit"
          :rows-per-page-options="[25, 50, 100]"
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          @page="onPage"
        />
      </div>
    </div>
  </main>
</template>
