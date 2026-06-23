<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Button from 'primevue/button'
import {
  Menu, X, BarChart3, ChevronDown, User,
} from 'lucide-vue-next'
import ThemeSwitcher from './ThemeSwitcher.vue'
import { useAuthStore } from '@/stores/auth'
import { useUserNotifications } from '@/composables/useUserNotifications'

const router = useRouter()
const auth = useAuthStore()
const { unreadCount } = useUserNotifications()
const hasUnread = computed(() => unreadCount.value > 0)
const unreadBadgeLabel = computed(() =>
  unreadCount.value > 99 ? '99+' : String(unreadCount.value),
)
const mobileOpen = ref(false)
const openMenu = ref<string | null>(null)
const isAuthenticated = computed(() => auth.isAuthenticated)
const userName = computed(() => auth.user?.name?.trim() || auth.user?.email || 'Account')
const userInitials = computed(() => {
  const source = (auth.user?.name?.trim() || auth.user?.email || '').trim()
  if (!source) return '?'
  // Initials from up to two words; fall back to first two chars of an email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
})
const userAvatar = computed(() => auth.user?.avatarUrl ?? null)
const isAdmin = computed(() => auth.isAdmin)

interface NavItem {
  label: string
  to: string
  children?: { label: string; to: string }[]
}

const navItems: NavItem[] = [
  {
    label: 'Explore',
    to: '/explore',
    children: [
      { label: 'Dashboards', to: '/dashboards' },
      { label: 'Browse data', to: '/explore' },
      { label: 'Resources', to: '/resources' },
      { label: 'Services', to: '/services' },
      { label: 'Locations', to: '/locations' },
    ],
  },
  {
    label: 'Docs',
    to: '/docs/api',
    children: [
      { label: 'API Reference', to: '/docs/api' },
    ],
  },
  { label: 'Blog', to: '/blog' },
  {
    label: 'Help',
    to: '/about',
    children: [
      { label: 'About', to: '/about' },
      { label: 'Install the app', to: '/install' },
    ],
  },
  { label: 'Contact', to: '/contact' },
]

const accountItems: { label: string; to: string }[] = [
  { label: 'Forms', to: '/forms' },
  { label: 'My submissions', to: '/submissions' },
  { label: 'Notifications', to: '/notifications' },
  { label: 'Subscriptions', to: '/subscriptions' },
  { label: 'Files', to: '/files' },
  { label: 'Settings', to: '/settings' },
]

const adminItems: { label: string; to: string }[] = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'Users', to: '/admin/users' },
  { label: 'Resources', to: '/admin/resources' },
  { label: 'Locations', to: '/admin/locations' },
  { label: 'Forms', to: '/admin/forms' },
  { label: 'Blog', to: '/admin/blog' },
  { label: 'Submissions', to: '/admin/submissions' },
  { label: 'Broadcast', to: '/admin/broadcast' },
]

