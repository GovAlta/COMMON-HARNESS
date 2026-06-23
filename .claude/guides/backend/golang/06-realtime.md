# Skill: Go Real-Time Features (WebSocket)

## Overview

Real-time communication uses Gorilla WebSocket for bidirectional streaming (LLM responses, live updates) with domain-based message routing.

## WebSocket Server Setup

### Connection Handler
```go
var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        origin := r.Header.Get("Origin")
        return isAllowedOrigin(origin)
    },
}

func HandleWebSocket(cfg *config.Config, db *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 1. Authenticate via JWT (from cookie or query param)
        token := r.URL.Query().Get("token")
        if token == "" {
            cookie, err := r.Cookie("access_token")
            if err != nil {
                http.Error(w, "Authentication required", http.StatusUnauthorized)
                return
            }
            token = cookie.Value
        }

        claims, err := auth.VerifyAccessToken(cfg, token)
        if err != nil {
            http.Error(w, "Invalid token", http.StatusUnauthorized)
            return
        }

        userID := claims["sub"].(string)

        // 2. Upgrade to WebSocket
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            logrus.WithError(err).Error("WebSocket upgrade failed")
            return
        }

        // 3. Create client and register
        client := NewClient(conn, userID, db)
        hub.Register(client)

        // 4. Start read/write pumps
        go client.WritePump()
        go client.ReadPump()
    }
}
```

## Message Protocol

### Domain-Based Routing
Messages follow `domain:action` format for routing:

```json
// Client → Server
{
    "type": "llm:stream",
    "taskId": "uuid",
    "payload": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    }
}

// Server → Client
{
    "type": "llm:chunk",
    "taskId": "uuid",
    "payload": {
        "content": "Hello! How can I help",
        "done": false
    }
}

// Server → Client (complete)
{
    "type": "llm:complete",
    "taskId": "uuid",
    "payload": {
        "content": "Hello! How can I help you today?",
        "done": true,
        "usage": {"input_tokens": 10, "output_tokens": 12}
    }
}

// Error
{
    "type": "error",
    "taskId": "uuid",
    "payload": {
        "message": "Provider rate limit exceeded",
        "code": "RATE_LIMITED"
    }
}
```

### Supported Domains
| Domain | Actions | Description |
|--------|---------|-------------|
| `llm` | stream, cancel | LLM chat with streaming responses |
| `notification` | subscribe, unsubscribe | Real-time notifications |
| `heartbeat` | ping, pong | Connection health |

## Client Management

```go
type Client struct {
    conn    *websocket.Conn
    userID  string
    db      *pgxpool.Pool
    send    chan []byte
    tasks   map[string]context.CancelFunc
    mu      sync.Mutex
}

const (
    maxConcurrentTasks = 10
    heartbeatInterval  = 30 * time.Second
    writeWait          = 10 * time.Second
    pongWait           = 60 * time.Second
    maxMessageSize     = 1024 * 1024 // 1MB
)

func (c *Client) ReadPump() {
    defer func() {
        hub.Unregister(c)
        c.conn.Close()
    }()

    c.conn.SetReadLimit(maxMessageSize)
    c.conn.SetReadDeadline(time.Now().Add(pongWait))
    c.conn.SetPongHandler(func(string) error {
        c.conn.SetReadDeadline(time.Now().Add(pongWait))
        return nil
    })

    for {
        _, message, err := c.conn.ReadMessage()
        if err != nil {
            break
        }
        c.handleMessage(message)
    }
}

func (c *Client) WritePump() {
    ticker := time.NewTicker(heartbeatInterval)
    defer func() {
        ticker.Stop()
        c.conn.Close()
    }()

    for {
        select {
        case message, ok := <-c.send:
            c.conn.SetWriteDeadline(time.Now().Add(writeWait))
            if !ok {
                c.conn.WriteMessage(websocket.CloseMessage, []byte{})
                return
            }
            c.conn.WriteMessage(websocket.TextMessage, message)

        case <-ticker.C:
            c.conn.SetWriteDeadline(time.Now().Add(writeWait))
            if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }
        }
    }
}
```

## Message Routing

