<script setup lang="ts">
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import { Search, Download, X, Filter } from 'lucide-vue-next'
import { orders } from '@/data/mockData'
import type { Order } from '@/data/mockData'
import { regions } from '@/data/regions'
import MapView from '@/components/explore/MapView.vue'

// Filter state
const searchText = ref('')
const selectedCategory = ref<string | null>(null)
const selectedRegion = ref<string | null>(null)
const dateRange = ref<Date[] | null>(null)

// Pagination state
const currentPage = ref(0)
const rowsPerPage = ref(25)

// Derive unique filter options from data
const categoryOptions = computed(() => {
  const unique = [...new Set(orders.map((o: Order) => o.category))]
  return unique.sort().map(c => ({ label: c, value: c }))
})

const regionOptions = computed(() => {
  const unique = [...new Set(orders.map((o: Order) => o.regionName))]
  return unique.sort().map(r => ({ label: r, value: r }))
})

// Filtered data
const filteredOrders = computed(() => {
  let result: Order[] = orders

  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    result = result.filter(
      (o: Order) =>
        o.id.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        o.category.toLowerCase().includes(q) ||
        o.regionName.toLowerCase().includes(q)
    )
  }

  if (selectedCategory.value) {
    result = result.filter((o: Order) => o.category === selectedCategory.value)
  }

  if (selectedRegion.value) {
    result = result.filter((o: Order) => o.regionName === selectedRegion.value)
  }

  if (dateRange.value && dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1]) {
    const from = dateRange.value[0].toISOString().split('T')[0]
    const to = dateRange.value[1].toISOString().split('T')[0]
    result = result.filter((o: Order) => o.date >= from && o.date <= to)
  }

  return result
})

// Currency formatting
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

// Status tag severity mapping
function statusSeverity(status: string): 'success' | 'warn' | 'danger' {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'success'
    case 'pending':
      return 'warn'
    case 'cancelled':
      return 'danger'
    default:
      return 'warn'
  }
}

// Clear all filters
function clearFilters(): void {
  searchText.value = ''
  selectedCategory.value = null
  selectedRegion.value = null
  dateRange.value = null
}

const hasActiveFilters = computed(() => {
  return (
    searchText.value !== '' ||
    selectedCategory.value !== null ||
    selectedRegion.value !== null ||
    (dateRange.value !== null && dateRange.value.length === 2)
  )
})

