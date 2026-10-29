#!/bin/bash
# Checks that Hydrogen updates itself the way an installed copy will: stamps
# this build twice with a throwaway signing key (release 1 installed, release 2
# offered), serves release 2's appcast from this runner, waits for Sparkle to
# download and verify it, then relaunches to install it. Appends to
# demo-out/verify.md.
set -uo pipefail

out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
updates="$GITHUB_WORKSPACE/dream/hydrogen/updates"
work="$RUNNER_TEMP/update-check"
app="$work/Applications/Hydrogen.app"
hydrogen="$app/Contents/Resources/hydrogen-agent/hydrogen"
profile="$work/profile"
feed="$work/feed"
port=8765
mkdir -p "$out" "$work/Applications" "$profile/Default" "$feed"
export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$work/agent"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
note() { echo "  - $1" >> "$report"; }
bundle_version() { /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist" 2>/dev/null; }
finish() {
  "$hydrogen" daemon stop > /dev/null 2>&1 || true
  pkill -f "$app/" 2>/dev/null || true
  [ -n "${server:-}" ] && kill "$server" 2>/dev/null
  log show --last 20m --style compact \
    --predicate 'subsystem BEGINSWITH "org.sparkle-project" OR process IN {"Autoupdate", "Updater", "Installer"}' \
    > "$out/update-sparkle.log" 2>&1 || true
  cat "$report"
  exit 0
}
{ echo; echo "## Updates"; echo; } >> "$report"

dmg=$(find "$GITHUB_WORKSPACE/dmg" -type f -name '*.dmg' | head -1)
python3 -m venv "$work/venv" > /dev/null && "$work/venv/bin/pip" install --quiet cryptography
python="$work/venv/bin/python"
HYDROGEN_UPDATE_KEY=$("$python" -I -c 'import base64, os; print(base64.b64encode(os.urandom(32)).decode())')
export HYDROGEN_UPDATE_KEY
public_key=$("$python" -I "$updates/appcast.py" public-key)

if ! installed=$("$updates/stamp-dmg.sh" "$dmg" "$work/installed.dmg" "$public_key" 1 2> "$out/update-stamp.log"); then
  fail "This build has Sparkle's update keys, so it can update itself (\`update-stamp.log\`)"
  finish
fi
offered=$("$updates/stamp-dmg.sh" "$dmg" "$feed/hydrogen-update.dmg" "$public_key" 2 2>> "$out/update-stamp.log")
read -r installed_version short_version minimum_system _ <<< "$installed"
read -r offered_version _ <<< "$offered"
"$python" -I "$updates/appcast.py" write --dmg "$feed/hydrogen-update.dmg" \
  --url "http://127.0.0.1:$port/hydrogen-update.dmg" --version "$offered_version" \
  --short-version "$short_version" --minimum-system "$minimum_system" --out "$feed/appcast-arm64.xml"
cp "$feed/appcast-arm64.xml" "$out/update-appcast.xml"
echo "Installed $installed_version, offering $offered_version (minimum macOS $minimum_system)"

hdiutil attach -quiet -nobrowse -mountpoint "$work/mount" "$work/installed.dmg"
cp -R "$work/mount/Hydrogen.app" "$app"
hdiutil detach -quiet "$work/mount"

pkill -x Hydrogen 2>/dev/null && sleep 3
probe="$out/update-feed-probe.txt"
{
  echo "python3: $(command -v python3)"
  echo "firewall before: $(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1)"
  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off 2>&1
  echo "firewall now: $(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1)"
} > "$probe"
python3 -u -m http.server "$port" --bind 127.0.0.1 --directory "$feed" > "$out/update-feed.log" 2>&1 &
server=$!
for _ in $(seq 1 20); do
  curl -s -m 3 -o /dev/null "http://127.0.0.1:$port/probe" && break
  sleep 0.5
done
echo "probe from curl: $(curl -sS -m 5 -o /dev/null -w '%{http_code} in %{time_total}s' "http://127.0.0.1:$port/probe" 2>&1)" >> "$probe"

cat > "$profile/Default/Preferences" <<'JSON'
{"helium": {"completed_onboarding": true, "services": {"user_consented": true}}}
JSON
"$app/Contents/MacOS/Hydrogen" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 --custom-update-server-url="http://127.0.0.1:$port/" about:blank \
  > "$out/update-hydrogen.log" 2>&1 &

for _ in $(seq 1 90); do
  grep -q 'GET /hydrogen-update.dmg' "$out/update-feed.log" && break
  sleep 2
done
if grep -q 'GET /appcast-arm64.xml' "$out/update-feed.log"; then
  pass "On launch Hydrogen checks its update feed, the fork's latest release (here served from this runner, \`update-feed.log\`)"
else
  fail "On launch Hydrogen checks its update feed (\`update-feed.log\`, \`update-feed-probe.txt\`, \`update-sparkle.log\`)"
  echo "probe from curl after: $(curl -sS -m 5 -o /dev/null -w '%{http_code} in %{time_total}s' "http://127.0.0.1:$port/probe" 2>&1)" >> "$probe"
  finish
fi
if grep -q 'GET /hydrogen-update.dmg' "$out/update-feed.log"; then
  pass "It finds release 2 newer than its own release 1 ($offered_version over $installed_version) and downloads it"
else
  fail "It downloads release 2 ($offered_version over $installed_version, \`update-sparkle.log\`)"
  finish
fi

for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
about=$("$hydrogen" repl "return (await cdp('Target.createTarget', {url: 'chrome://settings/help'})).targetId" 2>/dev/null | tr -d '"[:space:]')
ready=false
for _ in $(seq 1 24); do
  sleep 5
  "$hydrogen" read --tab "$about" > "$out/update-about.txt" 2>&1
  if grep -qi 'relaunch' "$out/update-about.txt"; then
    ready=true
    break
  fi
done
"$hydrogen" screenshot --tab "$about" -o "$out/update-about.png" > /dev/null 2>&1 || true
if $ready; then
  pass "Its signature checks out and the About page offers to relaunch (\`update-about.png\`)"
else
  fail "The About page offers to relaunch once the update is verified (\`update-about.txt\`, \`update-sparkle.log\`)"
  finish
fi

"$hydrogen" repl "await cdp('Target.createTarget', {url: 'chrome://restart'}); return 'restarting'" > /dev/null 2>&1 || true
"$hydrogen" daemon stop > /dev/null 2>&1 || true
for _ in $(seq 1 90); do
  [ "$(bundle_version)" = "$offered_version" ] && break
  sleep 2
done
now=$(bundle_version)
if [ "$now" = "$offered_version" ] && codesign --verify --deep --strict "$app" 2>/dev/null; then
  pass "Relaunching installs it: the app on disk is now $now, validly signed"
else
  fail "Relaunching installs the update (the app on disk is ${now:-missing}, \`update-sparkle.log\`)"
  finish
fi
relaunched=false
for _ in $(seq 1 30); do
  pgrep -f "$app/Contents/MacOS/Hydrogen" > /dev/null && relaunched=true && break
  sleep 2
done
if $relaunched; then
  pass "and Hydrogen reopens on the new release"
else
  fail "Hydrogen reopens after installing the update"
fi
finish
