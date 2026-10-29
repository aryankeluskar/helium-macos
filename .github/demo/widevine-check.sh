#!/bin/bash
# Checks that Hydrogen gets Google's Widevine CDM (which Spotify, Netflix and
# other protected media need) through Helium services' component proxy, and
# that a page can open a Widevine key session with it. Starts from a fresh
# profile that agreed to Helium services in onboarding. Appends to
# demo-out/verify.md.
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

pkill -x Hydrogen 2>/dev/null && sleep 3
"$app/Contents/MacOS/Hydrogen" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 --enable-logging=stderr \
  --vmodule='*component*=2,*update_client*=2,*widevine*=2,*cdm*=2,*crx*=2,*unzip*=1' \
  about:blank > "$out/widevine-hydrogen.log" 2>&1 &
browser=$!
for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
sleep 10

eme='(async () => {
  try {
    const access = await navigator.requestMediaKeySystemAccess("com.widevine.alpha", [{
      initDataTypes: ["cenc"],
      audioCapabilities: [{contentType: "audio/mp4; codecs=\"mp4a.40.2\""}],
      videoCapabilities: [{contentType: "video/mp4; codecs=\"avc1.42E01E\""}],
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

tab=$("$agent" open https://example.com/ --json 2>/dev/null | jq -r '.tab.id // empty')
result=""
for attempt in $(seq 1 18); do
  sleep 15
  result=$("$agent" eval --tab "$tab" --json "$eme" 2>/dev/null | jq -r '.value // empty')
  echo "attempt $attempt: $result" >> "$out/widevine-attempts.txt"
  [[ "$result" == "license request"* ]] && break
done

components=$("$agent" open chrome://components --json 2>/dev/null | jq -r '.tab.id // empty')
sleep 4
"$agent" read --tab "$components" > "$out/widevine-components.txt" 2>&1
widevine=$(grep -i -A3 'Widevine' "$out/widevine-components.txt" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-200)

if [[ "$result" == "license request"* ]]; then
  pass "Widevine works: a page opened a key session and the CDM produced a $result (after $((attempt * 15 + 10)) s)"
else
  fail "Widevine works: the key session ended with \"${result:-no answer}\" after $((attempt * 15 + 10)) s (\`widevine-attempts.txt\`)"
fi
echo "  - chrome://components: ${widevine:-no Widevine row}" >> "$report"

"$agent" daemon stop > /dev/null 2>&1 || true
kill "$browser" 2>/dev/null || true
grep -i -E 'widevine|oimompecagnajdejgnnjijobebaeigek|error|crx|install' "$out/widevine-hydrogen.log" | grep -v -i stun | head -120 \
  > "$out/widevine-updater.txt"
ls -laR "$profile/WidevineCdm" > "$out/widevine-files.txt" 2>&1 || true
cat "$report"
