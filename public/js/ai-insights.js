/* ================================================================
   CocaCoy AI Insights — Business Intelligence via Gemini API
   - Summarizes Firestore data locally (never sends raw DB data)
   - Caches API responses in localStorage for 20 minutes
   - Gracefully handles API failures
================================================================ */

// ── CONFIG ──────────────────────────────────────────────────────
// Replace with your actual Gemini API Key from https://aistudio.google.com/
const GEMINI_API_KEY = 'AIzaSyBDAkiI4KWntrV1qeGmAWzIh72AOEI-33g';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const CACHE_KEY      = 'cocacoy_ai_insights_cache';
const CACHE_DURATION = 20 * 60 * 1000; // 20 minutes in ms

// ── MAIN EXPORT ─────────────────────────────────────────────────

/**
 * Main entry point.
 * Call this with your summarized business data to get AI insights.
 * Returns an array of insight strings, or null on failure.
 *
 * @param {Object} analytics - The summarized business analytics object.
 * @returns {Promise<string[]|null>}
 */
export async function generateInsights(analytics) {
  // 1. Check cache first
  const cached = getCache(analytics);
  if (cached) return cached; // { insights, timestamp }

  // 2. Validate API key
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    console.warn('[CocaCoy AI] Gemini API key not configured. Returning demo insights.');
    return generateFallbackInsights(analytics);
  }

  // 3. Build the prompt
  const prompt = buildPrompt(analytics);

  // 4. Call Gemini API
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[CocaCoy AI] API Error:', err);
      return generateFallbackInsights(analytics);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const insights = parseInsights(rawText);

    // 5. Cache the successful response
    const timestamp = Date.now();
    setCache(insights, analytics, timestamp);
    return { insights, timestamp };

  } catch (err) {
    console.error('[CocaCoy AI] Network error:', err);
    return { insights: generateFallbackInsights(analytics), timestamp: Date.now() };
  }
}


// ── ANALYTICS SUMMARIZER ─────────────────────────────────────────

/**
 * Builds a compact analytics summary from raw Firestore data arrays.
 * Only statistical summaries are used — raw product data is never sent.
 *
 * @param {Array} products - Array of product objects from Firestore.
 * @param {Array} transactions - Array of transaction objects from Firestore.
 * @returns {Object} Compact analytics summary.
 */
