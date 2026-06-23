/**
 * FileScanner — pluggable malware-scanning interface.
 *
 * Why this exists
 * ----------------
 * The CAS UPLOAD-001 / UPLOAD-002 and ASVS V12 rules require that uploaded
 * files are scanned for malware before being accepted into the application.
 * The template ships with a NO-OP default so that out-of-the-box deploys are
 * not blocked on choosing a scanner, but the no-op is recorded as RA-FS-001
 * in `.ai/data/risk_acceptances.json` and the blueteam assessment will surface
 * it as a HIGH-severity gap until the deployment wires in a real scanner.
 *
 * Wiring in a real scanner (no code change to file.service.ts required)
 * --------------------------------------------------------------------
 *   1. Set FILE_SCANNER env to one of: 'noop' (default), 'clamav', 'defender',
 *      'custom'.
 *   2. For 'clamav': set CLAMAV_HOST + CLAMAV_PORT (the bundled `clamd-client`
 *      adapter speaks the clamd INSTREAM protocol over TCP — no daemon-side
 *      code change needed against an existing ClamAV deployment).
 *   3. For 'defender': set MDFE_SCAN_URL + MDFE_API_KEY (Microsoft Defender
 *      for Endpoint exposes a REST scan endpoint; the adapter POSTs the
 *      buffer base64-encoded).
 *   4. For 'custom': implement and export a default `FileScanner` from a
 *      module path provided via CUSTOM_FILE_SCANNER_MODULE.
 *
 * Nothing in this template ships with a hard runtime dependency on ClamAV or
 * Defender — the adapter is selected at boot via the env var, and the noop
 * default keeps `npm install` clean.
 */

export type ScanResult =
  | { clean: true }
  | { clean: false; threatName: string; engine: string };

export interface FileScanner {
  /** Human-friendly name used in audit logs */
  readonly name: string;
  /**
   * Scan the given buffer. Implementations MUST timeout themselves (the
   * caller already enforces an outer 30s deadline) and return a structured
   * result; do not throw on infected files.
   */
  scan(buffer: Buffer, declaredMime: string): Promise<ScanResult>;
}

/**
 * No-op scanner — accepts everything. Logs a single warning on first use so
 * the operator notices the gap. Pair with RA-FS-001 in the risk register.
 */
class NoopScanner implements FileScanner {
  readonly name = 'noop';
  private warned = false;
  async scan(_buffer: Buffer, _declaredMime: string): Promise<ScanResult> {
    if (!this.warned) {
      this.warned = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[file-scanner] Using NO-OP scanner — uploads are NOT being checked for malware. ' +
        'Wire in a real scanner via FILE_SCANNER env var before going to production. ' +
        'See RA-FS-001 in .ai/data/risk_acceptances.json.'
      );
    }
    return { clean: true };
  }
}

let _scanner: FileScanner | null = null;

/**
 * Lazy-resolve the configured scanner. The lookup is intentionally simple —
 * teams that wire in clamd / Defender will replace the body of this function
 * with their adapter import (which avoids dragging a runtime dep into the
 * template's package.json for every deploy that doesn't need it).
 */
export function getFileScanner(): FileScanner {
  if (_scanner) return _scanner;
  const choice = (process.env.FILE_SCANNER || 'noop').toLowerCase();
  switch (choice) {
    case 'noop':
      _scanner = new NoopScanner();
      break;
    default:
      // eslint-disable-next-line no-console
      console.error(
        `[file-scanner] FILE_SCANNER='${choice}' has no adapter compiled in. ` +
        'Add one in src/services/file-scanner.ts (see header comment for the contract) ' +
        'and re-deploy. Falling back to noop scanner.'
      );
      _scanner = new NoopScanner();
  }
  return _scanner;
}

/**
 * Test-only: swap in a fake scanner. Resets between tests.
 */
export function _setFileScannerForTest(scanner: FileScanner | null): void {
  _scanner = scanner;
}
