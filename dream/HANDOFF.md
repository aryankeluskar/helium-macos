# Handoff: the dream browser

Written 2026-10-27 19:00 UTC by the cloud Claude Code session that built this branch, for whoever picks it up next
(the owner's local Claude Code). Repo: `aryankeluskar/helium-macos`, branch `claude/arc-spaces`.

The whole conversation is in `dream/transcript/2026-10-26-cloud-session.md` (about 1 MB; grep it rather than reading it
end to end).

## The goal, in the owner's words

> A browser whose UI and UX is like Arc, mainly the touchpad scroll to shift spaces, optimized for Apple Silicon (an
> M5 MacBook Pro), and vertical tabs. Full native Chrome extensions support. The best seamless ad blocker, like
> Brave's. Safety, since things are getting pwned left and right. Open source, to modify it to have Brave-like vertical
> tabs (see https://github.com/imputnet/helium/pull/1035 and the owner's comments there: Brave's sidebar expand is
> fast, Zen's ease-in/ease-out makes it slow, Zen shows no favicons when collapsed).

Later asks: spaces must be Arc's exact UI/UX (not Chromium's Tab Groups Focusing look); an agent-native control surface
so Claude Code can drive the browser (like Aside's CLI/MCP/REPL, no AI inside the browser); and the agent CLI shipped
inside the DMG.

## Rules the owner set

- **Never run builds or heavy jobs on the owner's Mac without asking.** A Chromium build pegs it for hours; the owner
  was very clear about this. Compile on GitHub Actions (free for this public repo) instead.
- **Commits are authored by the owner** (`Aryan Keluskar <80093392+aryankeluskar@users.noreply.github.com>`) with no
  `Co-Authored-By: Claude` or `Claude-Session` lines. History was rewritten once to remove them; don't add them back.
- Move fast; ask only when the answer changes what gets built.

## What the fork is

Helium (imputnet's ungoogled-Chromium browser, Chromium 156) plus the patches in `patches/dream/`, listed at the end of
`patches/series`:

| Patch | What it does | State |
|---|---|---|
| `fast-vertical-tabs-hover-expand.patch` | Collapsed sidebar opens in 120 ms ease-out, closes in 100 ms (Brave-fast); expand on hover by default | in every build |
| `tab-group-spaces-by-default.patch` | Tab Groups Focusing on, freezing off: a focused group is a "space" | in every build |
| `scrollable-spaces.patch` | Two-finger swipe on the sidebar moves the tab list with the fingers and settles on a space | in every build |
| `arc-spaces.patch` | Arc's spaces: no group header/chip/indent, space header (emoji icon + name), space bar at the sidebar's foot with `+`, ARCUI paging physics (half-speed tracking, rubber band, 5 pt/s flick, 0.25 s critically damped spring, haptic detents), colour blend between spaces, new tabs stay in the space, per-space last tab, Ctrl+1…9, wheel-mouse paging | in the DMG; seen working in the CI demo |
| `block-debug-port-on-default-profile.patch` | `--remote-debugging-port` never opens on the default profile (Chrome's anti-infostealer rule, which Chromium builds skip) | in the DMG |
| `space-swipe-stops-at-the-ends.patch` | Swipes without tracking stop at the first and last space instead of wrapping out of spaces | in the DMG (run `40615857553`) |
| `space-swipe-rests-under-the-fingers.patch` | Like ARCUI: only the last 100 ms of movement before the fingers lift counts as a flick, and resting the fingers mid-swipe keeps the space under them (the timer is a 3 s safety net, not 300 ms) | build `40721215586`; its checks pass |
| `space-swipe-velocity-uses-event-times.patch` | Swipe velocity uses the trackpad events' own time stamps, so a busy main thread can't turn a flick into a rest | build `40736992400` |
| `spaces-reopen-on-the-current-space.patch` | Saves the focused space on every change (Chromium wrote it only on session rebuilds), so a relaunch reopens on it | build `40736992400` |
| `reopen-spaces-on-launch.patch` | "Continue where you left off" by default, as Arc always reopens your spaces (Chromium's default is a new tab) | build `40736992400` |
| `hydrogen-updates-from-github.patch` | Sparkle's feed is the fork's `releases/latest/download/appcast-arm64.xml` instead of updates.helium.computer (see "Updates" below) | build `40793741179`; the update check passes |

`dream/arc-spaces.md` is the spaces checklist with ARCUI's measured numbers (from the owner's Ardia repo,
`docs/dia-spec.md` "Profile paging" and `packages/ardiacore/ios/SwipeModule.swift`). `dream/README.md` is the user
guide. Helium itself supplies the rest of the goal: uBlock Origin built in as a component (always on, with DNS
uncloaking), Chrome Web Store extensions, Brave's importer, an arm64 official build with ThinLTO and PGO.

`agent/` is the agent CLI (`helium`, `helium mcp`, `helium repl`), see `agent/README.md`. It talks to Chromium's
approval-mode DevTools server (`chrome://inspect/#remote-debugging`; the user clicks Allow once per session) through a
daemon on a 0600 Unix socket. 33 tests (`cd agent && npm test`) run against headless Chromium on Linux.
`sign_and_package_app.sh` bundles it into `Helium.app/Contents/Resources/helium-agent/` before signing.

## Hydrogen: the fork's name

The fork is branded **Hydrogen** (owner's ask: it isn't fully Helium, and it shouldn't be confused with an installed
Helium):
- **Identity:** `Hydrogen.app` with bundle ID `com.aryankeluskar.hydrogen`, its own profile folder
  (`~/Library/Application Support/com.aryankeluskar.hydrogen`) and keychain item ("Hydrogen Storage Key"), and DMGs
  named `hydrogen_*_arm64-macos.dmg`.
- **Brand:** the icon and every logo are the four Balmer lines of hydrogen's spectrum (410, 434, 486 and 656 nm) over a
  spectrum band, on paper by default and graphite in dark mode, with a layered Icon Composer icon for macOS 26.
  - The wordmark is set in Sora (OFL, vendored in `dream/hydrogen/fonts/`).
  - The design system, with tokens, the brand book and the assets, is at
    https://claude.ai/artifact/74Bcdb9uC9QUEfvAm8nrqm.
  - `dream/hydrogen/make_icons.py` regenerates every asset into `dream/hydrogen/resources/`.
- **How it's applied:** `dream/hydrogen/rebrand.sh <src>` runs after Helium's resources step in `prepare_sources` (and as
  `he hydrogen`).
  - It rewrites BRANDING, the keychain, profile and crash-product constants, every UI string (via Helium's
    substitution helpers, with translations re-keyed), the logos, onboarding, the WebUI glyph and `Assets.car` (compiled
    with Chromium's `compile_car.py` when actool exists).
  - It runs on resumed trees too: `resume_patch` entries ending in `.sh` run as scripts.
  - Strings about imput's servers keep "Helium services".
  - Internal identifiers (`helium://`, `helium.*` prefs, `helium::`) are unchanged.
  - Nothing in the `helium-chromium` submodule is edited.
- **Agent CLI:** now `hydrogen`. It reads `HYDROGEN_*` first and falls back to `HELIUM_*` and the old profile folder.

## Where the builds are right now

**Update 2026-10-29 06:35 UTC: the current DMG is run `40820087458`** (artifact `hydrogen_0.20.1.1_arm64-macos.dmg`):
`40812288983` plus `phishing-list-through-helium-services.patch`. On a GitHub Mac (orchestrator run `40827263201`) all
32 checks pass, including the five update checks, and uBlock Origin runs its phishing list (167,552 entries) next to
the malware (122,620), badware and URL-tracking lists. `ARC_RUN` points at it, so `turn-on-updates.sh` publishes it as
the first release.

**Update 2026-10-29 04:50 UTC: the DMG was run `40812288983`** (artifact `hydrogen_0.20.1.1_arm64-macos.dmg`):
`40793741179` plus `global-privacy-control-on.patch`. On a GitHub Mac (orchestrator run `40812345349`) all 32 checks
pass, including the five update checks, and the safety comparison with Brave matches the README's table (GPC now
sent). `ARC_RUN` in `plan.env` points at it, so `turn-on-updates.sh` publishes it as the first release.

**Update 2026-10-29 02:30 UTC: the DMG was run `40793741179`** (artifact `hydrogen_0.20.1.1_arm64-macos.dmg`):
`40781573927` with Helium's Sparkle updater built in and its feed on the fork's releases. On a GitHub Mac (orchestrator
run `40804887084`) all 32 checks pass, including five new update checks: a copy stamped as release 1 fetches the feed,
downloads release 2, Sparkle logs "OK: EdDSA signature is correct for update", About shows "Nearly up to date! Relaunch
Hydrogen to finish updating.", and the relaunch installs 0.20.1.1.2, validly signed. Its updater trusts only a
placeholder key, so it can't take real updates: install the first published release instead (see "Updates").

**Update 2026-10-29 00:05 UTC: the DMG was run `40781573927`** (artifact `hydrogen_0.20.1.1_arm64-macos.dmg`):
`40771149709` plus the design review's fixes (`dream/design-review.md`, made with the `apple-design` and
`make-interfaces-feel-better` skills in `.claude/skills/`): `spaces-accessible-space-bar.patch`,
`spaces-in-the-menu-bar.patch` and the space wording from `dream/hydrogen/space_strings.py`. On a GitHub Mac
(orchestrator run `40781699572`) all 15 spaces checks and every other check pass, including VoiceOver driving the space
bar and the Tabs menu's New, Next and Previous Space.

Before that, the DMG was run `40771149709` (artifact `hydrogen_0.20.1.1_arm64-macos.dmg`):
`40736992400` plus `space-swipe-flick-survives-coalesced-events.patch`. On a GitHub Mac (orchestrator run `40771190699`)
every check passes, including all 13 spaces checks: six quick flicks in a row page correctly, the resting checks hold,
and a relaunch restores the spaces. Next up is run `40781573927`, which adds the design review's fixes
(`dream/design-review.md`): the accessible space bar and header, spaces in the Tabs menu, and the space wording.

Before that, the DMG was run `40736992400` (artifact `hydrogen_0.20.1.1_arm64-macos.dmg`,
113 MB): Hydrogen plus the swipe release fixes, reopening your spaces at launch and on the space you left.
- **How it was built:** it resumed `40721215586` (which added `space-swipe-rests-under-the-fingers.patch` to
  `40697436072`) with `space-swipe-velocity-uses-event-times.patch`, `spaces-reopen-on-the-current-space.patch` and
  `reopen-spaces-on-launch.patch`.
- **Checked on a GitHub Apple Silicon Mac** (orchestrator run `40756361778`, `verify.md` on `demo-videos`): every
  build, ad-blocking and extension check, and all 13 spaces checks in `.github/demo/spaces-checks.mjs`, which drive a
  fresh profile with synthetic keys, clicks and trackpad scrolls and read the current space from a test extension:
  - Ctrl+1…9, space bar dots, `+`, renaming to "🏠 Home" from the right-click editor, Cmd+T joining the space, the
    last tab per space, and the sidebar listing only the current space's tabs;
  - swipes: one space at a time, stopping at the ends, a quick flick pages, a quarter drag then rest snaps back,
    resting mid-swipe keeps the space under the fingers;
  - quitting cleanly and relaunching brings back the spaces, their names and the current space.
- **Lessons from writing those checks:** synthetic modifier keys must be pressed and released as flagsChanged events
  or every later click arrives as a Ctrl+click; Chrome's hold-to-quit can't be driven synthetically (quit with
  DevTools' `Browser.close`); `session.restore_on_startup` is a protected pref, so it can't be set from outside; a new
  CGEvent has no time stamp, so macOS stamps the synthetic swipes when they're posted, and the flick check failed once
  in two runs on this build when the runner stalled the input tool before the lift.

Earlier, the Hydrogen DMG before those fixes was run `40697436072` (artifact
`hydrogen_0.20.1.1_arm64-macos.dmg`):
- **How it was built:** it resumed `40615857553`'s tree with `resume_patch=dream/hydrogen/rebrand.sh`, in 1 h 36 min.
- **What the checks confirmed** (on a GitHub Apple Silicon Mac, orchestrator run `40716033864`):
  - the menu bar reads Hydrogen, and the Dock shows the Balmer icon from the compiled `Assets.car`;
  - the bundle is Hydrogen / `com.aryankeluskar.hydrogen`;
  - the About page reads "About Hydrogen" with the new tile, and onboarding says "Meet Hydrogen" with the spectral glyph;
  - arm64, the agent CLI, uBlock Origin, 24/24 ad networks blocked, Web Store installs, and 93 vs Brave's 80–91 on
    d3ward's list.
- **The first attempt** (`40694258624`) failed only because the onboarding page's i18n generator rejects a `.grdp` that
  starts with an XML declaration; `rename_strings.py` now keeps files' original form.

Earlier, before the rename (run `40615857553`, artifact `helium_0.20.1.1_arm64-macos.dmg`):

- **What it is:** Arc spaces, the hardening patch, and `space-swipe-stops-at-the-ends.patch`. It was rebuilt incrementally
  from run `40590194934`'s finished tree in 52 min; that's the way to ship small spaces fixes.
- **Verified on a GitHub Apple Silicon Mac** (orchestrator run `40615908250`; `verify.md`, `spaces-demo.mp4` and
  `after.png` are on the `demo-videos` branch; the ready notice is a comment on commit `3c45847`):
  - every check passes: arm64 only, the agent CLI lists, opens and reads tabs, uBlock Origin runs built in, and ad
    and tracker requests are blocked;
  - the demo shows the space header, the dot bar with `+`, no group chips, and a two-finger swipe sliding the whole
    space with the fingers, the colour blending between spaces, and a spring settle;
  - it goes Work → Personal → Research, rubber-bands at the last space, and swipes back to Work without leaving spaces.
- **Deeper checks** (`.github/demo/deep-checks.sh`, orchestrator run `40623786400`; results in `verify.md`):
  - **Ad blocking:** 24 of 24 ad and tracker networks (Google ads and analytics, Amazon, AppNexus, Criteo, Taboola,
    Outbrain, Meta, Hotjar, TikTok, LinkedIn and others) are blocked or answered with uBlock Origin's stub. 5 of 5
    normal CDN, font and image requests load, and ad slots are hidden. A test extension
    (`.github/demo/request-observer`) reads each outcome from `chrome.webRequest`; fetch-based probes can't tell.
  - **Chrome Web Store:** Dark Reader installs from the Web Store and runs. `.github/demo/extensions-check.sh` (quick
    check run `40845414182` on build `40820087458`) installs eight through the store's button and the native dialog:
    Dark Reader, Bitwarden, 1Password, Vimium, React Developer Tools, Google Translate, SponsorBlock and Grammarly, all
    MV3. Each one's popup runs, Dark Reader darkens Wikipedia and Vimium shows link hints on f. Helium downloads extensions through its
    privacy proxy, which works only after the user agrees to Helium services in first-run onboarding (pref
    `helium.services.user_consented`).
  - **Vertical tabs:** collapsed, the strip shows favicons. Hover expands it over the page in about 3 frames (~100 ms)
    and it collapses within a frame.
- **The fixed bug:** on the no-tracking path (Reduce Motion, or no space focused yet), a swipe past the last space used
  to wrap out of spaces into the plain grouped list.
- **Chromium 156 builds as C++23 and has no `base/containers/contains.h`:** use `std::ranges::contains`, and check
  headers against a source tree before pushing.
- **GitHub's Macs have Reduce Motion on**, so the demo passes `--force-prefers-no-reduced-motion`.
- **The recording's last ~15 s lag behind the screen** on these VMs; `after.png`, taken after recording stops, is the
  real end state.
- **uBlock Origin needs a few seconds on a fresh profile** before it blocks, so `verify.sh` retries its probes. It also
  accepts uBlock Origin's harmless stub (it redirects `analytics.js` rather than blocking it).
- **Notices go on the head commit** of `claude/arc-spaces` as a comment, since issues are off on this fork.

A full Chromium build takes about a day on one free 3-core runner, so this one is split:

1. Run `40457940101` (build.yml, ninja) compiled phases 1–2, then was cancelled to free a runner. Its artifact
   `github_build_artifact_arm64` (the phase-2 build tree) is the base every resume uses.
2. Run `40540351808` ("Compile a partial build in parallel shards") has four runners compiling the rest into
   `sccache-shard-0..3` caches; due around 21:00–21:50 UTC.
3. Run `40565603171` is the compile check of `arc-spaces.patch` and the hardening patch, after fixing the three
   compile errors the previous check (`40553369007`) found.
4. "Finish the dream build" (`.github/workflows/orchestrate.yml`, on free Linux runners, started by pushing
   `.github/orchestrate/plan.env`; find its run with `gh run list --workflow orchestrate.yml`) waits for
   2 and 3, dispatches the safe build (resume of 1 with the shard caches) and, if 3 passed, the Arc build (same, plus
   `resume_patch` = both new patches), waits for a DMG (preferring Arc's), records the demo via `demo.yml`, and comments
   "Dream browser DMG ready" on the branch's head commit with the links, including `verify.md` from `.github/demo/verify.sh` (arm64,
   ad blocking, extensions and the agent CLI, checked on a GitHub Apple Silicon Mac). **Don't dispatch builds by hand
   while it runs.**

The DMG is an artifact of the build run (log in to GitHub to download). It isn't notarized: allow it once in System
Settings › Privacy & Security. The demo video lands on the `demo-videos` branch (`spaces-demo.mp4`).

Check state with:

```sh
gh run list --repo aryankeluskar/helium-macos --branch claude/arc-spaces --limit 15
gh run view <id> --repo aryankeluskar/helium-macos            # jobs and steps
gh run view <id> --repo aryankeluskar/helium-macos --log-failed | tail -200
```

## If something fails

- **Arc compile check fails with compiler errors:** fix `patches/dream/arc-spaces.patch` (see "Editing a patch"),
  push (the compile check runs on pushes touching `patches/dream/**`), then once it passes dispatch the Arc build:
  ```sh
  gh workflow run build.yml --repo aryankeluskar/helium-macos --ref claude/arc-spaces \
    -f arches='["arm64"]' -f resume_run=40457940101 -f build_tool=ninja -f cache_run=40540351808 \
    -f resume_patch="patches/dream/arc-spaces.patch patches/dream/block-debug-port-on-default-profile.patch"
  ```
  Later, iterate on spaces faster by resuming from the finished Arc build's run instead (`resume_run=<that run>`, with
  a patch holding only the new change): its tree and ThinLTO cache make it incremental.
- **A build phase dies before compiling (download reset, runner loss):** re-run the failed jobs once.
- **A long build:** each phase runs ~5 h then saves its tree; build.yml chains up to 10 phases. To finish sooner, write
  the run ID to `.github/shards/tree-run` and push: four runners compile the rest in parallel, then resume the run with
  `cache_run` = the shard run.

## Updates

Hydrogen updates itself with Helium's Sparkle 2 integration (`patches/helium/macos/updater/`), which the fork's builds
used to leave out for want of a signing key. The pieces are in `dream/hydrogen/updates/`:

- **Built in, key stamped later.** Every build compiles Sparkle with `placeholder-public-key`, a key whose private half
  was never kept (`devutils/shared.sh` for fresh builds, `enable-sparkle.sh` as a `resume_patch` for resumed ones).
  `stamp-dmg.sh` copies a DMG with the real `SUPublicEDKey` and a release number appended to `CFBundleVersion`
  (Helium's version, so `0.20.1.1.N`), re-signs the app ad hoc and keeps the Finder layout. So a key added after a
  build still works with that build, and Hydrogen-only releases count as newer.
- **Signing.** `HYDROGEN_UPDATE_KEY` (an Actions secret, the base64 of a 32-byte Ed25519 seed) signs each DMG
  (`appcast.py`); the appcast's `sparkle:edSignature` is checked against the stamped key before extraction
  (`SUVerifyUpdateBeforeExtraction`).
- **Publishing.** `release.yml` (`publish.sh`) stamps, signs and creates the GitHub release `hydrogen-<version>-rN`
  with the DMG and `appcast-arm64.xml`, marked latest. It runs after an orchestrated build whose checks all pass (set
  `PUBLISH=0` in `plan.env` to skip) and after upstream-sync builds (`build.yml` with `publish: true` runs `demo.yml`
  then `release.yml`). Without the secret it prints a notice and publishes nothing.
- **Checked on a Mac.** `.github/demo/update-check.sh` (in every demo; alone via `quick-check.yml`, triggered by
  pushing "<build run> update-check.sh" to `.github/diagnostics/quick-check`) stamps the build as releases 1 and 2 with a
  throwaway key, serves release 2's appcast from the runner through `--custom-update-server-url`, and follows it to
  the installed, relaunched release 2.
- **Owner's one-time setup** (the session's GitHub token can't write secrets or repo settings):
  `curl -fsSL https://raw.githubusercontent.com/aryankeluskar/helium-macos/claude/arc-spaces/dream/hydrogen/updates/turn-on-updates.sh | bash`
  makes the key straight into the secret (never shown or saved), sets `claude/arc-spaces` as the default branch (so
  the six-hourly upstream sync runs) and dispatches `release.yml`, which publishes `ARC_RUN`. Then install that
  release's DMG once.
- Updates need Helium services consented (onboarding), Helium's own gate for its updater
  (`helium::ShouldAccessUpdateService`). Before the first release, the feed answers 404, which Sparkle logs and ignores.

## Safety compared with Brave

`.github/demo/safety-checks.sh` (in every demo, after the failed-check count since it compares rather than gates)
runs Hydrogen and Brave on fresh profiles and tabulates HTTPS upgrades, tracking parameters, Global Privacy Control,
WebRTC local IPs, per-site canvas fingerprints, Google's Safe Browsing test pages (retried for two minutes, since
Brave's list downloads after launch), the debugging port on the default profile, and uBlock Origin's malware,
phishing and tracking lists. On build `40807405351` Hydrogen matched or beat Brave on everything but Safe Browsing,
which ungoogled Chromium removes (see the README's table). `global-privacy-control-on.patch` closed the GPC gap.
A bundled `assets.json` default for the phishing list didn't work: with Helium services on, uBlock bootstraps its
asset registry from Helium's server, and uBlock picks its lists on first launch, before onboarding turns services on.
`phishing-list-through-helium-services.patch` (uBlock's `storage.js`) instead adds `curben-phishing` once, the first
time `assetsBootstrapLocation` is set (Helium reloads uBlock when services change), records `hydrogenAddedPhishingList`
so unticking it sticks, and invalidates the selfie so it compiles on that launch. Without services nothing changes.

**Owner's decision (2026-10-29): no Google Safe Browsing.** Asked directly, the owner chose uBlock Origin's lists
(phishing, malware, badware) over bringing back Safe Browsing, which would check visited URLs with Google. Don't
reopen this unless they ask.

## Ads on real pages compared with Brave

`.github/demo/real-sites.sh` (with `real-sites.mjs`, in every demo after the safety comparison) loads twelve ad-heavy
pages in each browser on a fresh profile, once its blocker stops a probe request, and follows every request over the
DevTools protocol, auto-attaching to out-of-process frames. On build `40820087458` (quick-check run `40830506936`):
ad and tracker requests answered, Hydrogen 12 of 84 and Brave 43 of 126; 62 MB against 66 MB; Hydrogen's load event
came sooner on 11 of 12 pages (one tie). macOS runners have no `timeout` command, so the script keeps its own deadline.

## Speed compared with Chrome and Brave

`.github/demo/speedometer.sh` (quick check only, about 25 minutes) runs Speedometer 3.1 in Hydrogen, Brave and Chrome,
three rounds interleaved, each on a fresh profile with its window in front (Hydrogen's marked as onboarded, or its
setup page takes the front tab and Speedometer runs throttled in the background). On build `40820087458`
(quick-check run `40834488088`): medians Hydrogen 22.5, Chrome 22.1, Brave 16.7. macOS ships bash 3.2, so no
associative arrays in the demo scripts.

## Protected media (Widevine)

Spotify's web player failed with "No such device": Hydrogen had no Widevine CDM. Helium's component proxy
(`services.helium.imput.net/com`, imputnet/helium-services `svc/extension-proxy/lib/helpers.ts`) allows only CRLSet
and drops Widevine from every answer, and it sends Google a Windows x64 request anyway; official Helium 0.20.2.1 fails
the same way. imput announced DRM support on 2026-10-26. Until it lands, `dream/hydrogen/widevine/install-widevine.sh`
fetches the Mac arm64 package from Google's update server, verifies its SHA-256 and unpacks the CRX into
`<profile>/WidevineCdm/<version>`, which the component installer registers at launch. `.github/demo/widevine-check.sh`
(quick check only, about 2 minutes, since it depends on Google, jsDelivr and Shaka's license server) passes on build
`40820087458` (run `40844757225`): installed, key session opened, Shaka's Widevine stream played 4.4 s. Builds are
signed ad hoc without the hardened runtime, so macOS doesn't enforce library validation and Google's CDM loads; a
build signed with a certificate and the hardened runtime needs Chromium's plugin helper entitlements
(`disable-library-validation`) for the same.

## CI facts that cost hours to learn

- Free plan: **5 concurrent macOS jobs**. Every push starts "Sanity check" (2 macOS jobs): cancel it
  (`gh run cancel <id>`) or use `[skip ci]` in commits that don't need CI.
- Build with **ninja**, not siso: siso re-schedules every step after a timeout; ninja resumes exactly. Each finished
  build uploads `compile_cache_arm64` and the next fresh build starts from it.
- A workflow that exists only on this branch can't be dispatched (GitHub requires it on the default branch); give it a
  push trigger on a small file instead (`.github/shards/tree-run`, `.github/orchestrate/plan.env`,
  `.github/diagnostics/run-id`). `build.yml` and `demo.yml`'s `workflow_call` work.
- `GITHUB_TOKEN` pushes don't start workflows, but `gh workflow run` with it does.
- Schedules (`upstream-sync.yml` every 6 h, merging Helium's security releases and rebuilding) and `workflow_run`
  (`build-failure-issue.yml`) only fire from the default branch: **set `claude/arc-spaces` as the fork's default branch**
  (`turn-on-updates.sh` does it) for security updates to flow automatically.
- The compile check (`compile-check.sh`) must run `he hydrogen` like `prepare_sources` does, or files using
  `space_strings.py`'s strings (`IDS_NEW_SPACE_MAC` in `main_menu_builder.mm`) fail there while real builds pass.
- `job-errors.yml` prints the error lines of any job's log (push its ID to `.github/diagnostics/job-errors`), for
  logs too long to read through the API.
- A reusable workflow sees its caller's `github.run_number`, so release numbers come from the existing release tags,
  not the run number.
- The compile check skips test sources: Helium's source tarball has no `chrome/test/data`.

## Editing a patch

There's no Chromium tree in the repo. The cloud session used a scratch git tree; locally, a source checkout needs
about 15 GB and downloads ~2 GB but compiles nothing:

```sh
source dev.sh
he presetup                     # download and unpack Helium's Chromium source into build/src
he merge && he push             # merge Helium's and this repo's series, apply all with quilt
export QUILT_PATCHES="$PWD/patches" QUILT_SERIES=series.merged
cd build/src
quilt pop dream/arc-spaces.patch   # make the patch you're editing the top one
quilt edit <file>                  # or edit files it already touches directly
quilt refresh && quilt push -a
cd - && he unmerge                 # restore patches/series
```

Patches are plain `--- a/` / `+++ b/` diffs relative to `build/src`. Compile changes on CI (push → compile check), not
locally, unless the owner says otherwise. `dream/build-on-a-mac.sh --background` exists for a local build at background
priority, only with the owner's OK.

## Next, in order

1. Owner runs `turn-on-updates.sh` (see "Updates") and installs the first release's DMG from
   https://github.com/aryankeluskar/helium-macos/releases; from then on Hydrogen updates itself.
2. Owner checks on the real M5 trackpad:
   - swipe feel, rubber band, haptics, colour blend;
   - space header and space bar (`+`, right-click editor, emoji icons);
   - Ctrl+1…9;
   - that new tabs stay in the space;
   - that the hidden group header leaves no gap.

   Fix what's off, measured against Arc/Dia captures with numbers (the owner's Ardia repo has the method and measured
   values).
3. Agent CLI on the real browser: approval dialog flow, agent window placement next to the spaces sidebar,
   screenshots of a background window (`agent/README.md`, "Only a real macOS Helium can confirm").
4. Spaces backlog (`dream/arc-spaces.md`):
   - drop a tab on a space bar item;
   - Arc-size favourites tiles;
   - per-space pinned tabs with a "Clear" divider and Today tabs;
   - per-space profiles.
5. Agent-native phase 2 in the browser:
   - a native agent space ("🤖 Claude") that agent tabs live in;
   - an "agent is driving" indicator;
   - pairing instead of the per-session prompt (Keychain token, revocable, scoped to the agent space and a site list,
     with an audit log).
6. When the upstream sync brings Helium's DRM support, run `widevine-check.sh` on that build: if a fresh profile gets
   Widevine by itself, retire `install-widevine.sh` from the README.
7. If the owner hasn't run the setup, the default branch is still unset, so security updates don't rebuild by
   themselves; run "Follow upstream Helium" by hand meanwhile (or dispatch `build.yml` with `publish: true`).
