"""Small local HTTP API so another program or an assistant can query the index.

Deliberately stdlib-only (`http.server`): the whole pipeline is free and offline,
and adding a web framework here would buy nothing. Bind to loopback by default;
this exposes your books, so think before passing `--host 0.0.0.0`.

    POST /search   {"query": "...", "k": 8, "filters": {"lang": ["fa"]}}
    POST /context  same input, returns a prompt-ready block with numbered sources
    GET  /stats    corpus and index statistics
    GET  /health   liveness probe
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from .search import Retriever, build_context


def _make_handler(retriever: Retriever):
    class Handler(BaseHTTPRequestHandler):
        server_version = "bookrag/0.2"

        def log_message(self, fmt: str, *args) -> None:  # keep the console readable
            print(f"[serve] {self.address_string()} {fmt % args}", flush=True)

        def _send(self, payload, status: int = 200) -> None:
            body = (payload if isinstance(payload, str)
                    else json.dumps(payload, ensure_ascii=False)).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            path = urlparse(self.path).path
            if path in ("/", "/health"):
                self._send({"ok": True, "chunks": retriever.table.count_rows()})
            elif path == "/stats":
                self._send(retriever.stats())
            else:
                self._send({"error": "not found"}, 404)

        def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length") or 0)
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                self._send({"error": "invalid json"}, 400)
                return
            query = str(payload.get("query") or payload.get("q") or "").strip()
            if not query:
                self._send({"error": "query required"}, 400)
                return
            if path not in ("/search", "/context"):
                self._send({"error": "not found"}, 404)
                return
            result = retriever.search(query, k=int(payload.get("k") or 8),
                                      filters=payload.get("filters") or {})
            if path == "/context":
                self._send({"query": query, "context": build_context(result),
                            "results": result["results"], "total_ms": result["total_ms"]})
            else:
                self._send(result)

    return Handler


def serve(root: str = "data", host: str = "127.0.0.1", port: int = 8765) -> None:
    retriever = Retriever(root=root)
    httpd = ThreadingHTTPServer((host, port), _make_handler(retriever))
    print(f"[serve] http://{host}:{port}  GET /health /stats  POST /search /context", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
