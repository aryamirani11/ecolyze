/**
 * extractor.js — DOM-based product data extraction for eBay product pages.
 *
 * Exports a global `Ecolyze.extractProductData()` function that returns
 * a structured product object.  Selectors include fallbacks so extraction
 * degrades gracefully when eBay tweaks its markup.
 */

// eslint-disable-next-line no-var
var Ecolyze = window.Ecolyze || {};

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Try a list of CSS selectors and return the trimmed textContent of the
   * first element that matches, or `null`.
   */
  function textFromSelectors(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return null;
  }

  /**
   * Try a list of CSS selectors and return the `src` (or `data-src`) of the
   * first <img> that matches, or `null`.
   */
  function imgSrcFromSelectors(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        return el.src || el.dataset.src || el.getAttribute('src') || null;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Field extractors                                                   */
  /* ------------------------------------------------------------------ */

  function extractTitle() {
    return textFromSelectors([
      'h1.x-item-title__mainTitle span.ux-textspans--BOLD',
      'h1.x-item-title__mainTitle',
      'h1#itemTitle',
      'h1[itemprop="name"]',
      'h1.product-title',
    ]);
  }

  function extractPrice() {
    return textFromSelectors([
      'div.x-price-primary span.ux-textspans',
      'span[itemprop="price"]',
      '#prcIsum',
      '#mm-saleDscPrc',
      '.x-price-primary',
    ]);
  }

  function extractDescription() {
    // eBay often loads the description inside an iframe, so we try the
    // visible "item specifics" / condition / subtitle text first.
    const parts = [];

    const subtitle = textFromSelectors([
      '.x-item-title__subtitle',
      '#vi-subtitle',
    ]);
    if (subtitle) parts.push(subtitle);

    const condition = textFromSelectors([
      '.x-item-condition-text span.ux-textspans',
      '#vi-itm-cond',
      '.condText',
    ]);
    if (condition) parts.push(`Condition: ${condition}`);

    // Item specifics (key-value pairs)
    const specRows = document.querySelectorAll(
      '.x-about-this-item .ux-labels-values__labels-content, ' +
      '.x-about-this-item .ux-labels-values__values-content'
    );

    if (specRows.length >= 2) {
      const labels = document.querySelectorAll(
        '.x-about-this-item .ux-labels-values__labels-content'
      );
      const values = document.querySelectorAll(
        '.x-about-this-item .ux-labels-values__values-content'
      );

      const count = Math.min(labels.length, values.length, 8); // cap at 8
      for (let i = 0; i < count; i++) {
        const lbl = labels[i]?.textContent?.trim();
        const val = values[i]?.textContent?.trim();
        if (lbl && val) parts.push(`${lbl}: ${val}`);
      }
    }

    return parts.length ? parts.join(' | ') : null;
  }

  function extractImageUrl() {
    return imgSrcFromSelectors([
      '.ux-image-carousel-item.active img',
      '.ux-image-carousel-item img',
      '#icImg',
      'img[itemprop="image"]',
      '.img.img500',
    ]);
  }

  function extractCategory() {
    const crumbs = document.querySelectorAll(
      'nav.breadcrumbs a span, .seo-breadcrumbs a span'
    );
    if (crumbs.length) {
      return Array.from(crumbs)
        .map((s) => s.textContent.trim())
        .filter(Boolean)
        .join(' > ');
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Extract all available product data from the current eBay product page.
   * @returns {{ title: string|null, price: string|null, description: string|null,
   *             imageUrl: string|null, category: string|null, url: string }}
   */
  Ecolyze.extractProductData = function extractProductData() {
    return {
      title: extractTitle(),
      price: extractPrice(),
      description: extractDescription(),
      imageUrl: extractImageUrl(),
      category: extractCategory(),
      url: window.location.href,
    };
  };

  window.Ecolyze = Ecolyze;
})();
