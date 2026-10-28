#!/bin/bash
# Checks the installed build beyond verify.sh: how widely uBlock Origin blocks
# ad and tracker networks (as seen by the request-observer extension) and hides
# ad slots without breaking normal requests,
# installing an extension from the Chrome Web Store, and the collapsed vertical
# tab strip expanding on hover. Appends to demo-out/verify.md.
set -uo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
app=/Applications/Hydrogen.app
out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
hydrogen="$app/Contents/Resources/hydrogen-agent/hydrogen"
profile="$RUNNER_TEMP/deep-profile"
swipe="$RUNNER_TEMP/swipe"
ax="$RUNNER_TEMP/ax"
mkdir -p "$out" "$profile/Default"
export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/hydrogen-agent-deep"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

[ -x "$swipe" ] || swiftc -O "$demo_dir/swipe.swift" -o "$swipe"
swiftc -O "$demo_dir/ax.swift" -o "$ax"

cat > "$profile/Default/Preferences" <<'JSON'
{"helium": {"browser": {"layout": 2}, "completed_onboarding": true, "services": {"user_consented": true}}, "vertical_tabs": {"collapsed_state": true, "expand_on_hover": true}}
JSON

"$app/Contents/MacOS/Hydrogen" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 --window-position=0,25 --window-size=1024,710 --force-prefers-no-reduced-motion \
  --load-extension="$demo_dir/request-observer" \
  "https://en.wikipedia.org/wiki/Arc_(web_browser)" https://news.ycombinator.com https://github.com/imputnet/helium \
  > "$out/deep-hydrogen.log" 2>&1 &
browser=$!
for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
sleep 20

{
  echo
  echo "## Vertical tabs"
  echo
} >> "$report"

bounds=$("$swipe" bounds Hydrogen || true)
if [ -n "$bounds" ]; then
  read -r win_x win_y _ win_h <<< "$bounds"
  away_x=$((win_x + 700))
  away_y=$((win_y + win_h / 2))
  strip_x=$((win_x + 20))
  "$swipe" move "$away_x" "$away_y"
  sleep 2
  screencapture -x "$out/tabs-collapsed.png" || true
  ffmpeg -y -loglevel error -f avfoundation -framerate 30 -capture_cursor 1 \
    -i "Capture screen 0:none" -t 6 -c:v libx264 -preset ultrafast -crf 20 \
    "$out/hover.mov" > "$out/hover-ffmpeg.log" 2>&1 &
  recording=$!
  sleep 2
  "$swipe" move "$strip_x" "$away_y"
  sleep 1.5
  screencapture -x "$out/tabs-hover-expanded.png" || true
  "$swipe" move "$away_x" "$away_y"
  wait "$recording" || true
  if [ -s "$out/hover.mov" ]; then
    ffmpeg -y -loglevel error -i "$out/hover.mov" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" -c:v libx264 -crf 26 -movflags +faststart \
      "$out/hover-expand.mp4"
    ffmpeg -loglevel error -i "$out/hover.mov" \
      -vf "crop=200:200:$((win_x + 60)):$((win_y + 150)),tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" \
      -f null - 2>/dev/null \
      | awk '/pts_time/ { split($0, a, "pts_time:"); t = a[2] } /YAVG/ { split($0, b, "="); printf "%.3f %.2f\n", t, b[2] }' \
      > "$out/hover-motion.txt"
    rm -f "$out/hover.mov"
    moving=$(awk '$2 > 1 { n++ } END { print n + 0 }' "$out/hover-motion.txt")
    echo "- ℹ️ The strip area changed in $moving frames at 30 fps across one hover in and out (\`hover-motion.txt\`, \`hover-expand.mp4\`); Brave-fast is about 4 frames in and 3 out" >> "$report"
  fi
  echo "- ℹ️ Collapsed with favicons: \`tabs-collapsed.png\`; expanded on hover: \`tabs-hover-expanded.png\`" >> "$report"
