#!/usr/bin/env bash
#
# AgentHub installer — download the latest release binary for this platform.
#
#   curl -fsSL https://raw.githubusercontent.com/deckyfx/agenthub/main/install.sh | bash
#
# Options (env vars, since stdin is the script when piped):
#   AGENTHUB_HOME=<dir>   install location           (default: ~/.agenthub)
#   AGENTHUB_FORCE=1      reinstall even if up to date
#   GITHUB_TOKEN=<token>  use for the GitHub API (avoids rate limits)
#
set -euo pipefail

REPO="deckyfx/agenthub"
INSTALL_DIR="${AGENTHUB_HOME:-$HOME/.agenthub}"
BIN="$INSTALL_DIR/agenthub"
FORCE="${AGENTHUB_FORCE:-0}"

# Also accept `bash -s -- --force`
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
err()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── 1. Detect platform ────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  Darwin-arm64)         PLATFORM="macos-arm64" ;;
  Darwin-x86_64)        PLATFORM="macos-x64"   ;;
  Linux-x86_64)         PLATFORM="linux-x64"   ;;
  Linux-aarch64|Linux-arm64) PLATFORM="linux-arm64" ;;
  *) err "Unsupported platform: $OS-$ARCH (Windows: download agenthub-windows-x64.exe from Releases)" ;;
esac
ASSET="agenthub-$PLATFORM"

command -v curl >/dev/null 2>&1 || err "curl is required."

# sha256 helper (Linux: sha256sum, macOS: shasum -a 256)
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  elif command -v shasum   >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}';
  else echo ""; fi
}

api() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" "$1"
  else
    curl -fsSL "$1"
  fi
}

bold "AgentHub installer"
info "platform: $PLATFORM"

# ── 2. Resolve latest version, compare with what's installed ──────────────────

LATEST="$(api "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
  | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
[ -n "$LATEST" ] || err "Could not find a published release for $REPO."
info "latest:   $LATEST"

if [ -x "$BIN" ]; then
  CURRENT="$("$BIN" --version 2>/dev/null | awk '{print $2}')" || CURRENT=""
  info "current:  ${CURRENT:-unknown} (at $BIN)"
  if [ "$CURRENT" = "$LATEST" ] && [ "$FORCE" != "1" ]; then
    ok "Already up to date ($LATEST). Use AGENTHUB_FORCE=1 to reinstall."
    exit 0
  fi
else
  info "current:  not installed"
fi

# ── 3. Download (with checksum verification) and install ──────────────────────

BASE="https://github.com/$REPO/releases/download/$LATEST"
TMP="$(mktemp)"
trap 'rm -f "$TMP" "$TMP.sums" 2>/dev/null || true' EXIT

bold "Downloading $ASSET ($LATEST)…"
curl -fSL --progress-bar "$BASE/$ASSET" -o "$TMP" || err "Download failed: $BASE/$ASSET"

if api "$BASE/SHA256SUMS.txt" >"$TMP.sums" 2>/dev/null && [ -s "$TMP.sums" ]; then
  EXPECTED="$(grep " $ASSET\$" "$TMP.sums" | awk '{print $1}')"
  ACTUAL="$(sha256 "$TMP")"
  if [ -n "$EXPECTED" ] && [ -n "$ACTUAL" ]; then
    [ "$EXPECTED" = "$ACTUAL" ] && ok "checksum verified" || err "Checksum mismatch (expected $EXPECTED, got $ACTUAL)"
  else
    info "checksum: skipped (no entry or no sha256 tool)"
  fi
else
  info "checksum: skipped (SHA256SUMS.txt not found)"
fi

mkdir -p "$INSTALL_DIR"
mv "$TMP" "$BIN"
chmod +x "$BIN"
# Clear macOS quarantine so it runs without a Gatekeeper prompt.
[ "$OS" = "Darwin" ] && xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
ok "installed: $BIN"

# ── 4. Initialize / migrate the database ──────────────────────────────────────

bold "Migrating database…"
"$BIN" init

# ── 5. PATH guidance ──────────────────────────────────────────────────────────

echo ""
if echo ":$PATH:" | grep -q ":$INSTALL_DIR:"; then
  ok "$INSTALL_DIR is already on your PATH."
  bold "Done — run: agenthub --help"
else
  case "${SHELL:-}" in
    */zsh)  RC="~/.zshrc" ;;
    */bash) RC="~/.bashrc" ;;
    *)      RC="your shell profile" ;;
  esac
  bold "Almost done — add AgentHub to your PATH:"
  echo ""
  info "echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> $RC"
  echo ""
  info "Then restart your shell (or: source $RC) and run: agenthub --help"
fi
