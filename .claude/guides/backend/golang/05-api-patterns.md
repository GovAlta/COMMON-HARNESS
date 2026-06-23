# Skill: Go API Patterns

## Overview

RESTful API design using Chi router. Covers consistent response formatting plus input validation, pagination, audit logging.

## Route Registration

### Route Groups by Auth Level
```go
func RegisterProtectedRoutes(r chi.Router, cfg *config.Config, db *pgxpool.Pool) {
    // Authenticated routes (all users)
    r.Route("/users", func(r chi.Router) {
        r.Get("/", controllers.ListUsers)
        r.Get("/{id}", controllers.GetUser)
    })

    // Admin routes (role-gated)
    r.Route("/admin", func(r chi.Router) {
        r.Use(middleware.RequireRole("org_admin"))
        r.Get("/users", controllers.AdminListUsers)
        r.Put("/users/{id}/role", controllers.UpdateUserRole)
    })

    // Super admin routes
    r.Route("/system", func(r chi.Router) {
        r.Use(middleware.RequireRole("super_admin"))
        r.Get("/audit-log", controllers.GetAuditLog)
    })
}
```

### Middleware Chains for Authorization
```go
// Public: No middleware
r.Get("/health", healthHandler)

// Authenticated: JWT required
r.Group(func(r chi.Router) {
    r.Use(middleware.Authenticate(cfg))
    r.Get("/api/v1/me", meHandler)
})

// Role-gated: JWT + minimum role
r.Group(func(r chi.Router) {
    r.Use(middleware.Authenticate(cfg))
    r.Use(middleware.RequireRole("org_admin"))
    r.Delete("/api/v1/users/{id}", deleteHandler)
})
```

## Controller Pattern

Controllers are thin handlers: extract input → call service → format response.

```go
// GET /api/v1/users
func ListUsers(w http.ResponseWriter, r *http.Request) {
    page, limit := utils.ParsePagination(r)

    users, total, err := services.ListUsers(r.Context(), page, limit)
    if err != nil {
        utils.SendError(w, r, err)
        return
    }

    utils.SendPaginated(w, users, utils.PaginationMeta{
        Page:  page,
        Limit: limit,
        Total: total,
    })
}

// POST /api/v1/users
func CreateUser(w http.ResponseWriter, r *http.Request) {
    var input services.CreateUserInput
    if err := utils.ParseJSON(r, &input); err != nil {
        utils.SendError(w, r, err)
        return
    }

    // Validate required fields
    if input.Name == "" || input.Email == "" {
        utils.SendError(w, r, utils.Validation(map[string]string{
            "name":  "Name is required",
            "email": "Email is required",
        }))
        return
    }

    user, err := services.CreateUser(r.Context(), input)
    if err != nil {
        utils.SendError(w, r, err)
        return
    }

    // Audit log
    userID := r.Context().Value("user_id").(string)
    utils.LogAudit(r.Context(), "user", user.ID.String(), "create", userID)

    utils.SendSuccess(w, http.StatusCreated, user)
}

// GET /api/v1/users/{id}
func GetUser(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        utils.SendError(w, r, utils.BadRequest("Invalid ID format"))
        return
    }

    user, err := services.GetUserByID(r.Context(), id)
    if err != nil {
        utils.SendError(w, r, err)
        return
    }

    utils.SendSuccess(w, http.StatusOK, user)
}

// PUT /api/v1/users/{id}
func UpdateUser(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        utils.SendError(w, r, utils.BadRequest("Invalid ID format"))
        return
    }

    var input services.UpdateUserInput
    if err := utils.ParseJSON(r, &input); err != nil {
        utils.SendError(w, r, err)
        return
    }

    user, err := services.UpdateUser(r.Context(), id, input)
    if err != nil {
        utils.SendError(w, r, err)
        return
    }

    utils.SendSuccess(w, http.StatusOK, user)
}

// DELETE /api/v1/users/{id}
func DeleteUser(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        utils.SendError(w, r, utils.BadRequest("Invalid ID format"))
        return
    }

    if err := services.DeleteUser(r.Context(), id); err != nil {
        utils.SendError(w, r, err)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}
```

## Response Format

### Consistent JSON Responses

```go
// Success response
{
    "success": true,
    "data": { ... }
}

// Paginated response
{
    "success": true,
    "data": [ ... ],
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 150,
        "totalPages": 8
    }
}

// Error response
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable message",
        "correlationId": "uuid"
    }
}

// Validation error response (422)
{
    "success": false,
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Validation failed",
        "details": {
            "name": "Name is required",
            "email": "Invalid email format"
        },
        "correlationId": "uuid"
    }
}
```

