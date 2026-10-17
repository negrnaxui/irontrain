#!/usr/bin/env python3
"""Cross-platform local launcher for Iron Wastes. Game files are served unchanged."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial
import os
import socket
import sys
import webbrowser

ROOT = Path(__file__).resolve().parent
FIRST_PORT = 8765
LAST_PORT = 8775

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Keep the launcher window readable.
        pass

def main():
    os.chdir(ROOT)
    server = None
    for port in range(FIRST_PORT, LAST_PORT + 1):
        try:
            handler = partial(QuietHandler, directory=str(ROOT))
            server = ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue

    if server is None:
        print(f"ERROR: Ports {FIRST_PORT}-{LAST_PORT} are all busy.")
        input("Press Enter to close...")
        return 1

    url = f"http://127.0.0.1:{server.server_address[1]}/index.html"
    print("=" * 42)
    print("          IRON WASTES - START")
    print("=" * 42)
    print("\nLocal game server is running.")
    print(f"Opening: {url}")
    print("Keep this window open while playing.")
    print("To stop the game server, close this window or press Ctrl+C.\n")

    try:
        webbrowser.open(url)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local game server...")
    finally:
        server.server_close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
