"""Start the server and open the app in the browser: python -m server"""

import json
import threading
import urllib.request
import webbrowser

import uvicorn

HOST = "127.0.0.1"  # Local machine only: the microphone audio never leaves this computer.
PORT = 8765
URL = f"http://localhost:{PORT}"


def already_running() -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{PORT}/api/health", timeout=2) as res:
            return "model" in json.load(res)
    except (OSError, ValueError):
        return False


if __name__ == "__main__":
    if already_running():
        print(f"Dezheimer is already running. Opening {URL}")
        webbrowser.open(URL)
    else:
        print(f"Dezheimer is starting on {URL}")
        print("Keep this window open while you use the app. Close it to stop.")
        threading.Timer(1.5, webbrowser.open, [URL]).start()
        # reload: the server restarts by itself when its code changes.
        uvicorn.run(
            "server.app:app", host=HOST, port=PORT, log_level="warning",
            reload=True, reload_dirs=["server"],
        )