function openSubmenu(key: string): void {
  openMenu.value = key
}
function closeSubmenu(): void {
  openMenu.value = null
}
function toggleSubmenu(key: string): void {
  openMenu.value = openMenu.value === key ? null : key
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/60">
    <div class="max-w-screen-2xl mx-auto px-4 md:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <RouterLink
          to="/"
          class="flex items-center gap-3 group"
          aria-label="Go to home page"
          data-testid="nav-logo"
        >
          <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BarChart3 :size="18" class="text-white" aria-hidden="true" />
          </div>
          <span class="font-jakarta font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">
            App Template
          </span>
        </RouterLink>

        <!-- Desktop nav -->
        <nav class="hidden xl:flex items-center gap-1" aria-label="Main navigation" data-testid="nav-menu">
          <template v-for="item in navItems" :key="item.label">
            <!-- Items with submenu -->
            <div
              v-if="item.children"
              class="relative"
              @mouseenter="openSubmenu(item.label)"
              @mouseleave="closeSubmenu"
            >
              <button
                class="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-geist text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                :aria-expanded="openMenu === item.label"
                aria-haspopup="true"
                @click="toggleSubmenu(item.label)"
                @keydown.escape="closeSubmenu"
              >
                {{ item.label }}
                <ChevronDown :size="14" class="transition-transform" :class="openMenu === item.label ? 'rotate-180' : ''" aria-hidden="true" />
              </button>
              <Transition
                enter-active-class="transition ease-out duration-100"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition ease-in duration-75"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
              >
                <div
                  v-if="openMenu === item.label"
                  class="absolute top-full left-0 pt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50"
                  role="menu"
                >
                  <RouterLink
                    v-for="child in item.children"
                    :key="child.to"
                    :to="child.to"
                    role="menuitem"
                    class="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors focus:outline-none focus-visible:bg-slate-50"
                    @click="closeSubmenu"
                  >
                    {{ child.label }}
                  </RouterLink>
                </div>
              </Transition>
            </div>

            <!-- Plain nav links -->
            <RouterLink
              v-else
              :to="item.to"
              class="px-3 py-2 rounded-lg text-sm font-geist text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              active-class="text-indigo-600 bg-indigo-50"
            >
              {{ item.label }}
            </RouterLink>
          </template>

          <!-- Account dropdown (authenticated users) -->
          <div
            v-if="isAuthenticated"
            class="relative"
            @mouseenter="openSubmenu('account')"
            @mouseleave="closeSubmenu"
          >
            <button
              class="relative inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-sm font-geist text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 max-w-[14rem]"
              :aria-expanded="openMenu === 'account'"
              :aria-label="hasUnread
                ? `Account menu for ${userName}. ${unreadBadgeLabel} unread notifications.`
                : `Account menu for ${userName}`"
              aria-haspopup="true"
              data-testid="nav-account"
              @click="toggleSubmenu('account')"
              @keydown.escape="closeSubmenu"
            >
              <span class="relative inline-block">
                <img
                  v-if="userAvatar"
                  :src="userAvatar"
                  :alt="''"
                  class="w-7 h-7 rounded-full object-cover bg-slate-200"
                  referrerpolicy="no-referrer"
                />
                <span
                  v-else
                  class="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-jakarta font-semibold flex items-center justify-center"
                  aria-hidden="true"
                >{{ userInitials }}</span>
                <!--
                  Unread badge — anchored to the top-right of the avatar.
                  We render a numeric pill when there's room (>=2 unread)
                  and a plain dot at 1; either way the count is exposed to
                  AT via the parent button's aria-label so screen readers
                  don't need the visual.
                -->
                <span
                  v-if="hasUnread"
                  class="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 rounded-full bg-red-600 ring-2 ring-white text-[10px] leading-4 font-jakarta font-semibold text-white px-1 flex items-center justify-center"
                  aria-hidden="true"
                  data-testid="nav-account-unread-badge"
                >{{ unreadBadgeLabel }}</span>
              </span>
              <span class="truncate font-medium">{{ userName }}</span>
              <ChevronDown :size="14" class="transition-transform flex-shrink-0" :class="openMenu === 'account' ? 'rotate-180' : ''" aria-hidden="true" />
            </button>
            <Transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
            >
              <div
                v-if="openMenu === 'account'"
                class="absolute top-full right-0 pt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50"
                role="menu"
              >
                <RouterLink
                  v-for="child in accountItems"
                  :key="child.to"
                  :to="child.to"
                  role="menuitem"
                  class="flex items-center justify-between px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                  @click="closeSubmenu"
                >
                  <span>{{ child.label }}</span>
                  <!--
                    Inline unread pill on the Notifications row only. The
                    badge is decorative — the avatar's aria-label already
                    announces the count to screen readers, so we mark this
                    aria-hidden to avoid double-reading.
                  -->
                  <span
                    v-if="child.to === '/notifications' && hasUnread"
                    class="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-jakarta font-semibold"
                    aria-hidden="true"
                    data-testid="nav-notifications-unread-badge"
                  >{{ unreadBadgeLabel }}</span>
                </RouterLink>
              </div>
            </Transition>
          </div>

          <!-- Admin dropdown (admin role) -->
          <div
            v-if="isAdmin"
            class="relative"
            @mouseenter="openSubmenu('admin')"
            @mouseleave="closeSubmenu"
          >
            <button
              class="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-geist text-indigo-600 hover:bg-indigo-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              :aria-expanded="openMenu === 'admin'"
              aria-haspopup="true"
              data-testid="nav-admin"
              @click="toggleSubmenu('admin')"
              @keydown.escape="closeSubmenu"
            >
              Admin
              <ChevronDown :size="14" class="transition-transform" :class="openMenu === 'admin' ? 'rotate-180' : ''" aria-hidden="true" />
            </button>
            <Transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
            >
              <div
                v-if="openMenu === 'admin'"
                class="absolute top-full right-0 pt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50"
                role="menu"
              >
                <RouterLink
                  v-for="child in adminItems"
                  :key="child.to"
                  :to="child.to"
                  role="menuitem"
                  class="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                  @click="closeSubmenu"
                >
                  {{ child.label }}
                </RouterLink>
              </div>
            </Transition>
          </div>
        </nav>

        <!-- Right side -->
        <div class="flex items-center gap-3">
          <ThemeSwitcher data-testid="theme-switcher" />
          <template v-if="isAuthenticated">
            <!-- The Account dropdown above (pill with avatar + name) is the
                 canonical user identity in the bar; we don't duplicate it here.
                 The Sign Out button stays accessible from this right slot. -->
            <Button
              icon="pi pi-sign-out"
              label="Sign Out"
              severity="contrast"
              size="small"
              outlined
              class="hidden sm:flex"
              data-testid="nav-logout"
              @click="auth.logout()"
              aria-label="Sign out of your account"
            />
          </template>
          <Button
            v-else
            icon="pi pi-sign-in"
            label="Sign In"
            severity="contrast"
            size="small"
            outlined
            class="hidden sm:flex"
            @click="router.push('/auth')"
            aria-label="Sign in to your account"
          />
          <!-- Mobile toggle -->
          <button
            class="xl:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            @click="mobileOpen = !mobileOpen"
            :aria-expanded="mobileOpen"
            aria-controls="mobile-menu"
            aria-label="Toggle navigation menu"
            data-testid="mobile-menu-toggle"
          >
            <Menu v-if="!mobileOpen" :size="20" class="text-slate-600" aria-hidden="true" />
            <X v-else :size="20" class="text-slate-600" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Mobile menu -->
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-150"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <nav
          v-if="mobileOpen"
          id="mobile-menu"
          class="xl:hidden pb-4 border-t border-slate-100 pt-4"
          aria-label="Mobile navigation"
        >
          <div class="flex flex-col gap-1">
            <template v-for="item in navItems" :key="item.label">
              <RouterLink
                v-if="!item.children"
                :to="item.to"
                class="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors font-geist text-sm"
                active-class="text-indigo-600 bg-indigo-50"
                @click="mobileOpen = false"
              >
                {{ item.label }}
              </RouterLink>
              <template v-else>
                <RouterLink
                  v-for="child in item.children"
                  :key="child.to"
                  :to="child.to"
                  class="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors font-geist text-sm"
                  active-class="text-indigo-600 bg-indigo-50"
                  @click="mobileOpen = false"
                >
                  {{ child.label }}
                </RouterLink>
              </template>
            </template>

            <template v-if="isAuthenticated">
              <div class="mt-3 px-3 text-[10px] font-geist font-semibold uppercase tracking-wider text-slate-400">
                Account
              </div>
              <RouterLink
                v-for="child in accountItems"
                :key="'acc-' + child.to"
                :to="child.to"
                class="flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors font-geist text-sm"
                active-class="text-indigo-600 bg-indigo-50"
                @click="mobileOpen = false"
              >
                <span>{{ child.label }}</span>
                <span
                  v-if="child.to === '/notifications' && hasUnread"
                  class="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-jakarta font-semibold"
                  aria-hidden="true"
                >{{ unreadBadgeLabel }}</span>
              </RouterLink>
            </template>

            <template v-if="isAdmin">
              <div class="mt-3 px-3 text-[10px] font-geist font-semibold uppercase tracking-wider text-indigo-500">
                Admin
              </div>
              <RouterLink
                v-for="child in adminItems"
                :key="'adm-' + child.to"
                :to="child.to"
                class="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors font-geist text-sm"
                active-class="text-indigo-600 bg-indigo-50"
                @click="mobileOpen = false"
              >
                {{ child.label }}
              </RouterLink>
            </template>

            <template v-if="isAuthenticated">
              <div class="px-3 py-2 mt-3 text-sm font-geist text-slate-500 flex items-center gap-2">
                <User :size="14" aria-hidden="true" />
                {{ userName }}
              </div>
              <button
                class="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-center font-geist text-sm mt-1 hover:bg-slate-200 transition-colors"
                @click="auth.logout(); mobileOpen = false"
              >
                Sign Out
              </button>
            </template>
            <RouterLink
              v-else
              to="/auth"
              class="px-3 py-2 rounded-lg bg-indigo-600 text-white text-center font-geist text-sm mt-2"
              @click="mobileOpen = false"
            >
              Sign In
            </RouterLink>
          </div>
        </nav>
      </Transition>
    </div>
  </header>
</template>