```go
func (c *Client) handleMessage(data []byte) {
    var msg Message
    if err := json.Unmarshal(data, &msg); err != nil {
        c.sendError("", "Invalid message format", "PARSE_ERROR")
        return
    }

    parts := strings.SplitN(msg.Type, ":", 2)
    if len(parts) != 2 {
        c.sendError(msg.TaskID, "Invalid message type format", "INVALID_TYPE")
        return
    }

    domain, action := parts[0], parts[1]

    switch domain {
    case "llm":
        c.handleLLM(action, msg)
    case "notification":
        c.handleNotification(action, msg)
    case "heartbeat":
        c.sendJSON(Message{Type: "heartbeat:pong"})
    default:
        c.sendError(msg.TaskID, "Unknown domain: "+domain, "UNKNOWN_DOMAIN")
    }
}
```

## LLM Streaming

### Multi-Provider Support
```go
func (c *Client) handleLLM(action string, msg Message) {
    switch action {
    case "stream":
        ctx, ok := c.reserveTaskSlot(msg.TaskID)
        if !ok {
            c.sendError(msg.TaskID, "Too many concurrent tasks", "MAX_TASKS")
            return
        }
        go c.streamLLM(ctx, msg)

    case "cancel":
        c.cancelTask(msg.TaskID)
    }
}

func (c *Client) reserveTaskSlot(taskID string) (context.Context, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()
    if len(c.tasks) >= maxConcurrentTasks {
        return nil, false
    }
    ctx, cancel := context.WithCancel(context.Background())
    c.tasks[taskID] = cancel
    return ctx, true
}

func (c *Client) cancelTask(taskID string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    if cancel, ok := c.tasks[taskID]; ok {
        cancel()
        delete(c.tasks, taskID)
    }
}

func (c *Client) finishTask(taskID string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    delete(c.tasks, taskID)
}

func (c *Client) streamLLM(ctx context.Context, msg Message) {
    defer c.finishTask(msg.TaskID)

    provider := getProvider(msg.Payload.Provider)
    stream, err := provider.StreamChat(ctx, msg.Payload)
    if err != nil {
        c.sendError(msg.TaskID, err.Error(), "PROVIDER_ERROR")
        return
    }

    for chunk := range stream {
        select {
        case <-ctx.Done():
            c.sendJSON(Message{
                Type:   "llm:cancelled",
                TaskID: msg.TaskID,
            })
            return
        default:
            c.sendJSON(Message{
                Type:    "llm:chunk",
                TaskID:  msg.TaskID,
                Payload: map[string]interface{}{"content": chunk.Content, "done": false},
            })
        }
    }

    c.sendJSON(Message{
        Type:    "llm:complete",
        TaskID:  msg.TaskID,
        Payload: map[string]interface{}{"done": true},
    })
}
```

### Provider Abstraction
```go
type LLMProvider interface {
    StreamChat(ctx context.Context, payload ChatPayload) (<-chan Chunk, error)
}

// Supported providers: OpenAI, Anthropic, Google AI, xAI, Groq
func getProvider(name string) LLMProvider {
    switch name {
    case "openai":
        return &OpenAIProvider{APIKey: os.Getenv("OPENAI_API_KEY")}
    case "anthropic":
        return &AnthropicProvider{APIKey: os.Getenv("ANTHROPIC_API_KEY")}
    case "google":
        return &GoogleAIProvider{APIKey: os.Getenv("GOOGLE_AI_API_KEY")}
    default:
        return &OpenAIProvider{APIKey: os.Getenv("OPENAI_API_KEY")}
    }
}
```

## Client-Side WebSocket (Vue 3 Composable)

```typescript
// composables/useWebSocket.ts
export function useWebSocket() {
    const socket = ref<WebSocket | null>(null)
    const connected = ref(false)
    const handlers = new Map<string, Set<Function>>()

    function connect(token: string) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const url = `${protocol}//${window.location.host}/ws?token=${token}`
        socket.value = new WebSocket(url)

        socket.value.onopen = () => { connected.value = true }
        socket.value.onclose = () => {
            connected.value = false
            scheduleReconnect()
        }
        socket.value.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            const domain = msg.type.split(':')[0]
            handlers.get(domain)?.forEach(fn => fn(msg))
        }
    }

    function send(type: string, taskId: string, payload: any) {
        socket.value?.send(JSON.stringify({ type, taskId, payload }))
    }

    function on(domain: string, handler: Function) {
        if (!handlers.has(domain)) handlers.set(domain, new Set())
        handlers.get(domain)!.add(handler)
    }

    return { connected, connect, send, on }
}
```

## Route Registration

```go
// In routes setup
r.HandleFunc("/ws", websocket.HandleWebSocket(cfg, db))
```
