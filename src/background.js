/**
 * background.js — Ecolyze Manifest V3 Service Worker.
 *
 * Responsibilities:
 *   1. Listen for "ANALYZE_PRODUCT" messages from the popup
 *   2. Request product data from the content script on the active tab
 *   3. Forward the data to the LLM via api.js
 *   4. Return the eco-score analysis to the popup
 */

import { analyzeProduct } from './api.js';

/* ─── Config ─── */

const SERPAPI_KEY = 'afc61564d200c81a4e7fdb2eb518c1ba8d420d97977eafd1c6cbdf1d7538e999';

/* ─── Message Listener ─── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'ANALYZE_PRODUCT') {
    handleAnalysis(message)
      .then(sendResponse)
      .catch((err) => {
        console.error('[Ecolyze BG] Uncaught error:', err);
        sendResponse({
          success: false,
          error: 'Coach is taking a water break. Try again!',
          technicalDetails: err.message,
          analysis: null,
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (message?.action === 'FETCH_ALTERNATIVE_PRODUCT') {
    fetchAlternativeProduct(message.productName)
      .then(sendResponse)
      .catch((err) => {
        console.error('[Ecolyze BG] Error fetching alternative:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open
  }

  return false;
});

/* ─── SerpApi Fetcher ─── */

async function fetchAlternativeProduct(productName) {
  if (!productName) throw new Error('No product name provided');

  const encodedName = encodeURIComponent(productName);
  const url = `https://serpapi.com/search.json?engine=amazon&k=${encodedName}&amazon_domain=amazon.com&api_key=${SERPAPI_KEY}`;

  console.log('[Ecolyze BG] Fetching alternative strictly from SerpApi for:', productName);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi responded with status ${res.status}`);

  const data = await res.json();
  console.log('[Ecolyze BG] SerpApi Response Data:', data);
  const results = data.organic_results;

  if (!results || results.length === 0) {
    throw new Error('No shopping results found');
  }

  // Extract the first item from the shopping_results array
  const firstItem = results[0];

  return {
    success: true,
    product: {
      title: firstItem.title,
      price: firstItem.price,
      link: firstItem.link_clean,
      thumbnail: firstItem.thumbnail
    }
  };
}

/* ─── Orchestration ─── */

/**
 * Full pipeline: get product data → call LLM → return result.
 *
 * @param {Object} message – The incoming message, may contain `tabId`
 *   or pre-supplied `productData`.
 */
async function handleAnalysis(message) {
  // If the popup already sends the product data, use it directly.
  if (message.productData) {
    console.log('[Ecolyze BG] Using pre-supplied product data.');
    return analyzeProduct(message.productData);
  }

  // Otherwise, request it from the content script on the active tab.
  const tab = await getActiveTab();
  if (!tab) {
    return {
      success: false,
      error: 'No active tab found.',
      technicalDetails: 'chrome.tabs.query returned no active tab',
      analysis: null,
    };
  }

  console.log('[Ecolyze BG] Requesting product data from tab', tab.id);

  const extraction = await chrome.tabs.sendMessage(tab.id, {
    type: 'GET_PRODUCT_DATA',
  });

  if (!extraction?.success) {
    return {
      success: false,
      error: extraction?.error || 'Could not extract product data.',
      technicalDetails: extraction?.technicalDetails || 'Content script returned failure',
      analysis: null,
    };
  }

  console.log('[Ecolyze BG] Product data received. Calling LLM…');
  return analyzeProduct(extraction.data.product);
}

/* ─── Helpers ─── */

/**
 * Get the currently active tab in the focused window.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}
