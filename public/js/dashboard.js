import { db, userCol } from './firebase.js';
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   DASHBOARD — live data from Firebase, scoped per authenticated user.
   Waits for 'userReady' event dispatched by guard.js before
   starting any Firestore listeners.
================================================================ */

let products = [];
let history  = [];

document.addEventListener('userReady', ({ detail: { uid } }) => {
  /* ── Listen products ── */
  onSnapshot(userCol(uid, 'products'), snap => {
    products = [];
    snap.forEach(d => { if (d.data().Name) products.push(d.data()); });
    renderDashboard();
  });

  /* ── Listen history ── */
  onSnapshot(userCol(uid, 'history'), snap => {
    history = [];
    snap.forEach(d => history.push(d.data()));
    renderDashboard();
  });

  /* ── Listen transactions → Analytics Grid ── */
  onSnapshot(userCol(uid, 'transactions'), snap => {
    window._allTransactions = [];
    snap.forEach(d => window._allTransactions.push(d.data()));
    updateSalesAnalytics(); // default filter is "today" initially
  });
});

let currentDashboardFilter = 'today';
window.setDashboardTimeFilter = (filter, btn) => {
  currentDashboardFilter = filter;
  // Update button active states
  const parent = btn.parentElement;
  parent.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  updateSalesAnalytics();
};

function updateSalesAnalytics() {
  const txs = window._allTransactions || [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  let cutoff = 0;
  if (currentDashboardFilter === 'today') {
    cutoff = todayStart;
  } else if (currentDashboardFilter === '7d') {
    cutoff = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  } else if (currentDashboardFilter === '30d') {
    cutoff = now.getTime() - (30 * 24 * 60 * 60 * 1000);
  } else if (currentDashboardFilter === '1y') {
    cutoff = now.getTime() - (365 * 24 * 60 * 60 * 1000);
  }

  let totalProductsSold = 0;
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalTransactions = 0;
  const productSalesMap = {};

  txs.forEach(tx => {
    const txTime = new Date(tx.createdAt).getTime();
    if (txTime >= cutoff) {
      totalTransactions++;
      totalRevenue += tx.total || 0;
      totalProfit += tx.totalProfit || 0;
      
      (tx.items || []).forEach(item => {
        totalProductsSold += item.qty || 0;
        if (!productSalesMap[item.name]) {
          productSalesMap[item.name] = 0;
        }
        productSalesMap[item.name] += item.qty || 0;
      });
    }
  });

  let bestSeller = '–';
  let maxSold = 0;
  for (const [name, qty] of Object.entries(productSalesMap)) {
    if (qty > maxSold) {
      maxSold = qty;
      bestSeller = name;
    }
  }

  setText('saProductsSold', totalProductsSold.toLocaleString('id-ID'));
  setText('saRevenue', 'Rp ' + totalRevenue.toLocaleString('id-ID'));
  setText('saProfit', 'Rp ' + totalProfit.toLocaleString('id-ID'));
  setText('saTransactions', totalTransactions.toLocaleString('id-ID'));
  setText('saBestSeller', bestSeller);
}

/* ================================================================
   MAIN RENDER
================================================================ */
function renderDashboard() {
  renderStats();
  renderMiniChart();
  renderRecentProducts();
  renderLowStockAlert();
}

/* ================================================================
   STAT CARDS
================================================================ */
function renderStats() {
  const totalValue = products.reduce((s, p) => s + ((parseInt(p.Stock)||0) * (parseInt(p.Price)||0)), 0);
  const lowStock   = products.filter(p => {
    const stock  = parseInt(p.Stock)             || 0;
    const thresh = parseInt(p.lowStockThreshold) || 10;
    return stock <= thresh;
  }).length;
  const totalProds = products.length;
  setText('totalValue',    'Rp ' + totalValue.toLocaleString('id-ID'));
  setText('lowStock',      lowStock);
  setText('totalProducts', totalProds);
}

/* ================================================================
   MINI BAR CHART — Chart.js (stock per category)
================================================================ */
let _dashBarChart = null;

function renderMiniChart() {
  const canvas = document.getElementById('barChart');
  if (!canvas) return;

  const catMap = {};
  products.forEach(p => {
    const cat = p.Category || 'Others';
    catMap[cat] = (catMap[cat] || 0) + (parseInt(p.Stock) || 0);
  });

  const entries = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0, 7);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    const empty = document.getElementById('barEmpty');
    if (empty) empty.style.display = 'flex';
    return;
  }

  canvas.style.display = '';
  const empty = document.getElementById('barEmpty');
  if (empty) empty.style.display = 'none';

  const labels = entries.map(e => e[0]);
  const data   = entries.map(e => e[1]);
  const colors = ['#c8956c','#a0714f','#7a9aaa','#22c997','#f5a623','#5b9cf6','#f75f5f'];

  if (_dashBarChart) _dashBarChart.destroy();
  _dashBarChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map((c,i) => colors[i % colors.length] + 'CC'),
        borderColor:     colors.map((c,i) => colors[i % colors.length]),
        borderWidth: 2, borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7265', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7265' }, beginAtZero: true }
      }
    }
  });
}

