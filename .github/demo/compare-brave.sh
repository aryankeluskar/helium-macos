#!/bin/bash
# Runs d3ward's ad block test list (131 ad, analytics, error tracking, social
# and OEM hosts, independent of uBlock Origin's lists) through the installed
# build and through Brave with default Shields, recording what each browser did
# with every request via the request-observer extension. Appends a comparison
# to demo-out/verify.md.
set -uo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
helium="/Applications/Helium.app/Contents/Resources/helium-agent/helium"
observer=bocpdjonlkcamnhcdfelpabhlkaihjke
mkdir -p "$out"

curl -fsSL https://raw.githubusercontent.com/d3ward/toolz/master/src/data/adblock_data.json -o "$RUNNER_TEMP/adblock_data.json"
jq -r 'to_entries[] | .key as $category | .value | .. | strings
  | select(contains(".") and (contains(" ") | not) and (contains("/") | not)) | "\($category)\t\(.)"' \
  "$RUNNER_TEMP/adblock_data.json" > "$RUNNER_TEMP/hosts.tsv"
urls=$(cut -f2 "$RUNNER_TEMP/hosts.tsv" | sed 's|^|https://|; s|$|/|' | jq -R . | jq -sc .)

sweep() {
  local label="$1" binary="$2" profile="$RUNNER_TEMP/sweep-$1" browser tab observer_tab attempt readiness
  mkdir -p "$profile"
  export HELIUM_USER_DATA_DIR="$profile" HELIUM_AGENT_HOME="$RUNNER_TEMP/agent-$label"
  "$binary" --user-data-dir="$profile" --no-first-run --no-default-browser-check --remote-debugging-port=0 \
    --disable-features=DisableLoadExtensionCommandLineSwitch --load-extension="$demo_dir/request-observer" \
    about:blank > "$out/sweep-$label.log" 2>&1 &
  browser=$!
  for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
  sleep 20
  tab=$("$helium" open https://example.com --json 2>/dev/null | jq -r '.tab.id')

  for attempt in $(seq 1 24); do
    readiness="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?ready=$attempt"
    "$helium" eval --tab "$tab" "fetch('$readiness', {mode: 'no-cors'}).then(() => 0, () => 0)" > /dev/null 2>&1
    sleep 1
    observer_tab=$("$helium" open "chrome-extension://$observer/outcomes.html" --json 2>/dev/null | jq -r '.tab.id')
    case "$("$helium" eval --tab "$observer_tab" --json "new Promise(r => setTimeout(r, 300)).then(() => JSON.parse(document.getElementById('outcomes').textContent))" 2>/dev/null \
      | jq -r --arg url "$readiness" '.value[$url] // ""')" in
      blocked|stubbed) "$helium" close "$observer_tab" > /dev/null 2>&1; break ;;
    esac
    "$helium" close "$observer_tab" > /dev/null 2>&1
    sleep 4
  done

  "$helium" eval --tab "$tab" --json "Promise.all($urls.map(url => Promise.race([
    fetch(url, {mode: 'no-cors', cache: 'no-store'}).then(() => 'answered', () => 'failed'),
    new Promise(r => setTimeout(() => r('no answer'), 15000)),
  ]).then(result => [url, result]))).then(Object.fromEntries)" 2>/dev/null | jq '.value // {}' > "$out/sweep-$label-page.json"
  sleep 3
  observer_tab=$("$helium" open "chrome-extension://$observer/outcomes.html" --json 2>/dev/null | jq -r '.tab.id')
  "$helium" eval --tab "$observer_tab" --json "new Promise(r => setTimeout(r, 500)).then(() => JSON.parse(document.getElementById('outcomes').textContent))" 2>/dev/null \
    | jq '.value // {}' > "$out/sweep-$label.json"
  "$helium" daemon stop > /dev/null 2>&1 || true
  kill "$browser" 2>/dev/null || true
  sleep 3
}

{
  echo
  echo "## Compared with Brave"
  echo
} >> "$report"

sweep helium /Applications/Helium.app/Contents/MacOS/Helium
if brew install --cask brave-browser > "$out/brave-install.log" 2>&1; then
  sweep brave "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  brave_version=$(defaults read "/Applications/Brave Browser.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null)
else
  echo '{}' > "$out/sweep-brave.json"
  echo '{}' > "$out/sweep-brave-page.json"
  brave_version="not installed (see brave-install.log)"
fi

filtered() {
  jq -rn --arg url "https://$2/" --slurpfile seen "$out/sweep-$1.json" --slurpfile page "$out/sweep-$1-page.json" '
    ($seen[0][$url] // null) as $observed | ($page[0][$url] // "not requested") as $result
    | if $observed then $observed
      elif $result == "failed" then "blocked before extensions"
      else $result end'
}

{
  echo "d3ward's [ad block test](https://d3ward.github.io/toolz/adblock) hosts, requested from example.com in each browser with a fresh profile and default settings; Brave $brave_version with standard Shields. A host counts as blocked when the browser refused the request (seen by the request-observer extension, or, for Brave's Shields, which act before extensions, by the page's request failing) or answered it with a stub."
  echo
  echo "| Category | Hosts | Helium blocked | Brave blocked |"
  echo "|---|---|---|---|"
} >> "$report"
rows=""
total_helium=0
total_brave=0
while IFS= read -r category; do
  count=0 helium_blocked=0 brave_blocked=0
  while IFS=$'\t' read -r _ host; do
    count=$((count + 1))
    helium_result=$(filtered helium "$host")
    brave_result=$(filtered brave "$host")
    case "$helium_result" in blocked*|stubbed) helium_blocked=$((helium_blocked + 1)) ;; esac
    case "$brave_result" in blocked*|stubbed) brave_blocked=$((brave_blocked + 1)) ;; esac
    rows+="| $category | \`$host\` | $helium_result | $brave_result |"$'\n'
  done < <(awk -F'\t' -v c="$category" '$1 == c' "$RUNNER_TEMP/hosts.tsv")
  total_helium=$((total_helium + helium_blocked))
  total_brave=$((total_brave + brave_blocked))
  echo "| $category | $count | $helium_blocked | $brave_blocked |" >> "$report"
done < <(cut -f1 "$RUNNER_TEMP/hosts.tsv" | awk '!seen[$0]++')
{
  echo "| **All** | $(wc -l < "$RUNNER_TEMP/hosts.tsv" | tr -d ' ') | **$total_helium** | **$total_brave** |"
  echo
  echo "<details><summary>Each host</summary>"
  echo
  echo "| Category | Host | Helium | Brave |"
  echo "|---|---|---|---|"
  printf '%s' "$rows"
  echo
  echo "</details>"
} >> "$report"
cat "$report"
