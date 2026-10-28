#!/bin/bash
set -euxo pipefail

if [ -z "${BUILD_RUN:-}" ]; then
  echo "Set build_run to the run ID of a build that made a Hydrogen DMG." >&2
  exit 1
fi
gh run download "$BUILD_RUN" --repo "$GITHUB_REPOSITORY" --pattern '*.dmg' --dir dmg

dmg_file=$(find dmg -type f -name '*.dmg' | head -1)
hdiutil attach -nobrowse -mountpoint /Volumes/HydrogenDemo "$dmg_file"
cp -R /Volumes/HydrogenDemo/Hydrogen.app /Applications/
hdiutil detach /Volumes/HydrogenDemo
xattr -cr /Applications/Hydrogen.app
