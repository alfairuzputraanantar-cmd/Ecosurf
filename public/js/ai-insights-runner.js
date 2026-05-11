/* ================================================================
   ai-insights-runner.js
   Wires the AI insights service to Firestore data from the dashboard.
   Runs as an ES module, listens to userReady, then triggers insights.
================================================================ */
import { db, userCol } from './firebase.js';
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { generateInsights, buildAnalyticsSummary, getFallbackWithTimestamp } from './ai-insights.js';

let _products = [];
let _transactions = [];
let _insightsTriggered = false;

// ── NEW: Handle API key absence or failures gracefully ──
function getInitialInsights(analytics) {
  try {
    return generateInsights(analytics);
  } catch (e) {
    return getFallbackWithTimestamp(analytics);
  }
}

document.addEventListener('userReady', ({ detail: { uid } }) => {
  // Listen to products
  onSnapshot(userCol(uid, 'products'), snap => {
    _products = [];
    snap.forEach(d => { if (d.data().Name) _products.push(d.data()); });
    maybeGenerateInsights();
  });

  // Listen to transactions
  onSnapshot(userCol(uid, 'transactions'), snap => {
    _transactions = [];
    snap.forEach(d => _transactions.push(d.data()));
    maybeGenerateInsights();
  });
});

// Debounce: only generate after both listeners have loaded at least once
let _productsReady = false;
let _txReady = false;

function maybeGenerateInsights() {
  if (_products.length >= 0) _productsReady = true;
  if (_transactions.length >= 0) _txReady = true;

  // Only auto-generate insights once on initial load
  if (_productsReady && _txReady && !_insightsTriggered) {
    _insightsTriggered = true;
    runInsights();
  }
}

async function runInsights() {
  showLoadingState();

  try {
    const analytics = buildAnalyticsSummary(_products, _transactions);
    const { insights, timestamp } = await generateInsights(analytics);
    renderInsights(insights, timestamp);
  } catch (err) {
    console.error('[AI Runner] Failed to generate insights:', err);
    showErrorState();
  }
}

// ── Expose refresh function globally for the Refresh button ──
window.refreshAIInsights = async () => {
  // Clear cache to force a fresh fetch
  localStorage.removeItem('cocacoy_ai_insights_cache');

  const btn = document.getElementById('aiRefreshBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-rotate-right fa-spin"></i> Loading...'; }

  await runInsights();

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate-right"></i> Refresh'; }
};

// ── UI Renderers ─────────────────────────────────────────────────

function showLoadingState() {
  setDisplay('aiLoadingState', 'block');
  setDisplay('aiInsightsList', 'none');
  setDisplay('aiErrorState', 'none');
  setText('aiLastUpdated', 'Generating insights...');
}

function showErrorState() {
  setDisplay('aiLoadingState', 'none');
  setDisplay('aiInsightsList', 'none');
  setDisplay('aiErrorState', 'block');
  setText('aiLastUpdated', 'Failed to load insights.');
}

function renderInsights(insights, timestamp) {
  const listEl = document.getElementById('aiInsightsList');
  if (!listEl) return;

  listEl.innerHTML = insights.map((insight, i) => `
    <div class="ai-insight-item" style="animation-delay: ${i * 0.08}s">
      <span class="ai-insight-bullet">•</span>
      <span class="ai-insight-text">${insight}</span>
    </div>
  `).join('');

  setDisplay('aiLoadingState', 'none');
  setDisplay('aiInsightsList', 'block');
  setDisplay('aiErrorState', 'none');

  const date = timestamp ? new Date(timestamp) : new Date();
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  setText('aiLastUpdated', `Last updated: ${timeStr}`);
}

function setDisplay(id, val) {
  const el = document.getElementById(id);
  if (el) el.style.display = val;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
