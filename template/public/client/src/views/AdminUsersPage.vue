<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { Search, Users, ShieldCheck, Trash2, Power, PowerOff } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useAdmin } from '@/composables/useAdmin'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import type { ApiPaginationInfo } from '@/types/api'
import type { AdminUser, AdminRoleName } from '@/types/user'

const {
  listUsers,
  updateUserRole,
  setUserStatus,
  deleteUser,
  loading,
  error,
} = useAdmin()
const { success, error: notifyError } = useToast()
const { user: actor } = storeToRefs(useAuthStore())
const confirm = useConfirm()

// Per-row in-flight flag — disables the row's Activate/Delete controls while
// either request is mid-flight so a double-click cannot fire two writes.
const rowBusy = ref<Record<string, boolean>>({})

const items = ref<AdminUser[]>([])
const pagination = ref<ApiPaginationInfo | null>(null)

const page = ref(1)
const limit = ref(20)
const search = ref('')
const roleFilter = ref<AdminRoleName | null>(null)

const dialogOpen = ref(false)
const editing = ref<AdminUser | null>(null)
const pendingRole = ref<AdminRoleName>('viewer')
const dialogError = ref<string | null>(null)
const submitting = ref(false)

const roleOptions: { label: string; value: AdminRoleName }[] = [
  { label: 'Viewer', value: 'viewer' },
  { label: 'Submitter', value: 'submitter' },
  { label: 'Editor', value: 'editor' },
  { label: 'Manager', value: 'manager' },
  { label: 'Admin', value: 'admin' },
  { label: 'Super admin', value: 'super_admin' },
]

const roleFilterOptions = [{ label: 'All roles', value: null }, ...roleOptions]

function roleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  if (role === 'super_admin') return 'danger'
  if (role === 'admin') return 'warn'
  if (role === 'manager' || role === 'editor') return 'info'
  if (role === 'submitter') return 'success'
  return 'secondary'
}

function displayRole(role: AdminUser['user_role_name']): string {
  return role === 'user' ? 'viewer' : role
}

const isSelf = (row: AdminUser): boolean =>
  !!actor.value && row.pk_user_account === actor.value.id

