#!/usr/bin/env python3
"""
Register one or more files as "canaries". The Tampermonkey script will
then block any attempt to upload a file with a matching SHA-256 hash to
ChatGPT, Claude, or Gemini.

Usage:
    python3 register_hash.py /path/to/file1 /path/to/file2 ...

Requires canary_server.py to already be running (default:
http://127.0.0.1:5000).
"""

import hashlib
import json
import sys
import urllib.request

BACKEND = "http://127.0.0.1:5000"


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def register(path):
    file_hash = sha256_of(path)
    payload = json.dumps({"hash": file_hash, "filename": path}).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND}/register",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    print(f"{path}\n  sha256: {file_hash}\n  -> {result}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 register_hash.py <file> [file2 ...]")
        sys.exit(1)
    for path in sys.argv[1:]:
        try:
            register(path)
        except urllib.error.URLError as e:
            print(f"Could not reach backend at {BACKEND} — is canary_server.py running?\n{e}")
            sys.exit(1)
