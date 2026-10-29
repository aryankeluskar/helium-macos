#!/usr/bin/env python3
"""Signs Hydrogen updates for Sparkle and writes their appcast.

The signing key is the base64 of a 32-byte Ed25519 seed in the
HYDROGEN_UPDATE_KEY environment variable; it is never printed.

  appcast.py public-key
      Prints the matching public key, the value of SUPublicEDKey.
  appcast.py write --dmg D --url U --version V --short-version S
                   --minimum-system M --out appcast-arm64.xml
      Signs D and writes a one-item appcast offering it from U.
"""
import argparse
import base64
import binascii
import email.utils
import os
import sys
from xml.sax.saxutils import escape, quoteattr

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def signing_key():
    try:
        seed = base64.b64decode(os.environ.get('HYDROGEN_UPDATE_KEY', '').strip(), validate=True)
    except binascii.Error:
        seed = b''
    if len(seed) != 32:
        sys.exit('HYDROGEN_UPDATE_KEY must be the base64 of 32 random bytes.')
    return Ed25519PrivateKey.from_private_bytes(seed)


def public_key(key):
    return base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()


def write(args, key):
    with open(args.dmg, 'rb') as dmg:
        data = dmg.read()
    signature = base64.b64encode(key.sign(data)).decode()
    key.public_key().verify(base64.b64decode(signature), data)
    item = f'''<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Hydrogen</title>
    <item>
      <title>{escape(f"Hydrogen {args.short_version}")}</title>
      <pubDate>{email.utils.formatdate(usegmt=True)}</pubDate>
      <sparkle:version>{escape(args.version)}</sparkle:version>
      <sparkle:shortVersionString>{escape(args.short_version)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>{escape(args.minimum_system)}</sparkle:minimumSystemVersion>
      <enclosure url={quoteattr(args.url)} length="{len(data)}" type="application/octet-stream" sparkle:edSignature={quoteattr(signature)}/>
    </item>
  </channel>
</rss>
'''
    with open(args.out, 'w', encoding='utf-8') as out:
        out.write(item)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('public-key')
    writer = commands.add_parser('write')
    for name in ('dmg', 'url', 'version', 'short-version', 'minimum-system', 'out'):
        writer.add_argument(f'--{name}', required=True)
    args = parser.parse_args()
    key = signing_key()
    if args.command == 'public-key':
        print(public_key(key))
    else:
        write(args, key)


if __name__ == '__main__':
    main()
