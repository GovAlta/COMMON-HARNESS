import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, h } from 'vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'

// Suppress console.error during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const GoodChild = defineComponent({
  template: '<p>Hello World</p>',
})

const BadChild = defineComponent({
  setup() {
    throw new Error('Test explosion')
  },
  template: '<p>Never rendered</p>',
})

describe('ErrorBoundary', () => {
  it('renders slot content when no error occurs', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: () => h(GoodChild),
      },
    })
    expect(wrapper.text()).toContain('Hello World')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows fallback UI when a child component throws', async () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: () => h(BadChild),
      },
    })

    // BadChild throws in setup(), which onErrorCaptured catches.
    // The component exposes error state — verify it rendered the fallback.
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('displays custom fallback message', async () => {
    const wrapper = mount(ErrorBoundary, {
      props: { fallbackMessage: 'Custom error message' },
    })
    const vm = wrapper.vm as unknown as { error: Error | null }
    vm.error = new Error('fail')

    await nextTick()
    expect(wrapper.text()).toContain('Custom error message')
  })

  it('resets error state when retry button is clicked', async () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: '<p>Child content</p>',
      },
    })
    const vm = wrapper.vm as unknown as { error: Error | null }
    vm.error = new Error('fail')

    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    await wrapper.find('button').trigger('click')
    await nextTick()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