// CSV export
function downloadCSV(): void {
  const headers = ['ID', 'Date', 'Region', 'Product', 'Category', 'Revenue', 'Status']
  const rows = filteredOrders.value.map((o: Order) =>
    [o.id, o.date, o.regionName, o.productName, o.category, o.revenue, o.status].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'explore-data-export.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// Pagination handler
function onPageChange(event: { first: number; rows: number }): void {
  currentPage.value = event.first
  rowsPerPage.value = event.rows
}
</script>

<template>
  <div class="max-w-screen-2xl mx-auto px-4 md:px-8 py-8">
    <!-- Page heading -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-surface-900 dark:text-surface-0">
          Explore Data
        </h1>
        <p class="text-sm text-surface-500 mt-1">
          {{ filteredOrders.length.toLocaleString() }} results found
        </p>
      </div>
      <Button
        label="Export CSV"
        severity="secondary"
        outlined
        @click="downloadCSV"
        :disabled="filteredOrders.length === 0"
        aria-label="Export filtered data as CSV"
      >
        <template #icon>
          <Download class="w-4 h-4 mr-2" />
        </template>
      </Button>
    </div>

    <!-- Filter bar -->
    <section
      aria-label="Data filters"
      class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4 mb-6"
    >
      <div class="flex items-center gap-2 mb-3">
        <Filter class="w-4 h-4 text-surface-400" />
        <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Filters</h2>
        <button
          v-if="hasActiveFilters"
          @click="clearFilters"
          class="ml-auto flex items-center gap-1 text-xs text-surface-500 hover:text-red-500 transition-colors"
          aria-label="Clear all filters"
        >
          <X class="w-3 h-3" />
          Clear all
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Search -->
        <div>
          <label for="explore-search" class="text-xs font-medium text-surface-500 mb-1 block">
            Search
          </label>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
            <InputText
              id="explore-search"
              v-model="searchText"
              placeholder="Search by ID, product, category..."
              class="w-full !pl-10 !text-sm"
              aria-label="Search orders"
              data-testid="explore-search"
            />
          </div>
        </div>

        <!-- Category filter -->
        <div>
          <label for="explore-category" class="text-xs font-medium text-surface-500 mb-1 block">
            Category
          </label>
          <Select
            id="explore-category"
            v-model="selectedCategory"
            :options="categoryOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="All categories"
            :showClear="true"
            :tabindex="0"
            class="w-full !text-sm"
            aria-label="Filter by category"
          />
        </div>

        <!-- Region filter -->
        <div>
          <label for="explore-region" class="text-xs font-medium text-surface-500 mb-1 block">
            Region
          </label>
          <Select
            id="explore-region"
            v-model="selectedRegion"
            :options="regionOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="All regions"
            :showClear="true"
            :tabindex="0"
            class="w-full !text-sm"
            aria-label="Filter by region"
          />
        </div>

        <!-- Date range -->
        <div>
          <label for="explore-date-range" class="text-xs font-medium text-surface-500 mb-1 block">
            Date Range
          </label>
          <DatePicker
            id="explore-date-range"
            v-model="dateRange"
            selectionMode="range"
            dateFormat="yy-mm-dd"
            placeholder="Select date range"
            :showIcon="true"
            class="w-full !text-sm"
            aria-label="Filter by date range"
          />
        </div>
      </div>
    </section>

    <!-- DataTable -->
    <div class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden">
      <DataTable
        :value="filteredOrders"
        :paginator="true"
        :rows="rowsPerPage"
        :rowsPerPageOptions="[10, 25, 50, 100]"
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        :totalRecords="filteredOrders.length"
        removableSort
        rowHover
        responsiveLayout="scroll"
        class="text-sm"
        aria-label="Orders data table"
        data-testid="explore-table"
        @page="onPageChange"
      >
        <template #empty>
          <div class="text-center py-8 text-surface-500">
            No orders match your current filters. Try adjusting your criteria.
          </div>
        </template>

        <Column field="id" header="ID" sortable style="min-width: 120px">
          <template #body="{ data }">
            <span class="font-mono text-xs font-medium text-surface-900 dark:text-surface-0">
              {{ data.id }}
            </span>
          </template>
        </Column>

        <Column field="date" header="Date" sortable style="min-width: 120px">
          <template #body="{ data }">
            <span class="font-mono text-xs text-surface-600 dark:text-surface-300">
              {{ data.date }}
            </span>
          </template>
        </Column>

        <Column field="regionName" header="Region" sortable style="min-width: 130px">
          <template #body="{ data }">
            <span class="text-sm text-surface-700 dark:text-surface-200">{{ data.regionName }}</span>
          </template>
        </Column>

        <Column field="productName" header="Product" sortable style="min-width: 160px">
          <template #body="{ data }">
            <span class="font-medium text-surface-900 dark:text-surface-0">{{ data.productName }}</span>
          </template>
        </Column>

        <Column field="category" header="Category" sortable style="min-width: 130px">
          <template #body="{ data }">
            <span class="text-sm text-surface-600 dark:text-surface-300">{{ data.category }}</span>
          </template>
        </Column>

        <Column field="revenue" header="Revenue" sortable style="min-width: 120px">
          <template #body="{ data }">
            <span class="font-mono text-sm font-semibold text-surface-900 dark:text-surface-0">
              {{ formatCurrency(data.revenue) }}
            </span>
          </template>
        </Column>

        <Column field="status" header="Status" sortable style="min-width: 120px">
          <template #body="{ data }">
            <Tag
              :value="data.status"
              :severity="statusSeverity(data.status)"
              class="text-xs capitalize"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Region map -->
    <section aria-label="Region map" class="mt-6">
      <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-3">Region Overview</h2>
      <MapView :regions="regions" />
    </section>
  </div>
</template>
