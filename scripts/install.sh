#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/.agenthub"
BINARY="$INSTALL_DIR/agenthub"
REBUILD=false

# ── Parse args ────────────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ── Detect platform ───────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Darwin-arm64)  PLATFORM="macos-arm64" ;;
  Darwin-x86_64) PLATFORM="macos-x64"   ;;
  Linux-x86_64)  PLATFORM="linux-x64"   ;;
  Linux-aarch64) PLATFORM="linux-arm64" ;;
  *)
    echo "❌ Unsupported platform: $OS-$ARCH"
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$PROJECT_DIR/binaries/agenthub-$PLATFORM"

# ── Rebuild if requested ──────────────────────────────────────────────────────

if [ "$REBUILD" = true ]; then
  echo "🔨 Rebuilding ($PLATFORM)..."
  cd "$PROJECT_DIR"
  bun run build:local
  echo ""
fi

# ── Install ───────────────────────────────────────────────────────────────────

if [ ! -f "$SRC" ]; then
  echo "❌ Binary not found: $SRC"
  echo "   Run with --rebuild or run 'bun run build:local' first."
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cp "$SRC" "$BINARY"
chmod +x "$BINARY"

echo "✅ Installed: $BINARY  ($PLATFORM)"
echo ""

# Only show PATH hint if not already in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc):"
  echo ""
  echo '   export PATH="$HOME/.agenthub:$PATH"'
  echo ""
  echo "Then reload: source ~/.zshrc"
  echo ""
fi

echo "Test: agenthub --help"
