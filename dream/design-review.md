# Design review: Hydrogen's spaces sidebar

Reviewed 2026-10-28 with the two skills in `.claude/skills/`: `apple-design` (Apple's Human Interface Guidelines,
pinned at `ff4ebdd`) and `make-interfaces-feel-better`. Scope: the spaces UI in the vertical sidebar (space header,
space bar and `+`, the space editor, swipes and keyboard switching), plus the app icon. Platform: macOS, Chromium
views (C++), so web-only advice (CSS, Tailwind, `AnimatePresence`) is translated into views terms.

Evidence: the GitHub Mac runs of `.github/demo/spaces-checks.mjs` on build `40736992400` (sidebar captures, and the
accessibility tree dumped by `.github/demo/ax.swift`), and the source in `patches/dream/`.

## Summary

Hydrogen's thesis is Arc's: one sidebar per space, moved between by two fingers. What it will be remembered by is that
swipe, now with ARCUI's measured physics and haptic detents. Rating: **Critical issues** before this review's fixes,
because the space bar and the space header were invisible to VoiceOver, Voice Control and Full Keyboard Access. With
the fixes below (accessibility, menu bar commands, wording, contrast, press feedback) it moves to **Good**; the one
trade-off left is the space bar's 12 pt hit width, kept for Arc parity.

## Critical

- **What**: the space bar (its dots and `+`) and the space header were painted by one view each with no accessible
  role or name. The accessibility tree showed `AXGroup [0,661 200x41]` and `AXGroup [0,65 200x30]` with nothing inside,
  so VoiceOver could not read which space is current, switch spaces from the bar, make a space, or open the editor.
  - **Why**: `voiceover.md › Best practices`: "Provide alternative labels for all key interface elements … Add labels to
    any custom elements your app defines." `accessibility.md › Speech`: "Let people use the keyboard alone to navigate
    and interact with your app."
  - **Fix** (done, `patches/dream/spaces-accessible-space-bar.patch`): the bar is a tab list named "Spaces". Each item is
    a tab named after its space (position in set, selected when current) that switches on press and opens the editor
    on the context-menu action. `+` is a "New Space" button. The header is a button named after the space, described
    "Rename or recolor this space". All are focusable under Full Keyboard Access, show a focus ring, and act on Return
    or Space. Mouse handling and painting are unchanged.

## Improvements

- **High: the spaces commands aren't in the menu bar.** New Space, Next Space and Previous Space exist only as the `+`,
  Ctrl+1…9 and Chromium's Ctrl+Cmd+X/Z.
  - **Why**: `the-menu-bar.md › Custom menus`: "Even when commands are available elsewhere in your app, it's important to
    list them in the menu bar … Excluding commands from the menu bar … risks making them difficult for everyone to
    find." Also `sidebars.md › Best practices`: "Avoid putting critical information or actions at the bottom of a
    sidebar. People often relocate a window in a way that hides its bottom edge", which is exactly where Arc's space bar
    lives.
  - **Fix** (done, `patches/dream/spaces-in-the-menu-bar.patch`, strings added by `dream/hydrogen/space_strings.py`):
    "New Space", "Next Space" and "Previous Space" in the Tabs menu, on `IDC_NEW_SPACE`, `IDC_FOCUS_NEXT_TAB_GROUP` and
    `IDC_FOCUS_PREV_TAB_GROUP`. Their shortcuts stay in Chromium's table of shortcuts outside the menu, so the menu
    doesn't show them yet.
- **Medium: the space editor spoke of groups.** "New tab in group", "Close group", "Delete group", "Unfocus group", the
  "Name this group" placeholder and the field's accessible name "Tab-group title".
  - **Why**: `writing.md › Best practices`: "Create a list of common terms, and reference that list to keep your
    language consistent." Hydrogen calls them spaces everywhere else.
  - **Fix** (done, `dream/hydrogen/space_strings.py`, run by `rebrand.sh`): "New tab in space", "Go to space", "Show all
    spaces", "Close space", "Delete space", "Remove space, keep tabs", "Move space to new window", "Name this space",
    and "Space name". Sentence case matches the rest of Chromium's editor bubble.
