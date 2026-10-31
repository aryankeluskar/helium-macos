# Build verification on a GitHub Apple Silicon Mac

Hydrogen 0.20.3.1, macOS 26.6.2, Apple M1 (Virtual)

- ✅ Native Apple Silicon: the browser framework is `arm64` only
- ✅ The agent CLI ships inside the app and lists tabs
- ✅ The agent CLI opens and reads a page
- ✅ uBlock Origin runs as a built-in extension
  - Extension pages running: uBlock Origin
- ✅ The app is Hydrogen, separate from Helium (Hydrogen, com.aryankeluskar.hydrogen)
- ✅ The About page says Hydrogen (`about.png`)
- ✅ Onboarding welcomes you to Hydrogen (`onboarding.png`)

Extension APIs are also exercised by the demo itself: it loads an unpacked extension that makes the spaces.

## Vertical tabs

- ℹ️ The strip area changed in 0 frames at 30 fps across one hover in and out (`hover-motion.txt`, `hover-expand.mp4`); Brave-fast is about 4 frames in and 3 out
- ℹ️ Collapsed with favicons: `tabs-collapsed.png`; expanded on hover: `tabs-hover-expanded.png`

## Ad blocking across networks

Each URL is loaded on example.com the way a page loads it (script, stylesheet or image); a test extension reads what Chrome did with the request from `chrome.webRequest`.

- ✅ 24 of 24 ad and tracker requests are blocked, or answered with uBlock Origin's harmless stub
- ✅ 5 of 5 normal requests (CDNs, fonts, images) load, so blocking doesn't break sites
- ✅ Ad slots added to a page are hidden (cosmetic filtering: none,none)

<details><summary>Each request</summary>

| Host | What Chrome did |
|---|---|
| `pagead2.googlesyndication.com` | stubbed |
| `securepubads.g.doubleclick.net` | stubbed |
| `www.googletagservices.com` | stubbed |
| `static.doubleclick.net` | stubbed |
| `c.amazon-adsystem.com` | stubbed |
| `acdn.adnxs.com` | stubbed |
| `static.criteo.net` | blocked |
| `cdn.taboola.com` | blocked |
| `widgets.outbrain.com` | stubbed |
| `ads.pubmatic.com` | blocked |
| `js.adsrvr.org` | blocked |
| `z.moatads.com` | blocked |
| `www.google-analytics.com` | stubbed |
| `www.googletagmanager.com` | stubbed |
| `connect.facebook.net` | blocked |
| `static.hotjar.com` | blocked |
| `sb.scorecardresearch.com` | stubbed |
| `bat.bing.com` | blocked |
| `www.clarity.ms` | blocked |
| `cdn.mxpnl.com` | blocked |
| `analytics.tiktok.com` | blocked |
| `snap.licdn.com` | blocked |
| `secure.quantserve.com` | blocked |
| `cdn.segment.com` | blocked |
| `cdnjs.cloudflare.com` (normal) | loaded (200) |
| `unpkg.com` (normal) | loaded (200) |
| `fonts.googleapis.com` (normal) | loaded (200) |
| `upload.wikimedia.org` (normal) | loaded (200) |
| `www.gstatic.com` (normal) | loaded (200) |

</details>

## Chrome Web Store

Hydrogen downloads Web Store extensions through Helium's privacy proxy, so Google doesn't see them; the proxy works once you agree to Helium services in onboarding, as this profile has.

- ✅ Dark Reader installs from the Chrome Web Store (`web-store-dialog.png`, `web-store-installed.png`)
- ✅ The installed extension runs (its pages or service worker: true)

### Spaces, driven with synthetic keyboard, mouse and trackpad input

Window 1024×677 pt, the page area wasn't found, so the sidebar is assumed 200 pt wide; test spaces: Work, Personal, Research.

- ✅ Ctrl+1…9 jumps to space N (Ctrl+2, Ctrl+3, Ctrl+1), and Ctrl+9 with three spaces does nothing
  - landed on spaces 2, 3, 1, 1 (expected 2, 3, 1, 1)
- ✅ Audio keeps playing in a space you leave, as music in a Spotify tab should
  - after 12 s in space 2, the left space's audio clock went from 3 s to 16.7 s and its timer from 15 to 70 ticks; audible true, frozen false, discarded false