else
  fail "The Hydrogen window wasn't found, so the vertical tab strip wasn't checked"
fi

observer=bocpdjonlkcamnhcdfelpabhlkaihjke
probe_tab=$("$hydrogen" open https://example.com --json 2>/dev/null | jq -r '.tab.id')

request() {
  local urls
  urls=$(printf '%s\n' "$@" | jq -R . | jq -sc .)
  "$hydrogen" eval --tab "$probe_tab" "Promise.all($urls.map(url => new Promise(done => {
    const element = /\.(png|jpe?g)(\?|$)/.test(url) ? new Image()
      : /fonts\.googleapis|\.css(\?|$)/.test(url) ? Object.assign(document.createElement('link'), { rel: 'stylesheet' })
      : document.createElement('script');
    element.onload = element.onerror = () => done();
    setTimeout(done, 15000);
    if (element.tagName === 'LINK') element.href = url; else element.src = url;
    if (element.tagName !== 'IMG') document.head.append(element);
  }))).then(() => 'done')" > /dev/null 2>&1
}

outcomes() {
  local tab
  tab=$("$hydrogen" open "chrome-extension://$observer/outcomes.html" --json 2>/dev/null | jq -r '.tab.id')
  "$hydrogen" eval --tab "$tab" --json "new Promise(r => setTimeout(r, 500)).then(() => JSON.parse(document.getElementById('outcomes').textContent))" 2>/dev/null | jq -c '.value // {}'
  "$hydrogen" close "$tab" > /dev/null 2>&1 || true
}

outcome_of() {
  jq -r --arg url "$2" '.[$url] // "no request seen"' <<< "$1"
}

for attempt in $(seq 1 12); do
  readiness="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?ready=$attempt"
  request "$readiness"
  case "$(outcome_of "$(outcomes)" "$readiness")" in blocked|stubbed) break ;; esac
  sleep 5
done

{
  echo
  echo "## Ad blocking across networks"
  echo
  echo "Each URL is loaded on example.com the way a page loads it (script, stylesheet or image); a test extension reads what Chrome did with the request from \`chrome.webRequest\`."
  echo
} >> "$report"

ad_urls=(
  https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js
  https://securepubads.g.doubleclick.net/tag/js/gpt.js
  https://www.googletagservices.com/tag/js/gpt.js
  https://static.doubleclick.net/instream/ad_status.js
  https://c.amazon-adsystem.com/aax2/apstag.js
  https://acdn.adnxs.com/prebid/not-for-prod/prebid.js
  https://static.criteo.net/js/ld/publishertag.js
  https://cdn.taboola.com/libtrc/unip/1234/tfa.js
  https://widgets.outbrain.com/outbrain.js
  https://ads.pubmatic.com/AdServer/js/pwt/1/1/pwt.js
  https://js.adsrvr.org/up_loader.1.1.0.js
  https://z.moatads.com/moatheader.js
  https://www.google-analytics.com/analytics.js
  https://www.googletagmanager.com/gtag/js?id=G-TEST
  https://connect.facebook.net/en_US/fbevents.js
  https://static.hotjar.com/c/hotjar-1.js
  https://sb.scorecardresearch.com/beacon.js
  https://bat.bing.com/bat.js
  https://www.clarity.ms/tag/test
  https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js
  https://analytics.tiktok.com/i18n/pixel/events.js
  https://snap.licdn.com/li.lms-analytics/insight.min.js
  https://secure.quantserve.com/quant.js
  https://cdn.segment.com/analytics.js/v1/test/analytics.min.js
)
control_urls=(
  https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
  https://unpkg.com/react@18.3.1/umd/react.production.min.js
  https://fonts.googleapis.com/css2?family=Inter
  https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg
  https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png
)

request "${ad_urls[@]}" "${control_urls[@]}"
sleep 2
seen=$(outcomes)
echo "$seen" | jq . > "$out/request-outcomes.json"

