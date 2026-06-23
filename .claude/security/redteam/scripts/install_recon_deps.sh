#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# install_recon_deps.sh — Check and install dependencies for tools/recon/
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# Ensure Go and pip-installed binaries are in PATH
export PATH="/usr/local/go/bin:${HOME}/go/bin:${HOME}/.local/bin:${PATH}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

installed=0
skipped=0
failed=0

log_ok()   { echo -e "  ${GREEN}[OK]${NC}    $1"; }
log_skip() { echo -e "  ${YELLOW}[SKIP]${NC}  $1"; ((skipped++)); }
log_fail() { echo -e "  ${RED}[FAIL]${NC}  $1"; ((failed++)); }
log_inst() { echo -e "  ${CYAN}[INST]${NC}  $1"; }

check() {
    command -v "$1" &>/dev/null
}

# ─────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}=== Recon Tool Dependency Installer ===${NC}\n"
echo -e "${GREEN}NOTE:${NC} All recon tools in tools/recon/ have Node-native fallbacks."
echo -e "      Binaries are optional and provide richer output (e.g. nmap -sV, testssl.sh,"
echo -e "      whatweb signature DB). The native fallbacks (node:dns, node:tls, node:http,"
echo -e "      tcp-connect scan, whois-json, crt.sh, heuristic WAF detection) cover the same"
echo -e "      JSON output schema and let the recon agent run end-to-end without these binaries.\n"

# Ensure we can install packages
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
    echo -e "${YELLOW}Not running as root — will use sudo for apt installs.${NC}\n"
else
    SUDO=""
fi

APT_UPDATED=false
apt_update_once() {
    if [ "$APT_UPDATED" = false ]; then
        log_inst "Updating apt package index..."
        $SUDO apt-get update -qq
        APT_UPDATED=true
    fi
}

# ─────────────────────────── apt packages ────────────────────────────

echo "Checking apt packages..."

# dig (dnsutils)
if check dig; then
    log_ok "dig (dns_enum.py)"
else
    apt_update_once
    log_inst "Installing dig (dnsutils)..."
    if $SUDO apt-get install -y -qq dnsutils; then
        log_ok "dig installed"; ((installed++))
    else
        log_fail "dig — apt-get install dnsutils failed"
    fi
fi

# curl
if check curl; then
    log_ok "curl (http_headers.py)"
else
    apt_update_once
    log_inst "Installing curl..."
    if $SUDO apt-get install -y -qq curl; then
        log_ok "curl installed"; ((installed++))
    else
        log_fail "curl — apt-get install curl failed"
    fi
fi

# nmap
if check nmap; then
    log_ok "nmap (port_scan.py)"
else
    apt_update_once
    log_inst "Installing nmap..."
    if $SUDO apt-get install -y -qq nmap; then
        log_ok "nmap installed"; ((installed++))
    else
        log_fail "nmap — apt-get install nmap failed"
    fi
fi

# whois
if check whois; then
    log_ok "whois (whois_lookup.py)"
else
    apt_update_once
    log_inst "Installing whois..."
    if $SUDO apt-get install -y -qq whois; then
        log_ok "whois installed"; ((installed++))
    else
        log_fail "whois — apt-get install whois failed"
    fi
fi

# sslscan (fallback for tls_scan.py — testssl.sh is the primary tool)
if check sslscan; then
    log_ok "sslscan (tls_scan.py — fallback)"
else
    apt_update_once
    log_inst "Installing sslscan..."
    if $SUDO apt-get install -y -qq sslscan 2>/dev/null; then
        log_ok "sslscan installed"; ((installed++))
    else
        log_skip "sslscan — not in apt repos (testssl.sh is the primary tool; sslscan is only a fallback)"
    fi
fi

# whatweb
if check whatweb; then
    log_ok "whatweb (tech_fingerprint.py)"
else
    apt_update_once
    log_inst "Installing whatweb..."
    if $SUDO apt-get install -y -qq whatweb; then
        log_ok "whatweb installed"; ((installed++))
    else
        log_fail "whatweb — apt-get install whatweb failed"
    fi
fi

# ─────────────────────── pip packages ────────────────────────────────

echo ""
echo "Checking pip packages..."

# wafw00f
if check wafw00f; then
    log_ok "wafw00f (waf_detect.py)"
else
    log_inst "Installing wafw00f via pip..."
    if pip3 install --quiet wafw00f 2>/dev/null || pip install --quiet wafw00f 2>/dev/null; then
        log_ok "wafw00f installed"; ((installed++))
    else
        log_fail "wafw00f — pip install wafw00f failed"
    fi
fi

# ─────────────────── Go binaries (ProjectDiscovery) ──────────────────

echo ""
echo "Checking Go-based tools..."

GOBIN="${HOME}/go/bin"
mkdir -p "$GOBIN"

# Ensure GOBIN is in PATH for this script
export PATH="${GOBIN}:${PATH}"

ensure_modern_go() {
    # ProjectDiscovery tools need Go 1.21+; system packages often ship 1.13
    if check go; then
        local ver
        ver=$(go version | grep -oP '\d+\.\d+' | head -1)
        local major minor
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 1 ] && [ "$minor" -ge 21 ]; then
            return 0
        fi
        log_inst "System Go ($ver) is too old; installing Go 1.22..."
    else
        log_inst "Go not found; installing Go 1.22..."
    fi

    local GO_TAR="go1.22.5.linux-amd64.tar.gz"
    if curl -sL "https://go.dev/dl/${GO_TAR}" -o "/tmp/${GO_TAR}" && \
       $SUDO rm -rf /usr/local/go && \
       $SUDO tar -C /usr/local -xzf "/tmp/${GO_TAR}"; then
        rm -f "/tmp/${GO_TAR}"
        export PATH="/usr/local/go/bin:${HOME}/go/bin:${PATH}"
        log_ok "Go $(go version | grep -oP '\d+\.\d+\.\d+') installed to /usr/local/go"
        return 0
    else
        rm -f "/tmp/${GO_TAR}"
        return 1
    fi
}