- ✅ The sidebar lists only the current space's tabs (`spaces-current-only.png`)
  - Work's tabs listed: Hacker News, Lobsters; other spaces' tabs listed: none
- ✅ A click on a tab in the sidebar selects it (a control for the synthetic clicks)
  - clicked the row at 6,127,188,30: space 1 of 3 (Work), tab https://news.ycombinator.com/
- ✅ Clicking a dot in the space bar switches to that space (`space-bar.png`)
  - clicks at 112,684 100,684 88,684 on dots 3, 2, 1 landed on spaces 3, 2, 1; window 0 31 1024 677 before, 0 31 1024 677 after
- ✅ Each space reopens on the tab you left it on
  - back in Work: https://lobste.rs/
- ✅ Cmd+T opens the new tab in the current space, and closing it stays in that space
  - new tab in space 2 (11 tabs); after closing it: space 2 of 3 (Personal), tab https://www.wikipedia.org/
- ✅ Two-finger swipes move one space at a time and stop at the first and last space
  - from space 1, three swipes left then three right: 2, 3, 3, 2, 1, 1 (expected 2, 3, 3, 2, 1, 1)
- ✅ A quick short flick pages, like Arc (three times each way)
  - 100 pt flicks with momentum, left and right three times, landed on spaces 2, 1, 2, 1, 2, 1 (expected 2, 1, 2, 1, 2, 1); 0.4 s after each lift: 2, 1, 2, 1, 2, 1; event stamps in nanoseconds (nanoseconds reads as 739.126 s at uptime 739.126 s; mach ticks reads as 17.739 s at uptime 739.128 s)
- ✅ Dragging a quarter of the way, resting, then lifting snaps back to the same space
  - after a 100 pt drag held still for 0.2 s before lifting: space 1 (expected 1)
- ✅ Resting the fingers mid-swipe keeps the space under them until they lift
  - 0.9 s into resting at 65% of the way: space 1 (expected 1); after lifting: space 2 (expected 2, the nearer one) (`swipe-resting.png`)
- ✅ `+` in the space bar makes a new space and switches to it (`space-bar-new.png`)
  - 4 spaces; current: space 4 of 4 (), tab chrome://newtab/
- ✅ Right-clicking a dot opens the space editor; a name that starts with an emoji becomes its icon (`space-icon.png`)
  - the first space is now named "🏠 Home"; windows while editing: 2; the editor's field after typing: AXTextField [92,369 208x36] Space name | Space name | 🏠 Home
- ✅ VoiceOver can use the space bar: a "Spaces" tab list of named spaces with the current one selected, a "New Space" button, and a header button; pressing a space switches to it (`spaces-ax.txt`)
  - tab list found: true; spaces read as Home, Personal, Research, Space; selected: 1; "New Space" button: true; header button "Home": true; pressing "Research" through accessibility landed on space 3
- ✅ The Tabs menu has New Space, Next Space and Previous Space, and they work
  - from space 3 of 4: Next Space: space 4 of 4; Previous Space: space 3 of 4; New Space: space 5 of 5
- ✅ Spaces, their names and the current space come back after quitting and reopening (`spaces-relaunch.png`)
  - quit with a clean quit; Session_13437903161519836: selected-tab writes 10, 7, 11, 7, focused-space writes 45; before: 🏠 Home, Personal, Research, ,  on space 3, 12 tabs, https://arxiv.org/; after: 🏠 Home, Personal, Research, ,  on space 3, 12 tabs, https://arxiv.org/; other spaces' tabs listed after relaunch: none

16 of 16 spaces checks passed. Trackpad feel and haptics still need a real trackpad.

## Updates

- ✅ On launch Hydrogen checks its update feed, the fork's latest release (here served from this runner, `update-feed.log`)
- ✅ It finds release 2 newer than its own release 1 (0.20.3.1.2 over 0.20.3.1.1) and downloads it
- ✅ Its signature checks out and the About page offers to relaunch (`update-about.png`)
- ✅ Relaunching installs it: the app on disk is now 0.20.3.1.2, validly signed
- ✅ and Hydrogen reopens on the new release

