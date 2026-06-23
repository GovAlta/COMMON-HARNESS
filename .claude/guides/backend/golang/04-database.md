# Skill: Go Database Patterns (PostgreSQL + pgx)

## Overview

All applications use PostgreSQL with the `pgx` driver and `pgxpool` connection pooling. No ORM. Raw parameterized SQL gives explicit control.

### PostgreSQL Version Requirement

This skill requires **PostgreSQL 15+** (recommended **17+** per `standards/02-security.md`). Verify at startup:

```go
var version int
err := pool.QueryRow(ctx, "SHOW server_version_num").Scan(&version)
if version < 150000 {
    log.Fatalf("PostgreSQL 15+ required, found version %d", version)
}
```

## Connection Setup

```go
// Connection pooling with pgxpool
poolConfig, _ := pgxpool.ParseConfig(connectionString)
poolConfig.MinConns = 2
poolConfig.MaxConns = 20
poolConfig.MaxConnIdleTime = 30 * time.Second

pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
```

### Retry with Exponential Backoff
```go
delays := []time.Duration{2*time.Second, 4*time.Second, 8*time.Second, 16*time.Second, 32*time.Second}
for i, delay := range delays {
    pool, err = pgxpool.NewWithConfig(ctx, poolConfig)
    if err == nil {
        if err = pool.Ping(ctx); err == nil {
            break
        }
    }
    logrus.Warnf("DB attempt %d failed, retrying in %v...", i+1, delay)
    time.Sleep(delay)
}
```

## Query Patterns

### Required Imports
```go
import (
    "context"
    "fmt"

    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/google/uuid"
)
```

### CRITICAL: Always Use Parameterized Queries
```go
// CORRECT: parameterized
row := db.QueryRow(ctx, "SELECT id, name, email FROM users WHERE id = $1", userID)

// NEVER DO THIS: SQL injection vulnerability
row := db.QueryRow(ctx, "SELECT * FROM users WHERE id = '" + userID + "'")
```

### Single Row Query
```go
func GetUserByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*User, error) {
    var user User
    err := db.QueryRow(ctx,
        `SELECT id, name, email, role, created_at, updated_at
         FROM users WHERE id = $1 AND is_deleted = false`,
        id,
    ).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.CreatedAt, &user.UpdatedAt)

    if err == pgx.ErrNoRows {
        return nil, utils.NotFound("User")
    }
    if err != nil {
        return nil, fmt.Errorf("querying user: %w", err)
    }
    return &user, nil
}
```

### Multiple Row Query with Pagination
```go
func ListUsers(ctx context.Context, db *pgxpool.Pool, page, limit int) ([]User, int, error) {
    offset := (page - 1) * limit

    // Get total count
    var total int
    err := db.QueryRow(ctx,
        `SELECT COUNT(*) FROM users WHERE is_deleted = false`,
    ).Scan(&total)
    if err != nil {
        return nil, 0, fmt.Errorf("counting users: %w", err)
    }

    // Get page of results
    rows, err := db.Query(ctx,
        `SELECT id, name, email, role, created_at
         FROM users WHERE is_deleted = false
         ORDER BY name ASC
         LIMIT $1 OFFSET $2`,
        limit, offset,
    )
    if err != nil {
        return nil, 0, fmt.Errorf("listing users: %w", err)
    }
    defer rows.Close()

    var users []User
    for rows.Next() {
        var u User
        if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.CreatedAt); err != nil {
            return nil, 0, fmt.Errorf("scanning user: %w", err)
        }
        users = append(users, u)
    }

    return users, total, nil
}
```

