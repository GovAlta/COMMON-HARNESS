#!/usr/bin/env bash
# Install optional binaries that greenteam scanners can use.
# Each scanner has a graceful fallback when the tool is absent.

set -e

echo "greenteam: installing optional tooling…"

# Node-package devDeps (license-checker, depcheck, madge, prettier, eslint, vue-tsc, redocly)
npm install

# govulncheck (Go reachable CVE scanner)
if command -v go >/dev/null 2>&1; then
  echo "  + installing govulncheck…"
  go install golang.org/x/vuln/cmd/govulncheck@latest
else
  echo "  - go not installed; skipping govulncheck"
fi

# semgrep (SAST rule packs). Linux/macOS only — Windows users need WSL.
if command -v pipx >/dev/null 2>&1; then
  echo "  + installing semgrep via pipx…"
  pipx install semgrep || true
elif command -v pip3 >/dev/null 2>&1; then
  echo "  + installing semgrep via pip3 --user…"
  pip3 install --user semgrep || true
else
  echo "  - pip/pipx not installed; skipping semgrep"
fi

echo "greenteam: done."
