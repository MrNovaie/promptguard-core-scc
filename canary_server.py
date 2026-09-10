#!/usr/bin/env python3
"""
Canary Interceptor — local backend.

Serves a tiny local HTTP API (stdlib only, no pip installs needed) backed
by SQLite. The Tampermonkey script queries this to check whether a file's
SHA-256 hash is a registered "canary" — a file that should never be
uploaded to an AI chat tool.

Run:
    python3 canary_server.py

Listens on http://127.0.0.1:5000 by default. Leave this running in a
terminal while you browse.

Endpoints:
    GET  /check/<hash>   -> {"match": bool, "filename": str, "added_at": str}
    GET  /list            -> {"entries": [...]}
    POST /register         body: {"hash": "...", "filename": "..."}
"""

import json
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

DB_PATH = Path(__file__).parent / "canary.db"
HOST = "127.0.0.1"
PORT = 5000


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS hashes (
            hash TEXT PRIMARY KEY,
            filename TEXT,
            added_at TEXT
        )
        """
    )
    return conn


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        # Harmless if unused (GM_xmlhttpRequest ignores CORS), but keeps the
        # door open if you ever switch the userscript to plain fetch().
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]

        if len(parts) == 2 and parts[0] == "check":
            file_hash = parts[1].lower()
            conn = get_db()
            row = conn.execute(
                "SELECT filename, added_at FROM hashes WHERE hash = ?",
                (file_hash,),
            ).fetchone()
            conn.close()
            if row:
                self._send_json(
                    200, {"match": True, "filename": row[0], "added_at": row[1]}
                )
            else:
                self._send_json(200, {"match": False})
            return

        if parts == ["list"]:
            conn = get_db()
            rows = conn.execute(
                "SELECT hash, filename, added_at FROM hashes ORDER BY added_at DESC"
            ).fetchall()
            conn.close()
            self._send_json(
                200,
                {
                    "entries": [
                        {"hash": r[0], "filename": r[1], "added_at": r[2]}
                        for r in rows
                    ]
                },
            )
            return

        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if [p for p in parsed.path.split("/") if p] != ["register"]:
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw)
            file_hash = data["hash"].lower()
            filename = data.get("filename", "")
        except (json.JSONDecodeError, KeyError, AttributeError):
            self._send_json(400, {"error": "expected JSON {hash, filename}"})
            return

        conn = get_db()
        conn.execute(
            "INSERT OR REPLACE INTO hashes (hash, filename, added_at) VALUES (?, ?, ?)",
            (file_hash, filename, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        conn.close()
        self._send_json(201, {"status": "registered", "hash": file_hash})

    def log_message(self, fmt, *args):
        print(f"[canary-server] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    get_db().close()  # ensure table exists before we start serving
    print(f"Canary server listening on http://{HOST}:{PORT}")
    print(f"DB file: {DB_PATH}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
