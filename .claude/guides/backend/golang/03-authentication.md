# Skill: Go Authentication

## Overview

Authentication uses JWT tokens with OAuth 2.0 SSO providers and optional API key authentication.

## JWT Token Management

### Token Types

| Token | Expiry | Algorithm | Storage (Client) | Storage (Server) |
|-------|--------|-----------|-------------------|------------------|
| Access | 15 min | HS256 | Memory (ref) | Not stored |
| Refresh | 7 days | HS256 | httpOnly cookie | SHA-256 hash in DB |

### Token Creation
```go
func GenerateTokenPair(cfg *config.Config, user *models.User) (accessToken string, refreshToken string, err error) {
    // Access token
    accessClaims := jwt.MapClaims{
        "sub":   user.ID.String(),
        "email": user.Email,
        "role":  user.Role,
        "iat":   time.Now().Unix(),
        "exp":   time.Now().Add(15 * time.Minute).Unix(),
    }
    access := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
    accessToken, err = access.SignedString([]byte(cfg.JWTSecret))
    if err != nil {
        return "", "", fmt.Errorf("signing access token: %w", err)
    }

    // Refresh token
    refreshClaims := jwt.MapClaims{
        "sub":  user.ID.String(),
        "type": "refresh",
        "iat":  time.Now().Unix(),
        "exp":  time.Now().Add(7 * 24 * time.Hour).Unix(),
    }
    refresh := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
    refreshToken, err = refresh.SignedString([]byte(cfg.JWTRefreshSecret))
    if err != nil {
        return "", "", fmt.Errorf("signing refresh token: %w", err)
    }

    // Store hashed refresh token in database
    hash := sha256.Sum256([]byte(refreshToken))
    hashedToken := hex.EncodeToString(hash[:])
    err = storeRefreshToken(context.Background(), user.ID, hashedToken, time.Now().Add(7*24*time.Hour))

    return accessToken, refreshToken, err
}
```

### Token Verification (Algorithm Pinning)
```go
func VerifyAccessToken(cfg *config.Config, tokenString string) (jwt.MapClaims, error) {
    token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
        // Verify algorithm is HS256 (prevent algorithm confusion attacks)
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
        }
        return []byte(cfg.JWTSecret), nil
    }, jwt.WithValidMethods([]string{"HS256"}))

    if err != nil {
        return nil, err
    }

    claims, ok := token.Claims.(jwt.MapClaims)
    if !ok || !token.Valid {
        return nil, fmt.Errorf("invalid token claims")
    }

    return claims, nil
}
```

### Refresh Token Rotation
```go
func RefreshTokens(cfg *config.Config, db *pgxpool.Pool, refreshTokenStr string) (newAccess, newRefresh string, err error) {
    // 1. Verify refresh token
    claims, err := verifyRefreshToken(cfg, refreshTokenStr)
    if err != nil {
        return "", "", utils.Unauthorized("Invalid refresh token")
    }

    userID := claims["sub"].(string)

    // 2. Hash the incoming refresh token
    hash := sha256.Sum256([]byte(refreshTokenStr))
    hashedToken := hex.EncodeToString(hash[:])

    // 3. Find and validate old token in database
    storedToken, err := findRefreshToken(context.Background(), db, hashedToken)
    if err != nil {
        return "", "", utils.Unauthorized("Refresh token not found")
    }

    // 4. Token theft detection: if the token was already revoked,
    // an attacker is replaying a stolen token. Revoke ALL tokens
    // for this user to force re-authentication everywhere.
    if storedToken.IsRevoked {
        revokeAllUserRefreshTokens(context.Background(), db, userID)
        return "", "", utils.Unauthorized("Token reuse detected; all sessions revoked")
    }

    // 5. Revoke the current token (normal rotation)
    err = revokeRefreshToken(context.Background(), db, userID, hashedToken)
    if err != nil {
        return "", "", utils.Unauthorized("Failed to rotate token")
    }

    // 6. Load user for new token claims
    user, err := services.GetUserByID(context.Background(), db, userID)
    if err != nil {
        return "", "", err
    }

    // 7. Generate new token pair
    return GenerateTokenPair(cfg, user)
}
```

