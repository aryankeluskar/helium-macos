#!/bin/bash
# Checks the installed build on this Apple Silicon runner: native arm64,
# the built-in ad blocker running, extensions, and the bundled agent CLI. Writes
# demo-out/verify.md.
set -uo pipefail

app=/Applications/Hydrogen.app
out="$GITHUB_WORKSPACE/demo-out"
profile="$RUNNER_TEMP/verify-profile"
report="$out/verify.md"
hydrogen="$app/Contents/Resources/hydrogen-agent/hydrogen"
mkdir -p "$out" "$profile"
export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/hydrogen-agent"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

{
  echo "# Build verification on a GitHub Apple Silicon Mac"
  echo
  echo "Hydrogen $(defaults read "$app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null), macOS $(sw_vers -productVersion), $(sysctl -n machdep.cpu.brand_string)"
  echo
} > "$report"

if [ ! -d "$app" ]; then
  echo "- ❌ Hydrogen.app isn't installed, so nothing was checked (see the Get Hydrogen step)." >> "$report"
  cat "$report"
  exit 1
fi

framework=$(find "$app/Contents/Frameworks" -maxdepth 4 -type f -name 'Hydrogen Framework' | head -1)
archs=$(lipo -archs "$framework" 2>/dev/null)
check "Native Apple Silicon: the browser framework is \`$archs\` only" '[ "$archs" = arm64 ]'

"$app/Contents/MacOS/Hydrogen" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 about:blank > "$out/verify-hydrogen.log" 2>&1 &
browser=$!
for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
sleep 25

check "The agent CLI ships inside the app and lists tabs" '"$hydrogen" tabs > "$out/verify-tabs.txt" 2>&1'
"$hydrogen" open https://example.com > /dev/null 2>&1
check "The agent CLI opens and reads a page" '"$hydrogen" read 2>/dev/null | grep -q "Example Domain"'
"$hydrogen" screenshot -o "$out/verify-example.png" > /dev/null 2>&1 || true

extensions=$("$hydrogen" repl "return (await cdp('Target.getTargets')).targetInfos.filter(t => t.url.startsWith('chrome-extension://')).map(t => t.title || t.url).join(', ')" 2>&1)
check "uBlock Origin runs as a built-in extension" 'grep -qi "ublock" <<< "$extensions"'
echo "  - Extension pages running: $extensions" >> "$report"

plist="$app/Contents/Info.plist"
bundle_name=$(defaults read "$plist" CFBundleName 2>/dev/null)
bundle_id=$(defaults read "$plist" CFBundleIdentifier 2>/dev/null)
check "The app is Hydrogen, separate from Helium ($bundle_name, $bundle_id)" \
  '[ "$bundle_name" = Hydrogen ] && [ "$bundle_id" = com.aryankeluskar.hydrogen ]'
internal_tab() {
  local url id
  for url in "$@"; do
    id=$("$hydrogen" repl "return (await cdp('Target.createTarget', {url: '$url'})).targetId" 2>/dev/null | tr -d '"[:space:]')
    if [ -n "$id" ]; then
      echo "$id"
      return
    fi
  done
}
about_tab=$(internal_tab helium://settings/help chrome://settings/help)
sleep 4
"$hydrogen" read --tab "$about_tab" > "$out/about.txt" 2>&1
"$hydrogen" screenshot --tab "$about_tab" -o "$out/about.png" > /dev/null 2>&1 || true
stray=$(grep -o '[^.]*\bHelium\b[^.]*' "$out/about.txt" | grep -v 'Helium services' | head -3 | tr '\n' ' ')
check "The About page says Hydrogen (\`about.png\`)" 'grep -q "Hydrogen" "$out/about.txt" && [ -z "$stray" ]'
[ -n "$stray" ] && echo "  - Still says Helium: $stray" >> "$report"
setup_tab=$(internal_tab helium://setup chrome://setup)
sleep 6
"$hydrogen" read --tab "$setup_tab" > "$out/onboarding.txt" 2>&1
"$hydrogen" screenshot --tab "$setup_tab" -o "$out/onboarding.png" > /dev/null 2>&1 || true
check "Onboarding welcomes you to Hydrogen (\`onboarding.png\`)" 'grep -q "Hydrogen" "$out/onboarding.txt"'

"$hydrogen" daemon stop > /dev/null 2>&1 || true
kill "$browser" 2>/dev/null || true
echo >> "$report"
echo "Extension APIs are also exercised by the demo itself: it loads an unpacked extension that makes the spaces." >> "$report"
cat "$report"
