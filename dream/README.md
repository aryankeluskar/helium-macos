# Helium, dream branch

Helium with Arc-style spaces and Brave-style vertical tabs, built for Apple Silicon.

## What it changes

| Patch | What you get |
|---|---|
| `patches/dream/fast-vertical-tabs-hover-expand.patch` | The collapsed vertical tab strip opens over the page in 120 ms with a fast-start curve and closes in 100 ms, like Brave. Stock Chromium takes 250 ms on a slow-start curve. Expand on hover is on by default. |
| `patches/dream/tab-group-spaces-by-default.patch` | Chromium's Tab Groups Focusing is on: a focused tab group shows only its own tabs, so groups work as spaces. Freezing the other spaces' tabs is off, so chat apps and music keep running. |
| `patches/dream/scrollable-spaces.patch` | Two-finger horizontal scrolling on the sidebar moves between spaces like Arc. The tab list follows your fingers, the next space slides in beside it, and on release it settles on the nearer space (past 30% of the width or a quick flick). Reduce Motion falls back to an instant switch. |

Make a space with Cmd+Ctrl+P (new tab group), or right-click a tab and add it to a new group. Once you're in a space, Cmd+Ctrl+X and Cmd+Ctrl+Z step to the next and previous one.

## Getting a build

- **GitHub Actions:** run "Build macOS binaries of Helium" on this branch with `arches` set to `["arm64"]`. It takes about a day on the free runners. A cancelled run can continue from its last saved phase with `resume_run` set to its run ID.
- **Any Apple Silicon Mac:** `curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/build-on-a-mac.sh | bash -s -- --full-speed` on an idle or rented Mac (about 3 to 4 hours on an M2 Pro). Use `--background` instead on a Mac you're using: it runs at background priority with fewer jobs and takes much longer.

The DMG isn't notarized. After dragging Helium to Applications, allow it once in System Settings › Privacy & Security.

## Staying safe

- **Chromium security fixes:** "Follow upstream Helium" merges imputnet/helium-macos into this branch every six hours and starts a build when anything new arrives. GitHub only runs the schedule when this branch is the fork's default branch.
- **From Helium itself:** uBlock Origin is built in, HTTPS-First mode is on, and nothing is sent to Google.
- **No auto-update:** each new build has to be installed by hand.
