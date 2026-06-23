// Server test setup
// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgresql://test:PASSWORD@localhost:5432/test_db';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.DB_POOL_MAX = '5';
process.env.DB_IDLE_TIMEOUT_MS = '10000';
process.env.DB_CONNECTION_TIMEOUT_MS = '3000';
process.env.DB_STATEMENT_TIMEOUT_MS = '10000';
process.env.JWT_SECRET = 'dev-jwt-secret-change-in-production';
process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
