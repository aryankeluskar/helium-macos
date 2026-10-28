#!/usr/bin/env python3
"""Renames the browser from Helium to Hydrogen in every .grd, .grdp and .xtb
string of a prepared tree, after Helium's own name substitution. Strings about
imput's online services keep the Helium name. Only translations of messages
whose English text changed are renamed, and they are re-keyed to the new
English fingerprints with Helium's own substitution helpers.

Usage: rename_strings.py <chromium src dir> <helium-chromium dir>
"""

import re
import sys
from pathlib import Path

KEEP_HELIUM = r"(services|servers|Partner|partner|bangs)"
PATTERNS = [
    (rf"\bHelium( {KEEP_HELIUM}\b)", r"Helium_unreplace\1"),
    (r"\bHelium\b", "Hydrogen"),
    (r"Helium_unreplace", "Helium"),
]


def rename_xtb(path, util, fp_map):
    text = path.read_text(encoding="utf-8").replace("&#36;", "!!dollar-sign-literal!!")
    root = util.xml.fromstring(text, util.get_parser())
    changed = False
    seen = set()
    for translation in root.findall(".//translation"):
        old_id = translation.get("id")
        if old_id in fp_map:
            util.replace_grit_message(translation)
            translation.set("id", fp_map[old_id])
            changed = True
        util.dedup_translations_in_place(translation, seen)
    if changed:
        out = util.xml.tostring(root, encoding="unicode", xml_declaration=True)
        path.write_text(out.replace("!!dollar-sign-literal!!", "&#36;"), encoding="utf-8")
    return changed


def main(tree, helium_repo):
    tree, helium_repo = Path(tree).resolve(), Path(helium_repo).resolve()
    sys.path.insert(0, str(helium_repo / "utils"))
    import name_substitution
    import name_substitution_utils as util

    util.REPLACEMENT_REGEXES = [(re.compile(pattern), replacement) for pattern, replacement in PATTERNS]
    util.add_grit_to_path(tree)

    fp_map = {}
    changed = 0
    for path in name_substitution.get_substitutable_files(tree, ["grd", "grdp"]):
        result = name_substitution.substitute_grit_file((path, tree, False, False))
        if result:
            changed += 1
            fp_map.update(result[1])
    for path in name_substitution.get_substitutable_files(tree, ["xtb"]):
        if rename_xtb(path, util, fp_map):
            changed += 1
    print(f"Hydrogen: renamed strings in {changed} files, re-keyed {len(fp_map)} messages")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
