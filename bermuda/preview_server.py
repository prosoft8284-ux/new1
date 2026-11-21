"""Static preview server for bermuda/survival on port 3002.

Serves the game folder, maps "/" to index.html and disables caching so edits
show up immediately in the preview panel.
"""
import os
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "survival")
PORT = 3002


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


Handler.extensions_map.update({".js": "text/javascript", ".json": "application/json"})
handler = functools.partial(Handler, directory=ROOT)

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), handler).serve_forever()
