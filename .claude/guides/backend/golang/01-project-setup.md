# Skill: Go Project Setup

## Overview

Set up a Go backend with Chi router, PostgreSQL (pgx), and Vue 3 frontend.

## Go Backend Setup

### Module Initialization
```bash
mkdir -p backend-go/cmd/server
mkdir -p backend-go/internal/{auth,config,controllers,middleware,models,rbac,routes,services,testutil,utils,websocket}
mkdir -p backend-go/migrations
mkdir -p backend-go/docs
cd backend-go
go mod init github.com/your-org/<project-name>
```

### Core Dependencies
```bash
# Router
go get github.com/go-chi/chi/v5
go get github.com/go-chi/cors
go get github.com/go-chi/httprate

# Database
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool

# Authentication
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/crypto/bcrypt
go get github.com/google/uuid

# Configuration
go get github.com/joho/godotenv

# Logging
go get github.com/sirupsen/logrus
go get gopkg.in/natefinish/lumberjack.v2

# WebSocket
go get github.com/gorilla/websocket

# Swagger
go get github.com/swaggo/swag/cmd/swag
go get github.com/swaggo/http-swagger

# Development
go install github.com/air-verse/air@latest
```

### Entry Point (cmd/server/main.go)
```go
package main

import (
    "context"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/your-org/<project>/internal/config"
    "github.com/your-org/<project>/internal/routes"
    "github.com/sirupsen/logrus"
)

func main() {
    // Load configuration
    cfg := config.Load()

    // Connect to database
    db, err := config.ConnectDB(cfg)
    if err != nil {
        logrus.WithError(err).Warn("Starting in degraded mode (no database)")
    }
    defer config.Close(db)

    // Setup router
    router := routes.Setup(cfg, db)

    // Create server
    srv := &http.Server{
        Addr:    ":" + cfg.Port,
        Handler: router,
    }

    // Graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        logrus.Infof("Server starting on port %s", cfg.Port)
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            logrus.Fatalf("Server error: %v", err)
        }
    }()

    <-quit
    logrus.Info("Shutting down server...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        logrus.Fatalf("Server forced shutdown: %v", err)
    }

    logrus.Info("Server stopped")
}
```

### Configuration (internal/config/config.go)
```go
package config

import (
    "os"
    "strconv"

    "github.com/joho/godotenv"
    "github.com/sirupsen/logrus"
)

type Config struct {
    Port            string
    Environment     string
    FrontendURL     string
    APIBasePath     string
    DBConnString    string
    DBPoolMin       int
    DBPoolMax       int
    JWTSecret       string
    JWTRefreshSecret string
    CSRFSecret      string
    CORSOrigins     string
    // Add more as needed
}

func Load() *Config {
    godotenv.Load() // .env file optional

    cfg := &Config{
        Port:            getEnv("PORT", "3001"),
        Environment:     getEnv("ENVIRONMENT", "development"),
        FrontendURL:     getEnv("FRONTEND_URL", "http://localhost:5173"),
        APIBasePath:     getEnv("API_BASE_PATH", "/api/v1"),
        DBConnString:    os.Getenv("DB_CONNECTION_STRING"),
        DBPoolMin:       getEnvInt("DB_POOL_MIN", 2),
        DBPoolMax:       getEnvInt("DB_POOL_MAX", 20),
        JWTSecret:       os.Getenv("JWT_SECRET"),
        JWTRefreshSecret: os.Getenv("JWT_REFRESH_SECRET"),
        CSRFSecret:      os.Getenv("CSRF_SECRET"),
        CORSOrigins:     getEnv("CORS_ORIGIN", "http://localhost:5173"),
    }

    cfg.validate()
    return cfg
}

func (c *Config) validate() {
    if c.Environment == "production" {
        if len(c.JWTSecret) < 32 {
            logrus.Fatal("JWT_SECRET must be at least 32 characters in production")
        }
        if len(c.JWTRefreshSecret) < 32 {
            logrus.Fatal("JWT_REFRESH_SECRET must be at least 32 characters in production")
        }
    }
}
```

### Database Connection (internal/config/database.go)
```go
package config

import (
    "context"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/sirupsen/logrus"
)

var DB *pgxpool.Pool

func ConnectDB(cfg *Config) (*pgxpool.Pool, error) {
    if cfg.DBConnString == "" {
        return nil, fmt.Errorf("DB_CONNECTION_STRING not set")
    }

    poolConfig, err := pgxpool.ParseConfig(cfg.DBConnString)
    if err != nil {
        return nil, fmt.Errorf("parsing DB config: %w", err)
    }

    poolConfig.MinConns = int32(cfg.DBPoolMin)
    poolConfig.MaxConns = int32(cfg.DBPoolMax)
    poolConfig.MaxConnIdleTime = 30 * time.Second

    // Retry with exponential backoff
    var pool *pgxpool.Pool
    delays := []time.Duration{2, 4, 8, 16, 32}
    for i, delay := range delays {
        pool, err = pgxpool.NewWithConfig(context.Background(), poolConfig)
        if err == nil {
            if err = pool.Ping(context.Background()); err == nil {
                break
            }
        }
        logrus.Warnf("DB connection attempt %d failed, retrying in %ds...", i+1, delay)
        time.Sleep(delay * time.Second)
    }

    if err != nil {
        return nil, fmt.Errorf("connecting to database after retries: %w", err)
    }

    DB = pool
    logrus.Info("Database connected successfully")
    return pool, nil
}

func Close(pool *pgxpool.Pool) {
    if pool != nil {
        pool.Close()
    }
}
```

### Makefile
```makefile
.PHONY: build dev test test-unit test-integration test-coverage swagger clean

build:
	go build -o bin/server cmd/server/main.go

dev:
	@which air > /dev/null 2>&1 || go install github.com/air-verse/air@latest
	air

test:
	go test ./... -v -count=1 -coverprofile=coverage.out

test-unit:
	go test ./internal/... -v -short -count=1

test-integration:
	go test ./internal/... -v -run Integration -count=1

test-rbac:
	go test ./internal/rbac/... -v -count=1

test-coverage:
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html

swagger:
	swag init -g cmd/server/main.go -o docs/

clean:
	rm -rf bin/ tmp/ coverage.out coverage.html
```

### Environment Template (.env.example)
```bash
# Server
PORT=3001
HOST=localhost
ENVIRONMENT=development
API_BASE_PATH=/api/v1
FRONTEND_URL=http://localhost:5173

# Database
DB_CONNECTION_STRING=postgres://user:PASSWORD@localhost:5432/app?sslmode=disable
DB_POOL_MIN=2
DB_POOL_MAX=20

# JWT
JWT_SECRET=change-me-to-a-strong-secret-at-least-32-chars
JWT_REFRESH_SECRET=change-me-to-another-strong-secret-at-least-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=168h

# CSRF
CSRF_ENABLED=true
CSRF_SECRET=change-me-csrf-secret-at-least-32-chars

# CORS
CORS_ORIGIN=http://localhost:5173

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_CALLBACK_URL=http://localhost:3001/api/v1/auth/microsoft/callback

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=200
AUTH_RATE_LIMIT_MAX_REQ=30

# Logging
LOG_LEVEL=debug
```

## Frontend Setup

See `skills/frontend/01-client-architecture.md` for Vue 3 + PrimeVue setup.

## Development Workflow

```bash
# Terminal 1: Backend
cd backend-go && make dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

The frontend Vite dev server proxies `/api` requests to the Go backend on port 3001.