export function buildAnalyticsSummary(products, transactions) {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');
  const weekAgo  = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

  // ── Products ──
  const lowStock = products
    .filter(p => (parseInt(p.Stock) || 0) <= (parseInt(p.lowStockThreshold) || 10))
    .slice(0, 5)
    .map(p => ({ name: p.Name, stock: parseInt(p.Stock) || 0, threshold: parseInt(p.lowStockThreshold) || 10 }));

  const outOfStock = products.filter(p => (parseInt(p.Stock) || 0) === 0).length;

  // ── Transactions — Today ──
  const todayTxns = transactions.filter(t => {
    const d = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-CA') : '';
    return d === todayStr;
  });
  const revenueToday = todayTxns.reduce((s, t) => s + (t.total || 0), 0);
  const txCountToday = todayTxns.length;

  // ── Top selling (last 7 days) ──
  const salesMap = {};
  transactions.forEach(t => {
    const txDate = t.createdAt ? new Date(t.createdAt) : null;
    if (!txDate || txDate < weekAgo) return;
    (t.items || []).forEach(item => {
      salesMap[item.name] = (salesMap[item.name] || 0) + (item.qty || 0);
    });
  });
  const topSelling = Object.entries(salesMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  // ── Slow moving (in stock but not sold in 7 days) ──
  const soldNames = new Set(Object.keys(salesMap));
  const slowMoving = products
    .filter(p => (parseInt(p.Stock) || 0) > 0 && !soldNames.has(p.Name))
    .slice(0, 5)
    .map(p => ({ name: p.Name, stock: parseInt(p.Stock) || 0 }));

  return {
    totalProducts: products.length,
    outOfStock,
    lowStock,
    revenueToday,
    txCountToday,
    topSelling,
    slowMoving,
    generatedAt: now.toISOString()
  };
}


// ── PROMPT BUILDER ───────────────────────────────────────────────

function buildPrompt(analytics) {
  const { totalProducts, outOfStock, lowStock, revenueToday, txCountToday, topSelling, slowMoving } = analytics;

  const lowStockStr   = lowStock.length   ? lowStock.map(p => `${p.name} (${p.stock} left)`).join(', ') : 'none';
  const topSellingStr = topSelling.length ? topSelling.map(p => `${p.name} (${p.qty} sold)`).join(', ') : 'no sales yet';
  const slowStr       = slowMoving.length ? slowMoving.map(p => `${p.name} (${p.stock} in stock)`).join(', ') : 'none';

  return `You are a smart business assistant for a small Indonesian UMKM store using CocaCoy ERP.
Analyze the following daily business data and respond with exactly 3–4 short, actionable bullet points in English.
Each bullet point must be practical, specific, and easy for a non-technical store owner to understand.
Do NOT be generic. Focus on specific products mentioned in the data. Keep each point under 20 words.
Do NOT include introductions, conclusions, or explanations — just the bullet points.

Business Data:
- Total products in catalog: ${totalProducts}
- Out of stock products: ${outOfStock}
- Low stock products: ${lowStockStr}
- Today's revenue: Rp ${revenueToday.toLocaleString('id-ID')}
- Transactions today: ${txCountToday}
- Top selling products this week: ${topSellingStr}
- Slow moving products (no sales in 7 days): ${slowStr}

Provide 3–4 concise bullet points (use "•" character):`;
}


// ── RESPONSE PARSER ──────────────────────────────────────────────

function parseInsights(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.replace(/^[\s•\-*]+/, '').trim())
    .filter(l => l.length > 5);
  return lines.length > 0 ? lines : ['No insights generated. Please check back later.'];
}


// ── FALLBACK INSIGHTS (no API key / failure) ─────────────────────

function generateFallbackInsights(analytics) {
  const insights = [];
  const { lowStock, revenueToday, topSelling, slowMoving, outOfStock } = analytics;

  if (lowStock.length > 0) {
    insights.push(`${lowStock[0].name} has only ${lowStock[0].stock} units left — consider restocking soon.`);
  }
  if (outOfStock > 0) {
    insights.push(`${outOfStock} product(s) are out of stock and may be losing potential sales.`);
  }
  if (topSelling.length > 0) {
    insights.push(`${topSelling[0].name} is your best seller this week with ${topSelling[0].qty} units sold.`);
  }
  if (slowMoving.length > 0) {
    insights.push(`${slowMoving[0].name} hasn't sold in 7 days — consider running a promotion.`);
  }
  if (revenueToday === 0) {
    insights.push('No sales recorded today yet. Make sure the cashier system is active.');
  }

  return insights.length > 0
    ? insights
    : ['Add products and complete transactions to receive AI-powered insights.'];
}

export function getFallbackWithTimestamp(analytics) {
  return { insights: generateFallbackInsights(analytics), timestamp: Date.now() };
}


// ── CACHE HELPERS ────────────────────────────────────────────────

function getCache(analytics) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { insights, timestamp, expiry, productCount, txCount } = JSON.parse(raw);
    const now = Date.now();
    if (now > expiry) return null;
    // Invalidate cache if data significantly changed
    if (productCount !== analytics.totalProducts || txCount !== analytics.txCountToday) return null;
    return { insights, timestamp };
  } catch {
    return null;
  }
}

function setCache(insights, analytics, timestamp) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      insights,
      timestamp,
      expiry: Date.now() + CACHE_DURATION,
      productCount: analytics.totalProducts,
      txCount: analytics.txCountToday
    }));
  } catch {
    // Ignore storage errors
  }
}
