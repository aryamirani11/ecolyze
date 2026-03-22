/**
 * extractor.js — Deep-scrape product data extraction for Amazon product pages.
 *
 * Exports a global `Ecolyze.extractProductData()` function that returns
 * a richly-structured product object optimized for LLM sustainability analysis.
 */

// eslint-disable-next-line no-var
var Ecolyze = window.Ecolyze || {};

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                           */
  /* ------------------------------------------------------------------ */

  function textFromSelectors(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.replace(/\s+/g, ' ').trim(); // Amazon has lots of hidden whitespace
      }
    }
    return null;
  }

  function imgSrcFromSelectors(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Amazon often hides high-res images in data attributes
        return el.dataset.oldHires || el.getAttribute('data-a-dynamic-image') || el.src || null;
      }
    }
    return null;
  }

  function attrFromSelectors(selectors, attr) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const val = el?.getAttribute(attr);
      if (val && val.trim()) {
        return val.trim();
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Field extractors                                                  */
  /* ------------------------------------------------------------------ */

  function extractTitle() {
    return textFromSelectors([
      '#productTitle',
      'span#productTitle',
      'h1.a-size-large'
    ]) || document.title;
  }

  function extractPrice() {
    return textFromSelectors([
      '#corePrice_feature_div .a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price .a-offscreen'
    ]);
  }

  /**
   * Extract Amazon's "About this item" bullet points.
   */
  function extractDescription() {
    const bullets = document.querySelectorAll('#feature-bullets li span.a-list-item');
    if (bullets.length) {
      return Array.from(bullets)
        .map(b => b.textContent.trim())
        .filter(text => text.length > 0)
        .join(' | ');
    }

    // Fallback to meta description
    return attrFromSelectors([
      'meta[name="description"]',
    ], 'content');
  }

  /**
   * Extract Amazon's Product Details or Technical Details table.
   */
  function extractItemSpecifics() {
    const specifics = {};

    // Strategy 1: The standard product details table
    const tableRows = document.querySelectorAll('#productDetails_techSpec_section_1 tr, .prodDetTable tr');
    tableRows.forEach(row => {
      const keyEl = row.querySelector('th');
      const valEl = row.querySelector('td');
      if (keyEl && valEl) {
        // Remove invisible characters Amazon loves to use
        const key = keyEl.textContent.replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
        const val = valEl.textContent.replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
        if (key && val) specifics[key] = val;
      }
    });

    // Strategy 2: The Detail Bullets list (often used for clothing/books)
    const detailBullets = document.querySelectorAll('#detailBullets_feature_div li span.a-list-item');
    detailBullets.forEach(bullet => {
      const parts = bullet.textContent.split(':');
      if (parts.length >= 2) {
        const key = parts[0].replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
        const val = parts.slice(1).join(':').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
        if (key && val) specifics[key] = val;
      }
    });

    // Strategy 3: "Product Overview" table at the top of some pages
    const overviewRows = document.querySelectorAll('#productOverview_feature_div tr.a-spacing-small');
    overviewRows.forEach(row => {
      const keyEl = row.querySelector('td.a-span3 span');
      const valEl = row.querySelector('td.a-span9 span');
      if (keyEl && valEl) {
        specifics[keyEl.textContent.trim()] = valEl.textContent.trim();
      }
    });

    return Object.keys(specifics).length ? specifics : null;
  }

  function extractBrand(itemSpecifics) {
    // Try byline first ("Brand: Nike" or "Visit the Nike Store")
    let brand = textFromSelectors(['#bylineInfo']);
    if (brand) {
      return brand.replace('Brand:', '').replace('Visit the ', '').replace(' Store', '').trim();
    }

    // Fallback to item specifics
    if (itemSpecifics) {
      return itemSpecifics['Brand'] || itemSpecifics['Brand Name'] || null;
    }
    return null;
  }

  const MATERIAL_KEYWORDS = ['material', 'fabric', 'composition', 'lining', 'material composition'];

  function extractMaterialsRaw(itemSpecifics) {
    if (!itemSpecifics) return null;

    const hits = [];
    for (const [key, val] of Object.entries(itemSpecifics)) {
      const lower = key.toLowerCase();
      if (MATERIAL_KEYWORDS.some((kw) => lower.includes(kw))) {
        hits.push(val);
      }
    }
    return hits.length ? hits.join(', ') : null;
  }

  function extractSellerInfo() {
    const seller = textFromSelectors([
      '#merchant-info a',
      '#sellerProfileTriggerId',
      '#tabular-buybox-truncate-1 .tabular-buybox-text'
    ]);
    // Amazon doesn't display feedback % as easily as eBay, so we leave it null
    return seller ? { username: seller, feedbackPercentage: null } : null;
  }

  /**
   * Amazon doesn't use iframes for descriptions, but they have the A+ content
   * or main product description block. We kept the function name `extractIframeDescription`
   * so your background/API scripts don't break.
   */
  function extractIframeDescription() {
    return textFromSelectors([
      '#productDescription p',
      '#aplus p'
    ]);
  }

  function extractImageUrl() {
    let img = imgSrcFromSelectors(['#landingImage', '#imgBlkFront']);
    // Amazon stores multiple resolutions in a JSON string inside data-a-dynamic-image
    if (img && img.startsWith('{')) {
      try {
        const urls = JSON.parse(img);
        return Object.keys(urls)[0]; // Grab the first (usually highest res) URL
      } catch (e) {
        return null;
      }
    }
    return img;
  }

  function extractCategory() {
    const crumbs = document.querySelectorAll('#wayfinding-breadcrumbs_feature_div li span.a-list-item a');
    if (crumbs.length) {
      return Array.from(crumbs)
        .map((s) => s.textContent.trim())
        .filter(Boolean)
        .join(' > ');
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                        */
  /* ------------------------------------------------------------------ */

  Ecolyze.extractProductData = function extractProductData() {
    const itemSpecifics = extractItemSpecifics();

    return {
      title: extractTitle(),
      price: extractPrice(),
      description: extractDescription(),
      itemSpecifics,
      brand: extractBrand(itemSpecifics),
      materialsRaw: extractMaterialsRaw(itemSpecifics),
      imageUrl: extractImageUrl(),
      category: extractCategory(),
      seller: extractSellerInfo(),
      iframeDescription: extractIframeDescription(), // Re-used for Amazon's long-form description
      url: window.location.href,
    };
  };

  window.Ecolyze = Ecolyze;
})();