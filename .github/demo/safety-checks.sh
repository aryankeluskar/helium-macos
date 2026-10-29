#!/bin/bash
# Compares Hydrogen's safety defaults with Brave's, each on a fresh profile with
# default settings: HTTPS upgrades, tracking parameters stripped from links,
# the Global Privacy Control signal, local IP addresses in WebRTC, a canvas
# fingerprint that differs between sites, Google's Safe Browsing test pages,
# and the remote debugging port on the default profile. Appends a table to
# demo-out/verify.md. Installs Brave if compare-brave.sh hasn't.
set -uo pipefail

out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
hydrogen="/Applications/Hydrogen.app/Contents/Resources/hydrogen-agent/hydrogen"
hydrogen_app="/Applications/Hydrogen.app/Contents/MacOS/Hydrogen"
brave_app="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
results="$out/safety.json"
mkdir -p "$out"
echo '{}' > "$results"

record() {
  jq --arg browser "$1" --arg key "$2" --arg value "$3" '.[$browser][$key] = $value' "$results" > "$results.tmp" \
    && mv "$results.tmp" "$results"
}
open_tab() { "$hydrogen" open "$1" --json 2>/dev/null | jq -r '.tab.id // empty'; }
page_eval() { "$hydrogen" eval --tab "$1" --json "$2" 2>/dev/null | jq -r '.value // empty'; }

webrtc_candidates='new Promise(resolve => {
  const pc = new RTCPeerConnection({iceServers: []});
  const candidates = [];
  pc.createDataChannel("probe");
  pc.onicecandidate = event => event.candidate ? candidates.push(event.candidate.candidate) : resolve(candidates);
  pc.createOffer().then(offer => pc.setLocalDescription(offer));
  setTimeout(() => resolve(candidates), 4000);
}).then(candidates => JSON.stringify(candidates))'
canvas_hash='(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 40;
  const g = canvas.getContext("2d");
  g.textBaseline = "top";
  g.font = "16px Arial";
  g.fillStyle = "#f60";
  g.fillRect(110, 2, 70, 24);
  g.fillStyle = "#069";
  g.fillText("Hydrogen fingerprint 1.0", 4, 12);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canvas.toDataURL()));
  return [...new Uint8Array(digest)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join("");
})()'
page_text='document.title + " | " + (document.body ? document.body.innerText.replace(/\s+/g, " ").slice(0, 200) : "")'

