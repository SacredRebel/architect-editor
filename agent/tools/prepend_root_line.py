# -*- coding: utf-8 -*-
"""Put one line on top of a log (before its first line that starts with "- "): the shared one by default, or the one named
(my seat's: C:\\Playground\\agents\\a-geometer\\memory\\UPDATES.md).
Usage: python prepend_root_line.py <line file> [<log>]
The log must be there: through a junction that points at an empty folder (6 Oct) it is not, and nothing is written."""
import io
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # this PC's console is cp1252: a ✓ in the log stopped the print once

path = sys.argv[2] if len(sys.argv) > 2 else r"C:\Playground\UPDATES.md"
if not os.path.isfile(path):
    print("%s is not there (an empty junction?): not written" % path)
    sys.exit(1)
line = io.open(sys.argv[1], encoding="utf-8").read().strip("\n")
if "\n" in line:
    print("more than one line: not written")
    sys.exit(1)
text = io.open(path, encoding="utf-8").read()
if line[:60] in text:
    print("already there")
    sys.exit(1)
at = text.find("\n- ")
if at < 0:
    print("no entry found")
    sys.exit(1)
text = text[:at + 1] + line + "\n" + text[at + 1:]
if any(ord(c) < 32 and c not in "\n\r\t" for c in text):
    print("control character: not written")
    sys.exit(1)
io.open(path, "w", encoding="utf-8", newline="").write(text)
print("written; the log's first entries now:")
for l in text.splitlines()[3:7]:
    print("  ", l[:150])
