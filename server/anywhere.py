"""Use the app from a phone anywhere, not only at home: python -m server.anywhere

The models still run on this computer, which must stay switched on. The phone reaches
it through Tailscale, a private network between the user's own devices: the traffic is
encrypted from the phone to this computer, and the address cannot be opened by anyone
who is not signed in to the same Tailscale account. Nothing is made public.

Tailscale also gives the secure address (https) that phone browsers ask for before
they give the microphone and the position, so there is no certificate to install and
no code to type, unlike `server.phone`.

Needed once, by hand: Tailscale installed and signed in on this computer and on the
phone, with the same account (see the README).
"""

import ctypes
import json
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

from .__main__ import HOST, PORT, already_running

INSTALL = "https://tailscale.com/download"


def tailscale() -> str | None:
    """The Tailscale command, or None when it is not installed."""
    usual = Path(r"C:\Program Files\Tailscale\tailscale.exe")
    return shutil.which("tailscale") or (str(usual) if usual.exists() else None)


def run(exe: str, *args: str, timeout: float = 20) -> tuple[bool, str]:
    """Run a Tailscale command: (it worked, what it printed)."""
    try:
        done = subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout)
        return done.returncode == 0, (done.stdout + done.stderr).strip()
    except subprocess.TimeoutExpired as waiting:
        # Tailscale waits when something must first be allowed on its website: show what it asks.
        said = waiting.stdout or b""
        return False, (said.decode("utf-8", "replace") if isinstance(said, bytes) else said).strip()
    except OSError as error:
        return False, str(error)


def own_address(exe: str) -> tuple[str | None, str]:
    """The name of this computer on the private network, or (None, what to do)."""
    ok, out = run(exe, "status", "--json")
    try:
        status = json.loads(out)
    except ValueError:
        return None, "Tailscale is installed but is not running. Open Tailscale from the Start menu, then start this again."
    if status.get("BackendState") != "Running":
        return None, "Tailscale is not signed in on this computer. Open Tailscale from the Start menu, sign in, then start this again."
    name = (status.get("Self") or {}).get("DNSName", "").rstrip(".")
    if not name:
        return None, "Tailscale did not give a name to this computer. In the Tailscale website, under DNS, switch on MagicDNS."
    return name, ""


def stay_awake() -> None:
    """Ask Windows not to go to sleep by itself while this program runs."""
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # continuous, system required
    except (AttributeError, OSError):
        pass   # not on Windows


if __name__ == "__main__":
    if already_running():
        print("Dezheimer is already running in another window. Close that window, then start this again.")
        raise SystemExit(1)

    exe = tailscale()
    if not exe:
        print("To reach this computer from anywhere, Dezheimer uses Tailscale, which is not installed yet.")
        print(f"  1. On this computer: install it from {INSTALL} and sign in.")
        print("  2. On the phone: install the Tailscale app and sign in with the same account.")
        print("  3. Start this again.")
        raise SystemExit(1)

    name, problem = own_address(exe)
    if not name:
        print(problem)
        raise SystemExit(1)

    # The secure address of this computer, for the user's own devices only, sent to the app.
    ok, said = run(exe, "serve", "--bg", "--https=443", f"http://{HOST}:{PORT}")
    if not ok:
        print("Tailscale could not open the secure address. It said:")
        print(said or "(nothing)")
        print("If it gives a link, open it and allow HTTPS for your devices, then start this again.")
        raise SystemExit(1)

    stay_awake()
    address = f"https://{name}"
    print("Dezheimer is starting, for this computer and for your phone, anywhere.")
    print("Keep this window open, and the computer switched on and plugged in. Close the window to stop.")
    print()
    print(f"  The app on the phone (Tailscale switched on):   {address}")
    print(f"  The app on this computer:                       http://localhost:{PORT}")
    print()
    print("The first time, open the address in Safari, allow the microphone and the position,")
    print("then Share, Add to Home Screen.")
    print()
    threading.Timer(1.5, webbrowser.open, [f"http://localhost:{PORT}"]).start()
    try:
        uvicorn.run("server.app:app", host=HOST, port=PORT, log_level="warning")
    finally:
        run(exe, "serve", "--https=443", "off")
        sys.stdout.flush()
