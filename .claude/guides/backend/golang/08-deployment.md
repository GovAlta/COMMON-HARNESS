# Skill: Go Deployment

## Overview

Go applications are compiled to a single binary for deployment. This skill covers build, health checks, graceful shutdown, logging plus CI/CD.

## Build

### Production Binary
```bash
# Standard build
go build -o bin/server cmd/server/main.go

# Optimized build (strip debug info)
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/server cmd/server/main.go
```

### Docker Build
```dockerfile
# Multi-stage build
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server cmd/server/main.go

FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/.env.example .env.example

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3001/health/live || exit 1

CMD ["./server"]
```

## Health Probes

Three endpoints for orchestrator integration:

| Endpoint | Purpose | Checks | Probe Type |
|----------|---------|--------|-----------|
| `/health` | Basic health | App running | General |
| `/health/ready` | Readiness | DB connection | Readiness (K8s/Azure) |
| `/health/live` | Liveness | Always 200 | Liveness (K8s/Azure) |

### Probe Configuration
- **Liveness**: Check every 30s, 5s timeout, 3 retries
- **Readiness**: Check every 10s, 5s timeout, 3 retries
- **Startup**: Allow 60s for initial startup

## Graceful Shutdown

```go
func main() {
    // ... setup ...

    srv := &http.Server{
        Addr:    ":" + cfg.Port,
        Handler: router,
    }

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            logrus.Fatalf("Server error: %v", err)
        }
    }()

    <-quit
    logrus.Info("Shutting down...")

    // Phase 1: Stop accepting new connections (30s for in-flight requests)
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        logrus.Errorf("Server shutdown error: %v", err)
    }

    // Phase 2: Close database pool
    if db != nil {
        db.Close()
    }

    logrus.Info("Server stopped")
}
```

### Shutdown Order
1. Stop accepting new HTTP connections
2. Wait for in-flight requests to complete (30s timeout)
3. Close WebSocket connections
4. Close database connection pool
5. Flush log buffers
6. Exit

## Logging

### Structured Logging with Logrus
```go
func SetupLogging(cfg *config.Config) {
    // JSON format for production (machine-parseable)
    if cfg.Environment == "production" {
        logrus.SetFormatter(&logrus.JSONFormatter{
            TimestampFormat: time.RFC3339,
        })
    } else {
        logrus.SetFormatter(&logrus.TextFormatter{
            FullTimestamp: true,
        })
    }

    // Log level from config
    level, err := logrus.ParseLevel(cfg.LogLevel)
    if err != nil {
        level = logrus.InfoLevel
    }
    logrus.SetLevel(level)
}
```

### Log Rotation (lumberjack)
```go
import lumberjack "gopkg.in/natefinch/lumberjack.v2"

logrus.SetOutput(&lumberjack.Logger{
    Filename:   "/var/log/app/server.log",
    MaxSize:    100,  // MB
    MaxBackups: 10,
    MaxAge:     30,   // days
    Compress:   true,
})
```

### Log Fields Convention
```go
logrus.WithFields(logrus.Fields{
    "user_id":    userID,
    "action":     "create_user",
    "entity_id":  entityID,
    "request_id": reqID,
    "duration":   duration.String(),
    "status":     statusCode,
    "ip":         clientIP,
}).Info("Request completed")
```

### Rules
- **Never log**: Passwords, tokens, API keys, PII
- **Always log**: Request ID, user ID, action, status, duration
- **Production**: JSON format to stdout (captured by log aggregator)
- **Development**: Text format with colors

## CI/CD Pipeline

### GitHub Actions
```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: app_test
          POSTGRES_USER: ${{ env.SCRATCH_PG_USER }}
          POSTGRES_PASSWORD: ${{ env.SCRATCH_PG_PWD }}
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      - run: go mod download
        working-directory: backend-go
      - run: make test
        working-directory: backend-go
        env:
          DB_CONNECTION_STRING: postgres://test:PASSWORD@localhost:5432/app_test?sslmode=disable

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      - run: make build
        working-directory: backend-go
      - uses: actions/upload-artifact@v4
        with:
          name: server-binary
          path: backend-go/bin/server

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: server-binary
      # Deploy to target environment
```

## Environment Configuration

### Required Variables (Production)
```bash
# Server
PORT=3001
ENVIRONMENT=production
FRONTEND_URL=https://app.example.com

# Database (via vault/secrets manager)
DB_CONNECTION_STRING=postgres://...?sslmode=require

# JWT (minimum 32 characters)
JWT_SECRET=<from-vault>
JWT_REFRESH_SECRET=<from-vault>

# CORS
CORS_ORIGIN=https://app.example.com
```

### Security Checklist
- [ ] JWT_SECRET minimum 64 characters, from secrets manager
- [ ] DB_CONNECTION_STRING uses SSL (`sslmode=require`)
- [ ] CORS_ORIGIN set to exact production domain (no wildcards)
- [ ] ENVIRONMENT=production (enables secure cookies, disables debug logging)
- [ ] OAuth redirect URIs match production URLs
- [ ] Rate limiting configured appropriately
- [ ] Log level set to `info` or `warn` (not `debug`)
- [ ] Health probes configured in orchestrator
- [ ] Database connection pool sized for expected load

### Dependency Security
- [ ] `go mod verify` passes (checksums valid)
- [ ] `govulncheck ./...` reports zero known vulnerabilities
- [ ] Dependabot or Renovate configured for automated dependency updates
- [ ] `go mod tidy` run before each commit to remove unused dependencies

## Database Startup

```go
// Run on application startup
func InitializeDatabase(db *pgxpool.Pool) {
    ctx := context.Background()

    // Check connectivity
    if err := db.Ping(ctx); err != nil {
        logrus.WithError(err).Fatal("Database connectivity check failed")
    }

    // Refresh index statistics
    _, err := db.Exec(ctx, "ANALYZE")
    if err != nil {
        logrus.WithError(err).Warn("ANALYZE failed (non-fatal)")
    }

    logrus.Info("Database initialized successfully")
}
```