blocked=0
rows=""
for url in "${ad_urls[@]}"; do
  result=$(outcome_of "$seen" "$url")
  case "$result" in blocked|stubbed) blocked=$((blocked + 1)) ;; esac
  rows+="| \`$(echo "$url" | cut -d/ -f3)\` | $result |"$'\n'
done
loaded=0
for url in "${control_urls[@]}"; do
  result=$(outcome_of "$seen" "$url")
  case "$result" in loaded*) loaded=$((loaded + 1)) ;; esac
  rows+="| \`$(echo "$url" | cut -d/ -f3)\` (normal) | $result |"$'\n'
done
check "$blocked of ${#ad_urls[@]} ad and tracker requests are blocked, or answered with uBlock Origin's harmless stub" "[ $blocked -ge $(( ${#ad_urls[@]} * 9 / 10 )) ]"
check "$loaded of ${#control_urls[@]} normal requests (CDNs, fonts, images) load, so blocking doesn't break sites" "[ $loaded -eq ${#control_urls[@]} ]"

cosmetic=$("$hydrogen" eval --tab "$probe_tab" "(async () => { for (const id of ['ad_banner', 'google_ads']) { const slot = document.createElement('div'); slot.id = id; slot.textContent = 'ad'; slot.style.height = '90px'; document.body.append(slot); } await new Promise(r => setTimeout(r, 3000)); return ['ad_banner', 'google_ads'].map(id => getComputedStyle(document.getElementById(id)).display).join(','); })()" 2>/dev/null | tr -d '"[:space:]')
check "Ad slots added to a page are hidden (cosmetic filtering: $cosmetic)" '[ "$cosmetic" = none,none ]'
{
  echo
  echo "<details><summary>Each request</summary>"
  echo
  echo "| Host | What Chrome did |"
  echo "|---|---|"
  printf '%s' "$rows"
  echo
  echo "</details>"
} >> "$report"

{
  echo
  echo "## Chrome Web Store"
  echo
  echo "Hydrogen downloads Web Store extensions through Helium's privacy proxy, so Google doesn't see them; the proxy works once you agree to Helium services in onboarding, as this profile has."
  echo
} >> "$report"

extension=eimadpbcbfnmbkopoojfekhnkhdbieeh
"$hydrogen" open "https://chromewebstore.google.com/detail/$extension" > /dev/null 2>&1
sleep 8
"$hydrogen" snapshot > "$out/web-store-snapshot.txt" 2>&1
ref=$(grep -iE 'button "(Add to|Install)' "$out/web-store-snapshot.txt" | grep -o 'ref=e[0-9]*' | head -1 | cut -d= -f2)
if [ -n "$ref" ]; then
  "$hydrogen" click "$ref" > "$out/web-store-click.txt" 2>&1
  sleep 3
  screencapture -x "$out/web-store-dialog.png" || true
  "$ax" press Hydrogen "Add extension" 20 || echo "no Add extension button" >> "$out/web-store-click.txt"
  for _ in $(seq 1 30); do [ -d "$profile/Default/Extensions/$extension" ] && break; sleep 1; done
  sleep 3
  screencapture -x "$out/web-store-installed.png" || true
fi
check "Dark Reader installs from the Chrome Web Store (\`web-store-dialog.png\`, \`web-store-installed.png\`)" \
  '[ -d "$profile/Default/Extensions/$extension" ]'
running=$("$hydrogen" repl "return (await cdp('Target.getTargets')).targetInfos.some(t => t.url.startsWith('chrome-extension://$extension/'))" 2>/dev/null | tr -d '"[:space:]')
check "The installed extension runs (its pages or service worker: $running)" '[ "$running" = true ]'

"$hydrogen" daemon stop > /dev/null 2>&1 || true
kill "$browser" 2>/dev/null || true
cat "$report"
