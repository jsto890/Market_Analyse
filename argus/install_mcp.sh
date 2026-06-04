#!/usr/bin/env bash
# Installs the Argus MCP server into Claude Desktop config.
# Run this ONCE from your Mac terminal, then restart Claude Desktop.
#
# Usage: bash <path-to-repo>/argus/install_mcp.sh

set -euo pipefail

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
ARGUS_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$ARGUS_DIR/.venv/bin/python"

echo "=== Argus MCP Installer ==="
echo ""

# --- sanity checks ---
if [ ! -f "$PYTHON" ]; then
  echo "❌  Venv not found at $PYTHON"
  echo "    Run:  cd $ARGUS_DIR && ./run.sh setup"
  exit 1
fi
echo "✅  Python venv found"

# quick MCP import test
if ! "$PYTHON" -c "from argus.mcp_server.server import build_mcp" 2>/dev/null; then
  echo "❌  MCP server import failed. Check dependencies:"
  echo "    cd $ARGUS_DIR && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
echo "✅  MCP server imports OK"

# --- create config dir if missing ---
mkdir -p "$CONFIG_DIR"

# --- merge config ---
ARGUS_BLOCK='{
  "command": "'"$PYTHON"'",
  "args": ["-m", "argus.mcp_server"],
  "cwd": "'"$ARGUS_DIR"'"
}'

if [ -f "$CONFIG_FILE" ]; then
  echo "📄  Existing config found — merging…"
  # Use python (system) to merge JSON safely
  python3 - "$CONFIG_FILE" <<PYEOF
import json, sys
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
cfg.setdefault("mcpServers", {})["argus"] = {
    "command": "$PYTHON",
    "args": ["-m", "argus.mcp_server"],
    "cwd": "$ARGUS_DIR"
}
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
print("✅  Merged argus into existing config")
PYEOF
else
  echo "📄  No config found — creating fresh…"
  cat > "$CONFIG_FILE" <<JSON
{
  "mcpServers": {
    "argus": {
      "command": "$PYTHON",
      "args": ["-m", "argus.mcp_server"],
      "cwd": "$ARGUS_DIR"
    }
  }
}
JSON
  echo "✅  Created $CONFIG_FILE"
fi

echo ""
echo "🎉  Done! Now:"
echo "    1. Quit Claude Desktop completely (Cmd+Q)"
echo "    2. Relaunch Claude Desktop"
echo "    3. Ask Claude: 'run argus_status' to confirm the MCP is live"
echo ""
echo "Config written to: $CONFIG_FILE"
