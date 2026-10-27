#!/bin/bash
#
# Usage: build-on-a-mac.sh [--background | --full-speed] [--dir PATH]
#
# Builds the dream fork of Helium (vertical tabs that expand like Brave's,
# tab groups as Arc-style spaces you scroll between with two fingers) as an
# optimized Apple Silicon DMG, the same build GitHub Actions makes.
#
#   --background   Default. Runs at macOS background priority with a job
#                  count sized to this Mac's memory, so the Mac stays usable.
#                  Best left running overnight.
#   --full-speed   Uses every core. For a rented or otherwise idle Mac.
#   --dir PATH     Where to clone and build (default: ~/helium-dream).
#
# Needs macOS on Apple Silicon, Xcode 26 and Homebrew, and about 100 GB of
# free disk. Running it again continues an interrupted build.

set -euo pipefail

mode=background
dir="$HOME/helium-dream"
repo=https://github.com/aryankeluskar/helium-macos.git
branch=claude/arc-spaces

while [ $# -gt 0 ]; do
  case "$1" in
    --background) mode=background ;;
    --full-speed) mode=full ;;
    --dir) dir="$2"; shift ;;
    -h|--help) sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo "This builds on Apple Silicon Macs only." >&2
  exit 1
fi
xcode-select -p >/dev/null 2>&1 || { echo "Install Xcode 26 first." >&2; exit 1; }
command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh" >&2; exit 1; }

free_gb=$(df -g "$HOME" | awk 'NR == 2 {print $4}')
if [ "$free_gb" -lt 100 ]; then
  echo "Only ${free_gb} GB free; the build needs about 100 GB." >&2
  exit 1
fi

for formula in python@3.13 wget zstd coreutils readline; do
  brew list "$formula" >/dev/null 2>&1 || brew install "$formula"
done
python3 -m pip install --quiet --break-system-packages requests pillow
xcodebuild -downloadComponent MetalToolchain >/dev/null 2>&1 || true

if [ -d "$dir/.git" ]; then
  git -C "$dir" fetch origin "$branch"
  git -C "$dir" reset --keep "origin/$branch"
  git -C "$dir" submodule update --init --recursive
else
  git clone --branch "$branch" --recurse-submodules "$repo" "$dir"
fi
cd "$dir"

cores=$(sysctl -n hw.perflevel0.logicalcpu 2>/dev/null || sysctl -n hw.ncpu)
memory_gb=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
if [ "$mode" = full ]; then
  jobs=$(sysctl -n hw.ncpu)
  run=(caffeinate -i)
else
  jobs=$(( memory_gb / 3 ))
  [ "$jobs" -gt "$cores" ] && jobs=$cores
  [ "$jobs" -lt 2 ] && jobs=2
  run=(caffeinate -i taskpolicy -b)
fi
echo "Building with $jobs jobs ($mode)."

export _root_dir="$dir"
# shellcheck source=../devutils/shared.sh
source "$dir/devutils/shared.sh"

if [ ! -f "$_out_dir/args.gn" ]; then
  rm -rf "$_src_dir"
  prepare_sources true
  configure_build arm64 release
fi

(
  cd "$_src_dir"
  export SISO_PATH="$_siso_path"
  "${run[@]}" python3 "$_depot_tools_dir/autoninja.py" -C "$_out_dir" -j "$jobs" \
    chrome chromedriver chrome/installer/mac
  "$dir/sign_and_package_app.sh"
)

dmg=$(ls -t "$dir"/build/*.dmg | head -1)
echo
echo "Done: $dmg"
echo "Open it, drag Helium to Applications, then allow it once in"
echo "System Settings > Privacy & Security, since it isn't notarized."