## OAuth 2.0 Integration

### Google OAuth
```go
func GoogleLogin(cfg *config.Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Generate state nonce
        state := generateOAuthState()

        // Store state in httpOnly cookie
        http.SetCookie(w, &http.Cookie{
            Name:     "oauth_state",
            Value:    state,
            HttpOnly: true,
            Secure:   cfg.Environment == "production",
            SameSite: http.SameSiteLaxMode,
            MaxAge:   600, // 10 minutes
            Path:     "/",
        })

        // Redirect to Google
        url := fmt.Sprintf(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=openid+profile+email&state=%s",
            cfg.GoogleClientID,
            url.QueryEscape(cfg.GoogleCallbackURL),
            state,
        )
        http.Redirect(w, r, url, http.StatusTemporaryRedirect)
    }
}

func GoogleCallback(cfg *config.Config, db *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 1. Validate state parameter
        stateCookie, err := r.Cookie("oauth_state")
        if err != nil || r.URL.Query().Get("state") != stateCookie.Value {
            http.Error(w, "Invalid OAuth state", http.StatusBadRequest)
            return
        }

        // Clear state cookie
        http.SetCookie(w, &http.Cookie{
            Name:   "oauth_state",
            Value:  "",
            MaxAge: -1,
            Path:   "/",
        })

        // 2. Exchange code for tokens
        code := r.URL.Query().Get("code")
        googleUser, err := exchangeGoogleCode(cfg, code)
        if err != nil {
            http.Error(w, "OAuth exchange failed", http.StatusBadRequest)
            return
        }

        // 3. Find or create user (account linking by email)
        user, err := services.FindOrCreateOAuthUser(r.Context(), db, googleUser)
        if err != nil {
            http.Error(w, "User creation failed", http.StatusInternalServerError)
            return
        }

        // 4. Generate JWT tokens
        accessToken, refreshToken, err := GenerateTokenPair(cfg, user)
        if err != nil {
            http.Error(w, "Token generation failed", http.StatusInternalServerError)
            return
        }

        // 5. Set cookies and redirect to frontend
        setAuthCookies(w, cfg, accessToken, refreshToken)
        http.Redirect(w, r, cfg.FrontendURL+"/auth/callback", http.StatusTemporaryRedirect)
    }
}
```

### Microsoft OAuth (Azure AD)
```go
func MicrosoftLogin(cfg *config.Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        state := generateOAuthState()
        setStateCookie(w, cfg, state)

        url := fmt.Sprintf(
            "https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?client_id=%s&redirect_uri=%s&response_type=code&scope=openid+profile+email&state=%s",
            cfg.MicrosoftTenantID,
            cfg.MicrosoftClientID,
            url.QueryEscape(cfg.MicrosoftCallbackURL),
            state,
        )
        http.Redirect(w, r, url, http.StatusTemporaryRedirect)
    }
}
```

## Cookie Management

### Setting Auth Cookies
```go
func setAuthCookies(w http.ResponseWriter, cfg *config.Config, accessToken, refreshToken string) {
    secure := cfg.Environment == "production"

    // Access token cookie (short-lived, frontend reads via API)
    http.SetCookie(w, &http.Cookie{
        Name:     "access_token",
        Value:    accessToken,
        HttpOnly: true,
        Secure:   secure,
        SameSite: http.SameSiteLaxMode,
        MaxAge:   900, // 15 minutes
        Path:     "/",
    })

    // Refresh token cookie (long-lived, httpOnly)
    http.SetCookie(w, &http.Cookie{
        Name:     "refresh_token",
        Value:    refreshToken,
        HttpOnly: true,
        Secure:   secure,
        SameSite: http.SameSiteLaxMode,
        MaxAge:   604800, // 7 days
        Path:     "/",
    })

    // CSRF token (httpOnly; token is delivered via response body, not cookie reading)
    csrfToken := generateCSRFToken(cfg.CSRFSecret)
    http.SetCookie(w, &http.Cookie{
        Name:     "csrf_token",
        Value:    csrfToken,
        HttpOnly: true,
        Secure:   secure,
        SameSite: http.SameSiteLaxMode,
        MaxAge:   900,
        Path:     "/",
    })
}
```

