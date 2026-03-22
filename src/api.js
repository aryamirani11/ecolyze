/**
 * api.js — LLM API bridge for Ecolyze.
 *
 * Provides `analyzeProduct(productData)` which sends scraped product JSON
 * to the Google Gemini API and returns a parsed
 * sustainability analysis as JSON.
 *
 * Designed to be imported by the background service worker.
 */

/* ─── Config ─── */

const API_KEY = 'AIzaSyC1Xsp39CBeu8qR4gFSHa9P5VyLZNH77sw'; // ← Replace with your Gemini API key
const MODEL = 'gemini-3.1-flash-lite-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const TIMEOUT_MS = 30_000; // 30-second safety net

/* ─── System Prompt ─── */

const SYSTEM_PROMPT =
  `Act as the 'Ecolyze Sustainability Coach', an expert environmental auditor with an encouraging, supportive, and educational tone. Your goal is to analyze e-commerce product data (provided as JSON) and calculate a 1-100 Eco-Score.

### SCORING SYSTEM (THE FOUR PILLARS):
Calculate the overall Eco-Score (1-100) by evaluating these four weighted pillars based on the provided product data:

1. MATERIAL DNA (40% weight): 
   - High Score: Organic, recycled (e.g., rPET), hemp, Tencel, mono-materials.
   - Low Score: Virgin synthetics (polyester, nylon, acrylic), conventional cotton, complex unrecyclable blends.
   - Action: Analyze the "materialsRaw" and itemSpecifics fields.

2. MANUFACTURING (20% weight):
   - High Score: Visible certifications (GOTS, OEKO-TEX, Fair Trade), or manufacturing in regions with high renewable energy.
   - Low Score: Lack of transparency, manufacturing in regions known for coal-heavy grids or poor labor regulations.
   - Action: Check "Country of Origin" and look for certification keywords in the text.

3. BRAND ETHICS (20% weight):
   - High Score: Brands with strong public climate pledges, circularity programs (take-back/repair), or high "Good On You" ratings (e.g., Patagonia, Worn Wear).
   - Low Score: Ultra-fast fashion brands known for high waste and poor supply chain transparency.
   - Action: Identify the "brand" and use your internal knowledge base to audit their reputation.

4. DURABILITY (20% weight):
   - High Score: Heavyweight materials, "heritage" construction, items meant to last 10+ years (e.g., heavy coats, boots).
   - Low Score: Trend-heavy, flimsy, or disposable "fast fashion" items meant for a single season.
   - Action: Infer from "price", "title", and product category.

### TONE & ALTERNATIVES:
Your tone must be:
- Clear, honest, and unfiltered about the PRODUCT
- Neutral and respectful toward the USER (never judge or blame the buyer)
- Educational and grounded in reasoning, not vague claims

You are allowed to be critical of the product, materials, brand practices, and manufacturing—but NEVER shame or criticize the person considering or purchasing it.
- If the score is low, explain why gently and provide a highly specific sustainable product name as a Smart Swap (e.g., "Patagonia Men's Better Sweater 1/4-Zip"). Do not provide generic search queries.

### OUTPUT FORMAT:
You MUST return ONLY valid JSON. Do not include markdown formatting like json or any conversational text outside the JSON object. Use this exact structure:

{
  "ecoScore": 0,
  "pillarBreakdown": {
    "materials": 0,
    "manufacturing": 0,
    "ethics": 0,
    "durability": 0
  },
  "coachSummary": "A 1-2 sentence encouraging summary of the product's environmental impact.",
  "alternative": {
    "specificProductName": "A highly specific name of a sustainable alternative product, focus specifically on sustainability. SUSTAINABILITY IS THE ONLY PRIORITY."
  }
}
  Strictly follow JSON standards: Use double quotes for all keys and string values. Do not include trailing commas. Do not include comments or markdown formatting.`;

/* ─── Helpers ─── */

/**
 * Robust JSON sanitization layer.
 * Strips markdown, fixes trailing commas, and normalizes quotes.
 */
function sanitizeLLMResponse(rawString) {
  if (!rawString) return '';

  let sanitized = rawString.trim();

  // 1. Extract content only between the first '{' and the last '}'
  const startIdx = sanitized.indexOf('{');
  const endIdx = sanitized.lastIndexOf('}');

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    sanitized = sanitized.substring(startIdx, endIdx + 1);
  }

  // 2. Remove trailing commas before closing braces or brackets
  // Matches a comma followed by any amount of whitespace, then a closing } or ]
  sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');

  // 3. Replace any "smart" or "curly" quotes with standard double quotes
  sanitized = sanitized.replace(/[\u201C\u201D]/g, '"');

  return sanitized;
}

/* ─── Core ─── */

/**
 * Send product data to the LLM and return a structured eco-score JSON.
 *
 * @param {Object} productData – The object returned by Ecolyze.extractProductData()
 * @returns {Promise<Object>} Parsed JSON eco-score report, or a fallback error object.
 */
export async function analyzeProduct(productData) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const userMessage = [
      'Analyze the following product for environmental sustainability.',
      'Return ONLY valid JSON matching this exact schema:',
      '{ "ecoScore": 0, "pillarBreakdown": { "materials": 0, "manufacturing": 0, "ethics": 0, "durability": 0 }, "coachSummary": "...", "alternative": { "specificProductName": "..." } }',
      '',
      'Product data:',
      '```json',
      JSON.stringify(productData, null, 2),
      '```',
    ].join('\n');

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          { role: 'user', parts: [{ text: userMessage }] },
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'No response body');
      console.error('[Ecolyze API] HTTP error:', response.status, errorBody);
      return buildFallback(`API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log("[Ecolyze API] Full Response Data:", data);
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("[Ecolyze API] Raw Content String:", content);

    if (!content) {
      console.error('[Ecolyze API] Empty content in response:', data);
      return buildFallback('Empty response from AI');
    }

    const sanitizedContent = sanitizeLLMResponse(content);
    console.log("[Ecolyze API] Sanitized Content:", sanitizedContent);

    try {
      const parsed = JSON.parse(sanitizedContent);
      console.log("[Ecolyze API] Final Parsed Analysis:", parsed);
      return { success: true, analysis: parsed };
    } catch (parseError) {
      console.error('[Ecolyze API] JSON Parse failed. Sanitized string was:', sanitizedContent);
      console.error(parseError);
      return buildFallback('AI returned malformed data. Try again!');
    }
  } catch (err) {
    console.error('[Ecolyze API] Error:', err);

    if (err.name === 'AbortError') {
      return buildFallback('Request timed out. The coach is warming up — try again!');
    }

    return buildFallback(err.message || 'Unknown error');
  }
}

/**
 * Return a graceful fallback so the popup UI never crashes.
 */
function buildFallback(reason) {
  return {
    success: false,
    error: 'Coach is taking a water break. Try again!',
    technicalDetails: reason,
    analysis: null,
  };
}
