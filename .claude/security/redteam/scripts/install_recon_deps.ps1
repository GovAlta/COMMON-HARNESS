# install_recon_deps.ps1 — Windows port of install_recon_deps.sh
# Tries winget → scoop → choco, in that order, for each tool.
# All recon tools have Node-native fallbacks, so this script is OPTIONAL.

$ErrorActionPreference = "Continue"

function Write-Ok($msg)   { Write-Host "  [OK]    $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  [SKIP]  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [FAIL]  $msg" -ForegroundColor Red }
function Write-Inst($msg) { Write-Host "  [INST]  $msg" -ForegroundColor Cyan }

function Test-Cmd($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

$script:installed = 0
$script:skipped   = 0
$script:failed    = 0

$hasWinget = Test-Cmd winget
$hasScoop  = Test-Cmd scoop
$hasChoco  = Test-Cmd choco

Write-Host ""
Write-Host "=== Recon Tool Dependency Installer (Windows) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Detected package managers:"
Write-Host "  winget : $hasWinget"
Write-Host "  scoop  : $hasScoop"
Write-Host "  choco  : $hasChoco"
Write-Host ""

if (-not ($hasWinget -or $hasScoop -or $hasChoco)) {
    Write-Host "No package manager found. Install winget (https://aka.ms/winget), scoop (https://scoop.sh), or choco (https://chocolatey.org/install)." -ForegroundColor Yellow
    Write-Host "All recon tools have Node-native fallbacks; binaries are optional." -ForegroundColor Green
    exit 0
}

# (display name, used-by note, winget ID, scoop pkg, choco pkg)
$tools = @(
    @{ name="dig";    note="dns_enum.js";          winget="ISC.BIND";          scoop="bind";        choco="bind-toolsonly" }
    @{ name="curl";   note="(builtin on Win10+)";  winget="cURL.cURL";         scoop="curl";        choco="curl"           }
    @{ name="nmap";   note="port_scan.js";         winget="Insecure.Nmap";     scoop="nmap";        choco="nmap"           }
    @{ name="whois";  note="whois_lookup.js";      winget="Microsoft.Sysinternals.Whois"; scoop="sysinternals"; choco="sysinternals" }
    @{ name="sslscan";note="tls_scan.js (fallback)"; winget="";                scoop="sslscan";     choco=""               }
)

foreach ($t in $tools) {
    if (Test-Cmd $t.name) {
        Write-Ok "$($t.name) ($($t.note))"
        continue
    }
    $installed_this = $false
    if ($hasWinget -and $t.winget) {
        Write-Inst "$($t.name) via winget ($($t.winget))..."
        try {
            winget install --silent --accept-package-agreements --accept-source-agreements --id $t.winget *> $null
            if (Test-Cmd $t.name) { Write-Ok "$($t.name) installed via winget"; $script:installed++; $installed_this = $true }
        } catch { }
    }
    if (-not $installed_this -and $hasScoop -and $t.scoop) {
        Write-Inst "$($t.name) via scoop ($($t.scoop))..."
        try {
            scoop install $t.scoop *> $null
            if (Test-Cmd $t.name) { Write-Ok "$($t.name) installed via scoop"; $script:installed++; $installed_this = $true }
        } catch { }
    }
    if (-not $installed_this -and $hasChoco -and $t.choco) {
        Write-Inst "$($t.name) via choco ($($t.choco))..."
        try {
            choco install $t.choco -y *> $null
            if (Test-Cmd $t.name) { Write-Ok "$($t.name) installed via choco"; $script:installed++; $installed_this = $true }
        } catch { }
    }
    if (-not $installed_this) {
        if (-not $t.winget -and -not $t.scoop -and -not $t.choco) {
            Write-Skip "$($t.name) — no package available across winget/scoop/choco"
            $script:skipped++
        } else {
            Write-Fail "$($t.name) — install failed in all available managers"
            $script:failed++
        }
    }
}

# Tools that need pip / Go / GitHub releases — skip auto-install on Windows; document instead
Write-Host ""
Write-Host "Optional Python / Go / GitHub-release tools (not auto-installed on Windows):"
Write-Host "  wafw00f       — pip install wafw00f          (waf_detect.js)"
Write-Host "  subfinder     — go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
Write-Host "  httpx         — go install github.com/projectdiscovery/httpx/cmd/httpx@latest"
Write-Host "  feroxbuster   — scoop install feroxbuster    OR  download from GitHub releases"
Write-Host "  testssl.sh    — git clone + run under WSL or git-bash"
Write-Host "  whatweb       — Ruby tool; install via gem under WSL or ruby-installer"

Write-Host ""
Write-Host "=== Final Status ===" -ForegroundColor Cyan
$allTools = @("dig","curl","nmap","whois","sslscan","whatweb","wafw00f","subfinder","httpx","feroxbuster","testssl.sh")
$okCount = 0
$missCount = 0
foreach ($t in $allTools) {
    if (Test-Cmd $t) { Write-Ok ("{0,-15} present" -f $t); $okCount++ }
    else             { Write-Fail ("{0,-15} missing" -f $t); $missCount++ }
}

Write-Host ""
Write-Host "  Available: $okCount / $($allTools.Count)   Installed this run: $script:installed   Skipped: $script:skipped   Failed: $script:failed"
Write-Host ""
Write-Host "All native fallbacks available in tools/recon/ — binaries are optional and provide richer output." -ForegroundColor Green
Write-Host ""

if ($missCount -eq 0) { exit 0 } else { exit 1 }
