// P-V8-01: Structured JSON logger — each entry contains level, message, and
// timestamp only at the framework level. The logger itself does not automatically
// serialize request objects, user records, or any PII.
//
// The PII exposure identified as F-V8-01 originates in src/routes/employees.ts
// where the CALLER passes JSON.stringify(employee) as the message string.
// This logger cannot prevent a caller from embedding PII in the message argument,
// but it does not add any PII on its own.

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    writeLog('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    writeLog('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    writeLog('error', message, meta);
  },
};
