#!/bin/bash
# Checks the installed build beyond verify.sh: how widely uBlock Origin blocks
# ad and tracker networks and hides ad slots without breaking normal requests,
# installing an extension from the Chrome Web Store, and the collapsed vertical
# tab strip expanding on hover. Appends to demo-out/verify.md.
set -uo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
app=/Applications/Helium.app
out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
helium="$app/Contents/Resources/helium-agent/helium"
profile="$RUNNER_TEMP/deep-profile"
swipe="$RUNNER_TEMP/swipe"
ax="$RUNNER_TEMP/ax"
mkdir -p "$out" "$profile/Default"
export HELIUM_USER_DATA_DIR="$profile" HELIUM_AGENT_HOME="$RUNNER_TEMP/helium-agent-deep"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

[ -x "$swipe" ] || swiftc -O "$demo_dir/swipe.swift" -o "$swipe"
swiftc -O "$demo_dir/ax.swift" -o "$ax"

cat > "$profile/Default/Preferences" <<'JSON'
{"helium": {"browser": {"layout": 2}}, "vertical_tabs": {"collapsed_state": true, "expand_on_hover": true}}
JSON

"$app/Contents/MacOS/Helium" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 --window-position=0,25 --window-size=1024,710 \
  "https://en.wikipedia.org/wiki/Arc_(web_browser)" https://news.ycombinator.com https://github.com/imputnet/helium \
  > "$out/deep-helium.log" 2>&1 &
browser=$!
for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
sleep 20

{
  echo
  echo "## Vertical tabs"
  echo
} >> "$report"

bounds=$("$swipe" bounds Helium || true)
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
    echo "- ℹ️ The strip area changed in $moving frames at 30 fps across one hover in and out (\`hover-motion.txt\`, \`hover-expand.mp4\`); Brave-fast is about 4 frames each way" >> "$report"
  fi
  echo "- ℹ️ Collapsed with favicons: \`tabs-collapsed.png\`; expanded on hover: \`tabs-hover-expanded.png\`" >> "$report"
else
  fail "The Helium window wasn't found, so the vertical tab strip wasn't checked"
fi

probe() {
  "$helium" eval "fetch('$1', {mode: 'no-cors', cache: 'no-store', redirect: 'manual'}).then(r => r.type === 'opaqueredirect' ? 'stubbed' : 'loaded', () => 'blocked')" 2>/dev/null | tr -d '"[:space:]'
}

"$helium" open https://example.com > /dev/null 2>&1
for _ in $(seq 1 12); do
  case "$(probe https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js)" in blocked|stubbed) break ;; esac
  sleep 5
done

{
  echo
  echo "## Ad blocking across networks"
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

blocked=0
rows=""
for url in "${ad_urls[@]}"; do
  result=$(probe "$url")
  case "$result" in blocked|stubbed) blocked=$((blocked + 1)) ;; esac
  host=$(echo "$url" | cut -d/ -f3)
  rows+="| \`$host\` | $result |"$'\n'
done
loaded=0
for url in "${control_urls[@]}"; do
  result=$(probe "$url")
  [ "$result" = loaded ] && loaded=$((loaded + 1))
  host=$(echo "$url" | cut -d/ -f3)
  rows+="| \`$host\` (normal) | $result |"$'\n'
done
check "$blocked of ${#ad_urls[@]} ad and tracker requests never reach the page" "[ $blocked -ge $(( ${#ad_urls[@]} * 9 / 10 )) ]"
check "$loaded of ${#control_urls[@]} normal requests (CDNs, fonts, images) load, so blocking doesn't break sites" "[ $loaded -eq ${#control_urls[@]} ]"

cosmetic=$("$helium" eval "(async () => { for (const id of ['ad_banner', 'google_ads']) { const slot = document.createElement('div'); slot.id = id; slot.textContent = 'ad'; slot.style.height = '90px'; document.body.append(slot); } await new Promise(r => setTimeout(r, 3000)); return ['ad_banner', 'google_ads'].map(id => getComputedStyle(document.getElementById(id)).display).join(','); })()" 2>/dev/null | tr -d '"[:space:]')
check "Ad slots added to a page are hidden (cosmetic filtering: $cosmetic)" '[ "$cosmetic" = none,none ]'
{
  echo
  echo "<details><summary>Each request</summary>"
  echo
  echo "| Host | Result |"
  echo "|---|---|"
  printf '%s' "$rows"
  echo
  echo "</details>"
} >> "$report"

{
  echo
  echo "## Chrome Web Store"
  echo
} >> "$report"

extension=eimadpbcbfnmbkopoojfekhnkhdbieeh
"$helium" open "https://chromewebstore.google.com/detail/$extension" > /dev/null 2>&1
sleep 8
"$helium" snapshot > "$out/web-store-snapshot.txt" 2>&1
ref=$(grep -iE 'button "(Add to|Install)' "$out/web-store-snapshot.txt" | grep -o 'ref=e[0-9]*' | head -1 | cut -d= -f2)
if [ -n "$ref" ]; then
  "$helium" click "$ref" > "$out/web-store-click.txt" 2>&1
  sleep 3
  screencapture -x "$out/web-store-dialog.png" || true
  "$ax" press Helium "Add extension" 20 || echo "no Add extension button" >> "$out/web-store-click.txt"
  for _ in $(seq 1 30); do [ -d "$profile/Default/Extensions/$extension" ] && break; sleep 1; done
  sleep 3
  screencapture -x "$out/web-store-installed.png" || true
fi
check "Dark Reader installs from the Chrome Web Store (\`web-store-dialog.png\`, \`web-store-installed.png\`)" \
  '[ -d "$profile/Default/Extensions/$extension" ]'
running=$("$helium" repl "return (await cdp('Target.getTargets')).targetInfos.some(t => t.url.startsWith('chrome-extension://$extension/'))" 2>/dev/null | tr -d '"[:space:]')
check "The installed extension runs (its pages or service worker: $running)" '[ "$running" = true ]'

"$helium" daemon stop > /dev/null 2>&1 || true
kill "$browser" 2>/dev/null || true
cat "$report"
