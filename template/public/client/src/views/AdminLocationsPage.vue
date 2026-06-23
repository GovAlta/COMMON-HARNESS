<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { FormKit } from '@formkit/vue'
import { Plus, Pencil, Trash2 } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useServiceLocations } from '@/composables/useServiceLocations'
import { useAdmin } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import type {
  ServiceLocation,
  CreateServiceLocationPayload,
  ServiceLocationStatus,
} from '@/types/service-location'

const { items, pagination, loading, error, refresh } = useServiceLocations()
const {
  createServiceLocation,
  updateServiceLocation,
  deleteServiceLocation,
  error: adminError,
} = useAdmin()
const { success, error: notifyError } = useToast()
const confirm = useConfirm()

const page = ref(1)
const limit = ref(20)

const dialogOpen = ref(false)
const editing = ref<ServiceLocation | null>(null)

const formStatus = ref<ServiceLocationStatus>('open')

const initialValues = computed<Partial<CreateServiceLocationPayload>>(() => {
  if (!editing.value) return {}
  return {
    location_name: editing.value.location_name,
    location_address: editing.value.location_address ?? undefined,
    location_city: editing.value.location_city ?? undefined,
    location_region: editing.value.location_region ?? undefined,
    location_latitude: editing.value.location_latitude
      ? Number(editing.value.location_latitude)
      : undefined,
    location_longitude: editing.value.location_longitude
      ? Number(editing.value.location_longitude)
      : undefined,
    location_phone: editing.value.location_phone ?? undefined,
    location_email: editing.value.location_email ?? undefined,
    location_hours: editing.value.location_hours ?? undefined,
    location_services_offered: editing.value.location_services_offered ?? undefined,
    location_accessibility_info: editing.value.location_accessibility_info ?? undefined,
  }
})

async function load(): Promise<void> {
  await refresh({ page: page.value, limit: limit.value })
}

