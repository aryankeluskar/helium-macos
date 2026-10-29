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
| `patches/dream/space-swipe-rests-under-the-fingers.patch` | Swipes let go like Arc's: resting your fingers mid-swipe keeps the space under them, and lifting after a pause settles on the nearer space instead of flicking on to the next one. |
| `patches/dream/spaces-reopen-on-the-current-space.patch` | Quitting and reopening brings you back to the space you were in. Chromium saved the current space only when it rewrote the whole session file, so a normal quit reopened on the plain grouped list. |
| `patches/dream/reopen-spaces-on-launch.patch` | Hydrogen reopens your spaces and tabs when you launch it, like Arc ("Continue where you left off" by default; Chromium and Helium open a new tab). Change it in Settings › On startup. |
| `patches/dream/spaces-accessible-space-bar.patch` | VoiceOver, Voice Control and Full Keyboard Access can use spaces: the space bar is a "Spaces" tab list of named spaces with a "New Space" button, and the header is a button that opens the space's editor. Idle dots get stronger with Increase Contrast, and the `+` and dots respond while pressed. |
| `patches/dream/spaces-in-the-menu-bar.patch` | New Space, Next Space and Previous Space in the Tabs menu, as Apple's guidelines ask for every command. The space editor says "space" instead of "group" (`dream/hydrogen/space_strings.py`). |
| `patches/dream/hydrogen-updates-from-github.patch` | Hydrogen updates itself from this fork's GitHub releases with Helium's Sparkle updater, and accepts only updates signed with the fork's key. See "Staying safe". |
| `patches/dream/global-privacy-control-on.patch` | Sends the Global Privacy Control signal (`Sec-GPC: 1` and `navigator.globalPrivacyControl`) by default, as Brave does; Helium has the setting but leaves it off. Turn it off in Settings › Privacy and security. |

Make a space with the `+` in the space bar at the foot of the sidebar; your existing tabs become the first space. Right-click a space's item, or click its header, to rename or recolour it; start the name with an emoji to give it an icon. Switch with two fingers on the sidebar, a click in the space bar, Ctrl+1…9, or Cmd+Ctrl+X and Cmd+Ctrl+Z.

## Getting a build

- **GitHub Actions:** run "Build macOS binaries of Helium" on this branch with `arches` set to `["arm64"]`. The first build takes about a day on the free runners; each later one starts from the last finished build's compile cache and recompiles only what changed. A cancelled run continues from its last saved phase with `resume_run` set to its run ID. To finish a long build sooner, write its run ID to `.github/shards/tree-run` and push: four runners compile the rest in parallel, then resume the build with `cache_run` set to the shard run's ID.
- **Any Apple Silicon Mac:** `curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/build-on-a-mac.sh | bash -s -- --full-speed` on an idle or rented Mac (about 3 to 4 hours on an M2 Pro). Use `--background` instead on a Mac you're using: it runs at background priority with fewer jobs and takes much longer.

- **Releases:** once updates are on (below), every published build is at https://github.com/aryankeluskar/helium-macos/releases; installed copies update to it by themselves.

The DMG (`hydrogen_*_arm64-macos.dmg`) isn't notarized. After dragging Hydrogen to Applications, allow it once in System Settings › Privacy & Security.
On first launch, agree to Helium services in onboarding: Chrome Web Store installs download through Helium's privacy proxy, which stays off until you do.

## Agents

Hydrogen.app ships `hydrogen`, a CLI, MCP server and JS REPL that let Claude Code drive your signed-in browser from outside it, with your approval each session. Setup is two commands; see `agent/README.md`.

## Staying safe

Measured on build `40812288983` against Brave 1.97 (Chromium 155) on a GitHub Apple Silicon Mac, both on fresh profiles with default settings (`.github/demo/safety-checks.sh`, the "Safety compared with Brave" table in `verify.md` on the `demo-videos` branch):

| Protection | Hydrogen | Brave |
|---|---|---|
| http:// upgraded to HTTPS | ✅ | ✅ |
| Tracking parameters stripped from links (fbclid, gclid, msclkid, mc_eid, utm_source) | ✅ 5 of 5 | ◐ 4 of 5 (keeps utm_source) |
| Global Privacy Control sent | ✅ (`global-privacy-control-on.patch`) | ✅ |
| WebRTC hides local IP addresses | ✅ | ✅ |
| Canvas fingerprint differs from site to site | ✅ | ✅ |
| Third-party cookies blocked | ✅ | ✅ |
| `--remote-debugging-port` stays shut on the default profile (how infostealers read cookies) | ✅ | ❌ opens |
| Google Safe Browsing warnings (Google's phishing and malware test pages) | ❌ not built in | ✅ |

The one gap is Safe Browsing: ungoogled Chromium removes it, since it means checking URLs with Google. Hydrogen blocks known-bad sites with uBlock Origin's lists instead (URLhaus malware, about 120,000 entries, and uBlock's badware list), which don't include Google's test pages. For phishing coverage too, tick "Phishing URL Blocklist" under uBlock Origin's dashboard › Filter lists › Malware protection, security.

- **Chromium security fixes:** "Follow upstream Helium" merges imputnet/helium-macos into this branch every six hours and starts a build when anything new arrives. A merge that conflicts or can't be pushed, and any failed build, opens an issue in the fork ("Report failed builds"). GitHub only runs the schedule and the failure report when this branch is the fork's default branch.
- **No cookie theft through the debugging port:** like Chrome, `--remote-debugging-port` no longer opens on the profile you browse with (`patches/dream/block-debug-port-on-default-profile.patch`), so malware can't relaunch the browser to read your cookies. Agents connect through `chrome://inspect/#remote-debugging` instead, where you approve each connection.
- **From Helium:** uBlock Origin is built in as a component (always on, updated by Helium, with DNS uncloaking like Brave's), HTTPS-First mode is on, and nothing is sent to Google. Chrome Web Store extensions install natively.
- **Measured ad blocking** (a fresh profile on a GitHub Apple Silicon Mac, `.github/demo/deep-checks.sh` and `compare-brave.sh`): all 24 major ad and tracker networks tested are blocked or answered with uBlock Origin's harmless stub, normal CDNs, fonts and images still load, and ad slots are hidden. On d3ward's independent list of 131 hosts, Hydrogen blocks 93 and Brave's default Shields 80 to 91.
- **Updates itself:** Hydrogen checks the fork's latest GitHub release (`releases/latest/download/appcast-arm64.xml`) at launch and every hour, downloads a newer one in the background and installs it when you relaunch (About Hydrogen shows Relaunch). Sparkle checks every download against the Ed25519 public key built into your copy before opening it, so only releases signed with the fork's key install. A build is published only after every check on a GitHub Mac passes, including one that installs an update end to end (`.github/demo/update-check.sh`; it passes on build `40812288983`: release 1 fetches the feed, verifies release 2's signature, offers Relaunch and installs it). How it works is in `dream/hydrogen/updates/`.
  - **Turning it on, once:** `curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/hydrogen/updates/turn-on-updates.sh | bash` with the GitHub CLI signed in. It stores a new signing key straight into the `HYDROGEN_UPDATE_KEY` Actions secret (never shown or saved), makes this branch the default so the six-hourly upstream sync runs, and publishes the first release. Install that release's DMG once; after that, updates arrive by themselves.
  - Updates need Helium services on (onboarding, or Settings › Privacy and security › Helium services › "Allow automatic browser updates"), which is Helium's own switch for its updater. They come from GitHub, not imput's servers.
