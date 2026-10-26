#!/bin/bash
set -euxo pipefail

mkdir -p dmg
if [ -n "${BUILD_RUN:-}" ]; then
  gh run download "$BUILD_RUN" --repo "$GITHUB_REPOSITORY" --pattern '*arm64-macos.dmg' --dir dmg
else
  gh release download --repo imputnet/helium-macos --pattern '*arm64-macos.dmg' --dir dmg
fi

dmg_file=$(find dmg -name '*.dmg' | head -1)
hdiutil attach -nobrowse -mountpoint /Volumes/HeliumDemo "$dmg_file"
cp -R /Volumes/HeliumDemo/Helium.app /Applications/
hdiutil detach /Volumes/HeliumDemo
xattr -cr /Applications/Helium.app