function openCreate(): void {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(row: ServiceLocation): void {
  editing.value = row
  dialogOpen.value = true
}

function syncFormDefaults(): void {
  formStatus.value = editing.value?.location_status ?? 'open'
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

interface SubmitPayload
  extends Omit<
    CreateServiceLocationPayload,
    'location_latitude' | 'location_longitude' | 'location_status'
  > {
  location_latitude?: number | string
  location_longitude?: number | string
}

async function onSubmit(raw: SubmitPayload): Promise<void> {
  // FormKit text inputs always emit strings, so coerce numeric fields
  // before sending to the server's zod schema (which expects numbers).
  const payload: CreateServiceLocationPayload = {
    ...raw,
    location_status: formStatus.value,
    location_latitude:
      raw.location_latitude !== undefined && raw.location_latitude !== ''
        ? Number(raw.location_latitude)
        : undefined,
    location_longitude:
      raw.location_longitude !== undefined && raw.location_longitude !== ''
        ? Number(raw.location_longitude)
        : undefined,
  }
  const result = editing.value
    ? await updateServiceLocation(editing.value.pk_service_location, payload)
    : await createServiceLocation(payload)
  if (result) {
    success(editing.value ? 'Location updated' : 'Location created')
    dialogOpen.value = false
    await load()
  } else {
    notifyError('Save failed', adminError.value ?? 'Please try again.')
  }
}

function confirmDelete(row: ServiceLocation): void {
  confirm.require({
    message: `Delete "${row.location_name}"? The location will be hidden from the public map and all admin lists, but the record is retained in the database for audit purposes. This is a soft-delete and can be restored by an administrator from the audit trail.`,
    header: 'Confirm delete',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      const ok = await deleteServiceLocation(row.pk_service_location)
      if (ok) {
        items.value = items.value.filter(
          (r) => r.pk_service_location !== row.pk_service_location,
        )
        success('Location deleted')
        await load()
      } else {
        notifyError('Delete failed', adminError.value ?? 'Please try again.')
      }
    },
  })
}

function statusSeverity(s: ServiceLocationStatus): 'success' | 'warn' | 'danger' {
  if (s === 'open') return 'success'
  if (s === 'limited') return 'warn'
  return 'danger'
}

const statusOptions: { label: string; value: ServiceLocationStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Limited', value: 'limited' },
  { label: 'Closed', value: 'closed' },
]

function onDialogShow(): void {
  syncFormDefaults()
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2"
          >
            Manage Locations
          </h1>
          <p class="text-slate-600 font-geist">
            Create and update service locations shown on the public map.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          aria-label="Create a new service location"
          @click="openCreate"
        >
          <Plus :size="16" aria-hidden="true" />
          New location
        </button>
      </header>

      <Message
        v-if="error || adminError"
        severity="error"
        :closable="false"
        class="mb-6"
      >
        {{ error || adminError }}
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      >
        <LoadingSkeleton v-if="loading" type="table" :lines="6" />
        <DataTable
          v-else
          :value="items"
          striped-rows
          paginator
          :rows="limit"
          :rows-per-page-options="[10, 20, 50]"
          :total-records="pagination?.total ?? items.length"
          lazy
          :first="(page - 1) * limit"
          data-key="pk_service_location"
          aria-label="Service locations table"
          @page="onPage"
        >
          <Column field="location_name" header="Name" sortable />
          <Column field="location_city" header="City" sortable />
          <Column field="location_region" header="Region" sortable />
          <Column field="location_status" header="Status" sortable>
            <template #body="{ data }">
              <Tag
                :value="data.location_status"
                :severity="statusSeverity(data.location_status)"
              />
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  :aria-label="`Edit location ${data.location_name}`"
                  @click="openEdit(data)"
                >
                  <Pencil :size="12" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  :aria-label="`Delete location ${data.location_name}`"
                  @click="confirmDelete(data)"
                >
                  <Trash2 :size="12" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <Dialog
      v-model:visible="dialogOpen"
      modal
      :header="editing ? 'Edit location' : 'New location'"
      :style="{ width: '40rem', maxWidth: '95vw' }"
      :aria-label="editing ? 'Edit location form' : 'New location form'"
      @show="onDialogShow"
    >
      <FormKit
        type="form"
        :actions="false"
        :value="initialValues"
        @submit="onSubmit"
      >
        <FormKit
          type="text"
          name="location_name"
          label="Name"
          validation="required|length:1,255"
        />
        <FormKit type="text" name="location_address" label="Address" />
        <FormKit type="text" name="location_city" label="City" />
        <FormKit type="text" name="location_region" label="Region" />
        <div class="grid grid-cols-2 gap-4">
          <FormKit
            type="number"
            name="location_latitude"
            label="Latitude"
            step="0.000001"
          />
          <FormKit
            type="number"
            name="location_longitude"
            label="Longitude"
            step="0.000001"
          />
        </div>
        <FormKit type="tel" name="location_phone" label="Phone" />
        <FormKit type="email" name="location_email" label="Email" />
        <FormKit type="text" name="location_hours" label="Hours" />
        <FormKit
          type="textarea"
          name="location_services_offered"
          label="Services offered"
        />
        <FormKit
          type="textarea"
          name="location_accessibility_info"
          label="Accessibility info"
        />

        <div class="formkit-outer mb-4">
          <label
            for="location-status-select"
            class="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Status
          </label>
          <Select
            v-model="formStatus"
            input-id="location-status-select"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            aria-label="Location status"
          />
        </div>

        <div class="mt-6 flex items-center gap-3">
          <FormKit
            type="submit"
            :label="editing ? 'Save changes' : 'Create location'"
          />
          <button
            type="button"
            class="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            @click="dialogOpen = false"
          >
            Cancel
          </button>
        </div>
      </FormKit>
    </Dialog>

    <ConfirmDialog />
  </main>
</template>
