# Hydrogen

Hydrogen is a fork of [Helium](https://github.com/imputnet/helium) with Arc-style spaces and Brave-style vertical tabs,
built for Apple Silicon. Hydrogen is element 1, one lighter than helium; its icon is hydrogen's visible spectrum, the
four Balmer lines at 410, 434, 486 and 656 nm. It installs as its own app (`Hydrogen.app`, bundle ID
`com.aryankeluskar.hydrogen`) with its own profile and keychain item, so it never collides with an installed Helium.

## What it changes

| Patch | What you get |
|---|---|
| `patches/dream/fast-vertical-tabs-hover-expand.patch` | The collapsed vertical tab strip opens over the page in 120 ms with a fast-start curve and closes in 100 ms, like Brave. Stock Chromium takes 250 ms on a slow-start curve. Expand on hover is on by default. |
| `patches/dream/tab-group-spaces-by-default.patch` | Chromium's Tab Groups Focusing is on: a focused tab group shows only its own tabs, so groups work as spaces. Freezing the other spaces' tabs is off, so chat apps and music keep running. |
| `patches/dream/scrollable-spaces.patch` | Two-finger horizontal scrolling on the sidebar moves between spaces like Arc. The tab list follows your fingers, the next space slides in beside it, and on release it settles on the nearer space (past 30% of the width or a quick flick). Reduce Motion falls back to an instant switch. |
| `dream/hydrogen/rebrand.sh` | Renames the browser to Hydrogen: name, bundle ID, profile folder, keychain item, every UI string (imput's Helium services keep their name), logos, the onboarding page and the Liquid Glass app icon. `dream/hydrogen/make_icons.py` generates every icon and logo from code. |
| `patches/dream/arc-spaces.patch` | Spaces look and work like Arc's: no group headers or chips, a header naming the current space (an emoji at the start of its name becomes its icon), a space bar at the foot of the sidebar with `+` for a new space, the sidebar's colour blending between spaces as you swipe, ARCUI's paging physics with haptic detents, new tabs staying in the current space, each space remembering its tab, and Ctrl+1…9. See `dream/arc-spaces.md`. |

Make a space with the `+` in the space bar at the foot of the sidebar; your existing tabs become the first space. Right-click a space's item, or click its header, to rename or recolour it; start the name with an emoji to give it an icon. Switch with two fingers on the sidebar, a click in the space bar, Ctrl+1…9, or Cmd+Ctrl+X and Cmd+Ctrl+Z.

## Getting a build

- **GitHub Actions:** run "Build macOS binaries of Helium" on this branch with `arches` set to `["arm64"]`. The first build takes about a day on the free runners; each later one starts from the last finished build's compile cache and recompiles only what changed. A cancelled run continues from its last saved phase with `resume_run` set to its run ID. To finish a long build sooner, write its run ID to `.github/shards/tree-run` and push: four runners compile the rest in parallel, then resume the build with `cache_run` set to the shard run's ID.
- **Any Apple Silicon Mac:** `curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/build-on-a-mac.sh | bash -s -- --full-speed` on an idle or rented Mac (about 3 to 4 hours on an M2 Pro). Use `--background` instead on a Mac you're using: it runs at background priority with fewer jobs and takes much longer.

The DMG (`hydrogen_*_arm64-macos.dmg`) isn't notarized. After dragging Hydrogen to Applications, allow it once in System Settings › Privacy & Security.
On first launch, agree to Helium services in onboarding: Chrome Web Store installs download through Helium's privacy proxy, which stays off until you do.

## Agents

Hydrogen.app ships `hydrogen`, a CLI, MCP server and JS REPL that let Claude Code drive your signed-in browser from outside it, with your approval each session. Setup is two commands; see `agent/README.md`.

## Staying safe

- **Chromium security fixes:** "Follow upstream Helium" merges imputnet/helium-macos into this branch every six hours and starts a build when anything new arrives. A merge that conflicts or can't be pushed, and any failed build, opens an issue in the fork ("Report failed builds"). GitHub only runs the schedule and the failure report when this branch is the fork's default branch.
- **No cookie theft through the debugging port:** like Chrome, `--remote-debugging-port` no longer opens on the profile you browse with (`patches/dream/block-debug-port-on-default-profile.patch`), so malware can't relaunch the browser to read your cookies. Agents connect through `chrome://inspect/#remote-debugging` instead, where you approve each connection.
- **From Helium:** uBlock Origin is built in as a component (always on, updated by Helium, with DNS uncloaking like Brave's), HTTPS-First mode is on, and nothing is sent to Google. Chrome Web Store extensions install natively.
- **Measured ad blocking** (a fresh profile on a GitHub Apple Silicon Mac, `.github/demo/deep-checks.sh` and `compare-brave.sh`): all 24 major ad and tracker networks tested are blocked or answered with uBlock Origin's harmless stub, normal CDNs, fonts and images still load, and ad slots are hidden. On d3ward's independent list of 131 hosts, Hydrogen blocks 93 and Brave's default Shields 80 to 91.
- **No auto-update:** each new build has to be installed by hand.
