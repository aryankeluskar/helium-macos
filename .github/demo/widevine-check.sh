#!/bin/bash
# Checks that Hydrogen gets Google's Widevine CDM (which Spotify, Netflix and
# other protected media need) through Helium services' component proxy, and
# that a page can open a Widevine key session with it. Runs the same check on
# the latest official Helium for comparison. Each starts from a fresh profile
# that agreed to Helium services in onboarding. Appends to demo-out/verify.md.
set -uo pipefail

out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
agent="/Applications/Hydrogen.app/Contents/Resources/hydrogen-agent/hydrogen"
mkdir -p "$out"

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

check() {
  local label="$1" app="$2" profile="$RUNNER_TEMP/widevine-$1" browser tab result="" attempt components row
  mkdir -p "$profile/Default"
  export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/widevine-agent-$1"
  echo '{"helium": {"completed_onboarding": true, "services": {"user_consented": true, "schema_version": 1}}}' \
    > "$profile/Default/Preferences"
  "$app/Contents/MacOS/$(defaults read "$app/Contents/Info.plist" CFBundleExecutable)" \
    --user-data-dir="$profile" --no-first-run --no-default-browser-check --remote-debugging-port=0 \
    --enable-logging=stderr --vmodule='*/update_client/*=3,*/component_updater/*=3,*/cdm/*=2,*widevine*=2' \
    about:blank > "$out/widevine-$label.log" 2>&1 &
  browser=$!
  for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
  sleep 10
  tab=$("$agent" open https://example.com/ --json 2>/dev/null | jq -r '.tab.id // empty')
  for attempt in $(seq 1 12); do
    sleep 15
    result=$("$agent" eval --tab "$tab" --json "$eme" 2>/dev/null | jq -r '.value // empty')
    echo "$label attempt $attempt: $result" >> "$out/widevine-attempts.txt"
    [[ "$result" == "license request"* ]] && break
  done
  components=$("$agent" open chrome://components --json 2>/dev/null | jq -r '.tab.id // empty')
  sleep 4
  "$agent" read --tab "$components" > "$out/widevine-$label-components.txt" 2>&1
  row=$(grep -i -A3 'Widevine' "$out/widevine-$label-components.txt" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-160)
  if [[ "$result" == "license request"* ]]; then
    pass "$label: Widevine works, a page opened a key session and got a $result"
  else
    fail "$label: Widevine works (the key session ended with \"${result:-no answer}\")"
  fi
  echo "  - chrome://components: ${row:-no Widevine row}" >> "$report"
  "$agent" daemon stop > /dev/null 2>&1 || true
  kill "$browser" 2>/dev/null || true
  sleep 4
  grep -E 'oimompecagnajdejgnnjijobebaeigek|Widevine|widevine|update_checker|protocol_parser|request_sender|ping|errorcode|status' \
    "$out/widevine-$label.log" | grep -v -i stun | head -150 > "$out/widevine-$label-updater.txt"
}

pkill -x Hydrogen 2>/dev/null && sleep 3
check Hydrogen /Applications/Hydrogen.app

helium_dmg=$(curl -fsSL https://api.github.com/repos/imputnet/helium-macos/releases/latest \
  | jq -r '.assets[] | select(.name | test("arm64.*\\.dmg$")) | .browser_download_url' | head -1)
if [ -n "$helium_dmg" ] && curl -fsSL -o "$RUNNER_TEMP/helium.dmg" "$helium_dmg"; then
  hdiutil attach -quiet -nobrowse -mountpoint /Volumes/HeliumCheck "$RUNNER_TEMP/helium.dmg"
  cp -R /Volumes/HeliumCheck/Helium.app /Applications/
  hdiutil detach -quiet /Volumes/HeliumCheck
  xattr -cr /Applications/Helium.app
  echo "  - Helium for comparison: $(basename "$helium_dmg")" >> "$report"
  check Helium /Applications/Helium.app
else
  echo "  - Helium for comparison couldn't be downloaded" >> "$report"
fi
cat "$report"
