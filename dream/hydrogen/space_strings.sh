#!/bin/bash
# Runs space_strings.py on a Chromium tree; usable as a resume_patch entry.
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/space_strings.py" "$1"
