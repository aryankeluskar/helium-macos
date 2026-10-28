#!/bin/bash
# Renames a prepared Helium source tree to Hydrogen: product name and bundle
# ID, the keychain item, data directory and crash product, every UI string
# (imput's services keep the Helium name), the logos and the app icon. Run it
# after Helium's name substitution, translations and resources; running it
# again changes nothing.
#
# Usage: rebrand.sh <chromium src dir>
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$(dirname "$here")")"
src="$(cd "$1" && pwd)"
helium="$root/helium-chromium"
resources="$here/resources"
bundle_id=com.aryankeluskar.hydrogen

replace() {
  local file="$src/$1" old="$2" new="$3"
  if grep -qF -- "$new" "$file" && ! grep -qF -- "$old" "$file"; then
    return
  fi
  if ! grep -qF -- "$old" "$file"; then
    echo "rebrand: '$old' is not in $1" >&2
    exit 1
  fi
  python3 - "$file" "$old" "$new" <<'EOF'
import sys
path, old, new = sys.argv[1:]
with open(path, encoding="utf-8") as file:
    text = file.read()
with open(path, "w", encoding="utf-8") as file:
    file.write(text.replace(old, new))
EOF
}

write_if_changed() {
  local file="$1" content="$2"
  if [ ! -f "$file" ] || [ "$(cat "$file")" != "$content" ]; then
    printf '%s\n' "$content" > "$file"
  fi
}

write_if_changed "$src/chrome/app/theme/chromium/BRANDING" "COMPANY_FULLNAME=The Hydrogen Authors
COMPANY_SHORTNAME=The Hydrogen Authors
PRODUCT_FULLNAME=Hydrogen
PRODUCT_SHORTNAME=Hydrogen
PRODUCT_INSTALLER_FULLNAME=Hydrogen Installer
PRODUCT_INSTALLER_SHORTNAME=Hydrogen Installer
COPYRIGHT=Copyright @LASTCHANGE_YEAR@ The Hydrogen Authors. All rights reserved.
MAC_BUNDLE_ID=$bundle_id
MAC_CREATOR_CODE=Cr24
MAC_TEAM_ID=S4Q33XPHB4"

replace components/os_crypt/common/keychain_password_mac.mm \
  'kDefaultServiceName[] = "Helium Storage Key"' 'kDefaultServiceName[] = "Hydrogen Storage Key"'
replace components/os_crypt/common/keychain_password_mac.mm \
  'kDefaultAccountName[] = "Helium"' 'kDefaultAccountName[] = "Hydrogen"'
replace chrome/common/chrome_paths_mac.mm \
  'product_dir_name = "net.imput.helium";' "product_dir_name = \"$bundle_id\";"
replace chrome/app/chrome_crash_reporter_client.cc \
  'const char* product_name = "Helium";' 'const char* product_name = "Hydrogen";'
replace components/extstore_fixups/chrome-webstore.js \
  "el.nodeValue.replace(CHROME_NAME_REGEX, 'Helium')" "el.nodeValue.replace(CHROME_NAME_REGEX, 'Hydrogen')"

python3 "$here/rename_strings.py" "$src" "$helium"
python3 "$here/space_strings.py" "$src"

python3 - "$src/ui/webui/resources/cr_elements/icons.html.ts" "$resources/branding/product_logo.icon" <<'EOF'
import re
import sys
icons_path, vector_path = sys.argv[1:]
rects = []
for match in re.finditer(r"ROUND_RECT, ([^,]+), ([^,]+), ([^,]+), ([^,]+), ([^,]+),", open(vector_path).read()):
    x, y, w, h, r = (value.strip().rstrip("f") for value in match.groups())
    rects.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"/>')
glyph = "".join(rects)
text = open(icons_path, encoding="utf-8").read()
pattern = re.compile(r'(<g id="chrome-product" viewBox="0 0 56 56">)\s*(?:<path d="M33\.3232[^"]*"/>|<rect[^>]*/>(?:<rect[^>]*/>)*)')
text, count = pattern.subn(lambda m: f"{m.group(1)}\n        {glyph}", text)
if count == 0:
    sys.exit("rebrand: the cr:chrome-product logo is missing from icons.html.ts")
open(icons_path, "w", encoding="utf-8").write(text)
EOF

onboarding="$src/components/helium_onboarding"
if [ -d "$onboarding" ]; then
  cp "$resources/onboarding/HeliumLogoRaw.svelte" \
    "$onboarding/node_modules/@imput/helium-prism/dist/components/logos/HeliumLogoRaw.svelte"
  cp "$resources/assets/Assets.xcassets/AppIcon.appiconset/appicon_128.png" "$onboarding/public/favicon.png"
  replace components/helium_onboarding/index.html '<title>Helium Setup</title>' '<title>Hydrogen Setup</title>'
fi

overlay="$(mktemp -d)"
trap 'rm -rf "$overlay"' EXIT
cp -R "$resources/branding" "$overlay/branding"
python3 "$helium/utils/generate_resources.py" "$helium/resources/generate_resources.txt" "$overlay" > /dev/null
grep -vE '^\s*(#|$)' "$helium/resources/helium_resources.txt" | while read -r source dest; do
  if [ -e "$overlay/$source" ]; then
    echo "$source $dest"
  fi
done > "$overlay/mapping.txt"
python3 "$helium/utils/replace_resources.py" "$overlay/mapping.txt" "$overlay" "$src" > /dev/null

mac_icons="$src/chrome/app/theme/chromium/mac"
rm -rf "$mac_icons/AppIcon.icon" "$mac_icons/Assets.xcassets"
cp -R "$resources/assets/AppIcon.icon" "$resources/assets/Assets.xcassets" "$mac_icons/"
cp "$resources/assets/app.icns" "$mac_icons/app.icns"
if command -v xcrun > /dev/null && xcrun --find actool > /dev/null 2>&1; then
  catalog="$(mktemp -d)"
  cp -R "$resources/assets/AppIcon.icon" "$resources/assets/Assets.xcassets" "$catalog/"
  python3 "$src/tools/mac/icons/compile_car.py" "$catalog/Assets.xcassets"
  cp "$catalog/Assets.car" "$mac_icons/Assets.car"
  rm -rf "$catalog"
else
  echo "rebrand: no actool here, so Assets.car still holds the previous icon" >&2
fi

echo "rebrand: $src is now Hydrogen ($bundle_id)"
