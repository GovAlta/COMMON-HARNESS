import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/stores/auth'
import api from '@/lib/api'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('user is null', () => {
      const auth = useAuthStore()
      expect(auth.user).toBeNull()
    })

    it('loading is false', () => {
      const auth = useAuthStore()
      expect(auth.loading).toBe(false)
    })

    it('initialized is false', () => {
      const auth = useAuthStore()
      expect(auth.initialized).toBe(false)
    })

    it('isAuthenticated is false', () => {
      const auth = useAuthStore()
      expect(auth.isAuthenticated).toBe(false)
    })

    it('isAdmin is false', () => {
      const auth = useAuthStore()
      expect(auth.isAdmin).toBe(false)
    })
  })

  describe('fetchUser', () => {
    it('sets user on successful API call', async () => {
      const auth = useAuthStore()
      const mockUser: User = { id: '1', email: 'test@test.com', name: 'Test', role: 'user' }
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockUser), { status: 200 }),
      )

      await auth.fetchUser()

      expect(auth.user).toEqual(mockUser)
      expect(auth.isAuthenticated).toBe(true)
      expect(auth.initialized).toBe(true)
      expect(auth.loading).toBe(false)
      fetchSpy.mockRestore()
    })

    it('calls GET /auth/me', async () => {
      const auth = useAuthStore()
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('null', { status: 200 }),
      )

      await auth.fetchUser()

      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' })
      fetchSpy.mockRestore()
    })

    it('sets user to null on API failure', async () => {
      const auth = useAuthStore()
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network'))

      await auth.fetchUser()

      expect(auth.user).toBeNull()
      expect(auth.initialized).toBe(true)
      expect(auth.loading).toBe(false)
      fetchSpy.mockRestore()
    })

    it('sets loading during request', async () => {
      const auth = useAuthStore()
      let loadingDuringRequest = false
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        loadingDuringRequest = auth.loading
        return new Response(JSON.stringify({ id: '1', email: 'a@b.com', name: 'T', role: 'guest' }), { status: 200 })
      })

      await auth.fetchUser()

      expect(loadingDuringRequest).toBe(true)
      expect(auth.loading).toBe(false)
      fetchSpy.mockRestore()
    })
  })

  describe('login', () => {
    it('is a function', () => {
      const auth = useAuthStore()
      expect(typeof auth.login).toBe('function')
    })
  })

  describe('logout', () => {
    it('calls POST /auth/logout and clears user', async () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({})

      await auth.logout()

      expect(postSpy).toHaveBeenCalledWith('/auth/logout')
      expect(auth.user).toBeNull()
      postSpy.mockRestore()
    })

    it('clears user even on API failure', async () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }
      const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('fail'))

      try { await auth.logout() } catch { /* expected */ }

      expect(auth.user).toBeNull()
      postSpy.mockRestore()
    })
  })

  describe('isAdmin computed', () => {
    it('false for guest role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'guest' }
      expect(auth.isAdmin).toBe(false)
    })

    it('false for manager role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'manager' }
      expect(auth.isAdmin).toBe(false)
    })

    it('true for admin role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'admin' }
      expect(auth.isAdmin).toBe(true)
    })

    it('true for super_admin role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'super_admin' }
      expect(auth.isAdmin).toBe(true)
    })

    it('false for unknown role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'unknown' as any }
      expect(auth.isAdmin).toBe(false)
    })
  })

  describe('isManager computed', () => {
    it('true for manager role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'manager' }
      expect(auth.isManager).toBe(true)
    })

    it('false for editor role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'editor' }
      expect(auth.isManager).toBe(false)
    })

    it('true for admin role (higher)', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'admin' }
      expect(auth.isManager).toBe(true)
    })
  })

  describe('isEditor computed', () => {
    it('true for editor role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'editor' }
      expect(auth.isEditor).toBe(true)
    })

    it('false for user role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'user' }
      expect(auth.isEditor).toBe(false)
    })
  })

  describe('hasMinRole', () => {
    it('checks hierarchy correctly', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'editor' }
      expect(auth.hasMinRole('editor')).toBe(true)
      expect(auth.hasMinRole('user')).toBe(true)
      expect(auth.hasMinRole('manager')).toBe(false)
    })

    it('returns false for null user', () => {
      const auth = useAuthStore()
      expect(auth.hasMinRole('guest')).toBe(false)
    })
  })

  describe('auth:expired event', () => {
    it('clears user on event dispatch', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'user' }

      window.dispatchEvent(new CustomEvent('auth:expired'))

      expect(auth.user).toBeNull()
    })
  })

  describe('idle session timeout', () => {
    it('exposes resetIdleTimer function', () => {
      const auth = useAuthStore()
      expect(typeof auth.resetIdleTimer).toBe('function')
    })
  })
})
