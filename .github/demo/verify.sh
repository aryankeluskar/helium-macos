#!/bin/bash
# Checks the installed build on this Apple Silicon runner: native arm64,
# built-in ad blocking, extensions, and the bundled agent CLI. Writes
# demo-out/verify.md.
set -uo pipefail

app=/Applications/Helium.app
out="$GITHUB_WORKSPACE/demo-out"
profile="$RUNNER_TEMP/verify-profile"
report="$out/verify.md"
helium="$app/Contents/Resources/helium-agent/helium"
mkdir -p "$out" "$profile"
export HELIUM_USER_DATA_DIR="$profile" HELIUM_AGENT_HOME="$RUNNER_TEMP/helium-agent"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

{
  echo "# Build verification on a GitHub Apple Silicon Mac"
  echo
  echo "Helium $(defaults read "$app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null), macOS $(sw_vers -productVersion), $(sysctl -n machdep.cpu.brand_string)"
  echo
} > "$report"

if [ ! -d "$app" ]; then
  echo "- ❌ Helium.app isn't installed, so nothing was checked (see the Get Helium step)." >> "$report"
  cat "$report"
  exit 1
fi

framework=$(find "$app/Contents/Frameworks" -maxdepth 4 -type f -name 'Helium Framework' | head -1)
archs=$(lipo -archs "$framework" 2>/dev/null)
check "Native Apple Silicon: the browser framework is \`$archs\` only" '[ "$archs" = arm64 ]'

"$app/Contents/MacOS/Helium" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 about:blank > "$out/verify-helium.log" 2>&1 &
browser=$!
for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
sleep 25

check "The agent CLI ships inside the app and lists tabs" '"$helium" tabs > "$out/verify-tabs.txt" 2>&1'
"$helium" open https://example.com > /dev/null 2>&1
check "The agent CLI opens and reads a page" '"$helium" read 2>/dev/null | grep -q "Example Domain"'
"$helium" screenshot -o "$out/verify-example.png" > /dev/null 2>&1 || true

extensions=$("$helium" repl "return (await cdp('Target.getTargets')).targetInfos.filter(t => t.url.startsWith('chrome-extension://')).map(t => t.title || t.url).join(', ')" 2>&1)
check "uBlock Origin runs as a built-in extension" 'grep -qi "ublock" <<< "$extensions"'
echo "  - Extension pages running: $extensions" >> "$report"

probe() {
  "$helium" eval "fetch('$1', {mode: 'no-cors', cache: 'no-store', redirect: 'manual'}).then(r => r.type === 'opaqueredirect' ? 'stubbed' : 'loaded', () => 'blocked')" 2>/dev/null | tr -d '"[:space:]'
}
probe_filtered() {
  local result
  for _ in 1 2 3 4 5 6; do
    result=$(probe "$1")
    case "$result" in blocked|stubbed) break ;; esac
    sleep 5
  done
  echo "$result"
}
control=$(probe https://example.com/)
ad=$(probe_filtered https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js)
tracker=$(probe_filtered https://www.google-analytics.com/analytics.js)
is_filtered() { [ "$1" = blocked ] || [ "$1" = stubbed ]; }
check "A normal request loads (control: $control)" '[ "$control" = loaded ]'
check "An ad script never reaches the page: blocked, or swapped for uBlock Origin's harmless stub (googlesyndication: $ad)" 'is_filtered "$ad"'
check "A tracker never reaches the page: blocked, or swapped for uBlock Origin's harmless stub (google-analytics: $tracker)" 'is_filtered "$tracker"'

"$helium" daemon stop > /dev/null 2>&1 || true
kill "$browser" 2>/dev/null || true
echo >> "$report"
echo "Extension APIs are also exercised by the demo itself: it loads an unpacked extension that makes the spaces." >> "$report"
cat "$report"
