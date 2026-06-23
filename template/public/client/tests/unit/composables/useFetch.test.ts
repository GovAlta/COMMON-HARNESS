import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFetch } from '@/composables/useFetch'

// Mock the api module
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

import api from '@/lib/api'

const mockGet = vi.mocked(api.get)

describe('useFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets loading to true while fetching', async () => {
    let resolvePromise: (value: unknown) => void
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve
      }) as never,
    )

    const { loading } = useFetch('/test')

    // loading should be true immediately after call
    expect(loading.value).toBe(true)

    // Resolve the request
    resolvePromise!({ data: { result: 'ok' } })
    await nextTick()
    await nextTick()

    expect(loading.value).toBe(false)
  })

  it('stores fetched data on success', async () => {
    mockGet.mockResolvedValue({ data: { id: 1, name: 'Test' } })

    const { data, error } = useFetch<{ id: number; name: string }>('/items')

    // Wait for the async fetch to resolve
    await vi.waitFor(() => {
      expect(data.value).not.toBeNull()
    })

    expect(data.value).toEqual({ id: 1, name: 'Test' })
    expect(error.value).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const { data, error, loading } = useFetch('/fail')

    await vi.waitFor(() => {
      expect(loading.value).toBe(false)
    })

    expect(data.value).toBeNull()
    expect(error.value).toBeInstanceOf(Error)
    expect(error.value!.message).toBe('Network error')
  })

  it('re-fetches when URL ref changes', async () => {
    mockGet.mockResolvedValue({ data: 'first' })

    const url = ref('/first')
    const { data } = useFetch<string>(url)

    await vi.waitFor(() => {
      expect(data.value).toBe('first')
    })

    expect(mockGet).toHaveBeenCalledWith('/first')

    mockGet.mockResolvedValue({ data: 'second' })
    url.value = '/second'

    await nextTick()
    await vi.waitFor(() => {
      expect(data.value).toBe('second')
    })

    expect(mockGet).toHaveBeenCalledWith('/second')
  })

  it('supports manual refresh', async () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      return Promise.resolve({ data: `call-${callCount}` }) as never
    })

    const { data, refresh } = useFetch<string>('/refresh-test')

    await vi.waitFor(() => {
      expect(data.value).toBe('call-1')
    })

    await refresh()

    expect(data.value).toBe('call-2')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })
})
