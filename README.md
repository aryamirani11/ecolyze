Ecolyze

**Shop smarter, live greener.**

Ecolyze is a Chrome browser extension that analyses Amazon products in real time and surfaces an AI-generated sustainability score — directly inside your shopping experience. Click the floating leaf launcher on any Amazon product page to get an instant eco-score, a four-pillar breakdown, and a specific greener alternative.

---

## How It Works

Ecolyze activates automatically on Amazon product pages. When you click **Analyze Product** in the popup:

1. **Extract** — `extractor.js` deep-scrapes the Amazon DOM for title, price, description, brand, materials, item specifics, category, and seller info
2. **Score** — `background.js` forwards the structured product JSON to the Google Gemini API (`gemini-3.1-flash-lite-preview`), which scores the product across four sustainability pillars and returns a 1–100 Eco-Score with a coach summary and a specific swap recommendation
3. **Fetch Alternative** — if the Eco-Score is below 60, `background.js` queries SerpAPI to find a real Amazon listing for the recommended alternative, complete with title, price, thumbnail, and a direct buy link
4. **Display** — `popup.js` renders the score ring, pillar bars, coach summary, and the fetched alternative card in the popup UI

### Scoring System — The Four Pillars

| Pillar | Weight | What Gemini evaluates |
|---|---|---|
| **Material DNA** | 40% | Organic, recycled, or synthetic materials from `materialsRaw` and item specifics |
| **Manufacturing** | 20% | Country of origin, visible certifications (GOTS, OEKO-TEX, Fair Trade) |
| **Brand Ethics** | 20% | Brand reputation, climate pledges, circularity programs |
| **Durability** | 20% | Price, construction quality, product category and longevity signals |

### Architecture

```
ecolyze/
├── manifest.json               ← Chrome Manifest V3 config
├── src/
│   ├── background.js           ← Service worker; orchestrates API calls
│   ├── api.js                  ← Gemini API bridge; builds prompt, parses response
│   ├── extractor.js            ← DOM scraper; exposes Ecolyze.extractProductData()
│   ├── overlay.js              ← Injected side-panel UI (minimized/expanded states)
│   ├── content.js              ← Content script entry point; mounts overlay, handles SPA nav
│   ├── popup.html              ← Extension popup shell
│   ├── popup.js                ← Popup controller; renders score, pillars, smart swap
│   └── styles.css              ← Scoped styles for the injected overlay UI
└── icons/
    ├── ecolyzeLogo.png
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

**Message flow:**

```
popup.js
  │  { action: 'ANALYZE_PRODUCT' }
  ▼
background.js
  │  { type: 'GET_PRODUCT_DATA' }
  ▼
content.js → extractor.js
  │  { success: true, data: { product: {...} } }
  ▼
background.js → api.js → Gemini API
  │  { ecoScore, pillarBreakdown, coachSummary, alternative }
  ▼
background.js → SerpAPI (if ecoScore < 60)
  │  { title, price, link, thumbnail }
  ▼
popup.js (renders results)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension runtime | Chrome Manifest V3 |
| UI | Vanilla JS + HTML/CSS (no framework) |
| AI scoring | Google Gemini API (`gemini-3.1-flash-lite-preview`) |
| Product search | SerpAPI (Amazon engine) |
| Fonts | Inter via Google Fonts |

---

## Installation & Setup

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A [SerpAPI key](https://serpapi.com/manage-api-key)

### 1. Clone the repo

```bash
git clone https://github.com/aryamirani11/ecolyze.git
cd ecolyze
```

### 2. Add your API keys

Open `src/api.js` and replace the placeholder:

```js
const API_KEY = 'YOUR_GEMINI_API_KEY';
```

Open `src/background.js` and replace:

```js
const SERPAPI_KEY = 'YOUR_SERPAPI_KEY';
```

### 3. Load the extension into Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the root `ecolyze/` folder (the one containing `manifest.json`)

The Ecolyze icon will appear in your Chrome toolbar.

### 4. Use it

1. Navigate to any Amazon product page
2. Click the Ecolyze icon in the toolbar to open the popup
3. Click **Analyze Product**
4. View the Eco-Score, pillar breakdown, coach summary, and smart swap recommendation

---

## Environment Variables

API keys are currently stored directly in source files. Before pushing to a public repo, move them to a build-time config or environment variable system.

| Key | File | Where to get it |
|---|---|---|
| `API_KEY` (Gemini) | `src/api.js` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `SERPAPI_KEY` | `src/background.js` | [serpapi.com](https://serpapi.com/manage-api-key) |

> **Important:** Neither key should be committed to a public repository. Consider using a build tool like Vite or webpack with `.env` support before open-sourcing.

---

## Project Overview

Ecolyze was built for the **Sustainability Track** at HackDuke. The core premise: 73% of consumers want to shop sustainably, but greenwashing and friction make it nearly impossible at the point of purchase. Ecolyze closes that gap by embedding sustainability intelligence directly into the Amazon shopping experience — no new tabs, no extra steps.

### Key features

- Floating launcher overlay injected into Amazon product pages
- AI-powered Eco-Score (1–100) across four weighted sustainability pillars
- Real Amazon alternative fetched via SerpAPI with title, price, and direct buy link
- Graceful fallback states for loading, errors, and timeouts
- SPA-aware — re-initializes on Amazon's client-side navigation

---

## Built by

**Arya Mirani** · **Kunal Toomu**

[ecolyze.us](https://ecolyze.us)
