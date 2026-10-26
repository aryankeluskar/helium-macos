#!/bin/bash
set -exo pipefail

source dev.sh

export QUILT_PATCHES="$PWD/patches"
export QUILT_SERIES="series.merged"

_source_archive="$_root_dir/build/chromium-source.tar"
_files="${1:-}"

mkdir -p "$_src_dir"
if [ -f "$_source_archive" ]; then
    tar -xf "$_source_archive" -C "$_src_dir"
else
    fetch_sources
    python3 "$_main_repo/utils/prune_binaries.py" --keep-build-dependencies "$_src_dir" "$_main_repo/pruning.list"
    tar -cf "$_source_archive" --exclude=.git --exclude=./uc_staging -C "$_src_dir" .
fi

mkdir -p "$_out_dir"
write_gn_args "$_arch" dev

he resources
python3 "$_main_repo/utils/helium_version.py" \
    --tree "$_main_repo" --platform-tree "$_root_dir" --chromium-tree "$_src_dir"
he merge
he push
he configure

if [ -z "$_files" ]; then
    _files=$(sed -n 's|^+++ b/||p' "$_root_dir"/patches/dream/*.patch | grep -E '\.(cc|mm)$' | sort -u)
fi

_targets=()
for _file in $_files; do
    _targets+=("../../$_file^")
done

cd "$_src_dir"
export SISO_PATH="$_siso_path"
python3 "$_depot_tools_dir/autoninja.py" -C "$_out_dir" "${_targets[@]}"
sccache --show-stats || true
