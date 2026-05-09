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
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    const yesterdayStr = yest.toISOString().slice(0, 10);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const startOfLastWeekStr = startOfLastWeek.toISOString().slice(0, 10);

    const thisMonthStr = now.toISOString().slice(0, 7);

    let revToday = 0, revYest = 0, revWeek = 0, revLastWeek = 0;
    let profToday = 0, profYest = 0, profMonth = 0;
    let salesMonthCount = 0;

    snap.forEach(d => {
      const data = d.data();
      const dateStr = (data.createdAt || '').slice(0, 10);
      const monthStr = (data.createdAt || '').slice(0, 7);
      const total = data.total || 0;

      // Calculate profit dynamically if not stored
      let profit = data.totalProfit;
      if (profit === undefined) {
        profit = (data.items || []).reduce((sum, item) => {
          const prod = products.find(p => p.id === item.productId);
          const buyPrice = parseInt(prod?.BuyPrice) || parseInt(item.buyPrice) || 0;
          return sum + (item.price - buyPrice) * item.qty;
        }, 0);
      }

      if (dateStr === todayStr) { revToday += total; profToday += profit; }
      else if (dateStr === yesterdayStr) { revYest += total; profYest += profit; }

      if (dateStr >= startOfWeekStr) { revWeek += total; }
      else if (dateStr >= startOfLastWeekStr && dateStr < startOfWeekStr) { revLastWeek += total; }

      if (monthStr === thisMonthStr) { profMonth += profit; salesMonthCount++; }
    });

    setText('todaySales', 'Rp ' + revToday.toLocaleString('id-ID'));
    setText('weekSales', 'Rp ' + revWeek.toLocaleString('id-ID'));
    setText('todayProfit', 'Rp ' + profToday.toLocaleString('id-ID'));
    setText('monthProfit', 'Rp ' + profMonth.toLocaleString('id-ID'));
    setText('totalSalesCount', salesMonthCount);

    setTrend('todaySalesTrend', revToday, revYest);
    setTrend('weekSalesTrend', revWeek, revLastWeek);
    setTrend('todayProfitTrend', profToday, profYest);
  });
});

function setTrend(id, current, previous) {
  const el = document.getElementById(id);
  if (!el) return;
  if (previous === 0) {
    if (current > 0) el.innerHTML = `<span style="color:var(--green);"><i class="fas fa-arrow-trend-up"></i> 100%</span>`;
    else el.innerHTML = '';
    return;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct >= 0) {
    el.innerHTML = `<span style="color:var(--green);"><i class="fas fa-arrow-trend-up"></i> ${pct}%</span>`;
  } else {
    el.innerHTML = `<span style="color:var(--red);"><i class="fas fa-arrow-trend-down"></i> ${Math.abs(pct)}%</span>`;
  }
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
