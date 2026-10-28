This fork's own work (the "dream browser", branded Hydrogen: Arc-style spaces, Brave-fast vertical tabs, the agent CLI) lives on branch
`claude/arc-spaces`. Read `dream/HANDOFF.md` first: it has the owner's goal and rules, where the builds stand, and how
to continue. Never run Chromium builds on the owner's Mac without asking; use GitHub Actions. The full cloud session transcript is in `dream/transcript/`.

For any UI or UX change, use the two design skills in `.claude/skills/`: `apple-design` (Apple's Human Interface
Guidelines, a submodule: run `git submodule update --init .claude/skills/apple-design`) and
`make-interfaces-feel-better` (polish details, MIT). `dream/design-review.md` is the review of Hydrogen they produced.
