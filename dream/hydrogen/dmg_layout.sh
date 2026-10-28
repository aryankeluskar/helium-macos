#!/bin/bash
# Writes the .DS_Store that lays out Hydrogen's DMG window (icon positions and
# background, from resources/dmg.json) by extracting it from a throwaway
# appdmg image. Needs macOS (hdiutil) and npx.
#
# Usage: dmg_layout.sh <output file>
set -euo pipefail

resources="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/resources"
output="$1"
work="$(mktemp -d)"
trap 'hdiutil detach "$work/mnt" -quiet 2>/dev/null || true; rm -rf "$work"' EXIT

mkdir -p "$work/Hydrogen.app/Contents/Resources" "$work/mnt"
cp "$resources/assets/app.icns" "$work/Hydrogen.app/Contents/Resources/"
cp "$resources/dmg.json" "$resources/dmg_background.png" "$work/"

npx -y appdmg@0.6.6 "$work/dmg.json" "$work/layout.dmg" > /dev/null
hdiutil attach "$work/layout.dmg" -mountpoint "$work/mnt" -readonly -nobrowse -quiet
cp "$work/mnt/.DS_Store" "$output"
