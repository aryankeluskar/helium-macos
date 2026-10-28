#!/bin/bash -eux

_root_dir="$(dirname "$(greadlink -f "$0")")"
_app="out/Default/Hydrogen.app"
_packaging="out/Default/Hydrogen Packaging"
_hydrogen="$_root_dir/dream/hydrogen"

# Ship the agent CLI inside the app, so coding agents can drive this browser
# (agent/README.md).
if command -v npm >/dev/null; then
  "$_root_dir/agent/scripts/install-into-app.sh" "$_app"
else
  echo "warn: npm is missing; Hydrogen.app ships without the agent CLI" >&2
fi

if [ -n "${MACOS_CERTIFICATE_NAME:-}" ]; then
  if [ -n "${PROD_MACOS_SPECIAL_ENTITLEMENTS_PROFILE_PATH:-}" ]; then
    # Chromium embeds this profile from its packaging inputs during signing.
    cp "$PROD_MACOS_SPECIAL_ENTITLEMENTS_PROFILE_PATH" "$_packaging/Helium.provisionprofile"
  fi

  CREDENTIAL_ARGS=(store-credentials notarytool-profile)
  NOTARY_ARGS=(--notary-arg=--keychain-profile=notarytool-profile)
  if [ -n "${CI:-}" ]; then
    CREDENTIAL_ARGS+=("--keychain=$HOME/Library/Keychains/build.keychain-db")
    NOTARY_ARGS+=("--notary-arg=--keychain=$HOME/Library/Keychains/build.keychain-db")
  fi

  xcrun notarytool \
    "${CREDENTIAL_ARGS[@]}" \
    --apple-id "$PROD_MACOS_NOTARIZATION_APPLE_ID" \
    --team-id "$PROD_MACOS_NOTARIZATION_TEAM_ID" \
    --password "$PROD_MACOS_NOTARIZATION_PWD"

  python3 "$_packaging/sign_chrome.py" \
    --input out/Default \
    --output out/Default/signed \
    --identity "$MACOS_CERTIFICATE_NAME" \
    --disable-packaging --notarize \
    "${NOTARY_ARGS[@]}"

  _app="out/Default/signed/stable/Hydrogen.app"
else
  echo "warn: MACOS_CERTIFICATE_NAME is missing; skipping notarization" >&2
  codesign --force --deep --sign - "$_app"
fi

if [ -z "${OUT_DMG_PATH:-}" ]; then
  _chromium_version=$(cat "$_root_dir/helium-chromium/chromium_version.txt")
  _helium_revision=$(cat "$_root_dir/helium-chromium/revision.txt")
  _platform_revision=$(cat "$_root_dir/revision.txt")
  OUT_DMG_PATH="$_root_dir/build/hydrogen_${_chromium_version}-${_helium_revision}.${_platform_revision}_macos.dmg"
fi

_layout="$(mktemp -d)"
_layout_args=()
if "$_hydrogen/dmg_layout.sh" "$_layout/dsstore"; then
  _layout_args=(--copy "$_layout/dsstore:/.DS_Store")
else
  echo "warn: the DMG window layout could not be generated; Finder will use its default layout" >&2
fi

# Package the app
chrome/installer/mac/pkg-dmg \
  --sourcefile --source "$_app" \
  --target "$OUT_DMG_PATH" \
  --volname Hydrogen --format ULMO \
  --icon "$_app/Contents/Resources/app.icns" \
  --symlink /Applications:/Applications \
  --mkdir .background \
  --copy "$_hydrogen/resources/dmg_background.png:/.background/dmg_background.png" \
  ${_layout_args[@]+"${_layout_args[@]}"} \
  --verbosity 2
rm -rf "$_layout"

if [ -n "${MACOS_CERTIFICATE_NAME:-}" ]; then
  codesign \
    --sign "$MACOS_CERTIFICATE_NAME" \
    --identifier com.aryankeluskar.hydrogen --force \
    "$OUT_DMG_PATH"
fi
