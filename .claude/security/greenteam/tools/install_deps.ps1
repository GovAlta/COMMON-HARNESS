# Install optional tooling for greenteam scanners.
# Each scanner has a graceful fallback when the tool is absent.

Write-Host "greenteam: installing optional tooling…"

# Node-package devDeps
npm install

# govulncheck (Go reachable CVE scanner)
if (Get-Command go -ErrorAction SilentlyContinue) {
  Write-Host "  + installing govulncheck…"
  go install golang.org/x/vuln/cmd/govulncheck@latest
} else {
  Write-Host "  - Go not installed; skipping govulncheck"
}

# semgrep — not officially supported on Windows. Document the gap.
Write-Host "  - semgrep is not natively supported on Windows."
Write-Host "    Run greenteam SAST steps from WSL or a Linux CI runner."

Write-Host "greenteam: done."
