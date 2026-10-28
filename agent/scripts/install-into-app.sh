#!/bin/bash
# Usage: install-into-app.sh <path/to/Hydrogen.app>
# Bundles the agent CLI and installs it at Contents/Resources/hydrogen-agent.
set -euo pipefail

app="$1"
agent_dir="$(cd "$(dirname "$0")/.." && pwd)"
dest="$app/Contents/Resources/hydrogen-agent"

(cd "$agent_dir" && npm ci --no-audit --no-fund && npm run bundle)

rm -rf "$dest"
mkdir -p "$dest"
cp "$agent_dir/dist/hydrogen.mjs" "$agent_dir/README.md" "$dest/"
cp "$agent_dir/scripts/hydrogen" "$dest/hydrogen"
chmod 755 "$dest/hydrogen"