## Compared with Brave

d3ward's [ad block test](https://d3ward.github.io/toolz/adblock) hosts, requested from example.com in each browser with a fresh profile and default settings; Brave 155.1.97.56 with standard Shields. A host counts as blocked when the browser refused the request (seen by the request-observer extension, or, for Brave's Shields, which act before extensions, by the page's request failing) or answered it with a stub.

| Category | Hosts | Hydrogen blocked | Brave blocked |
|---|---|---|---|
| Ads | 20 | 18 | 10 |
| Analytics | 30 | 30 | 29 |
| Error Trackers | 6 | 6 | 6 |
| Social Trackers | 20 | 15 | 11 |
| Mix | 20 | 7 | 7 |
| OEMs | 35 | 17 | 17 |
| **All** | 131 | **93** | **80** |

<details><summary>Each host</summary>

| Category | Host | Hydrogen | Brave |
|---|---|---|---|
| Ads | `adtago.s3.amazonaws.com` | blocked | blocked before extensions |
| Ads | `analyticsengine.s3.amazonaws.com` | loaded (403) | loaded (403) |
| Ads | `analytics.s3.amazonaws.com` | loaded (403) | loaded (403) |
| Ads | `advice-ads.s3.amazonaws.com` | stubbed | answered |
| Ads | `pagead2.googlesyndication.com` | stubbed | answered |
| Ads | `adservice.google.com` | blocked | blocked before extensions |
| Ads | `pagead2.googleadservices.com` | blocked | blocked before extensions |
| Ads | `afs.googlesyndication.com` | blocked | loaded (404) |
| Ads | `stats.g.doubleclick.net` | stubbed | answered |
| Ads | `ad.doubleclick.net` | stubbed | answered |
| Ads | `static.doubleclick.net` | stubbed | answered |
| Ads | `m.doubleclick.net` | stubbed | answered |
| Ads | `mediavisor.doubleclick.net` | stubbed | answered |
| Ads | `ads30.adcolony.com` | blocked | blocked before extensions |
| Ads | `adc3-launch.adcolony.com` | blocked | blocked before extensions |
| Ads | `events3alt.adcolony.com` | blocked | blocked before extensions |
| Ads | `wd.adcolony.com` | blocked | blocked before extensions |
| Ads | `static.media.net` | blocked | blocked before extensions |
| Ads | `media.net` | blocked | blocked before extensions |
| Ads | `adservetx.media.net` | blocked | blocked before extensions |
| Analytics | `analytics.google.com` | blocked | blocked before extensions |
| Analytics | `click.googleanalytics.com` | blocked | loaded (404) |
| Analytics | `google-analytics.com` | blocked | blocked before extensions |
| Analytics | `ssl.google-analytics.com` | blocked | blocked before extensions |
| Analytics | `adm.hotjar.com` | blocked | blocked before extensions |
| Analytics | `identify.hotjar.com` | blocked | blocked before extensions |
| Analytics | `insights.hotjar.com` | blocked | blocked before extensions |
| Analytics | `script.hotjar.com` | blocked | blocked before extensions |
| Analytics | `surveys.hotjar.com` | blocked | blocked before extensions |
| Analytics | `careers.hotjar.com` | blocked | blocked before extensions |
| Analytics | `events.hotjar.io` | blocked | blocked before extensions |
| Analytics | `mouseflow.com` | blocked | blocked before extensions |
| Analytics | `cdn.mouseflow.com` | blocked | blocked before extensions |
| Analytics | `o2.mouseflow.com` | blocked | blocked before extensions |
| Analytics | `gtm.mouseflow.com` | blocked | blocked before extensions |
| Analytics | `api.mouseflow.com` | blocked | blocked before extensions |
| Analytics | `tools.mouseflow.com` | blocked | blocked before extensions |
| Analytics | `cdn-test.mouseflow.com` | blocked | blocked before extensions |
| Analytics | `freshmarketer.com` | blocked | blocked before extensions |
| Analytics | `claritybt.freshmarketer.com` | blocked | blocked before extensions |
| Analytics | `fwtracks.freshmarketer.com` | blocked | blocked before extensions |
| Analytics | `luckyorange.com` | blocked | blocked before extensions |
| Analytics | `api.luckyorange.com` | blocked | blocked before extensions |
| Analytics | `realtime.luckyorange.com` | blocked | blocked before extensions |
| Analytics | `cdn.luckyorange.com` | blocked | blocked before extensions |
| Analytics | `w1.luckyorange.com` | blocked | blocked before extensions |
| Analytics | `upload.luckyorange.net` | blocked | blocked before extensions |
| Analytics | `cs.luckyorange.net` | blocked | blocked before extensions |
| Analytics | `settings.luckyorange.net` | blocked | blocked before extensions |
| Analytics | `stats.wp.com` | blocked | blocked before extensions |
| Error Trackers | `notify.bugsnag.com` | blocked | blocked before extensions |
| Error Trackers | `sessions.bugsnag.com` | blocked | blocked before extensions |
| Error Trackers | `api.bugsnag.com` | blocked | blocked before extensions |
| Error Trackers | `app.bugsnag.com` | blocked | blocked before extensions |
| Error Trackers | `browser.sentry-cdn.com` | blocked | blocked before extensions |
| Error Trackers | `app.getsentry.com` | blocked | blocked before extensions |
| Social Trackers | `pixel.facebook.com` | blocked | blocked before extensions |
| Social Trackers | `an.facebook.com` | loaded (404) | loaded (404) |
| Social Trackers | `static.ads-twitter.com` | blocked | blocked before extensions |
| Social Trackers | `ads-api.twitter.com` | stubbed | answered |
| Social Trackers | `ads.linkedin.com` | blocked | blocked before extensions |
| Social Trackers | `analytics.pointdrive.linkedin.com` | blocked | blocked before extensions |
| Social Trackers | `ads.pinterest.com` | stubbed | answered |
| Social Trackers | `log.pinterest.com` | blocked | blocked before extensions |
| Social Trackers | `analytics.pinterest.com` | blocked | blocked before extensions |
| Social Trackers | `trk.pinterest.com` | blocked | blocked before extensions |
| Social Trackers | `events.reddit.com` | blocked | blocked before extensions |
| Social Trackers | `events.redditmedia.com` | blocked | blocked before extensions |
| Social Trackers | `ads.youtube.com` | stubbed | answered |
| Social Trackers | `ads-api.tiktok.com` | loaded (404) | loaded (404) |
| Social Trackers | `analytics.tiktok.com` | blocked | blocked before extensions |
| Social Trackers | `ads-sg.tiktok.com` | answered | answered |
| Social Trackers | `analytics-sg.tiktok.com` | blocked | blocked before extensions |
| Social Trackers | `business-api.tiktok.com` | answered | answered |
| Social Trackers | `ads.tiktok.com` | stubbed | answered |
| Social Trackers | `log.byteoversea.com` | loaded (404) | loaded (404) |
| Mix | `ads.yahoo.com` | blocked | blocked before extensions |
| Mix | `analytics.yahoo.com` | blocked | blocked before extensions |
| Mix | `geo.yahoo.com` | blocked | blocked before extensions |
| Mix | `udc.yahoo.com` | blocked | blocked before extensions |
| Mix | `udcm.yahoo.com` | loaded (403) | loaded (403) |
| Mix | `analytics.query.yahoo.com` | loaded (403) | loaded (403) |
| Mix | `partnerads.ysm.yahoo.com` | blocked | answered |
| Mix | `log.fc.yahoo.com` | loaded (404) | loaded (404) |
| Mix | `gemini.yahoo.com` | answered | answered |
| Mix | `adtech.yahooinc.com` | answered | answered |
| Mix | `extmaps-api.yandex.net` | blocked | blocked before extensions |
| Mix | `appmetrica.yandex.ru` | answered | answered |
| Mix | `adfstat.yandex.ru` | loaded (200) | loaded (200) |
| Mix | `metrika.yandex.ru` | answered | answered |
| Mix | `offerwall.yandex.net` | no answer | blocked before extensions |
| Mix | `adfox.yandex.ru` | blocked | blocked before extensions |
| Mix | `auction.unityads.unity3d.com` | loaded (404) | loaded (404) |
| Mix | `webview.unityads.unity3d.com` | loaded (403) | loaded (403) |
| Mix | `config.unityads.unity3d.com` | loaded (404) | loaded (404) |
| Mix | `adserver.unityads.unity3d.com` | loaded (404) | loaded (404) |
| OEMs | `iot-eu-logser.realme.com` | loaded (403) | loaded (403) |
| OEMs | `iot-logser.realme.com` | loaded (403) | loaded (403) |
| OEMs | `bdapi-ads.realmemobile.com` | loaded (404) | loaded (404) |
| OEMs | `bdapi-in-ads.realmemobile.com` | loaded (404) | loaded (404) |
| OEMs | `api.ad.xiaomi.com` | blocked | blocked before extensions |
| OEMs | `data.mistat.xiaomi.com` | loaded (404) | loaded (404) |
| OEMs | `data.mistat.india.xiaomi.com` | loaded (404) | loaded (404) |
| OEMs | `data.mistat.rus.xiaomi.com` | loaded (404) | loaded (404) |
| OEMs | `sdkconfig.ad.xiaomi.com` | blocked | blocked before extensions |
| OEMs | `sdkconfig.ad.intl.xiaomi.com` | blocked | blocked before extensions |
| OEMs | `tracking.rus.miui.com` | loaded (404) | loaded (404) |
| OEMs | `adsfs.oppomobile.com` | loaded (404) | loaded (404) |
| OEMs | `adx.ads.oppomobile.com` | loaded (404) | loaded (404) |
| OEMs | `ck.ads.oppomobile.com` | loaded (404) | loaded (404) |
| OEMs | `data.ads.oppomobile.com` | loaded (404) | loaded (404) |
| OEMs | `metrics.data.hicloud.com` | blocked | blocked before extensions |
| OEMs | `metrics2.data.hicloud.com` | blocked | blocked before extensions |
| OEMs | `grs.hicloud.com` | loaded (403) | loaded (403) |
| OEMs | `logservice.hicloud.com` | blocked | blocked before extensions |
| OEMs | `logservice1.hicloud.com` | blocked | blocked before extensions |
| OEMs | `logbak.hicloud.com` | blocked | blocked before extensions |
| OEMs | `click.oneplus.cn` | blocked | blocked before extensions |
| OEMs | `open.oneplus.net` | blocked | blocked before extensions |
| OEMs | `samsungads.com` | blocked | blocked before extensions |
| OEMs | `smetrics.samsung.com` | blocked | blocked before extensions |
| OEMs | `nmetrics.samsung.com` | blocked | blocked before extensions |
| OEMs | `samsung-com.112.2o7.net` | blocked | blocked before extensions |
| OEMs | `analytics-api.samsunghealthcn.com` | blocked | blocked before extensions |
| OEMs | `iadsdk.apple.com` | loaded (403) | loaded (403) |
| OEMs | `metrics.icloud.com` | blocked | blocked before extensions |
| OEMs | `metrics.mzstatic.com` | blocked | blocked before extensions |
| OEMs | `api-adservices.apple.com` | loaded (403) | loaded (403) |
| OEMs | `books-analytics-events.apple.com` | loaded (401) | loaded (401) |
| OEMs | `weather-analytics-events.apple.com` | loaded (401) | loaded (401) |
| OEMs | `notes-analytics-events.apple.com` | loaded (401) | loaded (401) |

