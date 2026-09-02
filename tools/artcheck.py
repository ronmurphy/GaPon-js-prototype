#!/usr/bin/env python3
"""Check a sticker folder before judging the art by eye.

Catches the two failures this project has actually hit:
  1. Filenames with tool suffixes (_birefnet, _toonout). These fall back to a
     Material glyph silently — the set looks half-wired rather than misnamed.
  2. No alpha channel. A "checkerboard background" IS this: the transparency
     placeholder flattened into real pixels. Reading the PNG header says so
     definitively, without opening twelve files.

Usage: python3 tools/artcheck.py <collection-id>
"""
import sys, os, re, struct

# repo root is one level up now that this lives in tools/
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = open(os.path.join(root, 'js', 'data.js'), encoding='utf-8').read()

col_id = sys.argv[1] if len(sys.argv) > 1 else 'autumn'
m = re.search(r"id: '%s',[^\n]*artDir: '([^']+)'" % col_id, data)
if not m:
    sys.exit("no collection '%s' with an artDir in data.js" % col_id)
art_dir = m.group(1)
block = data[m.start():]
block = block[:block.index('],')]
want = re.findall(r"\{ id: '([^']+)'", block)

folder = os.path.join(root, 'assets', 'stickers', art_dir)
have = sorted(f for f in os.listdir(folder)) if os.path.isdir(folder) else []
print("%s  (%d files, %d expected)\n" % (folder, len(have), len(want)))

def png_info(path):
    with open(path, 'rb') as fh:
        head = fh.read(33)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    w, h, depth, ctype = struct.unpack('>IIBB', head[16:26])
    # colour types 4 (grey+A) and 6 (RGB+A) carry an alpha channel
    return w, h, ctype, ctype in (4, 6)

problems = []
for sid in want:
    fn = sid + '.png'
    path = os.path.join(folder, fn)
    if not os.path.exists(path):
        near = [f for f in have if f.startswith(sid)]
        if near:
            problems.append("%-14s MISNAMED -> %s" % (sid, ', '.join(near)))
        else:
            problems.append("%-14s missing" % sid)
        continue
    info = png_info(path)
    if not info:
        problems.append("%-14s not a PNG" % sid); continue
    w, h, ctype, alpha = info
    flags = []
    if not alpha:
        flags.append("NO ALPHA (a checkerboard is transparency flattened into pixels)")
    if (w, h) != (256, 256):
        flags.append("%dx%d, expected 256x256" % (w, h))
    if flags:
        problems.append("%-14s %s" % (sid, '; '.join(flags)))

extra = [f for f in have if f[:-4] not in want and f.endswith('.png')]
for f in extra:
    problems.append("%-14s not in the set — will never be shown" % f)

if problems:
    print('\n'.join('  ' + p for p in problems))
    print("\n%d problem(s)." % len(problems))
    sys.exit(1)
print("  all %d present, named right, 256x256, with alpha." % len(want))
