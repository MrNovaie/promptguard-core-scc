// ==UserScript==
// @name         Canary Interceptor POC - Day 2
// @namespace    canary-poc
// @version      0.2
// @description  Block uploads of files whose SHA-256 hash matches a local canary database
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[canary-poc]';
  const BACKEND = 'http://127.0.0.1:5000';
  // If the local backend is unreachable, do we allow the upload (fail open)
  // or block it (fail closed)? Fail-open is friendlier for a dev POC —
  // flip to false once you trust the setup and want a hard stop instead.
  const FAIL_OPEN = true;

  async function hashFile(file) {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function checkHash(hash) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${BACKEND}/check/${hash}`,
        timeout: 3000,
        onload: (res) => {
          try {
            resolve(JSON.parse(res.responseText));
          } catch (err) {
            console.warn(`${TAG} malformed response from backend`, err);
            resolve({ match: false, error: true });
          }
        },
        onerror: () => {
          console.warn(`${TAG} backend unreachable — is canary_server.py running?`);
          resolve({ match: !FAIL_OPEN, error: true });
        },
        ontimeout: () => resolve({ match: !FAIL_OPEN, error: true }),
      });
    });
  }

  async function evaluate(file) {
    const hash = await hashFile(file);
    const result = await checkHash(hash);
    console.log(`${TAG} ${file.name} -> ${hash} -> match=${result.match}`);
    return result;
  }

  // ---------- file input (click-to-upload) ----------

  async function handleFileInputChange(e) {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'file') return;

    if (target.dataset.canaryPassed === 'true') {
      // This is our own re-dispatched, already-vetted event — let it through.
      delete target.dataset.canaryPassed;
      return;
    }

    const file = target.files && target.files[0];
    if (!file) return;

    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    const { match, filename } = await evaluate(file);

    if (match) {
      try { target.value = ''; } catch (err) { /* some inputs are unclearable, ignore */ }
      alert(`[Canary] Blocked upload: "${file.name}" matches registered canary${filename ? ` "${filename}"` : ''}.`);
      return;
    }

    // No match: mark vetted and re-fire the event so the site's own
    // handler (React, etc.) still receives it normally.
    target.dataset.canaryPassed = 'true';
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- drag & drop ----------

  async function handleDrop(e) {
    if (e.__canaryPassed) return; // our own re-dispatch, already vetted

    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    const file = dt.files[0];
    const { match, filename } = await evaluate(file);

    if (match) {
      alert(`[Canary] Blocked drag-and-drop upload: "${file.name}" matches registered canary${filename ? ` "${filename}"` : ''}.`);
      return;
    }

    // Re-dispatch a synthetic drop carrying the same file(s) so the site's
    // drop-zone still receives it. This is more fragile than the file-input
    // path above — some sites gate drop handling on other dragenter/dragover
    // state — so treat it as a starting point, not a guarantee.
    const clone = new DataTransfer();
    for (const f of dt.files) clone.items.add(f);
    const redrop = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(redrop, 'dataTransfer', { value: clone });
    redrop.__canaryPassed = true;
    e.target.dispatchEvent(redrop);
  }

  document.addEventListener('change', handleFileInputChange, true);
  document.addEventListener('dragover', (e) => e.preventDefault(), true);
  document.addEventListener('drop', handleDrop, true);

  console.log(`${TAG} Day 2 interceptor loaded on ${location.hostname} (backend: ${BACKEND})`);
})();
