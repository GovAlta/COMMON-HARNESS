import { env } from '../config/environment';

/**
 * Pluggable redaction stub for AI prompt egress.
 *
 * When AI_REDACTION_MODE=strict, common PII / secret patterns in user prompts
 * are replaced with bracketed placeholders before being forwarded to the LLM
 * provider. This is a starter set — production deployments should extend the
 * pattern list and consider a dedicated DLP library.
 *
 * Patterns are intentionally conservative — we'd rather miss a redaction than
 * mangle legitimate prose. Operators can tune REDACTION_PATTERNS or replace
 * the implementation entirely with a managed DLP API. The interface is
 * stable; only the regex set should change.
 */
type Pattern = { regex: RegExp; label: string };

const REDACTION_PATTERNS: Pattern[] = [
  // Email addresses
  { regex: /[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, label: '[REDACTED-EMAIL]' },
  // International phone numbers (loose: +cc plus 9-14 digits with optional separators)
  { regex: /\+?\d{1,3}[ -]?\(?\d{1,4}\)?[ -]?\d{2,4}[ -]?\d{2,4}[ -]?\d{0,4}/g, label: '[REDACTED-PHONE]' },
  // AWS access key IDs
  { regex: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, label: '[REDACTED-AWS-KEY-ID]' },
  // Google API keys
  { regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g, label: '[REDACTED-GOOGLE-API-KEY]' },
  // Slack bot tokens
  { regex: /\bxox[abprs]-[A-Za-z0-9-]{10,48}\b/g, label: '[REDACTED-SLACK-TOKEN]' },
  // GitHub personal access tokens / OAuth tokens
  { regex: /\bgh[pousr]_[A-Za-z0-9]{30,80}\b/g, label: '[REDACTED-GITHUB-TOKEN]' },
  // PEM-encoded private keys
  { regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: '[REDACTED-PRIVATE-KEY]' },
  // OpenAI-style API keys (sk-... 40+ chars)
  { regex: /\bsk-[A-Za-z0-9]{20,}\b/g, label: '[REDACTED-OPENAI-KEY]' },
  // Credit card numbers (loose: 13-19 digits with optional separators, must Luhn-pass to truly redact in stricter setups)
  { regex: /\b(?:\d[ -]?){13,19}\b/g, label: '[REDACTED-PAN]' },
];

/**
 * Apply redaction patterns to a single string. Returns the original string
 * unchanged when redaction is disabled.
 */
export function redactPrompt(text: string): string {
  if (env.AI_REDACTION_MODE !== 'strict') return text;
  if (!text) return text;
  let out = text;
  for (const { regex, label } of REDACTION_PATTERNS) {
    out = out.replace(regex, label);
  }
  return out;
}

/**
 * Redact every user-role message in a conversation. Assistant and system
 * messages pass through unchanged — they are server-controlled.
 */
export function redactConversation<T extends { role: string; content: string }>(messages: T[]): T[] {
  if (env.AI_REDACTION_MODE !== 'strict') return messages;
  return messages.map((m) => (m.role === 'user' ? { ...m, content: redactPrompt(m.content) } : m));
}
