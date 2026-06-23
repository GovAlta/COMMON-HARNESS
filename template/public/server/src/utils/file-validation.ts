/**
 * File validation utility.
 * Validates file types by inspecting magic bytes (file signatures).
 * Ensures that the actual file content matches the declared MIME type
 * (defence-in-depth against extension spoofing and MIME-claim mismatch).
 *
 * Types fall into two categories:
 *   - **Binary** types have a deterministic magic-byte signature and are
 *     strictly verified (declared MIME must match detected signature).
 *   - **Text** types (plain text, CSV, JSON, XML, Markdown) have no reliable
 *     signature and are accepted based on declared MIME alone, with a
 *     heuristic check that the buffer is mostly printable text.
 *
 * Office Open XML (.docx/.xlsx/.pptx) and .zip all share the same ZIP magic
 * bytes (PK\x03\x04). Magic-byte detection returns 'application/zip' for
 * those; the declared MIME is then trusted (the file IS a ZIP either way).
 */

/** Allowed MIME types for file uploads */
export const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  'application/rtf',
  // Plain text family (no magic bytes — accepted by declared MIME + text heuristic)
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
  // Office Open XML (ZIP-based)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Legacy Office (CFB)
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  // Archives
  'application/zip',
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/** Types accepted without a magic-byte signature (text-based formats). */
const TEXT_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
]);

/** Office Open XML + zip all match the ZIP signature. */
const ZIP_BASED_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Legacy Office (Word 97-2003 / Excel 97-2003 / PowerPoint 97-2003) — CFB compound file. */
const CFB_BASED_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

/** Maximum file size in bytes (10 MB). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Magic byte signatures. Returned `mimeType` is the *category* signature,
 * not necessarily the user-declared MIME. The caller cross-checks declared
 * vs detected with format-family awareness (ZIP-vs-docx, etc.).
 */
interface MagicBytePattern {
  /** Category label returned by `detectMimeType`. */
  signature: string;
  bytes: number[];
  offset?: number;
}

const MAGIC_BYTE_PATTERNS: MagicBytePattern[] = [
  // JPEG: FF D8 FF
  { signature: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { signature: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  // GIF87a / GIF89a: 47 49 46 38 [37|39] 61
  { signature: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { signature: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  // BMP: 42 4D
  { signature: 'image/bmp',  bytes: [0x42, 0x4D] },
  // TIFF: 49 49 2A 00 (little-endian) / 4D 4D 00 2A (big-endian)
  { signature: 'image/tiff', bytes: [0x49, 0x49, 0x2A, 0x00] },
  { signature: 'image/tiff', bytes: [0x4D, 0x4D, 0x00, 0x2A] },
  // WEBP: RIFF…WEBP (handled specially below)
  { signature: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  // PDF: %PDF
  { signature: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  // RTF: {\rtf
  { signature: 'application/rtf', bytes: [0x7B, 0x5C, 0x72, 0x74, 0x66] },
  // ZIP / Office Open XML: PK\x03\x04
  { signature: 'application/zip', bytes: [0x50, 0x4B, 0x03, 0x04] },
  // Empty ZIP variants (rare): PK\x05\x06 / PK\x07\x08
  { signature: 'application/zip', bytes: [0x50, 0x4B, 0x05, 0x06] },
  { signature: 'application/zip', bytes: [0x50, 0x4B, 0x07, 0x08] },
  // Legacy Office (CFB): D0 CF 11 E0 A1 B1 1A E1
  { signature: 'application/x-cfb', bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] },
];

/**
 * Detect file category from magic bytes. Returns the signature label
 * (NOT necessarily the user-declared MIME). Callers map signature → MIME
 * via the family sets above.
 */
export function detectMimeType(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 2) return null;

  for (const pattern of MAGIC_BYTE_PATTERNS) {
    const offset = pattern.offset || 0;
    if (buffer.length < offset + pattern.bytes.length) continue;

    let match = true;
    for (let i = 0; i < pattern.bytes.length; i++) {
      if (buffer[offset + i] !== pattern.bytes[i]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    // WEBP needs the trailing "WEBP" tag at offset 8 to disambiguate from
    // other RIFF containers (WAV, AVI, etc.).
    if (pattern.signature === 'image/webp') {
      if (buffer.length < 12) continue;
      const webpTag = [0x57, 0x45, 0x42, 0x50];
      let webpMatch = true;
      for (let i = 0; i < webpTag.length; i++) {
        if (buffer[8 + i] !== webpTag[i]) { webpMatch = false; break; }
      }
      if (!webpMatch) continue;
    }

    return pattern.signature;
  }

  return null;
}

/** Declared MIME type membership check. */
export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Heuristic check that a buffer is "mostly text". Used as a soft validation
 * for text/plain, text/csv, application/json, etc. — formats with no magic
 * bytes. Counts non-printable, non-whitespace bytes in the first 4 KB; if
 * fewer than 5% are non-printable, accept as text.
 */
function looksLikeText(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.slice(0, 4096);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    // Printable ASCII + common whitespace
    if ((b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D) continue;
    // Allow high-byte UTF-8 (very common in real text)
    if (b >= 0x80) continue;
    nonPrintable++;
  }
  return nonPrintable / sample.length < 0.05;
}

/**
 * Validate that the buffer's actual content is consistent with the declared
 * MIME type, given the format family. Returns true on a content/MIME match.
 *
 *  - Image / PDF / RTF: declared MIME must equal detected signature.
 *  - Office Open XML / ZIP: declared must be in ZIP-family; detected must be
 *    'application/zip' (we don't crack the ZIP further — accept it as ZIP).
 *  - Legacy Office: declared must be in CFB-family; detected must be CFB.
 *  - Text family: detected signature should be null AND the buffer should
 *    look like text by the heuristic above.
 */
export function validateMimeType(buffer: Buffer, declaredType: string): boolean {
  if (!isAllowedMimeType(declaredType)) return false;

  const detected = detectMimeType(buffer);

  // Text family: no magic bytes, fall back to text heuristic.
  if (TEXT_MIME_TYPES.has(declaredType)) {
    return detected === null && looksLikeText(buffer);
  }

  if (ZIP_BASED_MIME_TYPES.has(declaredType)) {
    return detected === 'application/zip';
  }

  if (CFB_BASED_MIME_TYPES.has(declaredType)) {
    return detected === 'application/x-cfb';
  }

  // Binary types with a 1:1 signature mapping.
  return detected === declaredType;
}

/** Validate file size is within the maximum allowed limit. */
export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES;
}
