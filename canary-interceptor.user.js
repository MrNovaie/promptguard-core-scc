// ==UserScript==
// @name         Canary Interceptor POC - Day 2
// @namespace    canary-poc
// @version      0.3
// @description  Day 2: only block uploads whose SHA-256 matches a registered canary; let everything else through
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[canary-poc]';
  const BACKEND = 'http://127.0.0.1:5000';

  async function hashFile(file) {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function checkCanary(hash) {
    try {
      const res = await fetch(`${BACKEND}/check/${hash}`);
      if (!res.ok) throw new Error(`backend returned ${res.status}`);
      return await res.json(); // { match: bool, filename?, added_at? }
    } catch (err) {
      // Design choice: fail CLOSED (block) if the local backend can't be
      // reached, rather than silently letting uploads through. Flip this
      // to { match: false } if you'd rather fail open.
      console.error(`${TAG} backend unreachable, failing closed:`, err);
      return { match: true, filename: '(backend unreachable)' };
    }
  }

  // Re-inject a file into an <input type=file> and replay the change event
  // so the host page picks it up normally. isTrusted will be false on this
  // synthetic event — our handlers check that flag to avoid re-intercepting
  // their own replay and looping forever.
  function releaseFile(target, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    target.files = dt.files;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function releaseDrop(originalEvent, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });
    originalEvent.target.dispatchEvent(dropEvent);
  }

  async function handleFileInputChange(e) {
    if (!e.isTrusted) return; // this is our own replayed event — ignore it

    const target = e.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'file') return;

    const file = target.files && target.files[0];
    if (!file) return;

    // Always intercept first: we can't know if it's a canary until the
    // async hash + backend check finishes, and preventDefault() only works
    // if called synchronously within this handler.
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    const hash = await hashFile(file);
    const result = await checkCanary(hash);

    if (result.match) {
      target.value = '';
      console.warn(`${TAG} BLOCKED canary file:`, file.name, hash);
      alert(
        `Your actions have been logged. Your supervisor will soon contact you.\n\n` +
        `Blocked upload of: ${file.name}\n` +
        `SHA256: ${hash}`
      );
    } else {
      console.log(`${TAG} not a canary, releasing:`, file.name, hash);
      releaseFile(target, file);
    }
  }

  async function handleDrop(e) {
    if (!e.isTrusted) return;
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const file = e.dataTransfer.files[0];

    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    const hash = await hashFile(file);
    const result = await checkCanary(hash);

    if (result.match) {
      console.warn(`${TAG} BLOCKED canary drop:`, file.name, hash);
      alert(
        `Your actions have been logged. Your supervisor will soon contact you.\n\n` +
        `Blocked drag-and-drop upload of: ${file.name}\n` +
        `SHA256: ${hash}`
      );
    } else {
      console.log(`${TAG} not a canary, releasing drop:`, file.name, hash);
      releaseDrop(e, file);
    }
  }

  document.addEventListener('change', handleFileInputChange, true);

  document.addEventListener('dragover', (e) => {
    e.stopPropagation();
    e.preventDefault();
  }, true);

  document.addEventListener('drop', handleDrop, true);

  console.log(`${TAG} Day 2 interceptor loaded on ${location.hostname} (backend: ${BACKEND})`);
})();
