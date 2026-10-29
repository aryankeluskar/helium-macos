#!/bin/bash
# Runs Speedometer 3.1 (browserbench.org) in Hydrogen, Brave and Google Chrome
# on this Apple Silicon runner, two rounds interleaved so the three share the
# machine's conditions, each on a fresh profile with its window in front.
# Appends the scores to demo-out/verify.md. Not part of every demo: run it
# through quick-check.yml ("<build run> speedometer.sh").
set -uo pipefail

out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
agent="/Applications/Hydrogen.app/Contents/Resources/hydrogen-agent/hydrogen"
url="https://browserbench.org/Speedometer3.1/?startAutomatically=true"
results="$out/speedometer.tsv"
mkdir -p "$out"
: > "$results"

app_of() {
  case "$1" in
    Hydrogen) echo "/Applications/Hydrogen.app/Contents/MacOS/Hydrogen" ;;
    Brave) echo "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ;;
    Chrome) echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
  esac
}
[ -x "$(app_of Brave)" ] || brew install --cask brave-browser > "$out/brave-install.log" 2>&1
[ -x "$(app_of Chrome)" ] || brew install --cask google-chrome > "$out/chrome-install.log" 2>&1

run() {
  local name="$1" round="$2" binary profile="$RUNNER_TEMP/speedometer-$1-$2" browser tab state score=""
  binary=$(app_of "$name")
  [ -x "$binary" ] || return
  mkdir -p "$profile"
  export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/speedometer-agent-$1-$2"
  "$binary" --user-data-dir="$profile" --no-first-run --no-default-browser-check --remote-debugging-port=0 \
    --window-position=0,25 --window-size=1280,900 "$url" > "$out/speedometer-$name-$round.log" 2>&1 &
  browser=$!
  for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
  sleep 5
  osascript -e "tell application id \"$(defaults read "${binary%/Contents/MacOS/*}/Contents/Info.plist" CFBundleIdentifier)\" to activate" > /dev/null 2>&1 || true
  tab=$("$agent" tabs --json 2>/dev/null | jq -r '[.[]? | select(.url | contains("Speedometer"))][0].id // empty')
  for _ in $(seq 1 120); do
    sleep 5
    state=$("$agent" eval --tab "$tab" --json \
      'location.hash + "|" + (document.querySelector("#result-number")?.textContent || "")' 2>/dev/null | jq -r '.value // empty')
    if [[ "$state" == "#summary|"* ]] && [ -n "${state#*|}" ]; then
      score="${state#*|}"
      break
    fi
  done
  printf '%s\t%s\t%s\n' "$name" "$round" "${score:-no result}" >> "$results"
  "$agent" daemon stop > /dev/null 2>&1 || true
  kill "$browser" 2>/dev/null || true
  sleep 5
  pkill -f "$binary" 2>/dev/null || true
  sleep 3
}

pkill -x Hydrogen 2>/dev/null && sleep 3
for round in 1 2; do
  for name in Hydrogen Brave Chrome; do
    run "$name" "$round"
  done
done

version() {
  local binary
  binary=$(app_of "$1")
  defaults read "${binary%/Contents/MacOS/*}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null
}
{
  echo
  echo "## Speedometer 3.1 on this Apple Silicon runner"
  echo
  echo "$(sysctl -n machdep.cpu.brand_string), macOS $(sw_vers -productVersion). Two rounds, interleaved; higher is better."
  echo
  echo "| Browser | Version | Round 1 | Round 2 |"
  echo "|---|---|---|---|"
  for name in Hydrogen Brave Chrome; do
    echo "| $name | $(version "$name") | $(awk -F'\t' -v n="$name" '$1 == n && $2 == 1 { print $3 }' "$results") | $(awk -F'\t' -v n="$name" '$1 == n && $2 == 2 { print $3 }' "$results") |"
  done
} >> "$report"
cat "$report"
