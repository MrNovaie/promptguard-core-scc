# PromptGuard

PromptGuard is a proof-of-concept browser defense that blocks sensitive files from being uploaded to AI chat platforms by checking a file's SHA-256 hash against a local list of registered "canary" files.

The project is built around three pieces:

- a local SQLite-backed backend that stores known canary hashes,
- a browser userscript that intercepts file uploads and drag-and-drop events,
- a helper script that registers files as canaries before they are uploaded.

This is meant to be a low-friction, local-first prototype for preventing known restricted files from reaching AI tools such as ChatGPT, Claude, and Gemini.

## Project overview

The workflow is intentionally simple:

1. A file is registered with the local backend using its SHA-256 hash.
2. The browser userscript runs on supported AI chat websites.
3. When a user selects or drops a file, the script computes the file hash.
4. It calls the local backend to see whether that hash matches a registered canary.
5. If it matches, the upload is blocked; otherwise it is released to the site normally.

The script is designed to fail closed: if the backend is unreachable, it blocks the upload rather than allowing it through.

## Repository structure

- `canary-server.py` — local HTTP server and SQLite database service.
- `canary-interceptor.user.js` — Tampermonkey userscript that intercepts file uploads.
- `register_hash.py` — command-line helper to register files as canaries.
- `canary.db` — SQLite database storing hash metadata.
- `materials/` — supporting project materials and presentation assets.

## How the server works

`canary-server.py` starts a local HTTP server on `http://127.0.0.1:5000` and keeps a SQLite database at `canary.db`.

It exposes the following API endpoints:

- `GET /check/<hash>`
  - returns whether the hash matches a registered canary
  - response example: `{"match": true, "filename": "secret.pdf", "added_at": "..."}`

- `GET /list`
  - returns the list of all registered canaries

- `POST /register`
  - accepts JSON like `{"hash": "...", "filename": "..."}`
  - stores the hash and timestamp in the database

The database schema is minimal:

- `hash` (primary key)
- `filename`
- `added_at`

## How the interceptor works

The Tampermonkey script in `canary-interceptor.user.js` attaches to `change` and `drop` events on supported AI chat domains.

When a file is selected or dropped:

- the script reads the file as an `ArrayBuffer`,
- computes the SHA-256 hash using `crypto.subtle.digest`,
- sends a request to the local backend,
- checks whether the hash is in the canary database,
- blocks the upload if it is, or releases it if it is not.

The script uses `preventDefault()` and re-injects the file into the form field or drop target so the site behaves normally after the interception decision.

## How to register a file

The repo includes `register_hash.py`, which calculates the SHA-256 hash of a file and POSTs it to the backend.

Example:

```bash
python register_hash.py "C:\Users\YourName\Documents\sensitive.pdf"
```

If the backend is not running, the script will print an error explaining that it could not reach `http://127.0.0.1:5000`.

## Quick start

### 1. Start the backend

```bash
python canary-server.py
```

This will create or initialize the database and begin listening locally on port 5000.

### 2. Register a canary file

```bash
python register_hash.py "C:\path\to\protected.pdf"
```

### 3. Install the userscript

Open the userscript in a browser manager such as Tampermonkey and install it.

The script is currently configured to match:

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

### 4. Use the AI site normally

When a registered file is uploaded, the script blocks it and shows an alert explaining that the file was matched and blocked.

## Example API interactions

Check if a hash is known:

```bash
curl http://127.0.0.1:5000/check/<sha256>
```

List all registered canaries:

```bash
curl http://127.0.0.1:5000/list
```

## Security considerations

This is a deliberately local-only prototype and should be treated as a research or defensive demonstration rather than a production security control.

Important notes:

- the backend is not protected by authentication,
- it runs only on localhost,
- the interceptor is browser-side and depends on the user having the Tampermonkey script installed,
- the system relies on exact file hash matching, which is effective for known files but not for transformed or modified copies.

## Notes for extension

This project could be expanded by adding:

- a web UI for managing canaries,
- automated registration from a policy list,
- broader browser coverage and more upload interception points,
- support for duplicate or near-duplicate detection,
- stronger logging and monitoring for blocked file attempts.