- **Medium: the other spaces' dots ignore Increase Contrast.** Idle dots draw the label colour at 0.2 opacity.
  - **Why**: `accessibility.md › Vision`: "If your app doesn't provide this minimum contrast by default, ensure it at least
    provides a higher contrast color scheme when the system setting Increase Contrast is turned on."
  - **Fix** (done): with Increase Contrast on, idle dots are 0.45 and hovered 0.65 (current stays 0.85).

## Polish (make-interfaces-feel-better)

#### Scale on press
| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW | `vertical_tab_strip_space_switcher.cc` `OnPaint`, `GetItemOpacity` | The `+` and the dots change only on hover; a press shows nothing until release | A pressed `+` draws at full opacity and a pressed dot at the selected opacity until release | Press feedback makes the control feel responsive; on a 6 pt dot a `scale(0.96)` is under half a point, so the cue is opacity, a static cue rather than motion (principle 19) |

#### Minimum hit area
| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `vertical_tab_strip_space_switcher.cc` `kDotPitch` | Each dot's hit area is 12 × 28 pt | Unchanged, see Considered but rejected | Principle 16 asks for at least 40 × 40 px in dense desktop UI, and `accessibility.md › Mobility` gives 20 × 20 pt as the macOS minimum |

### Considered but rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| `kDotPitch = 12` | Widen each dot's hit area to 20 pt | The 12 pt pitch is ARCUI's measured value and the owner asked for Arc's exact UI. Widening it either changes the pitch or overlaps neighbours' hit areas, which principle 16 forbids. VoiceOver, Full Keyboard Access, Ctrl+1…9 and swipes now give every space a second, larger way in |
| The slide on Ctrl+number and space bar clicks | Drop the animation on these frequent interactions (`motion.md`: "generally avoid adding motion to UI interactions that occur frequently") | It's Arc's signature transition, it's short (a 0.25 s critically damped spring) and interruptible (a new swipe catches it), and Reduce Motion switches instantly |
| Window and page-card corners | Make the page card concentric with the macOS 26 window corner (principle 1) | The 1x CI captures can't resolve the radii with the Dock overlapping the corner; needs a measurement on a Retina screenshot before changing Helium's layout constants |

## Craft notes

- **Point of view**: strong. The spectral icon and the swipe are specific to this product. Boldness is spent in one
  place, the space colour tint during a swipe; the rest of the sidebar stays quiet and native.
- **Remove one accessory**: nothing obvious. The header row earns its place by naming the space and opening its editor.

## What works

- `page-controls.md › Customizing indicators`: "Avoid coloring indicator images." The dots use the label colour.
- `playing-haptics.md › Desktop (macOS)`: the alignment pattern on each detent during a swipe is the use Apple
  describes ("reaching the beginning/end … of something like a scrubber").
- `sidebars.md › Best practices`: the sidebar can be collapsed (the Collapse Tabs button and View menu), and it shows
  one level per space.
- Reduce Motion is honoured: swipes and keyboard switching jump instantly.
- `app-icons.md`: the icon is layered in Icon Composer with dark and tinted variants, vector layers, no text, and
  filled overlapping shapes.

## Verification and verdict

- **Verification**: `spaces-checks.mjs` gains two checks. One reads the space bar through the accessibility tree (tab
  list "Spaces", tabs named after the spaces, the current one selected, "New Space", the header button) and switches
  space by pressing a tab through accessibility, as VoiceOver does. The other presses Tabs › Next Space, Previous Space
  and New Space through the menu bar. Both run on the build that carries the fixes.
- **Not verified**: Increase Contrast and the press feedback need a look on a real screen.
- **Verdict**: **Needs changes** until both checks pass on a build; then **Approve** with the hit-width trade-off noted.
