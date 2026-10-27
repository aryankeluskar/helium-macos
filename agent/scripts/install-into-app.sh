#!/bin/bash
# Usage: install-into-app.sh <path/to/Helium.app>
# Bundles the agent CLI and installs it at Contents/Resources/helium-agent.
set -euo pipefail

app="$1"
agent_dir="$(cd "$(dirname "$0")/.." && pwd)"
dest="$app/Contents/Resources/helium-agent"

(cd "$agent_dir" && npm ci --no-audit --no-fund && npm run bundle)

rm -rf "$dest"
mkdir -p "$dest"
cp "$agent_dir/dist/helium.mjs" "$agent_dir/README.md" "$dest/"
cp "$agent_dir/scripts/helium" "$dest/helium"
chmod 755 "$dest/helium"
