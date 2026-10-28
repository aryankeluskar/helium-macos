#!/bin/bash
# Checks spaces with synthetic input on this Apple Silicon runner: Ctrl+1…9,
# the space bar and its `+`, renaming, new tabs, two-finger swipes (including
# resting the fingers) and relaunch. Appends to demo-out/verify.md.
set -uo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
out="$GITHUB_WORKSPACE/demo-out"
swipe="$RUNNER_TEMP/swipe"
ax="$RUNNER_TEMP/ax"
mkdir -p "$out"

[ -x "$swipe" ] || swiftc -O "$demo_dir/swipe.swift" -o "$swipe"
[ -x "$ax" ] || swiftc -O "$demo_dir/ax.swift" -o "$ax"

node "$demo_dir/spaces-checks.mjs" /Applications/Hydrogen.app "$RUNNER_TEMP/spaces-profile" "$out" "$swipe" "$ax" \
  "$demo_dir/spaces-extension"
