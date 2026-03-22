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
    maxWaitMs: 4000,
    pollIntervalMs: 200,
    debug: true,
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
  let _cachedProductData = null;
  let _cachedUrl = null;

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

    // Cache the extracted data for message-driven retrieval
    _cachedProductData = product;
    _cachedUrl = location.href;

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
      _cachedProductData = null;
      _cachedUrl = null;
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

  /* ─── Message-driven extraction ─── */

  const MSG_TIMEOUT_MS = 5000;

  /**
   * Wait for a product title to appear in the DOM, with an independent
   * timeout that does NOT alter the existing boot-time `maxWaitMs`.
   */
  function waitForProductDOMWithTimeout(timeoutMs) {
    return new Promise((resolve) => {
      if (isTitleReady()) return resolve(true);

      let elapsed = 0;
      const id = setInterval(() => {
        elapsed += CONFIG.pollIntervalMs;
        if (isTitleReady()) { clearInterval(id); resolve(true); }
        else if (elapsed >= timeoutMs) { clearInterval(id); resolve(false); }
      }, CONFIG.pollIntervalMs);
    });
  }

  /**
   * Extract product data, cache it, and return a structured response.
   */
  function extractAndCache() {
    try {
      if (typeof Ecolyze?.extractProductData !== 'function') {
        throw new Error('Ecolyze.extractProductData is not available');
      }

      const product = Ecolyze.extractProductData();
      _cachedProductData = product;
      _cachedUrl = location.href;

      return {
        success: true,
        data: {
          url: location.href,
          title: product.title || null,
          extractedAt: new Date().toISOString(),
          product,
        },
      };
    } catch (err) {
      log('Extraction error:', err);
      return {
        success: false,
        error: 'Failed to extract product data',
        technicalDetails: err.message,
      };
    }
  }

  /**
   * Ensure the DOM is ready and then extract. Returns a response envelope.
   */
  async function waitAndExtract() {
    const ready = await waitForProductDOMWithTimeout(MSG_TIMEOUT_MS);
    if (!ready) {
      log('Message handler: DOM readiness timed out.');
      return {
        success: false,
        error: 'Page load timeout',
        technicalDetails: `Product DOM not ready within ${MSG_TIMEOUT_MS} ms`,
      };
    }
    return extractAndCache();
  }

  // --- Helper: Wait specifically for the Amazon Title to appear ---
  async function waitForAmazonTitle(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      const title = document.querySelector('#productTitle');
      if (title && title.textContent.trim().length > 0) {
        return true; // Title is finally in the DOM!
      }
      console.log(`[Ecolyze] Waiting for Amazon Title... attempt ${i + 1}`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
    }
    return false; // Timed out
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PRODUCT_DATA' || message?.type === 'REFRESH_PRODUCT_DATA') {

      // 1. Handle Cache (Only for GET_PRODUCT_DATA)
      if (message.type === 'GET_PRODUCT_DATA' && _cachedProductData && _cachedUrl === location.href) {
        sendResponse({
          success: true,
          data: { product: _cachedProductData, extractedAt: new Date().toISOString() }
        });
        return false;
      }

      // 2. Clear cache if refreshing
      if (message.type === 'REFRESH_PRODUCT_DATA') {
        _cachedProductData = null;
        _cachedUrl = null;
      }

      // 3. Start the "Smart Extraction"
      waitForAmazonTitle().then((found) => {
        if (!found) {
          sendResponse({ success: false, error: "Amazon page took too long to load details." });
          return;
        }

        try {
          const data = Ecolyze.extractProductData(); // Your new Amazon-specific extractor
          _cachedProductData = data;
          _cachedUrl = location.href;

          sendResponse({
            success: true,
            data: {
              url: location.href,
              product: data,
              extractedAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          sendResponse({ success: false, error: "Extraction error: " + err.message });
        }
      });

      return true; // Crucial: Keeps the message channel open for the async .then()
    }

    return false;
  });

  /* ─── Boot ─── */

  init();
})();
