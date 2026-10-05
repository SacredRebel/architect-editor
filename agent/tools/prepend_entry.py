# -*- coding: utf-8 -*-
"""Put an entry on top of a log: after the file's header (everything before its first "## " line).
Usage: python prepend_entry.py <log> <entry file>"""
import io
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # this PC's console is cp1252: a ✓ in the log stopped the print once

log, entry_path = sys.argv[1:3]
text = io.open(log, encoding="utf-8").read()
entry = io.open(entry_path, encoding="utf-8").read().rstrip("\n") + "\n\n"
first = entry.splitlines()[0]
if first in text:
    print("already there:", first[:80])
    sys.exit(1)
at = text.find("\n## ")
if at < 0:
    print("no entry heading found in", log)
    sys.exit(1)
text = text[:at + 1] + entry + text[at + 1:]
if any(ord(c) < 32 and c not in "\n\r\t" for c in text):
    print("control character: not written")
    sys.exit(1)
io.open(log, "w", encoding="utf-8", newline="").write(text)
print("entry of %d lines put on top of %s" % (len(entry.splitlines()), log))
