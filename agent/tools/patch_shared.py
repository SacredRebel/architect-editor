# -*- coding: utf-8 -*-
"""The way lane A writes into a SHARED file (exchange\\godot\\FORMAT.md, knowledge\\LESSONS.md, a trace in
knowledge\\tools\\, agents\\…, the root UPDATES.md): never a shell here-document (it mangled \\f and \\r in Windows paths
once), never a whole-file rewrite (several lanes write these files in the same minute) — a small script like this one:
one anchor that must be there exactly once, the new text put before (or after) it, line ends kept as the file has them,
no control characters, and nothing written when anything is off.

    python patch_shared.py <file> <anchor file> <text file> [before|after|replace]

<anchor file> holds the exact anchor text, <text file> the new text (UTF-8). Read the file first and look at what other
lanes wrote since; write the smallest change; say in the log what was changed."""
import io
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
path, anchor_path, text_path = sys.argv[1:4]
how = sys.argv[4] if len(sys.argv) > 4 else "before"
raw = io.open(path, encoding="utf-8", newline="").read()
anchor = io.open(anchor_path, encoding="utf-8", newline="").read().rstrip("\n")
text = io.open(text_path, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
if crlf:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
if raw.count(anchor) != 1:
    sys.exit("the anchor is there %d times: not patched" % raw.count(anchor))
if any(ord(c) < 32 and c not in "\r\n\t" for c in text):
    sys.exit("a control character in the new text: not patched")
if text.strip() and text.strip() in raw:
    sys.exit("the new text is there already: not patched again")
new = {"before": text + anchor, "after": anchor + text, "replace": text}[how]
out = raw.replace(anchor, new, 1)
io.open(path, "w", encoding="utf-8", newline="").write(out)
print("%s: %d -> %d lines (%s the anchor; line ends %s)" % (path, raw.count("\n"), out.count("\n"), how, "CRLF" if crlf else "LF"))
