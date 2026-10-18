"""Replace main.html text from START (inclusive) up to END (exclusive) with a file.
usage: splice.py <block.js> <start marker> <end marker>"""
import sys
blk, start, end = sys.argv[1:4]
p = 'main.html'; s = open(p, encoding='utf-8').read()
a = s.find(start)
if a < 0 or s.count(start) != 1: sys.exit('start marker not unique/found: ' + start)
b = s.find(end, a)
if b < 0: sys.exit('end marker not found: ' + end)
s = s[:a] + open(blk, encoding='utf-8').read().rstrip('\n') + '\n\n' + s[b:]
open(p, 'w', encoding='utf-8').write(s); print('spliced', blk, b - a, 'chars replaced')
