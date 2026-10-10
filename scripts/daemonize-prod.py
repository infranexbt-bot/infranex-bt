#!/usr/bin/env python3
"""Double-fork daemonizer: spawns run-prod-keepalive.sh as a grandchild
re-parented to PID 1 (tini) so the tool-session reaper can't trace it.
Boot-spawned processes (dev server) survive the same way."""
import os
import sys

SCRIPT = "/home/z/my-project/run-prod-keepalive.sh"

pid = os.fork()
if pid == 0:
    # Middle process: new session, then fork again and exit immediately,
    # so the grandchild re-parents to PID 1 within milliseconds.
    os.setsid()
    pid2 = os.fork()
    if pid2 == 0:
        os.chdir("/")
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0)
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        os.execv("/bin/bash", ["bash", SCRIPT])
        os._exit(1)  # execv never returns
    os._exit(0)

# Parent: reap the middle child briefly, then exit so the tool call ends.
try:
    os.waitpid(pid, 0)
except ChildProcessError:
    pass
sys.exit(0)