### Clearing Auth Cookies (Logout)
```go
func clearAuthCookies(w http.ResponseWriter) {
    for _, name := range []string{"access_token", "refresh_token", "csrf_token"} {
        http.SetCookie(w, &http.Cookie{
            Name:   name,
            Value:  "",
            MaxAge: -1,
            Path:   "/",
        })
    }
}

// CSRF Token Endpoint: returns token in response body for JavaScript access
func GetCSRFToken(cfg *config.Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        csrfToken := generateCSRFToken(cfg.CSRFSecret)
        http.SetCookie(w, &http.Cookie{
            Name:     "csrf_token",
            Value:    csrfToken,
            HttpOnly: true,
            Secure:   cfg.Environment == "production",
            SameSite: http.SameSiteLaxMode,
            Path:     "/",
        })
        utils.SendSuccess(w, http.StatusOK, map[string]string{
            "token": csrfToken,
        })
    }
}
```

## Auth Controller Endpoints

```
POST   /api/v1/auth/register          : Create account (email/password)
POST   /api/v1/auth/login             : Login (email/password)
POST   /api/v1/auth/logout            : Logout (revoke tokens, clear cookies)
POST   /api/v1/auth/refresh           : Refresh token pair
GET    /api/v1/auth/me                : Get current user profile
GET    /api/v1/auth/csrf-token        : Get CSRF token (cookie + response body)
GET    /api/v1/auth/google            : Initiate Google OAuth
GET    /api/v1/auth/google/callback   : Google OAuth callback
GET    /api/v1/auth/microsoft         : Initiate Microsoft OAuth
GET    /api/v1/auth/microsoft/callback: Microsoft OAuth callback
```

## API Key Authentication

### Key Format
- Prefix: `app_` (identifies application API keys)
- Format: `app_` + 48 random bytes (base64url encoded)

### Key Storage
- Only the SHA-256 hash is stored in the database
- Original key shown once at creation, never retrievable

### Validation Flow
```go
func validateApiKey(ctx context.Context, db *pgxpool.Pool, key string) (*models.User, error) {
    hash := sha256.Sum256([]byte(key))
    hashedKey := hex.EncodeToString(hash[:])

    var user models.User
    err := db.QueryRow(ctx,
        `SELECT u.id, u.email, u.role FROM api_keys ak
         JOIN users u ON ak.user_id = u.id
         WHERE ak.key_hash = $1 AND ak.is_active = true AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
        hashedKey,
    ).Scan(&user.ID, &user.Email, &user.Role)

    if err != nil {
        return nil, err
    }

    // Track usage
    db.Exec(ctx, `UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $1 WHERE key_hash = $2`,
        "", hashedKey) // IP extracted from request context

    return &user, nil
}
```

## Account Lockout

```go
const maxFailedAttempts = 5
const lockoutDuration = 15 * time.Minute

func checkAccountLockout(ctx context.Context, db *pgxpool.Pool, email string) error {
    var failedAttempts int
    var lockedUntil *time.Time

    err := db.QueryRow(ctx,
        `SELECT failed_login_attempts, locked_until FROM users WHERE email = $1`,
        email,
    ).Scan(&failedAttempts, &lockedUntil)

    if err != nil {
        return err
    }

    if lockedUntil != nil && time.Now().Before(*lockedUntil) {
        return utils.TooManyRequests("Account temporarily locked. Try again later.")
    }

    return nil
}

func recordFailedLogin(ctx context.Context, db *pgxpool.Pool, email string) {
    db.Exec(ctx,
        `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE WHEN failed_login_attempts + 1 >= $1 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
         WHERE email = $2`,
        maxFailedAttempts, email,
    )
}

func resetFailedLogin(ctx context.Context, db *pgxpool.Pool, email string) {
    db.Exec(ctx,
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = $1`,
        email,
    )
}
```
