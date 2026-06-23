// F-V6-01: HARDCODED SECRET — weak key embedded in source, no rotation policy.
// This secret is committed to version control and known to anyone with repo access.
// F-V6-02: Algorithm HS256 with a short, guessable key — susceptible to offline
// brute-force. Minimum recommended secret length for HS256 is 256 bits (32 bytes).
export const JWT_SECRET = 'dir-secret-2024'; // HARDCODED SECRET
export const JWT_ALGORITHM = 'HS256';

export const PORT = process.env.PORT || 3000;

// P-V9-01: HTTPS on port 443 in production — ensure reverse proxy terminates TLS
// and forwards X-Forwarded-Proto so the app can detect HTTPS context.
export const HTTPS_PORT = 443;

export const DB_PATH = process.env.DB_PATH || './data/employees.db';

// F-V14-01: DEBUG flag — conditionally exposes internal paths, DB filenames, and
// environment variables in API responses. Must never be true in production.
export const DEBUG = process.env.NODE_ENV !== 'production';