</details>

## Safety compared with Brave

Each browser on a fresh profile with default settings (Hydrogen's with Helium services agreed to, as onboarding asks); Brave 155.1.97.56 with standard Shields, which has no uBlock Origin. Raw values in `safety.json`.

| Protection | Hydrogen | Brave |
|---|---|---|
| http://example.com upgraded to HTTPS | ✅ upgraded to HTTPS | ✅ upgraded to HTTPS |
| Tracking parameters removed from a link (fbclid, gclid, msclkid, mc_eid, utm_source) | ✅ 5 of 5 stripped (`?keep=1`) | ◐ 4 of 5 stripped (`?utm_source=probe&keep=1`) |
| Global Privacy Control signal (navigator.globalPrivacyControl) | ✅ sent | ✅ sent |
| WebRTC keeps local IP addresses private | ✅ no local IP (0 candidates, 0 mDNS) | ✅ no local IP (1 candidates, 1 mDNS) |
| Canvas fingerprint differs between example.com and example.org | ✅ differs between sites (aa0920ffa8d9 vs 23536e730a78) | ✅ differs between sites (f9c3b0c7113a vs 525c344a9687) |
| Google's Safe Browsing phishing test page | ❌ loaded, 5 tries over two minutes (` | Phishing Page Example. This is an example of a phishing page. Usern`) | ❌ loaded, 5 tries over two minutes (` | Phishing Page Example. This is an example of a phishing page. Usern`) |
| Google's Safe Browsing malware test page | ❌ loaded, 5 tries over two minutes (` | Malware Page Example. Malware download`) | ✅ blocked with a warning page (`Security error | Dangerous site Attackers on the site you tried visiti`) |
| --remote-debugging-port on the default profile (how infostealers read cookies) | ✅ stays closed | ❌ opens |
| Malware, phishing and tracking blocklists in uBlock Origin | ✅ badware (10557 entries), ✅ malware (122620 entries), ✅ phishing (167552 entries), ✅ URL tracking (2728 entries) | – not uBlock Origin: Brave Shields lists, plus Google Safe Browsing |
| Third-party cookies | ✅ blocked by default (Helium's default setting) | ✅ blocked by default (Shields) |

## Ads on real pages compared with Brave

Twelve ad-heavy pages, each given 20 seconds in a fresh profile once the browser's blocker stops a test ad request (up to 2.5 minutes after launch); requests counted over the DevTools protocol, including frames in other processes. Fewer answered ad and tracker requests is better.

Ad and tracker requests that got an answer, of those the page made:

| Page | Hydrogen | Brave | Hydrogen weight | Brave weight |
|---|---|---|---|---|
| weather.com | 7 of 25 | 7 of 25 | 176 req, 5.31 MB, loaded in 1 s | 223 req, 5.23 MB, loaded in 2 s |
| businessinsider.com | 0 of 1 | 0 of 1 | 31 req, 0.48 MB, loaded in 0.7 s | 34 req, 0.6 MB, loaded in 0.5 s |
| cnet.com | 0 of 2 | 1 of 3 | 96 req, 2.76 MB, loaded in 0.9 s | 94 req, 2.44 MB, loaded in 0.8 s |
| cnn.com | 0 of 2 | 4 of 13 | 132 req, 8.38 MB, loaded in 3 s | 177 req, 8.94 MB, loaded in 4.5 s |
| dailymail.co.uk | 0 of 2 | 2 of 5 | 214 req, 5.13 MB, loaded in 0.7 s | 239 req, 6.36 MB, loaded in 0.8 s |
| foxnews.com | 4 of 14 | 12 of 22 | 278 req, 5.24 MB, loaded in 3.4 s | 296 req, 5.58 MB, loaded in 5.2 s |
| huffpost.com | 0 of 22 | 3 of 25 | 149 req, 6.16 MB, loaded in 1.3 s | 160 req, 6.25 MB, loaded in 2.1 s |
| independent.co.uk | 1 of 19 | 5 of 20 | 94 req, 4.97 MB, loaded in 1.9 s | 87 req, 4.81 MB, loaded in 2.7 s |
| speedtest.net | 0 of 0 | 2 of 2 | 30 req, 1.43 MB, loaded in 1 s | 39 req, 1.7 MB, loaded in 2.3 s |
| theverge.com | 0 of 1 | 5 of 11 | 169 req, 2.79 MB, loaded in 2 s | 192 req, 4.47 MB, loaded in 2.8 s |
| wired.com | 0 of 0 | 2 of 2 | 134 req, 6.74 MB, loaded in 2.6 s | 134 req, 6.77 MB, loaded in 3 s |
| yahoo.com | 0 of 1 | 1 of 2 | 218 req, 3.19 MB, loaded in 1.2 s | 272 req, 3.43 MB, loaded in 0.9 s |
| **Pages both loaded (12)** | **12 of 89** | **44 of 131** | 52.58 MB | 56.58 MB |