GO_READY=false

install_go_tool() {
    local name="$1"
    local pkg="$2"
    local used_by="$3"

    if check "$name"; then
        log_ok "$name ($used_by)"
        return
    fi

    if [ "$GO_READY" = false ]; then
        if ensure_modern_go; then
            GO_READY=true
        else
            log_fail "$name — could not install a modern Go compiler"
            return
        fi
    fi

    log_inst "Installing $name via go install (this may take a minute)..."
    if go install "$pkg" 2>/dev/null; then
        if [ -f "${GOBIN}/${name}" ]; then
            log_ok "$name installed to ${GOBIN}/${name}"; ((installed++))
        else
            log_fail "$name — go install succeeded but binary not found in ${GOBIN}"
        fi
    else
        log_fail "$name — go install $pkg failed"
    fi
}

install_go_tool "subfinder" "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest" "subdomain_discovery.py"
install_go_tool "httpx"     "github.com/projectdiscovery/httpx/cmd/httpx@latest"            "tech_fingerprint.py"

# ─────────────────── feroxbuster (Rust binary) ───────────────────────

echo ""
echo "Checking standalone binaries..."

if check feroxbuster; then
    log_ok "feroxbuster (endpoint_discovery.py)"
else
    log_inst "Installing feroxbuster from GitHub releases..."
    FEROX_VER=$(curl -sI "https://github.com/epi052/feroxbuster/releases/latest" | grep -i '^location:' | grep -oP 'v[\d.]+' || echo "")
    if [ -z "$FEROX_VER" ]; then
        # Fallback version
        FEROX_VER="v2.11.0"
    fi
    FEROX_URL="https://github.com/epi052/feroxbuster/releases/download/${FEROX_VER}/x86_64-linux-feroxbuster.zip"
    TMPDIR=$(mktemp -d)
    if curl -sL "$FEROX_URL" -o "${TMPDIR}/feroxbuster.zip" && \
       unzip -qo "${TMPDIR}/feroxbuster.zip" -d "${TMPDIR}" && \
       chmod +x "${TMPDIR}/feroxbuster" && \
       $SUDO mv "${TMPDIR}/feroxbuster" /usr/local/bin/feroxbuster; then
        log_ok "feroxbuster ${FEROX_VER} installed to /usr/local/bin/"; ((installed++))
    else
        log_fail "feroxbuster — download/install from GitHub failed"
    fi
    rm -rf "$TMPDIR"
fi

# ─────────────────── testssl.sh (bash script) ────────────────────────

if check testssl.sh || check testssl; then
    log_ok "testssl.sh (tls_scan.py — primary)"
else
    log_inst "Installing testssl.sh from GitHub..."
    TESTSSL_DIR="/opt/testssl.sh"
    if [ -d "$TESTSSL_DIR" ]; then
        $SUDO rm -rf "$TESTSSL_DIR"
    fi
    if $SUDO git clone --depth 1 https://github.com/drwetter/testssl.sh.git "$TESTSSL_DIR" 2>/dev/null && \
       $SUDO ln -sf "${TESTSSL_DIR}/testssl.sh" /usr/local/bin/testssl.sh; then
        log_ok "testssl.sh installed to /usr/local/bin/"; ((installed++))
    else
        # sslscan is the fallback — check if that's available
        if check sslscan; then
            log_skip "testssl.sh — git clone failed, but sslscan is available as fallback"
        else
            log_fail "testssl.sh — git clone failed and no sslscan fallback"
        fi
    fi
fi

# ─────────────────── Summary ─────────────────────────────────────────

echo ""
echo -e "${CYAN}=== Final Status ===${NC}\n"

ALL_TOOLS=("dig" "curl" "nmap" "whois" "sslscan" "whatweb" "wafw00f" "subfinder" "httpx" "feroxbuster" "testssl.sh")
USED_BY=(
    "dns_enum.py"
    "http_headers.py"
    "port_scan.py"
    "whois_lookup.py"
    "tls_scan.py (fallback)"
    "tech_fingerprint.py"
    "waf_detect.py"
    "subdomain_discovery.py"
    "tech_fingerprint.py"
    "endpoint_discovery.py"
    "tls_scan.py (primary)"
)

ok_count=0
miss_count=0
for i in "${!ALL_TOOLS[@]}"; do
    tool="${ALL_TOOLS[$i]}"
    used="${USED_BY[$i]}"
    if check "$tool"; then
        log_ok "$(printf '%-15s' "$tool") — $used"
        ((ok_count++))
    else
        log_fail "$(printf '%-15s' "$tool") — $used"
        ((miss_count++))
    fi
done

echo ""
echo -e "  Available: ${GREEN}${ok_count}/${#ALL_TOOLS[@]}${NC}  |  Installed this run: ${CYAN}${installed}${NC}  |  Skipped: ${YELLOW}${skipped}${NC}  |  Failed: ${RED}${failed}${NC}"

if [ "$miss_count" -eq 0 ]; then
    echo -e "\n  ${GREEN}All recon dependencies are satisfied.${NC}\n"
    exit 0
else
    echo -e "\n  ${YELLOW}${miss_count} tool(s) still missing — some recon scripts will degrade gracefully.${NC}\n"
    exit 1
fi
