// ==UserScript==
// @name         Canary Interceptor POC - Day 2
// @namespace    canary-poc
// @version      0.2
// @description  Day 2: prove we can intercept and block file uploads before the page sees them
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

  async function hashFile(file) {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function handleFileInputChange(e) {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'file') return;

    const file = target.files && target.files[0];
    if (!file) return;

    console.log(`${TAG} intercepted file:`, file.name, file.size, 'bytes, type:', file.type);

    // --- Day 1 goal: prove we can stop the page from ever seeing this file ---
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    // Clear the input so the host page's own state doesn't retain a reference
    try {
      target.value = '';
    } catch (err) {
      console.warn(`${TAG} could not clear input value:`, err);
    }

    const hash = await hashFile(file);
    console.log(`${TAG} SHA256:`, hash);

    alert(
      `Your actions have been logged. Your supervisor will soon contact you.\n\n` +
      `Blocked upload of: ${file.name}\n` +
      `SHA256: ${hash}`
    );
  }

  async function handleDrop(e) {
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const file = e.dataTransfer.files[0];
    console.log(`${TAG} intercepted drop:`, file.name, file.size, 'bytes, type:', file.type);

    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    const hash = await hashFile(file);
    console.log(`${TAG} SHA256:`, hash);

    alert(
      `Your actions have been logged. Your supervisor will soon contact you.\n\n` +
      `Blocked drag-and-drop upload of: ${file.name}\n` +
      `SHA256: ${hash}`
    );
  }

  // Capture phase (the `true` third arg) is critical for both listeners below:
  // we need to run BEFORE the site's own React/JS listeners get a chance to
  // read the file.
  document.addEventListener('change', handleFileInputChange, true);

  // dragover must be prevented so the drop handler actually fires, but do NOT
  // alert here: dragover fires continuously (many times/sec) while dragging,
  // and dataTransfer.files is often empty/inaccessible until the 'drop' event.
  document.addEventListener('dragover', (e) => {
    e.stopPropagation();
    e.preventDefault();
  }, true);

  document.addEventListener('drop', handleDrop, true);

  console.log(`${TAG} Day 1 interceptor loaded on ${location.hostname}`);
})();