async function load(): Promise<void> {
  const result = await listUsers({
    page: page.value,
    limit: limit.value,
    role: roleFilter.value ?? undefined,
    search: search.value.trim() || undefined,
  })
  items.value = result.items
  pagination.value = result.pagination
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput(): void {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
}

watch(roleFilter, () => {
  page.value = 1
  load()
})

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

function openRoleDialog(row: AdminUser): void {
  editing.value = row
  // Coerce legacy 'user' to 'viewer' for the editable form value.
  pendingRole.value = (row.user_role_name === 'user' ? 'viewer' : row.user_role_name)
  dialogError.value = null
  dialogOpen.value = true
}

async function submitRoleChange(): Promise<void> {
  if (!editing.value) return
  dialogError.value = null
  submitting.value = true
  const updated = await updateUserRole(editing.value.pk_user_account, pendingRole.value)
  submitting.value = false
  if (updated) {
    success('Role updated', `${updated.user_display_name} is now ${displayRole(updated.user_role_name)}`)
    dialogOpen.value = false
    editing.value = null
    await load()
  } else {
    dialogError.value = error.value ?? 'Could not update role.'
    notifyError('Could not update role', error.value ?? 'Please try again.')
  }
}

const currentRoleLabel = computed(() => {
  if (!editing.value) return ''
  return displayRole(editing.value.user_role_name)
})

async function toggleStatus(row: AdminUser): Promise<void> {
  if (isSelf(row)) return // UI blocks this; defence-in-depth.
  rowBusy.value[row.pk_user_account] = true
  const next = !row.is_active
  const updated = await setUserStatus(row.pk_user_account, next)
  rowBusy.value[row.pk_user_account] = false
  if (updated) {
    // Patch in-place so the Tag re-renders without a full server round-trip.
    const idx = items.value.findIndex(
      (u) => u.pk_user_account === row.pk_user_account,
    )
    if (idx >= 0) items.value[idx] = updated
    success(
      next ? 'User activated' : 'User deactivated',
      `${updated.user_display_name} is now ${next ? 'active' : 'inactive'}`,
    )
  } else {
    notifyError(
      next ? 'Activate failed' : 'Deactivate failed',
      error.value ?? 'Please try again.',
    )
  }
}

function confirmDelete(row: AdminUser): void {
  if (isSelf(row)) return // UI blocks this; defence-in-depth.
  confirm.require({
    message: `Delete ${row.user_display_name} (${row.user_email_address})? The user account will be hidden from all lists and the user will be signed out and unable to reauthenticate. The record is retained in the database for audit purposes (soft-delete) and can be restored by an administrator from the audit trail.`,
    header: 'Confirm delete user',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete user', severity: 'danger' },
    accept: async () => {
      rowBusy.value[row.pk_user_account] = true
      const ok = await deleteUser(row.pk_user_account)
      rowBusy.value[row.pk_user_account] = false
      if (ok) {
        items.value = items.value.filter(
          (u) => u.pk_user_account !== row.pk_user_account,
        )
        success('User deleted', `${row.user_display_name} has been removed.`)
        await load()
      } else {
        // 400 self-delete is theoretically unreachable (button hidden) but
        // surface whatever the server says.
        notifyError('Delete failed', error.value ?? 'Please try again.')
      }
    },
  })
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
            Users
          </h1>
          <p class="text-slate-600 font-geist">
            Manage user accounts and roles.
          </p>
        </div>
      </header>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-6"
        aria-label="Filter users"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label
              for="user-search"
              class="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Search
            </label>
            <span class="relative block">
              <Search
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <InputText
                id="user-search"
                v-model="search"
                placeholder="Search by name or email"
                class="w-full !pl-10"
                aria-label="Search users"
                @input="onSearchInput"
              />
            </span>
          </div>
          <div>
            <label
              for="user-role-filter"
              class="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Role
            </label>
            <Select
              v-model="roleFilter"
              input-id="user-role-filter"
              :options="roleFilterOptions"
              option-label="label"
              option-value="value"
              placeholder="All roles"
              class="w-full"
              aria-label="Filter by role"
            />
          </div>
        </div>
      </section>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
        aria-label="Users"
      >
        <LoadingSkeleton
          v-if="loading && items.length === 0"
          type="table"
          :lines="6"
        />
        <div
          v-else-if="items.length === 0"
          class="p-10 text-center"
        >
          <Users
            :size="40"
            class="mx-auto text-slate-400 mb-3"
            aria-hidden="true"
          />
          <h2 class="font-jakarta font-bold text-slate-900 mb-1">No users found</h2>
          <p class="text-slate-500 font-geist text-sm">
            Try clearing the filters above.
          </p>
        </div>
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
          data-key="pk_user_account"
          aria-label="Users table"
          @page="onPage"
        >
          <Column header="User">
            <template #body="{ data }">
              <div class="flex items-center gap-3">
                <img
                  v-if="data.avatar_url"
                  :src="data.avatar_url"
                  :alt="`${data.user_display_name} avatar`"
                  class="w-9 h-9 rounded-full object-cover bg-slate-100"
                  loading="lazy"
                />
                <div
                  v-else
                  class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-jakarta font-semibold"
                  aria-hidden="true"
                >
                  {{ (data.user_display_name?.[0] ?? '?').toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div class="font-jakarta font-semibold text-slate-900 text-sm">
                    {{ data.user_display_name }}
                    <span
                      v-if="isSelf(data)"
                      class="ml-1 text-xs font-geist font-normal text-indigo-600"
                    >
                      (you)
                    </span>
                  </div>
                  <div class="text-xs font-geist text-slate-500 truncate">
                    {{ data.user_email_address }}
                  </div>
                </div>
              </div>
            </template>
          </Column>
          <Column field="user_role_name" header="Role" sortable>
            <template #body="{ data }">
              <Tag
                :value="displayRole(data.user_role_name)"
                :severity="roleSeverity(displayRole(data.user_role_name))"
              />
            </template>
          </Column>
          <Column field="sso_provider_name" header="SSO" sortable>
            <template #body="{ data }">
              <span class="text-sm font-geist text-slate-600 capitalize">
                {{ data.sso_provider_name }}
              </span>
            </template>
          </Column>
          <Column field="last_login_at" header="Last login" sortable>
            <template #body="{ data }">
              <span
                v-if="data.last_login_at"
                class="text-sm font-geist text-slate-600"
              >
                {{ new Date(data.last_login_at).toLocaleDateString() }}
              </span>
              <span v-else class="text-xs font-geist text-slate-400">—</span>
            </template>
          </Column>
          <Column field="created_at" header="Joined" sortable>
            <template #body="{ data }">
              <span class="text-sm font-geist text-slate-600">
                {{ new Date(data.created_at).toLocaleDateString() }}
              </span>
            </template>
          </Column>
          <Column field="is_active" header="Status">
            <template #body="{ data }">
              <Tag
                :value="data.is_active ? 'Active' : 'Inactive'"
                :severity="data.is_active ? 'success' : 'secondary'"
              />
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="isSelf(data)"
                  :aria-label="`Change role for ${data.user_display_name}`"
                  @click="openRoleDialog(data)"
                >
                  <ShieldCheck :size="12" aria-hidden="true" />
                  Change role
                </button>
                <button
                  v-if="!isSelf(data)"
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="
                    data.is_active
                      ? 'border-amber-200 bg-white hover:bg-amber-50 text-amber-700 focus-visible:ring-amber-500'
                      : 'border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 focus-visible:ring-emerald-500'
                  "
                  :disabled="rowBusy[data.pk_user_account]"
                  :aria-label="`${data.is_active ? 'Deactivate' : 'Activate'} ${data.user_display_name}`"
                  @click="toggleStatus(data)"
                >
                  <component
                    :is="data.is_active ? PowerOff : Power"
                    :size="12"
                    aria-hidden="true"
                  />
                  {{ data.is_active ? 'Deactivate' : 'Activate' }}
                </button>
                <button
                  v-if="!isSelf(data)"
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="rowBusy[data.pk_user_account]"
                  :aria-label="`Delete ${data.user_display_name}`"
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
      :style="{ width: '28rem', maxWidth: '95vw' }"
      header="Change user role"
      :aria-label="`Change role for ${editing?.user_display_name ?? 'user'}`"
    >
      <div v-if="editing" class="space-y-4">
        <p class="text-sm font-geist text-slate-700">
          Updating role for
          <strong class="font-jakarta font-semibold">
            {{ editing.user_display_name }}
          </strong>
          ({{ editing.user_email_address }}). Current role:
          <span class="font-mono text-xs">{{ currentRoleLabel }}</span>
        </p>

        <Message v-if="dialogError" severity="error" :closable="false">
          {{ dialogError }}
        </Message>

        <div>
          <label
            for="new-role-select"
            class="block text-sm font-medium text-slate-700 mb-1.5"
          >
            New role
          </label>
          <Select
            v-model="pendingRole"
            input-id="new-role-select"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            aria-label="Select new role"
          />
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="submitRoleChange"
          >
            {{ submitting ? 'Saving…' : 'Save role' }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            :disabled="submitting"
            @click="dialogOpen = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>

    <ConfirmDialog />
  </main>
</template>
