# Helium, dream branch

Helium with Arc-style spaces and Brave-style vertical tabs, built for Apple Silicon.

## What it changes

| Patch | What you get |
|---|---|
| `patches/dream/fast-vertical-tabs-hover-expand.patch` | The collapsed vertical tab strip opens over the page in 120 ms with a fast-start curve and closes in 100 ms, like Brave. Stock Chromium takes 250 ms on a slow-start curve. Expand on hover is on by default. |
| `patches/dream/tab-group-spaces-by-default.patch` | Chromium's Tab Groups Focusing is on: a focused tab group shows only its own tabs, so groups work as spaces. Freezing the other spaces' tabs is off, so chat apps and music keep running. |
| `patches/dream/scrollable-spaces.patch` | Two-finger horizontal scrolling on the sidebar moves between spaces like Arc. The tab list follows your fingers, the next space slides in beside it, and on release it settles on the nearer space (past 30% of the width or a quick flick). Reduce Motion falls back to an instant switch. |
| `patches/dream/arc-spaces.patch` | Spaces look and work like Arc's: no group headers or chips, a header naming the current space (an emoji at the start of its name becomes its icon), a space bar at the foot of the sidebar with `+` for a new space, the sidebar's colour blending between spaces as you swipe, ARCUI's paging physics with haptic detents, new tabs staying in the current space, each space remembering its tab, and Ctrl+1…9. See `dream/arc-spaces.md`. |

Make a space with the `+` in the space bar at the foot of the sidebar; your existing tabs become the first space. Right-click a space's item, or click its header, to rename or recolour it; start the name with an emoji to give it an icon. Switch with two fingers on the sidebar, a click in the space bar, Ctrl+1…9, or Cmd+Ctrl+X and Cmd+Ctrl+Z.

## Getting a build

- **GitHub Actions:** run "Build macOS binaries of Helium" on this branch with `arches` set to `["arm64"]`. The first build takes about a day on the free runners; each later one starts from the last finished build's compile cache and recompiles only what changed. A cancelled run continues from its last saved phase with `resume_run` set to its run ID. To finish a long build sooner, write its run ID to `.github/shards/tree-run` and push: four runners compile the rest in parallel, then resume the build with `cache_run` set to the shard run's ID.
- **Any Apple Silicon Mac:** `curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/build-on-a-mac.sh | bash -s -- --full-speed` on an idle or rented Mac (about 3 to 4 hours on an M2 Pro). Use `--background` instead on a Mac you're using: it runs at background priority with fewer jobs and takes much longer.

The DMG isn't notarized. After dragging Helium to Applications, allow it once in System Settings › Privacy & Security.

## Staying safe

- **Chromium security fixes:** "Follow upstream Helium" merges imputnet/helium-macos into this branch every six hours and starts a build when anything new arrives. A merge that conflicts or can't be pushed, and any failed build, opens an issue in the fork ("Report failed builds"). GitHub only runs the schedule and the failure report when this branch is the fork's default branch.
- **From Helium itself:** uBlock Origin is built in as a component (always on, updated by Helium, with DNS uncloaking like Brave's), HTTPS-First mode is on, and nothing is sent to Google. Chrome Web Store extensions install natively.
- **No auto-update:** each new build has to be installed by hand.
