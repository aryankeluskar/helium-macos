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

**Update 2026-10-28 02:35 UTC: the current DMG is run `40615857553`** (artifact `helium_0.20.1.1_arm64-macos.dmg`):

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
  - **Chrome Web Store:** Dark Reader installs from the Web Store and runs. Helium downloads extensions through its
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
  (owner's click in repo settings) for security updates to flow automatically.
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

1. Owner installs the DMG from run `40615857553`; check on the real M5 trackpad:
   - swipe feel, rubber band, haptics, colour blend;
   - space header and space bar (`+`, right-click editor, emoji icons);
   - Ctrl+1…9;
   - that new tabs stay in the space;
   - that the hidden group header leaves no gap.

   Fix what's off, measured against Arc/Dia captures with numbers (the owner's Ardia repo has the method and measured
   values).
2. Agent CLI on the real browser: approval dialog flow, agent window placement next to the spaces sidebar,
   screenshots of a background window (`agent/README.md`, "Only a real macOS Helium can confirm").
3. Spaces backlog (`dream/arc-spaces.md`):
   - drop a tab on a space bar item;
   - Arc-size favourites tiles;
   - per-space pinned tabs with a "Clear" divider and Today tabs;
   - per-space profiles.
4. Agent-native phase 2 in the browser:
   - a native agent space ("🤖 Claude") that agent tabs live in;
   - an "agent is driving" indicator;
   - pairing instead of the per-session prompt (Keychain token, revocable, scoped to the agent space and a site list,
     with an audit log).
5. Set the default branch (above) so security updates rebuild by themselves.
