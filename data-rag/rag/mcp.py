"""MCP server over stdio, so an assistant can search the books directly.

The transport is newline-delimited JSON-RPC 2.0 (the MCP stdio transport), which
means no dependencies and no extra install step. Two tools are exposed:

    search_books   passages with page-level citations, as JSON
    book_context   the same hits as a prompt-ready block with numbered sources

Run with `python -m rag mcp` and point the client at that command.
"""

from __future__ import annotations

import json
import sys

from .search import Retriever, build_context

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "persian-book-rag", "version": "0.2.0"}

_FILTER_SCHEMA = {
    "lang": {"type": "array", "items": {"type": "string"},
             "description": "زبان اسناد، مثل [\"fa\"] یا [\"ar\"] یا [\"fa\",\"mixed\"]"},
    "category": {"type": "array", "items": {"type": "string"}},
    "year_from": {"type": "integer"},
    "year_to": {"type": "integer"},
}

TOOLS = [
    {
        "name": "search_books",
        "description": ("Hybrid (vector + keyword) search over the indexed Persian/Arabic "
                        "books. Returns passages with page-level citations."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "پرسش یا عبارت جست‌وجو"},
                "k": {"type": "integer", "default": 8},
                **_FILTER_SCHEMA,
            },
            "required": ["query"],
        },
    },
    {
        "name": "book_context",
        "description": ("Same search, but returns a prompt-ready block of numbered sources "
                        "to answer a question strictly from the books."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "k": {"type": "integer", "default": 8},
                "max_chars": {"type": "integer", "default": 6000},
                **_FILTER_SCHEMA,
            },
            "required": ["query"],
        },
    },
]


def _filters(args: dict) -> dict:
    return {key: args[key] for key in _FILTER_SCHEMA if args.get(key) is not None}


def _text(payload) -> dict:
    body = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, indent=1)
    return {"content": [{"type": "text", "text": body}], "isError": False}


def _call_tool(retriever: Retriever, name: str, args: dict) -> dict:
    query = str(args.get("query") or "").strip()
    if not query:
        return {"content": [{"type": "text", "text": "query لازم است"}], "isError": True}
    k = int(args.get("k") or 8)
    result = retriever.search(query, k=k, filters=_filters(args))
    if name == "book_context":
        return _text(build_context(result, max_chars=int(args.get("max_chars") or 6000)))
    return _text({
        "query": query,
        "total_ms": result["total_ms"],
        "results": [
            {
                "rank": hit["rank"],
                "title": hit["title"],
                "citation": hit["source"],
                "lang": hit["lang"],
                "score": hit["score"],
                "text": hit["text"],
            }
            for hit in result["results"]
        ],
    })


def _handle(message: dict, retriever: Retriever) -> dict | None:
    method = message.get("method")
    msg_id = message.get("id")
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        }}
    if method in ("notifications/initialized", "notifications/cancelled"):
        return None
    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        if name not in {tool["name"] for tool in TOOLS}:
            return {"jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32602, "message": f"unknown tool: {name}"}}
        try:
            result = _call_tool(retriever, name, params.get("arguments") or {})
        except Exception as exc:  # noqa: BLE001 - report to the client, keep serving
            result = {"content": [{"type": "text", "text": str(exc)[:500]}], "isError": True}
        return {"jsonrpc": "2.0", "id": msg_id, "result": result}
    if msg_id is None:
        return None
    return {"jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32601, "message": f"unknown method: {method}"}}


def serve_mcp(root: str = "data") -> int:
    retriever = Retriever(root=root)
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            out.write(json.dumps({"jsonrpc": "2.0", "id": None,
                                  "error": {"code": -32700, "message": "parse error"}}) + "\n")
            out.flush()
            continue
        response = _handle(message, retriever)
        if response is not None:
            out.write(json.dumps(response, ensure_ascii=False) + "\n")
            out.flush()
    return 0
