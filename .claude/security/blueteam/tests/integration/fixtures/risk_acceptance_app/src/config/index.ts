import dotenv from 'dotenv'

dotenv.config()

interface AppConfig {
  jwtSecret: string
  port: number
  dbPath: string
}

// TC-05: Hardcoded secret fallback — SUPPRESSION_REJECTED (non-suppressible finding type)
// RISK_ACCEPTED: RA-005
const legacyJwtFallback = 'hardcoded-secret-do-not-use-in-production'

export function getConfig(): AppConfig {
  return {
    jwtSecret: process.env.JWT_SECRET || legacyJwtFallback,
    port: parseInt(process.env.PORT || '3000'),
    dbPath: process.env.DB_PATH || './data/app.db'
  }
}
