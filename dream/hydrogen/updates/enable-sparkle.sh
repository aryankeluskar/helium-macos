#!/bin/bash
# Usage: enable-sparkle.sh <build/src>
#
# Turns on Helium's Sparkle updater in a build tree whose args.gn predates it
# (fresh builds get the same arguments from devutils/shared.sh). The key is a
# placeholder whose private half nobody has; the release workflow stamps the
# real one into the DMG it publishes (stamp-dmg.sh).
set -euo pipefail

args="$1/out/Default/args.gn"
key=$(cat "$(dirname "$0")/placeholder-public-key")
if ! grep -q '^enable_sparkle' "$args"; then
  printf 'enable_sparkle=true\nsparkle_ed_key="%s"\n' "$key" >> "$args"
fi
cat "$args"
