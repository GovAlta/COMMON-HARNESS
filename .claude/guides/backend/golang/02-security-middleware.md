# Skill: Go Security Middleware Stack

## Overview

The middleware stack is applied in a specific order. Order matters. Changing it can break security guarantees.

## Middleware Chain (Exact Order)

```go
func Setup(cfg *config.Config, db *pgxpool.Pool) *chi.Mux {
    r := chi.NewRouter()

    // 1. Panic Recovery: catch panics, return 500
    r.Use(middleware.RecoverPanic)

    // 2. Proxy Headers: trust X-Forwarded-* from reverse proxy
    r.Use(middleware.ProxyHeaders)

    // 3. Request Logging: log method, path, status, duration
    r.Use(middleware.RequestLogger)

    // 4. Real IP: extract client IP from X-Forwarded-For
    r.Use(chimiddleware.RealIP)

    // 5. Request ID: generate/propagate X-Request-ID
    r.Use(chimiddleware.RequestID)

    // 6. CORS: handle cross-origin requests
    r.Use(corsMiddleware(cfg))

    // 7. Security Headers: CSP, HSTS, X-Frame-Options, etc.
    r.Use(middleware.SecurityHeaders)

    // 8. Compression: gzip response bodies
    r.Use(chimiddleware.Compress(5))

    // 9. CSRF Protection: validate tokens on state-changing requests
    r.Use(middleware.CSRFProtection(cfg))

    // 10. Rate Limiting: global rate limit
    r.Use(middleware.RateLimit(cfg))

    // 11. Request Timeout: 60-second deadline
    r.Use(chimiddleware.Timeout(60 * time.Second))

    // Routes
    r.Route("/api/v1", func(r chi.Router) {
        // Public routes (no auth)
        r.Group(func(r chi.Router) {
            routes.RegisterAuthRoutes(r, cfg, db)
            routes.RegisterHealthRoutes(r, db)
        })

        // Authenticated routes
        r.Group(func(r chi.Router) {
            r.Use(middleware.ApiKeyAuth(db))     // 12. API Key check (before JWT)
            r.Use(middleware.Authenticate(cfg))  // 13. JWT authentication
            routes.RegisterProtectedRoutes(r, cfg, db)
        })
    })

    return r
}
```

## Individual Middleware Implementations

### 1. Panic Recovery
```go
func RecoverPanic(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                logrus.WithField("panic", err).Error("Recovered from panic")
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusInternalServerError)
                json.NewEncoder(w).Encode(map[string]interface{}{
                    "success": false,
                    "error":   "Internal server error",
                    "code":    "INTERNAL_ERROR",
                })
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

### 2. Security Headers
```go
func SecurityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("X-XSS-Protection", "1; mode=block")
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        w.Header().Set("Content-Security-Policy",
            "default-src 'self'; "+
            "script-src 'self'; "+
            "style-src 'self' 'unsafe-inline'; "+
            "img-src 'self' data: blob:; "+
            "connect-src 'self' ws: wss:; "+
            "font-src 'self' data:; "+
            "frame-src 'none'; "+
            "object-src 'none'")
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
        next.ServeHTTP(w, r)
    })
}
```

### 3. CORS
```go
func corsMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
    origins := strings.Split(cfg.CORSOrigins, ",")
    for i := range origins {
        origins[i] = strings.TrimSpace(origins[i])
    }

    return cors.Handler(cors.Options{
        AllowedOrigins:   origins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Request-ID", "X-API-Key"},
        ExposedHeaders:   []string{"X-Request-ID"},
        AllowCredentials: true,
        MaxAge:           300,
    })
}
```

### 4. CSRF Protection
```go
func CSRFProtection(cfg *config.Config) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Skip safe methods
            if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
                next.ServeHTTP(w, r)
                return
            }

            // Skip if API key authenticated (stateless)
            if r.Context().Value("api_key_auth") != nil {
                next.ServeHTTP(w, r)
                return
            }

            // Skip auth endpoints (no session yet)
            if strings.HasPrefix(r.URL.Path, "/api/v1/auth/") {
                next.ServeHTTP(w, r)
                return
            }

            // Validate CSRF token
            headerToken := r.Header.Get("X-CSRF-Token")
            cookie, err := r.Cookie("csrf_token")
            if err != nil || !validateCSRFToken(cfg.CSRFSecret, headerToken, cookie.Value) {
                utils.SendError(w, &utils.ApiError{
                    StatusCode: http.StatusForbidden,
                    Message:    "CSRF validation failed",
                    Code:       "CSRF_MISMATCH",
                })
                return
            }

            next.ServeHTTP(w, r)
        })
    }
}

// Token format: timestamp:random:hmac_signature
func generateCSRFToken(secret string) string {
    timestamp := strconv.FormatInt(time.Now().Unix(), 10)
    random := make([]byte, 32)
    rand.Read(random)
    randomStr := hex.EncodeToString(random)

    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(timestamp + ":" + randomStr))
    signature := hex.EncodeToString(mac.Sum(nil))

    return timestamp + ":" + randomStr + ":" + signature
}

// GetCSRFToken returns a fresh CSRF token in both an httpOnly cookie and the response body.
// The frontend stores the body token in memory and sends it as X-CSRF-Token header.
// The backend validates the header against the httpOnly cookie.
func GetCSRFToken(cfg *config.Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        token := generateCSRFToken(cfg.CSRFSecret)
        http.SetCookie(w, &http.Cookie{
            Name:     "csrf_token",
            Value:    token,
            Path:     "/",
            HttpOnly: true,
            Secure:   cfg.Environment == "production",
            SameSite: http.SameSiteLaxMode,
        })
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"token": token})
    }
}

