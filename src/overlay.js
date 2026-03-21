/**
 * overlay.js — Production-quality dual-state UI system for Ecolyze.
 *
 * Architecture:
 *   ┌─────────────┐      ┌──────────────┐       ┌──────────────┐
 *   │  Data Layer  │─────▶│  Renderer    │──────▶│  DOM         │
 *   │  (state obj) │      │  (builders)  │       │  (injected)  │
 *   └─────────────┘      └──────────────┘       └──────────────┘
 *
 * States:
 *   MINIMIZED — compact circular launcher on the right edge
 *   EXPANDED  — side panel with sustainability information
 *
 * Public API:
 *   Ecolyze.renderOverlay(productData)   — mount the UI
 *   Ecolyze.removeOverlay()              — unmount entirely
 *   Ecolyze.updateOverlay(data)          — patch sections with new data
 *   Ecolyze.expandPanel()                — programmatic expand
 *   Ecolyze.collapsePanel()              — programmatic collapse
 *   Ecolyze.getState()                   — return current UI state string
 */

// eslint-disable-next-line no-var
var Ecolyze = window.Ecolyze || {};

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  CONSTANTS                                                         */
  /* ═══════════════════════════════════════════════════════════════════ */

  const ROOT_ID      = 'ecolyze-root';
  const LAUNCHER_ID  = 'ecolyze-launcher';
  const PANEL_ID     = 'ecolyze-panel';

  /** @enum {string} */
  const STATE = Object.freeze({
    MINIMIZED: 'minimized',
    EXPANDED:  'expanded',
  });

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  DATA LAYER — separated from rendering                             */
  /* ═══════════════════════════════════════════════════════════════════ */

  /** Default placeholder data. Every field is independently replaceable. */
  const defaults = Object.freeze({
    score:       4,
    maxScore:    10,
    summary:     'Moderate environmental footprint.',
    explanation: 'Based on estimated materials, packaging weight, and average shipping distance this product scores below the sustainability midpoint.',
    alternatives: Object.freeze([
      { name: 'Certified Refurbished',    price: '$72.00', score: 8, reason: 'Extends product lifecycle',   thumb: null },
      { name: 'Eco-Certified Equivalent', price: '$89.99', score: 7, reason: '70% recycled materials',     thumb: null },
      { name: 'Local Seller Option',      price: '$65.50', score: 6, reason: 'Shorter shipping distance',  thumb: null },
    ]),
  });

  /** Live mutable state. Shallow-merged on update. */
  let _data = { ...defaults };

  /** Current UI state. */
  let _uiState = STATE.MINIMIZED;

  /** Cached product data from extractor. */
  let _product = null;

  /** Whether mount is in progress (idempotency guard). */
  let _mounting = false;

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  UTILITIES                                                         */
  /* ═══════════════════════════════════════════════════════════════════ */

  function scoreColor(s) {
    if (s >= 7) return '#16a34a';
    if (s >= 5) return '#ca8a04';
    return '#dc2626';
  }

  function scoreBg(s) {
    if (s >= 7) return '#dcfce7';
    if (s >= 5) return '#fef9c3';
    return '#fee2e2';
  }

  function scoreLabel(s) {
    if (s >= 7) return 'Good';
    if (s >= 5) return 'Fair';
    return 'Low';
  }

  /** Escape basic HTML entities for safe injection. */
  function esc(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len - 1) + '…' : str;
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  SVG BUILDERS                                                      */
  /* ═══════════════════════════════════════════════════════════════════ */

  const LEAF_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66L7 18c4-2 7-4 9-8"/>
    <path d="M17 8c2-2 4-5 4-7-2 0-5 2-7 4"/>
  </svg>`;

  function buildScoreRing(score, max) {
    const r    = 30;
    const circ = 2 * Math.PI * r;
    const off  = circ - ((score / max) * circ);
    const col  = scoreColor(score);

    return `<svg class="eco-ring" width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="5"/>
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${col}" stroke-width="5"
              stroke-dasharray="${circ}" stroke-dashoffset="${off}"
              stroke-linecap="round" transform="rotate(-90 36 36)"
              class="eco-ring__arc"/>
      <text x="36" y="41" text-anchor="middle" fill="${col}"
            font-size="20" font-weight="700"
            font-family="Inter,system-ui,sans-serif">${score}</text>
    </svg>`;
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  COMPONENT: LAUNCHER (minimized state)                             */
  /* ═══════════════════════════════════════════════════════════════════ */

  function buildLauncher() {
    const col = scoreColor(_data.score);
    return `<button id="${LAUNCHER_ID}" class="eco-launcher" aria-label="Open Ecolyze sustainability panel">
      ${LEAF_ICON}
      <span class="eco-launcher__dot" style="background:${col}" id="ecolyze-dot"></span>
    </button>`;
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  COMPONENT: PANEL (expanded state)                                 */
  /* ═══════════════════════════════════════════════════════════════════ */

  function buildPanel() {
    const d     = _data;
    const title = _product?.title || 'Unknown Product';
    const col   = scoreColor(d.score);
    const bg    = scoreBg(d.score);

    const altCards = (d.alternatives || []).map((a) => {
      const thumbHTML = a.thumb
        ? `<img class="eco-card__thumb" src="${esc(a.thumb)}" alt="" loading="lazy"/>`
        : `<div class="eco-card__thumb eco-card__thumb--placeholder">${LEAF_ICON}</div>`;

      return `<div class="eco-card">
        ${thumbHTML}
        <div class="eco-card__body">
          <div class="eco-card__row">
            <span class="eco-card__name">${esc(truncate(a.name, 30))}</span>
            <span class="eco-card__badge" style="color:${scoreColor(a.score)};background:${scoreBg(a.score)}">${a.score}/${d.maxScore}</span>
          </div>
          <p class="eco-card__reason">${esc(a.reason)}</p>
          <div class="eco-card__row">
            <span class="eco-card__price">${esc(a.price)}</span>
            <button class="eco-card__cta">View</button>
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div id="${PANEL_ID}" class="eco-panel">
      <!-- ── HEADER ── -->
      <header class="eco-panel__header">
        <div class="eco-panel__brand">${LEAF_ICON}<span>Ecolyze</span></div>
        <button class="eco-panel__close" id="ecolyze-close" aria-label="Minimize">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 4L4 12M4 4l8 8"/>
          </svg>
        </button>
      </header>

      <!-- ── PRODUCT ── -->
      <p class="eco-panel__product" title="${esc(title)}">${esc(truncate(title, 60))}</p>

      <!-- ── SCORE BLOCK ── -->
      <div class="eco-panel__score">
        ${buildScoreRing(d.score, d.maxScore)}
        <div class="eco-panel__score-meta">
          <span class="eco-panel__score-badge" style="color:${col};background:${bg}">${scoreLabel(d.score)}</span>
          <span class="eco-panel__score-num">${d.score} / ${d.maxScore}</span>
          <span class="eco-panel__score-summary">${esc(d.summary)}</span>
        </div>
      </div>

      <!-- ── EXPLANATION ── -->
      <section class="eco-panel__section">
        <h4 class="eco-panel__heading">Details</h4>
        <p class="eco-panel__text">${esc(d.explanation)}</p>
      </section>

      <!-- ── ALTERNATIVES ── -->
      <section class="eco-panel__section">
        <h4 class="eco-panel__heading">🌿 Better Alternatives</h4>
        <div class="eco-cards" id="ecolyze-cards">${altCards}</div>
      </section>

      <!-- ── FOOTER ── -->
      <footer class="eco-panel__footer">Scores are estimates · Real data coming soon</footer>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  STATE TRANSITIONS                                                 */
  /* ═══════════════════════════════════════════════════════════════════ */

  function setUIState(next) {
    if (next === _uiState) return;
    const launcher = document.getElementById(LAUNCHER_ID);
    const panel    = document.getElementById(PANEL_ID);

    if (next === STATE.EXPANDED) {
      launcher?.classList.remove('eco--visible');
      // Wait for launcher fade-out before panel slides in
      setTimeout(() => panel?.classList.add('eco--visible'), 80);
    } else {
      panel?.classList.remove('eco--visible');
      setTimeout(() => launcher?.classList.add('eco--visible'), 100);
    }
    _uiState = next;
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  PUBLIC API                                                        */
  /* ═══════════════════════════════════════════════════════════════════ */

  Ecolyze.expandPanel  = function () { setUIState(STATE.EXPANDED); };
  Ecolyze.collapsePanel = function () { setUIState(STATE.MINIMIZED); };
  Ecolyze.getState      = function () { return _uiState; };

  /**
   * Mount the full UI system.  Idempotent — safe to call multiple times
   * (e.g. after SPA navigation).
   */
  Ecolyze.renderOverlay = function renderOverlay(productData) {
    if (_mounting) return;
    _mounting = true;

    // Tear down any previous instance
    Ecolyze.removeOverlay();
    _product = productData;
    _data    = { ...defaults }; // reset to placeholders on fresh mount

    // Build root container (single DOM insertion)
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = buildLauncher() + buildPanel();
    document.body.appendChild(root);

    // Event delegation on root — one listener only
    root.addEventListener('click', function (e) {
      const target = e.target.closest
        ? e.target.closest(`#${LAUNCHER_ID}, #ecolyze-close, .eco-card__cta`)
        : null;
      if (!target) return;

      if (target.id === LAUNCHER_ID)      Ecolyze.expandPanel();
      else if (target.id === 'ecolyze-close') Ecolyze.collapsePanel();
      // .eco-card__cta clicks can be wired to navigation in the future
    });

    // Start minimized → animate launcher in
    _uiState = STATE.MINIMIZED;
    requestAnimationFrame(() => {
      document.getElementById(LAUNCHER_ID)?.classList.add('eco--visible');
    });

    _mounting = false;
  };

  /**
   * Fully remove all injected DOM.
   */
  Ecolyze.removeOverlay = function removeOverlay() {
    document.getElementById(ROOT_ID)?.remove();
    _uiState = STATE.MINIMIZED;
  };

  /**
   * Patch live data and re-render affected sections without full remount.
   *
   * @param {{ score?: number, maxScore?: number, summary?: string,
   *           explanation?: string, alternatives?: Array }} patch
   */
  Ecolyze.updateOverlay = function updateOverlay(patch) {
    if (!patch || !document.getElementById(PANEL_ID)) return;
    Object.assign(_data, patch);

    const panel = document.getElementById(PANEL_ID);

    // Score ring + badge + number
    if (typeof patch.score === 'number' || typeof patch.maxScore === 'number') {
      const sc     = _data.score;
      const mx     = _data.maxScore;
      const col    = scoreColor(sc);
      const bg     = scoreBg(sc);

      const ring = panel.querySelector('.eco-ring');
      if (ring) ring.outerHTML = buildScoreRing(sc, mx);

      const badge = panel.querySelector('.eco-panel__score-badge');
      if (badge) { badge.textContent = scoreLabel(sc); badge.style.color = col; badge.style.background = bg; }

      const num = panel.querySelector('.eco-panel__score-num');
      if (num) num.textContent = `${sc} / ${mx}`;

      // Launcher dot colour
      const dot = document.getElementById('ecolyze-dot');
      if (dot) dot.style.background = col;
    }

    if (patch.summary) {
      const el = panel.querySelector('.eco-panel__score-summary');
      if (el) el.textContent = patch.summary;
    }

    if (patch.explanation) {
      const el = panel.querySelector('.eco-panel__text');
      if (el) el.textContent = patch.explanation;
    }

    if (Array.isArray(patch.alternatives)) {
      // Re-use builder by updating _data and re-rendering cards section
      const wrap = document.getElementById('ecolyze-cards');
      if (wrap) {
        wrap.innerHTML = _data.alternatives.map((a) => {
          const thumbHTML = a.thumb
            ? `<img class="eco-card__thumb" src="${esc(a.thumb)}" alt="" loading="lazy"/>`
            : `<div class="eco-card__thumb eco-card__thumb--placeholder">${LEAF_ICON}</div>`;

          return `<div class="eco-card">
            ${thumbHTML}
            <div class="eco-card__body">
              <div class="eco-card__row">
                <span class="eco-card__name">${esc(truncate(a.name, 30))}</span>
                <span class="eco-card__badge" style="color:${scoreColor(a.score)};background:${scoreBg(a.score)}">${a.score}/${_data.maxScore}</span>
              </div>
              <p class="eco-card__reason">${esc(a.reason)}</p>
              <div class="eco-card__row">
                <span class="eco-card__price">${esc(a.price)}</span>
                <button class="eco-card__cta">View</button>
              </div>
            </div>
          </div>`;
        }).join('');
      }
    }
  };

  window.Ecolyze = Ecolyze;
})();
