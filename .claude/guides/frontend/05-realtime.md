# Skill: Real-Time Communication

This skill covers WebSocket integration using Socket.io (service layer plus composable and component usage with streaming support) and Server-Sent Events (SSE) for one-way real-time data delivery. Includes automatic reconnection and composable cleanup.

> **Standards:** Cross-reference with [01-architecture](../../standards/01-architecture.md) for service layer organization, [02-security](../../standards/02-security.md) for WebSocket authentication and token handling, and [03-coding-conventions](../../standards/03-coding-conventions.md) for naming and formatting.

---

## 8. WebSocket Integration (Socket.io)

### 8.1 Socket Service

```typescript
// src/lib/socket.ts
import { io, type Socket } from 'socket.io-client'
import { ref, type Ref } from 'vue'

let socket: Socket | null = null
const connected: Ref<boolean> = ref(false)

interface SocketOptions {
  url?: string
  autoConnect?: boolean
}

/**
 * Initialize Socket.io connection.
 * Call once in App.vue or after successful login.
 */
export function initSocket(options: SocketOptions = {}) {
  if (socket?.connected) return socket

  const url = options.url || window.location.origin

  socket = io(url, {
    path: '/ws/socket.io',
    withCredentials: true,          // Send cookies for auth
    autoConnect: options.autoConnect ?? true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    connected.value = true
    console.debug('[socket] connected:', socket?.id)
  })

  socket.on('disconnect', (reason) => {
    connected.value = false
    console.debug('[socket] disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.warn('[socket] connection error:', err.message)
  })

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  connected.value = false
}

export { connected }
```

### 8.2 WebSocket Composable

```typescript
// src/composables/useWebSocket.ts
import { ref, onUnmounted } from 'vue'
import { getSocket, initSocket } from '@/lib/socket'

/**
 * Composable for WebSocket communication with domain-based message routing.
 *
 * Usage:
 *   const { sendMessage, onMessage, streamingText } = useWebSocket('chat')
 *   onMessage('response', (data) => { ... })
 *   sendMessage('user-input', { text: 'Hello' })
 */
export function useWebSocket(domain: string) {
  const streamingText = ref('')
  const isStreaming = ref(false)
  const listeners: Array<{ event: string; handler: (...args: any[]) => void }> = []

  function getOrInitSocket() {
    return getSocket() || initSocket()
  }

  /**
   * Send a message to the server within this domain.
   */
  function sendMessage(event: string, payload?: unknown) {
    const socket = getOrInitSocket()
    socket?.emit(`${domain}:${event}`, payload)
  }

  /**
   * Register a listener for a domain-scoped event.
   */
  function onMessage(event: string, handler: (...args: any[]) => void) {
    const socket = getOrInitSocket()
    const fullEvent = `${domain}:${event}`
    socket?.on(fullEvent, handler)
    listeners.push({ event: fullEvent, handler })
  }

  /**
   * Listen for streaming AI responses.
   *
   * Server emits `{domain}:stream` with { chunk: string, done: boolean }.
   */
  function onStream(callback?: (fullText: string) => void) {
    onMessage('stream', (data: { chunk: string; done: boolean }) => {
      if (data.done) {
        isStreaming.value = false
        callback?.(streamingText.value)
      } else {
        isStreaming.value = true
        streamingText.value += data.chunk
      }
    })
  }

  function resetStream() {
    streamingText.value = ''
    isStreaming.value = false
  }

  // Clean up listeners on component unmount
  onUnmounted(() => {
    const socket = getSocket()
    listeners.forEach(({ event, handler }) => {
      socket?.off(event, handler)
    })
  })

  return {
    sendMessage,
    onMessage,
    onStream,
    streamingText,
    isStreaming,
    resetStream,
  }
}
```

### REST API Fallback

For critical real-time features (e.g., AI chat), implement a REST API fallback when the WebSocket connection is unavailable:

```typescript
async function sendMessage(content: string) {
  if (ws.connected.value) {
    ws.emit('chat', { content });
  } else {
    // Fallback to REST endpoint
    const response = await api.post('/ai/chat', { content });
    messages.value.push(response.data);
  }
}
```

Core functionality remains available on networks that block WebSocket (enterprise firewalls, restrictive proxies). The REST endpoint should return the same response format as the WebSocket event.

### 8.3 Usage in a Component

