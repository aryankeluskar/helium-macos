#!/bin/bash
# Usage: publish.sh <build run>
#
# Publishes a build's Hydrogen DMG as the fork's latest GitHub release, where
# every installed Hydrogen looks for updates
# (releases/latest/download/appcast-arm64.xml): stamps the signing key and the
# next release number into the app, signs the DMG with HYDROGEN_UPDATE_KEY
# and uploads it with its appcast. Runs on a macOS runner (release.yml).
set -euo pipefail

build_run="$1"
updates="$(cd "$(dirname "$0")" && pwd)"
server="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if gh release view --repo "$GITHUB_REPOSITORY" --json body --jq .body 2>/dev/null | grep -qE "actions/runs/${build_run}([^0-9]|$)"; then
  echo "The latest release is already build run $build_run."
  exit 0
fi

python3 -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet cryptography
python="$work/venv/bin/python"
public_key=$("$python" -I "$updates/appcast.py" public-key)

last=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 200 --json tagName \
  --jq '[.[].tagName | select(test("^hydrogen-.*-r[0-9]+$")) | capture("-r(?<n>[0-9]+)$").n | tonumber] | max // 0')
release_number=$((last + 1))

gh run download "$build_run" --repo "$GITHUB_REPOSITORY" --pattern '*.dmg' --dir "$work/build"
in_dmg=$(find "$work/build" -type f -name '*.dmg' | head -1)
name=$(basename "$in_dmg")
mkdir -p "$work/release"
stamped=$("$updates/stamp-dmg.sh" "$in_dmg" "$work/release/$name" "$public_key" "$release_number")
read -r version short_version minimum_system <<< "$stamped"

tag="hydrogen-$short_version-r$release_number"
"$python" -I "$updates/appcast.py" write --dmg "$work/release/$name" \
  --url "$server/releases/download/$tag/$name" \
  --version "$version" --short-version "$short_version" --minimum-system "$minimum_system" \
  --out "$work/release/appcast-arm64.xml"

chromium=$(cut -d. -f1-4 <<< "$version")
notes=$(cat <<NOTES
Hydrogen $short_version on Chromium $chromium, from build run $server/actions/runs/$build_run (checks: $server/blob/demo-videos/verify.md).

Installed copies update themselves to this release. To install it fresh, open \`$name\`, drag Hydrogen to Applications, then allow it once in System Settings › Privacy & Security, since it isn't notarized.

The DMG is signed for Sparkle with the fork's update key (Ed25519), and Hydrogen accepts only updates signed with that key.
NOTES
)
gh release create "$tag" "$work/release/$name" "$work/release/appcast-arm64.xml" \
  --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --latest \
  --title "Hydrogen $short_version (release $release_number)" --notes "$notes"
echo "Published $server/releases/tag/$tag"