### Insert with Returning
```go
func CreateUser(ctx context.Context, db *pgxpool.Pool, input CreateUserInput) (*User, error) {
    var user User
    err := db.QueryRow(ctx,
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role, created_at, updated_at`,
        input.Name, input.Email, input.PasswordHash, input.Role,
    ).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.CreatedAt, &user.UpdatedAt)

    if err != nil {
        return nil, mapPgError(err)
    }
    return &user, nil
}
```

### Update
```go
func UpdateUser(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, input UpdateUserInput) (*User, error) {
    var user User
    err := db.QueryRow(ctx,
        `UPDATE users SET name = $1, email = $2, updated_at = NOW()
         WHERE id = $3 AND is_deleted = false
         RETURNING id, name, email, role, created_at, updated_at`,
        input.Name, input.Email, id,
    ).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.CreatedAt, &user.UpdatedAt)

    if err == pgx.ErrNoRows {
        return nil, utils.NotFound("User")
    }
    if err != nil {
        return nil, mapPgError(err)
    }
    return &user, nil
}
```

### Soft Delete
```go
func DeleteUser(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
    result, err := db.Exec(ctx,
        `UPDATE users SET is_deleted = true, deleted_at = NOW() WHERE id = $1 AND is_deleted = false`,
        id,
    )
    if err != nil {
        return fmt.Errorf("deleting user: %w", err)
    }
    if result.RowsAffected() == 0 {
        return utils.NotFound("User")
    }
    return nil
}
```

## Transactions

```go
func TransferOwnership(ctx context.Context, db *pgxpool.Pool, fromID, toID, entityID uuid.UUID) error {
    tx, err := db.Begin(ctx)
    if err != nil {
        return fmt.Errorf("beginning transaction: %w", err)
    }
    defer tx.Rollback(ctx) // No-op if committed

    // Remove old ownership
    _, err = tx.Exec(ctx,
        `DELETE FROM user_permissions WHERE user_id = $1 AND entity_id = $2`,
        fromID, entityID,
    )
    if err != nil {
        return fmt.Errorf("removing old ownership: %w", err)
    }

    // Grant new ownership
    _, err = tx.Exec(ctx,
        `INSERT INTO user_permissions (user_id, entity_type, entity_id, scope)
         VALUES ($1, 'organization', $2, 'all')`,
        toID, entityID,
    )
    if err != nil {
        return fmt.Errorf("granting new ownership: %w", err)
    }

    return tx.Commit(ctx)
}
```

## Error Mapping

Map PostgreSQL error codes to API-friendly errors:

```go
func mapPgError(err error) error {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) {
        switch pgErr.Code {
        case "23505": // unique_violation
            return &utils.ApiError{
                StatusCode: http.StatusConflict,
                Message:    "A record with this value already exists",
                Code:       "DUPLICATE_ENTRY",
                Details:    map[string]string{"constraint": pgErr.ConstraintName},
            }
        case "23503": // foreign_key_violation
            return &utils.ApiError{
                StatusCode: http.StatusBadRequest,
                Message:    "Referenced record does not exist",
                Code:       "FOREIGN_KEY_VIOLATION",
            }
        case "23502": // not_null_violation
            return &utils.ApiError{
                StatusCode: http.StatusBadRequest,
                Message:    fmt.Sprintf("Field '%s' is required", pgErr.ColumnName),
                Code:       "REQUIRED_FIELD",
            }
        case "23514": // check_violation
            return &utils.ApiError{
                StatusCode: http.StatusBadRequest,
                Message:    "Value does not meet constraints",
                Code:       "CHECK_VIOLATION",
            }
        }
    }

    if errors.Is(err, pgx.ErrNoRows) {
        return utils.NotFound("Record")
    }

    return fmt.Errorf("database error: %w", err)
}
```

## Migration System

### File Structure
```
migrations/
├── 001_initial_schema.sql      # Core tables, extensions, functions
├── 002_add_audit_log.sql       # Audit trail
├── 003_add_permissions.sql     # RBAC tables
├── seed.sql                    # Reference data & test fixtures
└── test-harness.sql            # E2E test data
```

### Migration File Pattern
```sql
-- migrations/001_initial_schema.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema
CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_users_email ON users(email) WHERE is_deleted = false;
CREATE INDEX idx_users_role ON users(role) WHERE is_deleted = false;
```

### Schema Conventions

| Convention | Rule | Example |
|-----------|------|---------|
| Primary keys | UUID with auto-generation | `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` |
| Timestamps | TIMESTAMPTZ, never TIMESTAMP | `created_at TIMESTAMPTZ DEFAULT NOW()` |
| Soft deletes | Boolean flag + timestamp | `is_deleted BOOLEAN, deleted_at TIMESTAMPTZ` |
| Foreign keys | Named constraints | `CONSTRAINT fk_user REFERENCES users(id)` |
| Indexes | On FKs and common query columns | `CREATE INDEX idx_users_email ON users(email)` |
| JSONB | For flexible/dynamic data | `metadata JSONB DEFAULT '{}'` |
| Naming | snake_case for tables and columns | `user_permissions`, `created_at` |

## Audit Logging

```go
func LogAudit(ctx context.Context, db *pgxpool.Pool, entry AuditEntry) {
    _, err := db.Exec(ctx,
        `INSERT INTO audit_log (user_id, entity_type, entity_id, action, ip_address, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        entry.UserID, entry.EntityType, entry.EntityID, entry.Action, entry.IPAddress, entry.Details,
    )
    if err != nil {
        // Audit logging must never crash the application
        logrus.WithError(err).Error("Failed to write audit log")
    }
}

type AuditEntry struct {
    UserID     uuid.UUID
    EntityType string
    EntityID   uuid.UUID
    Action     string
    IPAddress  string
    Details    interface{} // Serialized as JSONB
}
```