measure() {
  local label="$1" binary="$2" profile="$RUNNER_TEMP/safety-$1" browser tab
  mkdir -p "$profile"
  export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/safety-agent-$label"
  "$binary" --user-data-dir="$profile" --no-first-run --no-default-browser-check --remote-debugging-port=0 \
    about:blank > "$out/safety-$label.log" 2>&1 &
  browser=$!
  for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
  sleep 15

  tab=$(open_tab http://example.com/)
  sleep 6
  record "$label" https "$(page_eval "$tab" 'location.href')"

  tab=$(open_tab 'https://example.com/?fbclid=IwAR0probe&gclid=EAIaIQprobe&msclkid=probe&mc_eid=probe&utm_source=probe&keep=1')
  sleep 6
  record "$label" params "$(page_eval "$tab" 'location.search')"
  record "$label" gpc "$(page_eval "$tab" 'String(navigator.globalPrivacyControl)')"
  record "$label" webrtc "$(page_eval "$tab" "$webrtc_candidates")"
  record "$label" canvas_a "$(page_eval "$tab" "$canvas_hash")"
  record "$label" canvas_a_again "$(page_eval "$tab" "$canvas_hash")"
  tab=$(open_tab https://example.org/)
  sleep 6
  record "$label" canvas_b "$(page_eval "$tab" "$canvas_hash")"

  for kind in phishing malware; do
    tab=$(open_tab "https://testsafebrowsing.appspot.com/s/$kind.html")
    sleep 10
    record "$label" "$kind" "$(page_eval "$tab" "$page_text")"
  done

  "$hydrogen" daemon stop > /dev/null 2>&1 || true
  kill "$browser" 2>/dev/null || true
  sleep 4
  pkill -f "$binary" 2>/dev/null || true
  sleep 2

  "$binary" --remote-debugging-port=9333 --no-first-run --no-default-browser-check about:blank \
    > "$out/safety-$label-default-profile.log" 2>&1 &
  browser=$!
  local port=refused
  for _ in $(seq 1 25); do
    if curl -s -m 2 http://127.0.0.1:9333/json/version > /dev/null; then
      port=open
      break
    fi
    sleep 1
  done
  record "$label" debug_port "$port"
  kill "$browser" 2>/dev/null || true
  sleep 4
  pkill -f "$binary" 2>/dev/null || true
  sleep 2
}

pkill -x Hydrogen 2>/dev/null && sleep 3
measure hydrogen "$hydrogen_app"
if [ -x "$brave_app" ] || brew install --cask brave-browser > "$out/brave-install.log" 2>&1; then
  measure brave "$brave_app"
  brave_version=$(defaults read "/Applications/Brave Browser.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null)
else
  brave_version="(not installed)"
fi

summary() {
  jq -r --arg browser "$1" --arg row "$2" '
    (.[$browser] // {}) as $r
    | def interstitial: test("Dangerous site|Deceptive site|site ahead contains|Attackers on|Security error"; "i");
      def ublock: test("uBlock Origin has prevented|uBlock₀ has prevented"; "i");
      def local_ip: test("(^| )(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|169\\.254\\.)");
    if ($r | length) == 0 then "– not measured"
    elif $row == "https" then
      (if ($r.https // "") | startswith("https://") then "✅ upgraded to HTTPS" elif ($r.https // "") == "" then "– couldn'\''t read" else "❌ stayed on HTTP" end)
    elif $row == "params" then
      ($r.params // "") as $q
      | ([("fbclid", "gclid", "msclkid", "mc_eid", "utm_source") | select($q | contains(. + "=") | not)] | length) as $stripped
      | "\(if $stripped == 5 then "✅" elif $stripped > 0 then "◐" else "❌" end) \($stripped) of 5 stripped (`\($q)`)"
    elif $row == "gpc" then
      (if $r.gpc == "true" then "✅ sent" else "❌ not sent (`\($r.gpc // "")`)" end)
    elif $row == "webrtc" then
      (($r.webrtc // "[]") | (try fromjson catch [])) as $c
      | ([$c[] | select(local_ip)] | length) as $exposed
      | "\(if $exposed == 0 then "✅ no local IP" else "❌ \($exposed) local IP candidates" end) (\($c | length) candidates, \([$c[] | select(test("\\.local "))] | length) mDNS)"
    elif $row == "canvas" then
      (if ($r.canvas_a // "") == "" then "– couldn'\''t read"
       elif $r.canvas_a != $r.canvas_b then "✅ differs between sites (\($r.canvas_a) vs \($r.canvas_b))"
       else "❌ the same on every site (\($r.canvas_a))" end)
    elif $row == "phishing" or $row == "malware" then
      ($r[$row] // "") as $t
      | (if ($t | interstitial) then "✅ blocked with a warning page"
         elif ($t | ublock) then "✅ blocked by uBlock Origin"
         elif $t == "" then "– couldn'\''t read the page"
         else "❌ loaded" end) + " (`\($t | .[0:70])`)"
    elif $row == "debug_port" then
      (if $r.debug_port == "refused" then "✅ stays closed" elif $r.debug_port == "open" then "❌ opens" else "–" end)
    else "" end' "$results"
}

{
  echo
  echo "## Safety compared with Brave"
  echo
  echo "Each browser on a fresh profile with default settings; Brave $brave_version with standard Shields. Raw values in \`safety.json\`."
  echo
  echo "| Protection | Hydrogen | Brave |"
  echo "|---|---|---|"
  for row in "https:http://example.com upgraded to HTTPS" \
    "params:Tracking parameters removed from a link (fbclid, gclid, msclkid, mc_eid, utm_source)" \
    "gpc:Global Privacy Control signal (navigator.globalPrivacyControl)" \
    "webrtc:WebRTC keeps local IP addresses private" \
    "canvas:Canvas fingerprint differs between example.com and example.org" \
    "phishing:Google's Safe Browsing phishing test page" \
    "malware:Google's Safe Browsing malware test page" \
    "debug_port:--remote-debugging-port on the default profile (how infostealers read cookies)"; do
    key="${row%%:*}"
    echo "| ${row#*:} | $(summary hydrogen "$key") | $(summary brave "$key") |"
  done
  echo "| Third-party cookies | ✅ blocked by default (Helium's default setting) | ✅ blocked by default (Shields) |"
} >> "$report"
cat "$report"
