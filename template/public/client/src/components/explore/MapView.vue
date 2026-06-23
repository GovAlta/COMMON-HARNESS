<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { stripHtml } from '@/lib/sanitize'
import type { Region } from '@/data/regions'

interface Props {
  regions: Region[]
}

const props = defineProps<Props>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let markerLayer: L.LayerGroup | null = null

const typeColors: Record<string, string> = {
  office: '#6366f1',
  warehouse: '#0d9488',
  retail: '#f59e0b',
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
  updateMarkers()
}

function updateMarkers(): void {
  if (!markerLayer || !map) return
  markerLayer.clearLayers()

  props.regions.forEach((region) => {
    const color = typeColors[region.type] || '#94a3b8'
    const marker = L.circleMarker([region.lat, region.lng], {
      radius: 8,
      fillColor: color,
      fillOpacity: 0.8,
      color: '#fff',
      weight: 2,
    })

    marker.bindPopup(`
      <div style="font-family: 'Geist', sans-serif; min-width: 160px;">
        <strong>${stripHtml(region.name)}</strong><br/>
        <span style="color: #64748b; font-size: 0.8rem;">${stripHtml(region.country)} &middot; ${stripHtml(region.type)}</span><br/>
        <span style="color: #64748b; font-size: 0.8rem;">${stripHtml(String(region.siteCount))} sites</span>
      </div>
    `)

    marker.addTo(markerLayer!)
  })

  if (props.regions.length > 0) {
    const bounds = L.latLngBounds(props.regions.map((r) => [r.lat, r.lng]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }
}

watch(() => props.regions, updateMarkers, { deep: true })

onMounted(() => {
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
  <div class="relative">
    <div ref="mapContainer" class="w-full h-[500px] rounded-2xl border border-slate-200" />

    <!-- Legend -->
    <div class="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-xl p-3 shadow-sm border border-slate-100 z-[10]">
      <p class="text-[10px] font-geist font-semibold uppercase tracking-wider text-slate-400 mb-2">Regions</p>
      <div class="space-y-1.5">
        <div v-for="(color, type) in typeColors" :key="type" class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" :style="{ background: color }" />
          <span class="text-xs font-geist text-slate-600 capitalize">{{ type }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