// csrfMaxAge is the maximum age of a CSRF token before it is considered expired.
const csrfMaxAge = 24 * time.Hour

// verifyCSRFSignature checks that a single token has a valid HMAC signature
// and has not expired. Returns true only if the structure, signature, and
// timestamp are all valid.
func verifyCSRFSignature(secret, token string) bool {
    parts := strings.SplitN(token, ":", 3)
    if len(parts) != 3 {
        return false
    }
    timestamp, randomStr, providedSig := parts[0], parts[1], parts[2]

    // Recompute HMAC over "timestamp:random" using the server secret
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(timestamp + ":" + randomStr))
    expectedSig := hex.EncodeToString(mac.Sum(nil))

    // Constant-time comparison of the provided signature vs expected
    if !hmac.Equal([]byte(providedSig), []byte(expectedSig)) {
        return false
    }

    // Verify the token has not expired
    ts, err := strconv.ParseInt(timestamp, 10, 64)
    if err != nil {
        return false
    }
    if time.Since(time.Unix(ts, 0)) > csrfMaxAge {
        return false
    }

    return true
}

func validateCSRFToken(secret, headerToken, cookieToken string) bool {
    if headerToken == "" || cookieToken == "" {
        return false
    }

    // 1. Verify the HMAC signature on the header token against the server secret.
    //    This proves the token was issued by this server, not forged by an attacker.
    if !verifyCSRFSignature(secret, headerToken) {
        return false
    }

    // 2. Verify the HMAC signature on the cookie token as well, so a tampered
    //    cookie cannot be paired with a legitimately signed header token.
    if !verifyCSRFSignature(secret, cookieToken) {
        return false
    }

    // 3. Constant-time comparison: header and cookie must match (double-submit pattern).
    return hmac.Equal([]byte(headerToken), []byte(cookieToken))
}
```

### 5. Rate Limiting
```go
func RateLimit(cfg *config.Config) func(http.Handler) http.Handler {
    // General: 200 requests per 15 minutes (per standards/02-security.md)
    limiter := httprate.NewRateLimiter(200, 15*time.Minute,
        httprate.WithKeyFuncs(httprate.KeyByRealIP),
    )
    return limiter.Handler
}

// Auth-specific rate limiter (applied to auth routes)
func AuthRateLimit(cfg *config.Config) func(http.Handler) http.Handler {
    limiter := httprate.NewRateLimiter(30, 15*time.Minute,
        httprate.WithKeyFuncs(httprate.KeyByRealIP),
    )
    return limiter.Handler
}
```

### 6. Request Logging
```go
func RequestLogger(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)

        next.ServeHTTP(ww, r)

        logrus.WithFields(logrus.Fields{
            "method":     r.Method,
            "path":       r.URL.Path,
            "status":     ww.Status(),
            "duration":   time.Since(start).String(),
            "ip":         r.RemoteAddr,
            "request_id": chimiddleware.GetReqID(r.Context()),
        }).Info("request completed")
    })
}
```

### 7. Authentication (JWT)
```go
func Authenticate(cfg *config.Config) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Skip if already authenticated via API key
            if r.Context().Value("user_id") != nil {
                next.ServeHTTP(w, r)
                return
            }

            // Extract token from Authorization header or cookie
            tokenString := extractToken(r)
            if tokenString == "" {
                utils.SendError(w, utils.Unauthorized("Authentication required"))
                return
            }

            // Parse and validate with algorithm pinning
            token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
                return []byte(cfg.JWTSecret), nil
            }, jwt.WithValidMethods([]string{"HS256"}))

            if err != nil || !token.Valid {
                utils.SendError(w, utils.Unauthorized("Invalid or expired token"))
                return
            }

            claims := token.Claims.(jwt.MapClaims)
            ctx := context.WithValue(r.Context(), "user_id", claims["sub"])
            ctx = context.WithValue(ctx, "user_role", claims["role"])
            ctx = context.WithValue(ctx, "user_email", claims["email"])

            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### 8. API Key Authentication
```go
func ApiKeyAuth(db *pgxpool.Pool) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            apiKey := r.Header.Get("X-API-Key")
            if apiKey == "" {
                apiKey = extractBearerToken(r)
                if apiKey == "" || !strings.HasPrefix(apiKey, "app_") {
                    // No API key, continue to JWT auth
                    next.ServeHTTP(w, r)
                    return
                }
            }

            // Validate API key against database
            user, err := validateApiKey(r.Context(), db, apiKey)
            if err != nil {
                utils.SendError(w, utils.Unauthorized("Invalid API key"))
                return
            }

            ctx := context.WithValue(r.Context(), "user_id", user.ID)
            ctx = context.WithValue(ctx, "user_role", user.Role)
            ctx = context.WithValue(ctx, "api_key_auth", true)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

## Health Check Endpoints

```go
// GET /health: basic health check
// GET /health/ready: readiness probe (checks DB)
// GET /health/live: liveness probe (always 200)

func RegisterHealthRoutes(r chi.Router, db *pgxpool.Pool) {
    r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
        utils.SendSuccess(w, http.StatusOK, map[string]string{"status": "ok"})
    })

    r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
        if err := db.Ping(r.Context()); err != nil {
            w.WriteHeader(http.StatusServiceUnavailable)
            json.NewEncoder(w).Encode(map[string]string{"status": "not ready"})
            return
        }
        utils.SendSuccess(w, http.StatusOK, map[string]string{"status": "ready"})
    })

    r.Get("/health/live", func(w http.ResponseWriter, r *http.Request) {
        utils.SendSuccess(w, http.StatusOK, map[string]string{"status": "alive"})
    })
}
```
