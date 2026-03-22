/**
 * popup.js — Ecolyze popup controller.
 *
 * Handles the user-facing popup lifecycle:
 *   1. "Analyze Product" click → send message to background
 *   2. Show loading state while waiting
 *   3. Populate results or show error on response
 */

(function () {
  'use strict';

  /* ─── DOM refs ─── */

  const ctaSection = document.getElementById('eco-cta-section');
  const analyzeBtn = document.getElementById('analyze-btn');
  const loadingEl = document.getElementById('eco-loading');
  const errorEl = document.getElementById('eco-error');
  const errorMsg = document.getElementById('error-msg');
  const retryBtn = document.getElementById('retry-btn');
  const resultsEl = document.getElementById('eco-results');

  /* ─── State helpers ─── */

  function showOnly(section) {
    ctaSection.style.display = 'none';
    loadingEl.classList.remove('eco--active');
    errorEl.classList.remove('eco--active');
    resultsEl.classList.remove('eco--active');

    if (section === 'cta') ctaSection.style.display = '';
    if (section === 'loading') loadingEl.classList.add('eco--active');
    if (section === 'error') errorEl.classList.add('eco--active');
    if (section === 'results') resultsEl.classList.add('eco--active');
  }

  /* ─── Colour helpers ─── */

  function scoreColor(s) {
    if (s > 70) return '#22c55e';
    if (s >= 40) return '#f59e0b';
    return '#ef4444';
  }

  function scoreBg(s) {
    if (s > 70) return 'rgba(34,197,94,.15)';
    if (s >= 40) return 'rgba(245,158,11,.15)';
    return 'rgba(239,68,68,.15)';
  }

  function scoreLabel(s) {
    if (s > 70) return 'Great';
    if (s >= 40) return 'Fair';
    return 'Poor';
  }

  function pillarColor(v) {
    if (v > 70) return '#22c55e';
    if (v >= 40) return '#f59e0b';
    return '#ef4444';
  }

  /* ─── Render results ─── */

  function renderResults(analysis) {
    const { ecoScore, pillarBreakdown, coachSummary, alternative } = analysis;
    const col = scoreColor(ecoScore);

    // Score ring
    const r = 31;
    const circ = 2 * Math.PI * r; // ≈ 194.78
    const off = circ - ((ecoScore / 100) * circ);

    const arc = document.getElementById('score-arc');
    arc.setAttribute('stroke', col);
    // Trigger animation by setting dashoffset after a frame
    requestAnimationFrame(() => {
      arc.setAttribute('stroke-dashoffset', off);
    });

    const num = document.getElementById('score-number');
    num.textContent = ecoScore;
    num.setAttribute('fill', col);

    // Badge
    const badge = document.getElementById('score-badge');
    badge.textContent = scoreLabel(ecoScore);
    badge.style.color = col;
    badge.style.background = scoreBg(ecoScore);

    // Label
    document.getElementById('score-label').textContent =
      `Eco-Score · ${ecoScore} / 100`;

    // Pillar bars
    const pillars = ['materials', 'manufacturing', 'ethics', 'durability'];
    pillars.forEach((key) => {
      const val = pillarBreakdown[key] ?? 0;
      const bar = document.getElementById(`bar-${key}`);
      const lbl = document.getElementById(`val-${key}`);

      lbl.textContent = val;
      bar.style.background = pillarColor(val);

      // Animate width after a frame
      requestAnimationFrame(() => {
        bar.style.width = `${val}%`;
      });
    });

    // Coach summary
    document.getElementById('coach-summary').textContent =
      coachSummary || 'No summary available.';

    // Hide specific card by default
    const altCard = document.getElementById('specific-alt-card');
    altCard.style.display = 'none';

    // Smart swap text
    const swapEl = document.getElementById('smart-swap');

    // If the product is already highly rated, don't suggest a swap
    if (ecoScore >= 70) {
      swapEl.textContent = 'This product is highly rated! No swap needed.';
    } else if (alternative && alternative.specificProductName) {
      swapEl.textContent = `Looking for: ${alternative.specificProductName}`;

      // If score is low, fetch the actual product
      if (ecoScore < 60) {
        swapEl.textContent += " (Fetching product...)";

        chrome.runtime.sendMessage(
          { action: 'FETCH_ALTERNATIVE_PRODUCT', productName: alternative.specificProductName },
          (res) => {
            console.log("[Ecolyze] SerpApi Response:", res); // DEBUG LOG

            if (res && res.success && res.product) {
              const p = res.product;

              // Update Text
              swapEl.textContent = `Suggested Swap:`;
              document.getElementById('alt-title').textContent = p.title || alternative.specificProductName;
              document.getElementById('alt-price').textContent = p.price || 'View Price';

              // Update Link (The Critical Part)
              const linkEl = document.getElementById('alt-link');
              linkEl.href = p.link;

              // Update Image
              const imgEl = document.getElementById('alt-img');
              imgEl.src = p.thumbnail || '';

              // Show the card
              altCard.style.display = 'block';
            } else {
              console.error("[Ecolyze] Search failed or no results:", res?.error);
              swapEl.textContent = `Suggested Swap: ${alternative.specificProductName}`;
            }
          }
        );
      }
    } else {
      swapEl.textContent = 'No specific alternative suggested.';
    }

    showOnly('results');
  }

  /* ─── Error display ─── */

  function showError(msg) {
    errorMsg.textContent = msg || 'Something went wrong. Please try again.';
    showOnly('error');
  }

  /* ─── Analyze flow ─── */

  function requestAnalysis() {
    showOnly('loading');

    chrome.runtime.sendMessage({ action: 'ANALYZE_PRODUCT' }, (response) => {
      // Handle messaging errors (e.g., no content script)
      if (chrome.runtime.lastError) {
        console.error('[Ecolyze Popup]', chrome.runtime.lastError.message);
        showError('Could not connect to the page. Make sure you\'re on a product page and reload.');
        return;
      }

      if (!response) {
        showError('No response from background. Try reloading the extension.');
        return;
      }

      if (!response.success) {
        showError(response.error || 'Analysis failed. Try again!');
        return;
      }

      renderResults(response.analysis);
    });
  }

  /* ─── Event listeners ─── */

  analyzeBtn.addEventListener('click', requestAnalysis);
  retryBtn.addEventListener('click', requestAnalysis);
})();
