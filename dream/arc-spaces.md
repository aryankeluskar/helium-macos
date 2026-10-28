# Arc spaces in Helium

The target is Arc's spaces as Arc ships them, not Chromium's Tab Groups Focusing UI. Under the hood a space is a
tab group whose header, chip and indentation never show; Chromium's focus mode only filters the tab list.

Status: ⬜ not started, 🟡 partial, ✅ done.

## Behaviour

| | What Arc does | Status |
|---|---|---|
| One sidebar per space | The tab list shows only the current space: its header (icon and name), then its tabs. No group headers, chips or focus UI. | ✅ seen in a build: the focused group draws no header, line or indent, and `SpaceHeaderView` names the space; its click opens the group editor (not yet clicked in a build) |
| Space colour | The sidebar and the window frame take the space's colour; it blends between spaces while you swipe. | ✅ seen in a build: the sidebar takes each space's colour and blends between them during a swipe |
| Space bar | The sidebar footer has one item per space (its icon, or a dot), the current one highlighted; click to switch; `+` makes a space; right-click to rename, recolour or delete. | 🟡 renders in a build (`VerticalTabStripSpaceSwitcher`); clicks not yet exercised; dropping a tab on an item is still to do |
| Swipe to page | Two fingers anywhere on the sidebar move the whole space with the fingers, the neighbour slides in beside it, rubber band at the ends, spring settle on release. | 🟡 seen in a build with synthetic trackpad events: the space slides with the fingers, the neighbour comes in beside it, rubber band at the last space, spring settle. Feel, haptics and wheel paging need a real trackpad and mouse |
| Favorites | Pinned tabs are a grid at the top shared by every space; they stay put while you swipe. | 🟡 Chromium's pinned grid already sits above the spaces and stays put; its tiles aren't Arc's size yet |
| Last tab per space | Switching to a space shows the tab you left it on; tabs in other spaces keep running. | 🟡 in the build; not yet exercised: the model remembers each group's last active tab |
| Keyboard | Ctrl+1…9 jumps to space N. Arc's Cmd+Option+arrows stay Chrome's next and previous tab here; Chromium's Ctrl+Cmd+X and Ctrl+Cmd+Z step through spaces. | 🟡 in the build; not yet exercised |
| New tabs | Cmd+T and links from a tab open in the current space. | 🟡 in the build; not yet exercised: new tabs join the focused group instead of leaving focus mode |
| Persistence | Spaces (name, icon, colour, tabs) survive a relaunch, and the window reopens on the space it was on. | 🟡 session restore brings back groups and the focused group; to check in a build |

A space's icon is the first character of its name when that's an emoji ("🏠 Home" shows 🏠 in the space bar and
"Home" as the name); otherwise the space bar shows a dot and the header a dot in the space's colour.

## Measured values

From the ARCUI paging code that Arc and Dia share, measured in Dia 1.50.1 (aryankeluskar/ardia, `docs/dia-spec.md`
"Profile paging", implemented in `packages/ardiacore/ios/SwipeModule.swift`):

- **Tracking:** the position, in pages, moves at half the scroll distance: `start ± distance × 0.5 / width`.
- **Rubber band** past the first or last space, in points: `255 · (1 − 1/(0.15 · x/255 + 1))`.
- **Velocity:** from the positions of the last 0.1 s.
- **Release:** a flick (|velocity × width| ≥ 5 pt/s) goes to the next space in its direction (floor + 1 or ceil − 1),
  otherwise the nearest one; never more than one space from where the swipe began.
- **Settle:** critically damped spring, ω = 2π / 0.25 s, starting with the release velocity when it points at the
  target (else 0); at rest under 0.003 pages and 0.1 pages/s.
- **Haptics:** an alignment tick each time the nearest space changes during the swipe.
- **Wheel mice:** horizontal deltas add up while under 49 ms apart; past 1 pt they page once, then ignore the wheel
  for 250 ms.
- **Space bar:** footer 41 pt; the switcher band is 28 pt tall, centred above the footer's bottom 3 pt; 12 pt per
  item, centred, scrolling past 7 items (84 pt) with the edge items scaled 0.75–1; a 6 pt dot, label colour at 0.85
  selected, 0.4 hovered, 0.2 otherwise.
