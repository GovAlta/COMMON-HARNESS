import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'default' | 'admin' | 'blank'
    requiresAuth?: boolean
    requiresAdmin?: boolean
    guestOnly?: boolean
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  // Public pages
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Home' },
  },
  {
    path: '/dashboards',
    name: 'Dashboards',
    component: () => import('@/views/DashboardsPage.vue'),
    meta: { title: 'Dashboards' },
  },
  {
    path: '/dashboards/:slug',
    name: 'DashboardDetail',
    component: () => import('@/views/DashboardDetailPage.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/explore',
    name: 'Explore',
    component: () => import('@/views/ExplorePage.vue'),
    meta: { title: 'Explore Data' },
  },
  {
    path: '/blog',
    name: 'Blog',
    component: () => import('@/views/BlogPage.vue'),
    meta: { title: 'Blog' },
  },
  {
    path: '/blog/:slug',
    name: 'BlogPost',
    component: () => import('@/views/BlogPostPage.vue'),
    meta: { title: 'Blog Post' },
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/AboutPage.vue'),
    meta: { title: 'About' },
  },
  {
    path: '/install',
    name: 'Install',
    component: () => import('@/views/InstallPage.vue'),
    meta: { title: 'Install the app' },
  },
  {
    path: '/contact',
    name: 'Contact',
    component: () => import('@/views/ContactPage.vue'),
    meta: { title: 'Contact' },
  },
  {
    path: '/docs/api',
    name: 'ApiDocs',
    component: () => import('@/views/ApiDocsPage.vue'),
    meta: { title: 'API Documentation' },
  },

  // Auth
  {
    path: '/auth',
    name: 'Auth',
    component: () => import('@/views/AuthPage.vue'),
    meta: { title: 'Sign In', layout: 'blank', guestOnly: true },
  },

  // Domain — Resources (public)
  {
    path: '/resources',
    name: 'Resources',
    component: () => import('@/views/ResourcesPage.vue'),
    meta: { title: 'Resources' },
  },
  {
    path: '/resources/:id',
    name: 'ResourceDetail',
    component: () => import('@/views/ResourceDetailPage.vue'),
    meta: { title: 'Resource' },
  },

  // Domain — Services (public)
  {
    path: '/services',
    name: 'Services',
    component: () => import('@/views/ServicesPage.vue'),
    meta: { title: 'Services' },
  },
  {
    path: '/services/:id',
    name: 'ServiceDetail',
    component: () => import('@/views/ServiceDetailPage.vue'),
    meta: { title: 'Service' },
  },

  // Domain — Service Locations (public)
  {
    path: '/locations',
    name: 'Locations',
    component: () => import('@/views/LocationsPage.vue'),
    meta: { title: 'Locations' },
  },

  // Domain — Forms (auth)
  {
    path: '/forms',
    name: 'Forms',
    component: () => import('@/views/FormsPage.vue'),
    meta: { title: 'Forms', requiresAuth: true },
  },
  {
    path: '/forms/:id',
    name: 'FormSubmit',
    component: () => import('@/views/FormSubmitPage.vue'),
    meta: { title: 'Submit Form', requiresAuth: true },
  },

  // Account — My submissions (auth)
  {
    path: '/submissions',
    name: 'MySubmissions',
    component: () => import('@/views/MySubmissionsPage.vue'),
    meta: { title: 'My submissions', requiresAuth: true },
  },
  {
    path: '/submissions/:id',
    name: 'MySubmissionDetail',
    component: () => import('@/views/MySubmissionDetailPage.vue'),
    meta: { title: 'Submission', requiresAuth: true },
  },

  // Account — Notifications / Subscriptions / Files (auth)
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('@/views/NotificationsPage.vue'),
    meta: { title: 'Notifications', requiresAuth: true },
  },
  {
    path: '/subscriptions',
    name: 'Subscriptions',
    component: () => import('@/views/SubscriptionsPage.vue'),
    meta: { title: 'Subscriptions', requiresAuth: true },
  },
  {
    path: '/files',
    name: 'Files',
    component: () => import('@/views/FilesPage.vue'),
    meta: { title: 'Files', requiresAuth: true },
  },

  // Protected pages
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsPage.vue'),
    meta: { title: 'Settings', requiresAuth: true },
  },

  // Admin
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: () => import('@/views/AdminDashboardPage.vue'),
    meta: { title: 'Admin Dashboard', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('@/views/AdminUsersPage.vue'),
    meta: { title: 'Admin · Users', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/resources',
    name: 'AdminResources',
    component: () => import('@/views/AdminResourcesPage.vue'),
    meta: { title: 'Admin · Resources', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/locations',
    name: 'AdminLocations',
    component: () => import('@/views/AdminLocationsPage.vue'),
    meta: { title: 'Admin · Locations', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/forms',
    name: 'AdminForms',
    component: () => import('@/views/AdminFormsPage.vue'),
    meta: { title: 'Admin · Forms', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/submissions',
    name: 'AdminSubmissions',
    component: () => import('@/views/AdminSubmissionsPage.vue'),
    meta: { title: 'Admin · Submissions', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/broadcast',
    name: 'AdminBroadcast',
    component: () => import('@/views/AdminBroadcastPage.vue'),
    meta: { title: 'Admin · Broadcast', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },
  {
    path: '/admin/blog',
    name: 'AdminBlog',
    component: () => import('@/views/AdminBlogPage.vue'),
    meta: { title: 'Blog admin', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },

  // Catch-all
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundPage.vue'),
    meta: { title: 'Not Found', layout: 'blank' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

// Set document title
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | App Template` : 'App Template'
})

/**
 * Sanitize the redirect query parameter to prevent open-redirect attacks.
 * Only allows relative paths starting with "/" and blocks protocol-relative URLs.
 */
export function sanitizeRedirect(redirect: unknown): string | undefined {
  if (typeof redirect !== 'string') return undefined
  // Block protocol-relative (//evil.com), javascript:, data:, and anything not starting with /
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return undefined
  // Block embedded credentials or protocol schemes
  if (/[:\\@]/.test(redirect.split('?')[0])) return undefined
  return redirect
}

// Auth guard — redirects unauthenticated users to sign-in
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    const auth = useAuthStore()

    // Bootstrap: if we haven't loaded the user yet, try once
    if (!auth.isAuthenticated && !auth.loading) {
      await auth.fetchUser()
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'Auth', query: { redirect: to.fullPath } }
    }

    if (to.meta.requiresAdmin && !auth.isAdmin) {
      return { name: 'Home' }
    }
  }

  // Guest-only routes: redirect authenticated users away
  if (to.meta.guestOnly) {
    const auth = useAuthStore()
    if (!auth.isAuthenticated && !auth.loading) {
      await auth.fetchUser()
    }
    if (auth.isAuthenticated) {
      return { name: 'Home' }
    }
  }

  // If user lands on Auth page with a redirect param, sanitize it early
  if (to.name === 'Auth' && to.query.redirect) {
    const safe = sanitizeRedirect(to.query.redirect)
    if (safe !== to.query.redirect) {
      return { name: 'Auth', query: safe ? { redirect: safe } : {} }
    }
  }
})

export default router
