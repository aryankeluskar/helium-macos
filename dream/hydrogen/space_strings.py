#!/usr/bin/env python3
"""Words the space editor in terms of spaces: in Hydrogen a tab group is a space.

Usage: space_strings.py <chromium src>
Rewrites the English text of the tab group editor's messages in
chrome/app/generated_resources.grd and adds the Tab menu's space commands
(patches/dream/spaces-in-the-menu-bar.patch). Idempotent.
"""
import re
import sys
from pathlib import Path

MESSAGES = {
    "IDS_TAB_GROUP_HEADER_CXMENU_NEW_TAB_IN_GROUP": "New tab in space",
    "IDS_TAB_GROUP_HEADER_CXMENU_UNGROUP": "Remove space, keep tabs",
    "IDS_TAB_GROUP_HEADER_CXMENU_FOCUS_GROUP": "Go to space",
    "IDS_TAB_GROUP_HEADER_CXMENU_UNFOCUS_GROUP": "Show all spaces",
    "IDS_TAB_GROUP_HEADER_CXMENU_CLOSE_GROUP": "Close space",
    "IDS_TAB_GROUP_HEADER_CXMENU_DELETE_GROUP": "Delete space",
    "IDS_TAB_GROUP_HEADER_CXMENU_MOVE_GROUP_TO_NEW_WINDOW": "Move space to new window",
    "IDS_TAB_GROUP_HEADER_BUBBLE_TITLE_PLACEHOLDER": "Name this space",
    "IDS_TAB_GROUP_HEADER_CXMENU_TAB_GROUP_TITLE_ACCESSIBLE_NAME": "Space name",
}

MENU_MESSAGES = {
    "IDS_NEW_SPACE_MAC": ("New Space", "makes a new space and switches to it"),
    "IDS_NEXT_SPACE_MAC": ("Next Space", "switches to the next space"),
    "IDS_PREVIOUS_SPACE_MAC": ("Previous Space", "switches to the previous space"),
}
MENU_ANCHOR = "IDS_GROUP_TARGET_TAB_MAC"


def main():
    grd = Path(sys.argv[1]) / "chrome/app/generated_resources.grd"
    text = grd.read_text(encoding="utf-8")
    for name, wording in MESSAGES.items():
        pattern = re.compile(
            r'(<message name="' + name + r'"[^>]*>)(\s*)(.*?)(\s*)(</message>)', re.S)
        text, count = pattern.subn(
            lambda m: m.group(1) + m.group(2) + wording + m.group(4) + m.group(5), text, count=1)
        if count != 1:
            sys.exit(f"{name} not found in {grd}")

    anchor = re.search(r'( *)<message name="' + MENU_ANCHOR + r'".*?</message>\n', text, re.S)
    if not anchor:
        sys.exit(f"{MENU_ANCHOR} not found in {grd}")
    indent = anchor.group(1)
    added = "".join(
        f'{indent}<message name="{name}" desc="In Title Case: The Mac Tab menu item that {what}.">\n'
        f"{indent}  {wording}\n"
        f"{indent}</message>\n"
        for name, (wording, what) in MENU_MESSAGES.items()
        if f'name="{name}"' not in text)
    text = text[:anchor.end()] + added + text[anchor.end():]
    grd.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
