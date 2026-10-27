#!/usr/bin/env python3
"""Print the compile outputs of one shard from a ninja dry run."""

import re
import sys

COMPILE_STEP = re.compile(r'^\[\d+/\d+\] (?:CXX|CC|OBJCXX|OBJC) (\S+\.o)$')
BLOCK = 25


def main():
    dry_run, shard, shards = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    with open(dry_run, encoding='utf-8') as lines:
        outputs = [match.group(1) for match in map(COMPILE_STEP.match, lines.read().splitlines()) if match]
    for index, output in enumerate(outputs):
        if (index // BLOCK) % shards == shard:
            print(output)


if __name__ == '__main__':
    main()
