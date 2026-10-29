#!/bin/bash
# Turns on Hydrogen's self-updates for the fork, once. Needs the GitHub CLI
# (gh) signed in as the fork's owner; nothing is built on this Mac.
#
#   1. Makes the update signing key and stores it only as the
#      HYDROGEN_UPDATE_KEY Actions secret: it's never shown or written to disk.
#   2. Makes claude/arc-spaces the fork's default branch, which GitHub needs
#      before it runs the six-hourly "Follow upstream Helium" schedule.
#   3. Publishes the latest verified build as the first release.
#
#   curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/hydrogen/updates/turn-on-updates.sh | bash
set -euo pipefail

repo=aryankeluskar/helium-macos
branch=claude/arc-spaces

if gh secret list --repo "$repo" | grep -qE '^HYDROGEN_UPDATE_KEY[[:space:]]'; then
  echo "HYDROGEN_UPDATE_KEY is already set. Keeping it, since installed copies trust only that key."
else
  head -c 32 /dev/urandom | base64 | gh secret set HYDROGEN_UPDATE_KEY --repo "$repo"
  echo "Stored a new update signing key as HYDROGEN_UPDATE_KEY."
fi
gh api --method PATCH "repos/$repo" -f default_branch="$branch" --jq '"Default branch: " + .default_branch'
gh workflow run release.yml --repo "$repo" --ref "$branch"
echo "Publishing the first release; it appears at https://github.com/$repo/releases in about ten minutes."
echo "Install its DMG once. After that, Hydrogen updates itself."
