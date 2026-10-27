#!/bin/bash -eux

# Compile one slice of the objects a partial build tree still needs, into a
# fresh sccache directory that a later build phase merges into its own cache.

_shard="$1"
_shards="$2"

_root_dir="$(dirname "$(greadlink -f "$0")")"
source "$_root_dir/devutils/shared.sh"
epoch_job_start=$(cat "$_root_dir/epoch_job_start.txt")
# Leave time of the six-hour job limit to upload the cache.
_remaining_time=$(( 360*60 - 35*60 - $(date +%s) + epoch_job_start ))

_ninja="$_src_dir/third_party/ninja/ninja"
_targets="$_root_dir/shard_targets.txt"

cd "$_src_dir"

NINJA_STATUS='[%f/%t] ' "$_ninja" -C "$_out_dir" -n chrome chromedriver chrome/installer/mac \
    > "$_root_dir/shard_dry_run.txt"
python3 "$_root_dir/github_select_shard.py" "$_root_dir/shard_dry_run.txt" "$_shard" "$_shards" > "$_targets"
wc -l "$_targets"

export SCCACHE_DIR="$_root_dir/shard-cache"
export SCCACHE_CACHE_SIZE=20G
export SCCACHE_IDLE_TIMEOUT=0
export SCCACHE_IGNORE_SERVER_IO_ERROR=1
unset SCCACHE_GHA_ENABLED SCCACHE_GHA_VERSION
mkdir -p "$SCCACHE_DIR"
sccache --stop-server >/dev/null 2>&1 || true
sccache --start-server

_error_code=0
timeout -k 5m -s SIGTERM "${_remaining_time}s" \
    xargs "$_ninja" -C "$_out_dir" -k 0 < "$_targets" || _error_code=$?
echo "compile exit code: $_error_code"

sccache --show-stats
sccache --stop-server || true

tar -C "$SCCACHE_DIR" -cf "$_root_dir/shard-cache.tar" .
ls -l "$_root_dir/shard-cache.tar"
