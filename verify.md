
### Spaces, driven with synthetic keyboard, mouse and trackpad input

Window 1024×674 pt, the page area wasn't found, so the sidebar is assumed 200 pt wide; test spaces: Work, Personal, Research.

- ✅ Ctrl+1…9 jumps to space N (Ctrl+2, Ctrl+3, Ctrl+1), and Ctrl+9 with three spaces does nothing
  - landed on spaces 2, 3, 1, 1 (expected 2, 3, 1, 1)
- ✅ Audio keeps playing in a space you leave, as music in a Spotify tab should
  - after 12 s in space 2, the left space's audio clock went from 3.2 s to 16.7 s and its timer from 16 to 70 ticks; audible true, frozen false, discarded false
- ✅ The sidebar lists only the current space's tabs (`spaces-current-only.png`)
  - Work's tabs listed: Hacker News, Lobsters; other spaces' tabs listed: none
- ✅ A click on a tab in the sidebar selects it (a control for the synthetic clicks)
  - clicked the row at 6,127,188,30: space 1 of 3 (Work), tab https://news.ycombinator.com/
- ✅ Clicking a dot in the space bar switches to that space (`space-bar.png`)
  - clicks at 112,681 100,681 88,681 on dots 3, 2, 1 landed on spaces 3, 2, 1; window 0 31 1024 674 before, 0 31 1024 674 after
- ✅ Each space reopens on the tab you left it on
  - back in Work: https://lobste.rs/
- ✅ Cmd+T opens the new tab in the current space, and closing it stays in that space
  - new tab in space 2 (11 tabs); after closing it: space 2 of 3 (Personal), tab https://www.wikipedia.org/
- ✅ Two-finger swipes move one space at a time and stop at the first and last space
  - from space 1, three swipes left then three right: 2, 3, 3, 2, 1, 1 (expected 2, 3, 3, 2, 1, 1)
- ✅ A quick short flick pages, like Arc (three times each way)
  - 100 pt flicks with momentum, left and right three times, landed on spaces 2, 1, 2, 1, 2, 1 (expected 2, 1, 2, 1, 2, 1); 0.4 s after each lift: 2, 1, 2, 1, 2, 1; event stamps in nanoseconds (nanoseconds reads as 228.764 s at uptime 228.764 s; mach ticks reads as 5.490 s at uptime 228.766 s)
- ✅ Dragging a quarter of the way, resting, then lifting snaps back to the same space
  - after a 100 pt drag held still for 0.2 s before lifting: space 1 (expected 1)
- ✅ Resting the fingers mid-swipe keeps the space under them until they lift
  - 0.9 s into resting at 65% of the way: space 1 (expected 1); after lifting: space 2 (expected 2, the nearer one) (`swipe-resting.png`)
- ✅ `+` in the space bar makes a new space and switches to it (`space-bar-new.png`)
  - 4 spaces; current: space 4 of 4 (), tab chrome://newtab/
- ✅ Right-clicking a dot opens the space editor; a name that starts with an emoji becomes its icon (`space-icon.png`)
  - the first space is now named "🏠 Home"; windows while editing: 2; the editor's field after typing: AXTextField [92,366 208x36] Space name | Space name | 🏠 Home
- ✅ VoiceOver can use the space bar: a "Spaces" tab list of named spaces with the current one selected, a "New Space" button, and a header button; pressing a space switches to it (`spaces-ax.txt`)
  - tab list found: true; spaces read as Home, Personal, Research, Space; selected: 1; "New Space" button: true; header button "Home": true; pressing "Research" through accessibility landed on space 3
- ✅ The Tabs menu has New Space, Next Space and Previous Space, and they work
  - from space 3 of 4: Next Space: space 4 of 4; Previous Space: space 3 of 4; New Space: space 5 of 5
- ✅ Spaces, their names and the current space come back after quitting and reopening (`spaces-relaunch.png`)
  - quit with a clean quit; Session_13437732713576886: selected-tab writes 10, 7, 11, 7, focused-space writes 45; before: 🏠 Home, Personal, Research, ,  on space 3, 12 tabs, https://arxiv.org/; after: 🏠 Home, Personal, Research, ,  on space 3, 12 tabs, https://arxiv.org/; other spaces' tabs listed after relaunch: none

16 of 16 spaces checks passed. Trackpad feel and haptics still need a real trackpad.
