/**
 * content.js — Ecolyze content script entry point.
 *
 * Responsibilities:
 *   1. Wait for eBay product DOM readiness
 *   2. Extract product data
 *   3. Mount the overlay UI
 *   4. Watch for SPA-style navigation and re-initialize
 *
 * Loaded after extractor.js and overlay.js per manifest order.
 */

(function () {
  'use strict';

  /* ─── Config ─── */

  const CONFIG = {
    maxWaitMs:      4000,
    pollIntervalMs: 200,
    debug:          true,
  };

  /* ─── Logger ─── */

  function log(...args) {
    if (CONFIG.debug) {
      console.log('%c[Ecolyze]', 'color:#16a34a;font-weight:bold', ...args);
    }
  }

  /* ─── DOM readiness ─── */

  const TITLE_SELECTORS = [
    'h1.x-item-title__mainTitle',
    'h1#itemTitle',
    'h1[itemprop="name"]',
  ];

  function isTitleReady() {
    return TITLE_SELECTORS.some(
      (s) => document.querySelector(s)?.textContent?.trim()
    );
  }

  function waitForProductDOM() {
    return new Promise((resolve) => {
      if (isTitleReady()) return resolve(true);

      let elapsed = 0;
      const id = setInterval(() => {
        elapsed += CONFIG.pollIntervalMs;
        if (isTitleReady()) { clearInterval(id); resolve(true); }
        else if (elapsed >= CONFIG.maxWaitMs) { clearInterval(id); resolve(false); }
      }, CONFIG.pollIntervalMs);
    });
  }

  /* ─── Lifecycle ─── */

  let _lastUrl = location.href;
  let _running = false;

  async function init() {
    if (_running) return;
    _running = true;
    _lastUrl = location.href;

    log('Initializing on', _lastUrl);

    const ready = await waitForProductDOM();
    if (!ready) {
      log('Timed out waiting for product DOM.');
      _running = false;
      return;
    }

    const product = Ecolyze.extractProductData();
    log('Product data:', product);

    Ecolyze.renderOverlay(product);
    log('UI mounted.');

    _running = false;

    // (Future) API integration hook:
    // Ecolyze.fetchScore(product).then(Ecolyze.updateOverlay);
  }

  /* ─── SPA navigation watcher ─── */

  function onUrlChange() {
    if (location.href !== _lastUrl) {
      log('URL changed:', _lastUrl, '→', location.href);
      Ecolyze.removeOverlay();
      init();
    }
  }

  // Catch pushState / replaceState (eBay sometimes does SPA nav)
  const _pushState = history.pushState;
  history.pushState = function () {
    _pushState.apply(this, arguments);
    onUrlChange();
  };

  const _replaceState = history.replaceState;
  history.replaceState = function () {
    _replaceState.apply(this, arguments);
    onUrlChange();
  };

  window.addEventListener('popstate', onUrlChange);

  /* ─── Boot ─── */

  init();
})();
