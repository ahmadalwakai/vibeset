"""Bound the Xcode process group; keep its public simulator log out of exceptions."""
import os
import signal
import subprocess
import sys

timeout = int(sys.argv[1])
if not 1 <= timeout <= 1200 or len(sys.argv) < 5:
    raise SystemExit("Invalid diagnostic command")
with open(sys.argv[2], "wb") as log:
    child = subprocess.Popen(sys.argv[3:], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        status = child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        # The leader may exit before its build descendants; kill the entire group.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait(timeout=5)
        status = 124
raise SystemExit(status)