### Response Utility Functions
```go
package utils

import (
    "encoding/json"
    "errors"
    "net/http"

    chimiddleware "github.com/go-chi/chi/v5/middleware"
    "github.com/sirupsen/logrus"
)

func SendSuccess(w http.ResponseWriter, status int, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": true,
        "data":    data,
    })
}

func SendPaginated(w http.ResponseWriter, data interface{}, meta PaginationMeta) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": true,
        "data":    data,
        "meta":    meta,
    })
}

func SendError(w http.ResponseWriter, r *http.Request, err error) {
    correlationID := chimiddleware.GetReqID(r.Context())

    var apiErr *ApiError
    if errors.As(err, &apiErr) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(apiErr.StatusCode)
        errorObj := map[string]interface{}{
            "code":          apiErr.Code,
            "message":       apiErr.Message,
            "correlationId": correlationID,
        }
        if apiErr.Details != nil {
            errorObj["details"] = apiErr.Details
        }
        json.NewEncoder(w).Encode(map[string]interface{}{
            "success": false,
            "error":   errorObj,
        })
        return
    }

    // Unknown error: log and return generic message
    logrus.WithFields(logrus.Fields{
        "correlationId": correlationID,
    }).WithError(err).Error("Unhandled error")
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusInternalServerError)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": false,
        "error": map[string]interface{}{
            "code":          "INTERNAL_ERROR",
            "message":       "Internal server error",
            "correlationId": correlationID,
        },
    })
}

type PaginationMeta struct {
    Page       int `json:"page"`
    Limit      int `json:"limit"`
    Total      int `json:"total"`
    TotalPages int `json:"totalPages"`
}
```

## Input Validation

### JSON Parsing
```go
func ParseJSON(r *http.Request, v interface{}) error {
    if r.Header.Get("Content-Type") != "application/json" {
        return BadRequest("Content-Type must be application/json")
    }

    decoder := json.NewDecoder(r.Body)
    decoder.DisallowUnknownFields() // Reject unexpected fields
    if err := decoder.Decode(v); err != nil {
        return BadRequest("Invalid JSON: " + err.Error())
    }
    return nil
}
```

### Pagination Parsing
```go
func ParsePagination(r *http.Request) (page, limit int) {
    page, _ = strconv.Atoi(r.URL.Query().Get("page"))
    limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))

    if page < 1 {
        page = 1
    }
    if limit < 1 {
        limit = 20
    }
    if limit > 100 {
        limit = 100 // Maximum bound
    }
    return page, limit
}
```

### Field Validation
```go
func validateEmail(email string) error {
    if email == "" {
        return Validation(map[string]string{"email": "Email is required"})
    }
    if !strings.Contains(email, "@") {
        return Validation(map[string]string{"email": "Invalid email format"})
    }
    return nil
}

func validateUUID(s string) (uuid.UUID, error) {
    id, err := uuid.Parse(s)
    if err != nil {
        return uuid.Nil, BadRequest("Invalid UUID format")
    }
    return id, nil
}

func validateEnum(value string, allowed []string) error {
    for _, a := range allowed {
        if value == a {
            return nil
        }
    }
    return Validation(map[string]string{
        "value": fmt.Sprintf("Must be one of: %s", strings.Join(allowed, ", ")),
    })
}
```

## Error Types

```go
type ApiError struct {
    StatusCode int         `json:"-"`
    Message    string      `json:"message"`
    Code       string      `json:"code"`
    Details    interface{} `json:"details,omitempty"`
}

func (e *ApiError) Error() string { return e.Message }

func BadRequest(msg string) *ApiError {
    return &ApiError{StatusCode: 400, Message: msg, Code: "BAD_REQUEST"}
}

func Unauthorized(msg string) *ApiError {
    return &ApiError{StatusCode: 401, Message: msg, Code: "UNAUTHORIZED"}
}

func Forbidden(msg string) *ApiError {
    return &ApiError{StatusCode: 403, Message: msg, Code: "FORBIDDEN"}
}

func NotFound(entity string) *ApiError {
    return &ApiError{StatusCode: 404, Message: entity + " not found", Code: "NOT_FOUND"}
}

func Conflict(msg string) *ApiError {
    return &ApiError{StatusCode: 409, Message: msg, Code: "CONFLICT"}
}

func Validation(details interface{}) *ApiError {
    return &ApiError{StatusCode: 422, Message: "Validation failed", Code: "VALIDATION_ERROR", Details: details}
}

func TooManyRequests(msg string) *ApiError {
    return &ApiError{StatusCode: 429, Message: msg, Code: "TOO_MANY_REQUESTS"}
}
```

## HTTP Status Code Usage

| Status | When |
|--------|------|
| 200 OK | Successful GET, PUT, PATCH |
| 201 Created | Successful POST creating a resource |
| 204 No Content | Successful DELETE |
| 400 Bad Request | Malformed input, missing fields |
| 401 Unauthorized | Missing or invalid authentication |
| 403 Forbidden | Authenticated but insufficient permissions |
| 404 Not Found | Resource does not exist |
| 409 Conflict | Duplicate entry, version conflict |
| 422 Unprocessable Entity | Validation errors with field details |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Unexpected server failure |

## Adding a New Domain (Checklist)

1. Create model struct in `internal/models/`
2. Create controller file in `internal/controllers/` with CRUD handlers
3. Create service file in `internal/services/` with business logic
4. Register routes in `internal/routes/` with appropriate middleware
5. Add database migration in `migrations/`
6. Add audit logging for all mutations
7. Add RBAC permission checks if entity-scoped
8. Write controller tests in `*_test.go`
9. Update Swagger annotations and regenerate docs
