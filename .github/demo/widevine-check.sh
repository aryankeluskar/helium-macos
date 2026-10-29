#!/bin/bash
# Checks protected media (Widevine, which Spotify, Netflix and others need) in
# Hydrogen. Helium services' component proxy doesn't serve Widevine, so a fresh
# profile has none; dream/hydrogen/widevine/install-widevine.sh fetches it from
# Google. This runs the installer on a fresh profile, then checks that a page
# opens a Widevine key session and plays Shaka's Widevine-protected test stream
# with its public license server. Appends to demo-out/verify.md.
set -uo pipefail

out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
app=/Applications/Hydrogen.app
agent="$app/Contents/Resources/hydrogen-agent/hydrogen"
profile="$RUNNER_TEMP/widevine-profile"
mkdir -p "$out" "$profile/Default"
export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/widevine-agent"
echo '{"helium": {"completed_onboarding": true, "services": {"user_consented": true, "schema_version": 1}}}' \
  > "$profile/Default/Preferences"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
{ echo; echo "## Protected media (Widevine)"; echo; } >> "$report"

eme='(async () => {
  try {
    const access = await navigator.requestMediaKeySystemAccess("com.widevine.alpha", [{
      initDataTypes: ["cenc"],
      audioCapabilities: [{contentType: "audio/mp4; codecs=\"mp4a.40.2\"", robustness: "SW_SECURE_CRYPTO"}],
      videoCapabilities: [{contentType: "video/mp4; codecs=\"avc1.42E01E\"", robustness: "SW_SECURE_DECODE"}],
    }]);
    const keys = await access.createMediaKeys();
    const session = keys.createSession();
    const keyId = new Uint8Array(16).fill(7);
    const data = new Uint8Array([0x12, 0x10, ...keyId]);
    const box = new DataView(new ArrayBuffer(32 + data.length));
    box.setUint32(0, 32 + data.length);
    [..."pssh"].forEach((c, i) => box.setUint8(4 + i, c.charCodeAt(0)));
    "edef8ba979d64acea3c827dcd51d21ed".match(/../g).forEach((h, i) => box.setUint8(12 + i, parseInt(h, 16)));
    box.setUint32(28, data.length);
    data.forEach((b, i) => box.setUint8(32 + i, b));
    const message = new Promise((resolve) => session.addEventListener("message", (e) => resolve(e.message.byteLength)));
    await session.generateRequest("cenc", box.buffer);
    const bytes = await Promise.race([message, new Promise((r) => setTimeout(() => r(0), 10000))]);
    return bytes > 0 ? `license request of ${bytes} bytes` : "no license request";
  } catch (error) {
    return `${error.name}: ${error.message}`;
  }
})()'

playback='(async () => {
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/shaka-player@4.16.0/dist/shaka-player.compiled.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Shaka Player did not load"));
      document.head.append(script);
    });
    shaka.polyfill.installAll();
    const video = document.createElement("video");
    video.muted = true;
    video.width = 640;
    document.body.append(video);
    const player = new shaka.Player();
    await player.attach(video);
    player.configure({drm: {servers: {"com.widevine.alpha": "https://cwip-shaka-proxy.appspot.com/no_auth"}}});
    await player.load("https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd");
    await video.play();
    await new Promise((r) => setTimeout(r, 8000));
    const quality = video.getVideoPlaybackQuality();
    return `played ${video.currentTime.toFixed(1)} s with ${player.getKeySystem() || "no key system"}, ` +
      `${quality.totalVideoFrames} frames decoded, ${video.videoWidth}x${video.videoHeight}`;
  } catch (error) {
    return `${error.name || "Error"}: ${error.message || ("Shaka error " + error.code)}`;
  }
})()'

launch() {
  "$app/Contents/MacOS/$(defaults read "$app/Contents/Info.plist" CFBundleExecutable)" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
    --remote-debugging-port=0 --enable-logging=stderr --vmodule='*/cdm/*=2,*widevine*=2' \
    about:blank >> "$out/widevine-$1.log" 2>&1 &
  browser=$!
  for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
  sleep 15
  tab=$("$agent" open https://example.com/ --json 2>/dev/null | jq -r '.tab.id // empty')
  sleep 3
}

quit() {
  "$agent" daemon stop > /dev/null 2>&1 || true
  kill "$browser" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$browser" 2>/dev/null || break; sleep 1; done
  rm -f "$profile/DevToolsActivePort"
}

components_row() {
  local components
  components=$("$agent" open chrome://components --json 2>/dev/null | jq -r '.tab.id // empty')
  sleep 4
  "$agent" read --tab "$components" > "$out/widevine-$1-components.txt" 2>&1
  grep -i -A3 'Widevine' "$out/widevine-$1-components.txt" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-160
}

pkill -x Hydrogen 2>/dev/null && sleep 3

launch before
before=$("$agent" eval --tab "$tab" --json "$eme" 2>/dev/null | jq -r '.value // empty')
echo "  - Before installing, a fresh profile's key session ends with \"${before:-no answer}\"" >> "$report"
echo "  - chrome://components before: $(components_row before)" >> "$report"
quit

if HYDROGEN_APP="$app" bash dream/hydrogen/widevine/install-widevine.sh > "$out/widevine-install.txt" 2>&1; then
  pass "install-widevine.sh: $(tail -2 "$out/widevine-install.txt" | head -1)"
else
  fail "install-widevine.sh ran (exit $?): $(tail -3 "$out/widevine-install.txt" | tr '\n' ' ' | cut -c1-300)"
fi
ls -R "$profile/WidevineCdm" > "$out/widevine-files.txt" 2>&1

launch after
for attempt in 1 2 3 4; do
  session=$("$agent" eval --tab "$tab" --json "$eme" 2>/dev/null | jq -r '.value // empty')
  echo "after attempt $attempt: $session" >> "$out/widevine-attempts.txt"
  [[ "$session" == "license request"* ]] && break
  sleep 10
done
if [[ "$session" == "license request"* ]]; then
  pass "After installing, a page opened a Widevine key session and got a $session"
else
  fail "After installing, a page opened a Widevine key session (it ended with \"${session:-no answer}\")"
fi
played=$("$agent" eval --tab "$tab" --json "$playback" 2>/dev/null | jq -r '.value // empty')
echo "playback: $played" >> "$out/widevine-attempts.txt"
seconds=$(sed -n 's/^played \([0-9.]*\) s with com.widevine.alpha.*/\1/p' <<< "$played")
if [ -n "$seconds" ] && awk -v s="$seconds" 'BEGIN { exit !(s >= 4) }'; then
  pass "Widevine-protected video plays: $played"
else
  fail "Widevine-protected video plays (${played:-no answer})"
fi
echo "  - chrome://components after: $(components_row after)" >> "$report"
quit

again=$(HYDROGEN_APP="$app" bash dream/hydrogen/widevine/install-widevine.sh 2>&1 | tail -1)
if [[ "$again" == *"already installed"* ]]; then
  pass "Running the installer again changes nothing: $again"
else
  fail "Running the installer again changes nothing (it said \"$again\")"
fi
grep -i -E 'widevine|cdm' "$out/widevine-after.log" | head -60 > "$out/widevine-after-cdm.txt"
cat "$report"