```vue
<!-- src/views/Chat.vue -->
<template>
  <div class="flex flex-col h-[calc(100vh-8rem)]">
    <!-- Messages -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="[
          'max-w-[70%] p-3 rounded-lg',
          msg.sender === 'user'
            ? 'ml-auto bg-primary text-primary-contrast'
            : 'bg-surface-100 dark:bg-surface-700',
        ]"
      >
        <div v-html="renderMarkdown(msg.text)" />
      </div>

      <!-- Streaming indicator -->
      <div v-if="isStreaming" class="max-w-[70%] p-3 rounded-lg bg-surface-100 dark:bg-surface-700">
        <div v-html="renderMarkdown(streamingText)" />
        <ProgressBar mode="indeterminate" style="height: 2px" class="mt-2" />
      </div>
    </div>

    <!-- Input -->
    <div class="border-t border-surface-200 dark:border-surface-700 p-4">
      <div class="flex gap-2">
        <InputText
          v-model="inputText"
          placeholder="Type a message..."
          class="flex-1"
          @keyup.enter="send"
        />
        <Button icon="pi pi-send" @click="send" :disabled="!inputText.trim() || isStreaming" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { renderMarkdown } from '@/utils/sanitize'

interface Message {
  id: string
  sender: 'user' | 'assistant'
  text: string
}

const messages = ref<Message[]>([])
const inputText = ref('')
const messagesContainer = ref<HTMLElement>()

const { sendMessage, onMessage, onStream, streamingText, isStreaming, resetStream } = useWebSocket('chat')

onMounted(() => {
  onMessage('history', (data: Message[]) => {
    messages.value = data
    scrollToBottom()
  })

  onStream((fullText) => {
    messages.value.push({
      id: crypto.randomUUID(),
      sender: 'assistant',
      text: fullText,
    })
    resetStream()
    scrollToBottom()
  })

  sendMessage('join')
})

function send() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  messages.value.push({ id: crypto.randomUUID(), sender: 'user', text })
  sendMessage('message', { text })
  inputText.value = ''
  resetStream()
  scrollToBottom()
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}
</script>
```

---

## 9. Server-Sent Events (SSE)

### 9.1 SSE Service

```typescript
// src/lib/sse.ts
import { ref } from 'vue'

type SSEHandler = (data: unknown) => void

interface SSEConnection {
  source: EventSource
  handlers: Map<string, SSEHandler[]>
}

const connections = new Map<string, SSEConnection>()
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Connect to an SSE endpoint. Supports multiple named connections.
 *
 * @param name - Unique name for this connection (e.g., 'notifications', 'updates')
 * @param url - SSE endpoint URL
 * @param events - Map of event names to handlers
 * @param options - Additional options
 */
export function connectSSE(
  name: string,
  url: string,
  events: Record<string, SSEHandler>,
  options: { reconnectDelay?: number } = {},
) {
  // Close existing connection if any
  disconnectSSE(name)

  const source = new EventSource(url, {
    withCredentials: true,
  } as EventSourceInit)

  const handlers = new Map<string, SSEHandler[]>()

  // Register event listeners
  for (const [eventName, handler] of Object.entries(events)) {
    if (!handlers.has(eventName)) {
      handlers.set(eventName, [])
    }
    handlers.get(eventName)!.push(handler)

    if (eventName === 'message') {
      // Default message event
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handler(data)
        } catch {
          handler(event.data)
        }
      }
    } else {
      source.addEventListener(eventName, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          handler(data)
        } catch {
          handler(event.data)
        }
      })
    }
  }

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      connections.delete(name)
      // Auto-reconnect
      const delay = options.reconnectDelay ?? 5000
      const timer = setTimeout(() => {
        connectSSE(name, url, events, options)
      }, delay)
      reconnectTimers.set(name, timer)
    }
  }

  connections.set(name, { source, handlers })
}

/**
 * Disconnect a named SSE connection.
 */
export function disconnectSSE(name: string) {
  const conn = connections.get(name)
  if (conn) {
    conn.source.close()
    connections.delete(name)
  }
  const timer = reconnectTimers.get(name)
  if (timer) {
    clearTimeout(timer)
    reconnectTimers.delete(name)
  }
}

/**
 * Disconnect all SSE connections.
 */
export function disconnectAllSSE() {
  for (const name of connections.keys()) {
    disconnectSSE(name)
  }
}
```

### 9.2 SSE Composable

```typescript
// src/composables/useSSE.ts
import { onUnmounted } from 'vue'
import { connectSSE, disconnectSSE } from '@/lib/sse'

/**
 * Composable wrapper for SSE with automatic cleanup on unmount.
 *
 * Usage:
 *   const { connect, disconnect } = useSSE('live-updates')
 *   connect('/api/v1/updates/stream', {
 *     update: (data) => { items.value.push(data) },
 *     heartbeat: () => { console.debug('alive') },
 *   })
 */
export function useSSE(name: string) {
  function connect(url: string, events: Record<string, (data: any) => void>) {
    connectSSE(name, url, events)
  }

  function disconnect() {
    disconnectSSE(name)
  }

  onUnmounted(() => {
    disconnect()
  })

  return { connect, disconnect }
}
```

### 9.3 Usage Example

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useSSE } from '@/composables/useSSE'
import { useNotificationStore } from '@/stores/useNotificationStore'

const notificationStore = useNotificationStore()
const { connect } = useSSE('notifications')

onMounted(() => {
  // Fetch existing notifications
  notificationStore.fetchNotifications()

  // Stream new notifications via SSE
  connect('/api/v1/notifications/stream', {
    notification: (data) => {
      notificationStore.addNotification(data)
    },
    'bulk-update': (data) => {
      notificationStore.fetchNotifications()
    },
  })
})
</script>
```

---

> **Accessibility:** All components must follow the accessibility standard. See `standards/05-accessibility.md`.
