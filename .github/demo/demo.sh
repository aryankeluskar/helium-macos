#!/bin/bash
set -euxo pipefail

demo_dir="$(cd "$(dirname "$0")" && pwd)"
out="$GITHUB_WORKSPACE/demo-out"
profile="$RUNNER_TEMP/demo-profile"
mkdir -p "$out" "$profile/Default"

swiftc -O "$demo_dir/swipe.swift" -o "$RUNNER_TEMP/swipe"
swipe="$RUNNER_TEMP/swipe"

cat > "$profile/Default/Preferences" <<'JSON'
{"helium": {"browser": {"layout": 2}}, "vertical_tabs": {"collapsed_state": false, "expand_on_hover": true}}
JSON

/Applications/Helium.app/Contents/MacOS/Helium \
  --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --load-extension="$demo_dir/spaces-extension" \
  --enable-features=TabGroupsFocusing \
  --window-position=0,25 --window-size=1024,710 \
  about:blank > "$out/helium.log" 2>&1 &
helium_pid=$!

bounds=""
for _ in $(seq 1 60); do
  bounds=$("$swipe" bounds Helium || true)
  [ -n "$bounds" ] && break
  sleep 1
done
[ -n "$bounds" ] || { echo "no Helium window"; exit 1; }
read -r win_x win_y win_w win_h <<< "$bounds"
strip_x=$((win_x + 70))
strip_y=$((win_y + win_h / 2))

sleep 35
"$swipe" move "$strip_x" "$strip_y"
sleep 1
screencapture -x "$out/before.png" || true

ffmpeg -y -loglevel error -f avfoundation -framerate 30 -capture_cursor 1 \
  -i "Capture screen 0:none" -t 28 -c:v libx264 -preset ultrafast -crf 20 \
  "$out/screen.mov" > "$out/ffmpeg.log" 2>&1 &
recording=$!
sleep 3
if ! kill -0 "$recording" 2>/dev/null; then
  cat "$out/ffmpeg.log" || true
  screencapture -x -v -V 26 "$out/screen.mov" &
  recording=$!
fi
sleep 2

for _ in 1 2 3; do
  "$swipe" swipe "$strip_x" "$strip_y" -420 0.35
  sleep 2
done
"$swipe" swipe "$strip_x" "$strip_y" -50 1.2
sleep 2
"$swipe" swipe "$strip_x" "$strip_y" 130 1.5
sleep 2
for _ in 1 2; do
  "$swipe" swipe "$strip_x" "$strip_y" 420 0.35
  sleep 2
done

wait "$recording" || true
screencapture -x "$out/after.png" || true
kill "$helium_pid" || true

if [ -s "$out/screen.mov" ]; then
  ffmpeg -y -loglevel error -i "$out/screen.mov" \
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" -c:v libx264 -crf 26 -movflags +faststart \
    "$out/spaces-demo.mp4"
  rm -f "$out/screen.mov"
fi
ls -la "$out"
