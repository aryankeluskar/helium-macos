#!/bin/bash
# Installs popular extensions from the Chrome Web Store the way a person does
# (Add to Chrome, then Add extension in the native dialog) on a fresh profile
# that agreed to Helium services, and checks that each one installs, that its
# own popup or options page loads, and that Dark Reader and Vimium act on a
# page. Appends to demo-out/verify.md.
set -uo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
app=/Applications/Hydrogen.app
out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
hydrogen="$app/Contents/Resources/hydrogen-agent/hydrogen"
profile="$RUNNER_TEMP/extensions-profile"
ax="$RUNNER_TEMP/ax"
mkdir -p "$out/extensions" "$profile/Default"
export HYDROGEN_USER_DATA_DIR="$profile" HYDROGEN_AGENT_HOME="$RUNNER_TEMP/hydrogen-agent-extensions"
echo '{"helium": {"completed_onboarding": true, "services": {"user_consented": true, "schema_version": 1}}}' \
  > "$profile/Default/Preferences"

pass() { echo "- ✅ $1" >> "$report"; }
fail() { echo "- ❌ $1" >> "$report"; }
{ echo; echo "## Chrome Web Store extensions"; echo; } >> "$report"

[ -x "$ax" ] || swiftc -O "$demo_dir/ax.swift" -o "$ax"
pkill -x Hydrogen 2>/dev/null && sleep 3
"$app/Contents/MacOS/$(defaults read "$app/Contents/Info.plist" CFBundleExecutable)" --user-data-dir="$profile" \
  --no-first-run --no-default-browser-check --remote-debugging-port=0 --window-position=0,25 --window-size=1200,800 \
  about:blank > "$out/extensions/hydrogen.log" 2>&1 &
browser=$!
for _ in $(seq 1 60); do [ -s "$profile/DevToolsActivePort" ] && break; sleep 1; done
sleep 12

page_loads='(async () => {
  await new Promise((r) => setTimeout(r, 4000));
  const elements = document.querySelectorAll("body *").length;
  const text = (document.body?.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60);
  return `${elements} elements${text ? `, "${text}"` : ""}`;
})()'

install() {
  local id="$1" name="$2" tab ref dir version manifest page shown
  tab=$("$hydrogen" open "https://chromewebstore.google.com/detail/$id" --json 2>/dev/null | jq -r '.tab.id // empty')
  sleep 8
  "$hydrogen" snapshot --tab "$tab" > "$out/extensions/$id-store.txt" 2>&1
  ref=$(grep -iE 'button "(Add to|Install)' "$out/extensions/$id-store.txt" | grep -o 'ref=e[0-9]*' | head -1 | cut -d= -f2)
  if [ -n "$ref" ]; then
    "$hydrogen" click "$ref" > /dev/null 2>&1
    sleep 3
    "$ax" press Hydrogen "Add extension" 20 > /dev/null 2>&1 || echo "no Add extension button" >> "$out/extensions/$id-store.txt"
    for _ in $(seq 1 45); do [ -d "$profile/Default/Extensions/$id" ] && break; sleep 1; done
  fi
  dir=$(find "$profile/Default/Extensions/$id" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
  if [ -z "$dir" ]; then
    fail "$name installs from the Web Store (no Add button: ${ref:-missing}; see \`extensions/$id-store.txt\`)"
    return
  fi
  version=$(basename "$dir" | sed 's/_[0-9]*$//')
  manifest=$(jq -r '"MV\(.manifest_version)"' "$dir/manifest.json")
  page=$(jq -r '.action.default_popup // .browser_action.default_popup // .options_ui.page // .options_page // empty' "$dir/manifest.json")
  if [ -z "$page" ]; then
    pass "$name $version ($manifest) installs from the Web Store"
    return
  fi
  tab=$("$hydrogen" open "chrome-extension://$id/$page" --json 2>/dev/null | jq -r '.tab.id // empty')
  shown=$("$hydrogen" eval --tab "$tab" --json "$page_loads" 2>/dev/null | jq -r '.value // empty')
  echo "$name $page: $shown" >> "$out/extensions/pages.txt"
  if [[ "$shown" =~ ^([0-9]+)\ elements ]] && [ "${BASH_REMATCH[1]}" -ge 3 ]; then
    pass "$name $version ($manifest) installs from the Web Store and its page runs (\`$page\`: $shown)"
  else
    fail "$name $version ($manifest) installs from the Web Store and its page runs (\`$page\`: ${shown:-no answer})"
  fi
}

install eimadpbcbfnmbkopoojfekhnkhdbieeh "Dark Reader"
install nngceckbapebfimnlniiiahkandclblb "Bitwarden"
install aeblfdkhhhdcdjpifhhbdiojplfjncoa "1Password"
install dbepggeogbaibhgnhhndojpepiihcmeb "Vimium"
install fmkadmapgofadopljbjfkapdkoienihi "React Developer Tools"
install aapbdbdomjkkjkaonfhkkikfgjllcleb "Google Translate"
install mnjggcdmjocbbbhaepdhchncahnbgone "SponsorBlock"
install kbfnbcaeplbcioakkpcpgfkobkghlhen "Grammarly"

tab=$("$hydrogen" open https://en.wikipedia.org/wiki/Hydrogen --json 2>/dev/null | jq -r '.tab.id // empty')
sleep 6
dark=$("$hydrogen" eval --tab "$tab" --json '(() => { const styles = document.querySelectorAll("style.darkreader").length; return `${styles} Dark Reader styles, background ${getComputedStyle(document.body).backgroundColor}`; })()' 2>/dev/null | jq -r '.value // empty')
if [[ "$dark" =~ ^([0-9]+)\ Dark ]] && [ "${BASH_REMATCH[1]}" -gt 0 ]; then
  pass "Dark Reader darkens Wikipedia ($dark)"
else
  fail "Dark Reader darkens Wikipedia (${dark:-no answer})"
fi
"$hydrogen" focus "$tab" > /dev/null 2>&1
"$hydrogen" press f > /dev/null 2>&1
sleep 2
hints=$("$hydrogen" eval --tab "$tab" --json '(() => { const hosts = [...document.documentElement.querySelectorAll("*")].filter((e) => /vimium/i.test(e.id + " " + e.className)); const inner = hosts.reduce((n, e) => n + (e.shadowRoot ? e.shadowRoot.querySelectorAll("*").length : e.querySelectorAll("*").length), 0); return `${hosts.length} Vimium elements holding ${inner}`; })()' 2>/dev/null | jq -r '.value // empty')
"$hydrogen" press Escape > /dev/null 2>&1
if [[ "$hints" =~ holding\ ([0-9]+)$ ]] && [ "${BASH_REMATCH[1]}" -gt 10 ]; then
  pass "Vimium shows link hints when you press f ($hints)"
else
  fail "Vimium shows link hints when you press f (${hints:-no answer})"
fi
screencapture -x "$out/extensions/after.png" 2>/dev/null || true

"$hydrogen" daemon stop > /dev/null 2>&1 || true
kill "$browser" 2>/dev/null || true
cat "$report"
