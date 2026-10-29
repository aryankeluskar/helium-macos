#!/bin/bash
# Installs Google's Widevine CDM into Hydrogen, which Spotify and other
# protected media need. Helium's update proxy doesn't serve Widevine yet, so
# this asks Google's component update server directly, the way Chrome does,
# checks the download against the SHA-256 in Google's answer, and puts it where
# Hydrogen loads it on its next launch. Running it again updates Widevine, and
# it changes nothing when the newest version is already installed.
#
#   curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/hydrogen/widevine/install-widevine.sh | bash
set -euo pipefail

app="${HYDROGEN_APP:-/Applications/Hydrogen.app}"
data="${HYDROGEN_USER_DATA_DIR:-$HOME/Library/Application Support/com.aryankeluskar.hydrogen}"
appid=oimompecagnajdejgnnjijobebaeigek

command -v jq > /dev/null || { echo "This needs jq, which comes with macOS 15 and later." >&2; exit 1; }
[ "$(uname -m)" = arm64 ] || { echo "Hydrogen runs on Apple Silicon only." >&2; exit 1; }
framework_version=$(find "$app/Contents/Frameworks" -maxdepth 3 -path '*Framework.framework/Versions/*' -name '[0-9]*' 2> /dev/null | head -1)
chromium_version=$(basename "${framework_version:-}")
[[ "$chromium_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Hydrogen isn't installed at $app." >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

jq -n --arg appid "$appid" --arg chromium "$chromium_version" --arg macos "$(sw_vers -productVersion)" \
  --arg request "{$(uuidgen)}" --arg session "{$(uuidgen)}" '{request: {
    "@os": "mac", "@updater": "chrome", acceptformat: "crx3,download,puff,run",
    apps: [{appid: $appid, enabled: true, installsource: "ondemand", lang: "", updatecheck: {}, version: "0.0.0.0"}],
    arch: "arm64", dedup: "cr", ismachine: false,
    os: {arch: "arm64", platform: "Mac OS X", version: $macos},
    prodversion: $chromium, protocol: "4.0", requestid: $request, sessionid: $session, updaterversion: $chromium}}' \
  > "$work/request.json"
curl -fsS --retry 3 --max-time 60 https://update.googleapis.com/service/update2/json \
  -H 'content-type: application/json' -H "x-goog-update-appid: $appid" \
  -H 'x-goog-update-interactivity: fg' -H "x-goog-update-updater: chrome-$chromium_version" \
  --data @"$work/request.json" | sed "1s/^)]}'//" > "$work/answer.json"

update=$(jq -c --arg appid "$appid" '.response.apps[]? | select(.appid == $appid) | .updatecheck' "$work/answer.json")
version=$(jq -r '.nextversion // empty' <<< "$update")
sha256=$(jq -r '[.pipelines[0].operations[]? | select(.type == "download") | .out.sha256][0] // empty' <<< "$update")
url=$(jq -r '[.pipelines[0].operations[]? | select(.type == "download") | .urls[].url | select(startswith("https://"))][0] // empty' <<< "$update")
if [ "$(jq -r '.status // empty' <<< "$update")" != ok ] || [ -z "$version" ] || [ -z "$sha256" ] || [ -z "$url" ]; then
  echo "Google's update server didn't offer Widevine for Chromium $chromium_version:" >&2
  cat "$work/answer.json" >&2
  exit 1
fi

target="$data/WidevineCdm/$version"
library="_platform_specific/mac_arm64/libwidevinecdm.dylib"
if [ -f "$target/$library" ] && [ -f "$target/manifest.json" ]; then
  echo "Widevine $version is already installed in Hydrogen."
  exit 0
fi

echo "Downloading Widevine $version from Google..."
curl -fsSL --retry 3 --max-time 300 -o "$work/widevine.crx3" "$url"
[ "$(shasum -a 256 "$work/widevine.crx3" | cut -d' ' -f1)" = "$sha256" ] || { echo "The download doesn't match Google's SHA-256." >&2; exit 1; }
[ "$(head -c 4 "$work/widevine.crx3")" = Cr24 ] || { echo "The download isn't a CRX package." >&2; exit 1; }
header_size=$(od -An -tu4 -j8 -N4 "$work/widevine.crx3" | tr -d ' ')
tail -c +$((12 + header_size + 1)) "$work/widevine.crx3" > "$work/widevine.zip"
ditto -x -k "$work/widevine.zip" "$work/$version"
[ "$(jq -r .version "$work/$version/manifest.json")" = "$version" ] && [ -f "$work/$version/$library" ] \
  || { echo "The package doesn't hold Widevine $version for Apple Silicon." >&2; exit 1; }

mkdir -p "$data/WidevineCdm"
rm -rf "$target"
mv "$work/$version" "$target"
echo "Installed Widevine $version in Hydrogen."
if pgrep -x Hydrogen > /dev/null; then
  echo "Quit Hydrogen (Command-Q) and open it again; then Spotify and other protected media play."
else
  echo "Open Hydrogen; Spotify and other protected media play now."
fi
