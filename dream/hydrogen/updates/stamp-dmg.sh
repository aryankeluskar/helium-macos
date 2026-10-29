#!/bin/bash
# Usage: stamp-dmg.sh <in.dmg> <out.dmg> <public key> <release number>
#
# Copies a Hydrogen DMG with the update signing key and a release number
# stamped into the app: SUPublicEDKey is the key Sparkle checks updates
# against, and the release number becomes a fifth part of CFBundleVersion
# (Helium's version, like 0.20.1.1), so Hydrogen-only releases count as newer
# than the same Helium release before them. The app is ad-hoc signed again and the Finder layout kept. Prints
# "<bundle version> <short version> <minimum macOS> <Chromium version>".
set -euo pipefail

in_dmg="$1"
out_dmg="$2"
public_key="$3"
release_number="$4"

work="$(mktemp -d)"
cleanup() {
  hdiutil detach -quiet -force "$work/mount" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

hdiutil convert -quiet "$in_dmg" -format UDRW -o "$work/rw.dmg"
sectors=$(hdiutil resize -limits "$work/rw.dmg" | awk 'END { print $2 }')
if [[ "$sectors" =~ ^[0-9]+$ ]]; then
  hdiutil resize -quiet -sectors $((sectors + 204800)) "$work/rw.dmg" || echo "warn: the DMG couldn't be grown; stamping in place" >&2
fi
hdiutil attach -quiet -nobrowse -noautoopen -mountpoint "$work/mount" "$work/rw.dmg"

app="$work/mount/Hydrogen.app"
plist="$app/Contents/Info.plist"
if ! /usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$plist" > /dev/null 2>&1; then
  echo "$in_dmg has no SUPublicEDKey: it was built without Sparkle, so it can't update itself." >&2
  exit 1
fi
base_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist" | cut -d. -f1-4)
bundle_version="$base_version.$release_number"
chromium_version=$(find "$app/Contents/Frameworks" -maxdepth 3 -path '*Framework.framework/Versions/*' -name '[0-9]*' | head -1)
chromium_version="${chromium_version##*/}"
/usr/libexec/PlistBuddy -c "Set :SUPublicEDKey $public_key" "$plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $bundle_version" "$plist"
short_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")
minimum_system=$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")

xattr -cr "$app"
codesign --force --sign - "$app" >&2
codesign --verify --deep --strict "$app" >&2

hdiutil detach -quiet "$work/mount"
rm -f "$out_dmg"
hdiutil convert -quiet "$work/rw.dmg" -format ULMO -o "$out_dmg"
echo "$bundle_version $short_version $minimum_system $chromium_version"