/* ================================================================
   RECENT PRODUCTS (last 5 added)
================================================================ */
function renderRecentProducts() {
  const el = document.getElementById('recentProducts');
  if (!el) return;

  if (products.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><i class="fas fa-inbox"></i><p>No products added yet.</p></div>';
    return;
  }

  const sorted = [...products]
    .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))
    .slice(0, 5);

  el.innerHTML = sorted.map(p => {
    const stock    = parseInt(p.Stock) || 0;
    const price    = parseInt(p.Price) || 0;
    const stockCls = stock <= 5 ? 'tag-red' : stock <= 20 ? 'tag-yellow' : 'tag-green';
    return `
      <div class="recent-item">
        <div>
          <div class="recent-item-name">${p.Name}</div>
          <div class="recent-item-sub">${p.Category||'—'} · <span class="tag ${stockCls}" style="font-size:10px;">${stock} ${p.Unit||'pcs'}</span></div>
        </div>
        <div class="recent-item-val">Rp ${price.toLocaleString('id-ID')}</div>
      </div>`;
  }).join('');
}

/* ================================================================
   LOW STOCK ALERT PANEL
================================================================ */
function renderLowStockAlert() {
  const el = document.getElementById('lowStockList');
  if (!el) return;

  const low = products
    .filter(p => {
      const stock  = parseInt(p.Stock)             || 0;
      const thresh = parseInt(p.lowStockThreshold) || 10;
      return stock <= thresh;
    })
    .sort((a,b) => (parseInt(a.Stock)||0) - (parseInt(b.Stock)||0))
    .slice(0, 6);

  if (low.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:24px 0;color:var(--muted);">
        <i class="fas fa-circle-check" style="font-size:28px;color:var(--green);display:block;margin-bottom:10px;"></i>
        All products have sufficient stock!
      </div>`;
    return;
  }

  el.innerHTML = low.map(p => {
    const stock  = parseInt(p.Stock)             || 0;
    const thresh = parseInt(p.lowStockThreshold) || 10;
    const pct    = Math.min(100, Math.round((stock / thresh) * 100));
    const color  = stock <= Math.ceil(thresh * 0.3) ? 'var(--red)' : 'var(--yellow)';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-size:13px;font-weight:600;">${p.Name}</span>
          <span style="font-size:12px;color:${color};font-weight:700;">${stock} / ${thresh} ${p.Unit||'pcs'}</span>
        </div>
        <div style="background:var(--surface2);border-radius:6px;height:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;transition:width .4s;"></div>
        </div>
      </div>`;
  }).join('');
}

/* ================================================================
   UTIL
================================================================ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
