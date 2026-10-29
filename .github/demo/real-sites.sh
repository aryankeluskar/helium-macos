#!/bin/bash
# Compares ads and trackers on real ad-heavy pages between the installed
# Hydrogen (Helium services agreed to, as onboarding asks) and Brave with
# default Shields, each on a fresh profile and measured by real-sites.mjs once
# its blocker is active. Appends a table to demo-out/verify.md. Installs Brave
# if compare-brave.sh hasn't.
set -uo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
out="$GITHUB_WORKSPACE/demo-out"
report="$out/verify.md"
brave_app="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
hydrogen_profile="$RUNNER_TEMP/real-sites-hydrogen"
mkdir -p "$out" "$hydrogen_profile/Default"
echo '{"helium": {"completed_onboarding": true, "services": {"user_consented": true}}}' > "$hydrogen_profile/Default/Preferences"

pkill -x Hydrogen 2>/dev/null && sleep 3
node "$demo_dir/real-sites.mjs" hydrogen /Applications/Hydrogen.app/Contents/MacOS/Hydrogen \
  "$hydrogen_profile" "$out"
if [ -x "$brave_app" ] || brew install --cask brave-browser >> "$out/brave-install.log" 2>&1; then
  pkill -f "Brave Browser" 2>/dev/null && sleep 3
  node "$demo_dir/real-sites.mjs" brave "$brave_app" "$RUNNER_TEMP/real-sites-brave" "$out"
fi

for label in hydrogen brave; do
  [ -s "$out/real-sites-$label.json" ] || echo '{"pages": []}' > "$out/real-sites-$label.json"
done
jq -r -s '
  (.[0].pages | map({key: .url, value: .}) | from_entries) as $h
  | (.[1].pages | map({key: .url, value: .}) | from_entries) as $b
  | def cell($p): if $p == null or $p.error != null or ($p.requests // 0) == 0 then "–"
      else "\($p.adAnswered) of \($p.adRequests)" end;
    def weight($p): if $p == null or $p.error != null or ($p.requests // 0) == 0 then "–"
      else "\($p.requests) req, \($p.megabytes) MB, \(if $p.loadSeconds == null then "no load event" else "loaded in \($p.loadSeconds) s" end)" end;
    def total($pages; f): [$pages[] | select(.error == null and (.requests // 0) > 0) | f] | add // 0;
  ([$h | keys[] | select($b[.] != null and $h[.].requests > 0 and $b[.].requests > 0)]) as $both
  | "Ad and tracker requests that got an answer, of those the page made:",
    "",
    "| Page | Hydrogen | Brave | Hydrogen weight | Brave weight |",
    "|---|---|---|---|---|",
    ($h | keys[] as $url | "| \($url | sub("^https://(www\\.)?"; "") | sub("/.*$"; "")) | \(cell($h[$url])) | \(cell($b[$url])) | \(weight($h[$url])) | \(weight($b[$url])) |"),
    "| **Pages both loaded (\($both | length))** | **\(total([$both[] as $u | $h[$u]]; .adAnswered)) of \(total([$both[] as $u | $h[$u]]; .adRequests))** | **\(total([$both[] as $u | $b[$u]]; .adAnswered)) of \(total([$both[] as $u | $b[$u]]; .adRequests))** | \(total([$both[] as $u | $h[$u]]; .megabytes) * 100 | round / 100) MB | \(total([$both[] as $u | $b[$u]]; .megabytes) * 100 | round / 100) MB |"
' "$out/real-sites-hydrogen.json" "$out/real-sites-brave.json" > "$out/real-sites.md" 2> "$out/real-sites-jq.log"

{
  echo
  echo "## Ads on real pages compared with Brave"
  echo
  echo "Twelve ad-heavy pages, each given 20 seconds in a fresh profile once the browser's blocker stops a test ad request (up to 2.5 minutes after launch); requests counted over the DevTools protocol, including frames in other processes. Fewer answered ad and tracker requests is better."
  echo
  cat "$out/real-sites.md"
} >> "$report"
cat "$report"
