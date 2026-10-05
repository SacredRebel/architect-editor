# -*- coding: utf-8 -*-
"""For probes run in freecadcmd (agent\\tools\\run_probe.ps1): every printed line goes to <probe>.log beside the probe at
once (freecadcmd's own stdout is buffered and partly swallowed), and a probe that runs longer than its limit writes
where it waits and ends (faulthandler). Use:

    import os, sys
    sys.path.insert(0, r"C:\\Playground\\Architect-editor\\agent\\tools")
    import _log
    lap = _log.start("my_probe", 600, os.path.dirname(os.path.abspath(__file__)))
    lap("built %d pieces" % n)        # "[  12.3 s] built 5 pieces"
    ...
    os._exit(0)                       # end freecadcmd at once (it may hang on exit otherwise)
"""
import faulthandler
import os
import sys
import time


def start(name, limit_s=300, folder=None):
    folder = folder or os.path.dirname(os.path.abspath(sys.argv[0] if sys.argv and sys.argv[0] else __file__))
    log = open(os.path.join(folder, name + ".log"), "w", encoding="utf-8", buffering=1)

    class Tee:
        def write(self, text):
            log.write(text)
            log.flush()

        def flush(self):
            log.flush()

    sys.stdout = Tee()
    faulthandler.dump_traceback_later(limit_s, repeat=False, file=log, exit=True)
    t0 = time.time()

    def lap(text):
        print("[%6.1f s] %s" % (time.time() - t0, text))

    return lap
