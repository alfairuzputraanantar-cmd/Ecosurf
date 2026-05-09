import { userCol } from './firebase.js';
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   CHARTS — all data from Firebase, scoped per authenticated user.
   Waits for 'userReady' event dispatched by guard.js.
================================================================ */

const PALETTE = ['#c8956c','#a0714f','#7a9aaa','#22c997','#f5a623','#5b9cf6','#f75f5f','#e8c9b0'];

let _stockChart = null, _catChart = null, _histChart = null, _salesChart = null, _profitChart = null, _topProfitChart = null;
let products = [];
let history  = [];
let transactions = [];

/* ── Start listeners only after auth is ready ── */
document.addEventListener('userReady', ({ detail: { uid } }) => {

  // ✅ Listen to users/{uid}/products
  onSnapshot(userCol(uid, 'products'), snap => {
    products = [];
    snap.forEach(d => { if (d.data().Name) products.push(d.data()); });
    renderAll();
  });

  // ✅ Listen to users/{uid}/history
  onSnapshot(userCol(uid, 'history'), snap => {
    history = [];
    snap.forEach(d => history.push(d.data()));
    renderAll();
  });

  // ✅ Listen to users/{uid}/transactions
  onSnapshot(userCol(uid, 'transactions'), snap => {
    transactions = [];
    snap.forEach(d => transactions.push(d.data()));
    renderAll();
  });
});


/* ================================================================
   RENDER ALL
================================================================ */
function renderAll() {
  renderStockChart();
  renderCategoryChart();
  renderHistoryChart();
  renderSalesChart();
  renderProfitChart();
  renderTopProfitChart();
  renderLowStockTable();
}


/* ================================================================
   BAR CHART — top 10 products by stock
================================================================ */
function renderStockChart() {
  const canvas = document.getElementById('stockChart');
  const empty  = document.getElementById('emptyStock');
  if (!canvas) return;

  const sorted = [...products]
    .sort((a,b) => (parseInt(b.Stock)||0) - (parseInt(a.Stock)||0))
    .slice(0, 10);

  if (sorted.length === 0) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (empty) empty.style.display = 'none';

  const labels = sorted.map(p => p.Name);
  const data   = sorted.map(p => parseInt(p.Stock) || 0);

  if (_stockChart) _stockChart.destroy();
  _stockChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Stock',
        data,
        backgroundColor: labels.map((_,i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor:     labels.map((_,i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2, borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxRotation: 30 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

/* ================================================================
   DONUT CHART — stock distribution by category
================================================================ */
function renderCategoryChart() {
  const canvas   = document.getElementById('categoryChart');
  const empty    = document.getElementById('emptyCategory');
  const legendEl = document.getElementById('categoryLegend');
  if (!canvas) return;

  const catMap = {};
  products.forEach(p => {
    const cat = p.Category || 'Others';
    catMap[cat] = (catMap[cat] || 0) + (parseInt(p.Stock) || 0);
  });
  const entries = Object.entries(catMap);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (empty) empty.style.display = 'none';

  const labels = entries.map(e => e[0]);
  const data   = entries.map(e => e[1]);
  const colors = labels.map((_,i) => PALETTE[i % PALETTE.length]);

  if (_catChart) _catChart.destroy();
  _catChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'CC'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: { legend: { display: false } }
    }
  });

  if (legendEl) {
    const total = data.reduce((s,v) => s+v, 0) || 1;
    legendEl.innerHTML = labels.map((l,i) => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${colors[i]};"></div>
        <span>${l}</span>
        <span style="margin-left:4px;color:var(--text);font-weight:600;">${data[i]}</span>
        <span style="margin-left:4px;color:var(--muted);font-size:10px;">(${Math.round(data[i]/total*100)}%)</span>
      </div>`).join('');
  }
}

/* ================================================================
   LINE CHART — products added per day (last 14 days)
================================================================ */
function renderHistoryChart() {
  const canvas = document.getElementById('historyChart');
  const empty  = document.getElementById('emptyHistory');
  if (!canvas) return;

  const dayMap = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().slice(0,10)] = 0;
  }

  history.forEach(h => {
    if (h.action !== 'Added') return;
    let dateKey = null;
    if (h.createdAt) {
      dateKey = h.createdAt.slice(0,10);
    } else if (h.timestamp) {
      const m = h.timestamp.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) dateKey = `${m[3]}-${m[2]}-${m[1]}`;
    }
    if (dateKey && dayMap[dateKey] !== undefined) dayMap[dateKey]++;
  });

  const labels = Object.keys(dayMap).map(k => { const [y,m,d] = k.split('-'); return `${d}/${m}`; });
  const data   = Object.values(dayMap);

  if (data.every(v => v === 0)) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (empty) empty.style.display = 'none';

  if (_histChart) _histChart.destroy();
  _histChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Products Added',
        data,
        borderColor: '#c8956c',
        backgroundColor: 'rgba(200,149,108,.12)',
        fill: true, tension: 0.45,
        pointBackgroundColor: '#c8956c',
        pointBorderColor: '#13161f',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

/* ================================================================
   LOW STOCK TABLE
================================================================ */
function renderLowStockTable() {
  const el = document.getElementById('lowStockTable');
  if (!el) return;

  const low = products
    .filter(p => {
      const stock  = parseInt(p.Stock)             || 0;
      const thresh = parseInt(p.lowStockThreshold) || 10;
      return stock <= thresh;
    })
    .sort((a,b) => (parseInt(a.Stock)||0) - (parseInt(b.Stock)||0));

  if (low.length === 0) {
    el.innerHTML = `
      <tr><td colspan="5" style="text-align:center;padding:30px;color:var(--muted);">
        <i class="fas fa-circle-check" style="color:var(--green);margin-right:8px;"></i>
        All products have sufficient stock!
      </td></tr>`;
    return;
  }

  el.innerHTML = low.map(p => {
    const stock  = parseInt(p.Stock)             || 0;
    const price  = parseInt(p.Price)             || 0;
    const thresh = parseInt(p.lowStockThreshold) || 10;
    const cls    = stock <= Math.ceil(thresh * 0.3) ? 'tag-red' : 'tag-yellow';
    return `
      <tr>
        <td data-label="Product Name" style="font-weight:600;">${p.Name}</td>
        <td data-label="Category"><span class="tag tag-copper">${p.Category||'-'}</span></td>
        <td data-label="Stock Left"><span class="tag ${cls}">${stock} ${p.Unit||'pcs'}</span></td>
        <td data-label="Threshold"><span class="tag tag-blue">${thresh} ${p.Unit||'pcs'}</span></td>
        <td data-label="Price" style="color:var(--brand-1);font-weight:700;">Rp ${price.toLocaleString('id-ID')}</td>
      </tr>`;
  }).join('');
}

/* ================================================================
   SALES CHART — daily revenue (last 7 days)
================================================================ */
function renderSalesChart() {
  const canvas = document.getElementById('salesChart');
  const empty  = document.getElementById('emptySales');
  if (!canvas) return;

  const dayMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().slice(0,10)] = 0;
  }

  transactions.forEach(t => {
    const dateKey = (t.createdAt || '').slice(0,10);
    if (dateKey && dayMap[dateKey] !== undefined) {
      dayMap[dateKey] += (t.total || 0);
    }
  });

  const labels = Object.keys(dayMap).map(k => { const [y,m,d] = k.split('-'); return `${d}/${m}`; });
  const data   = Object.values(dayMap);

  if (data.every(v => v === 0)) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (empty) empty.style.display = 'none';

  if (_salesChart) _salesChart.destroy();
  _salesChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data,
        borderColor: '#22c997',
        backgroundColor: 'rgba(34,201,151,.12)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#22c997',
        pointBorderColor: '#13161f',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { 
          grid: { color: 'rgba(255,255,255,0.05)' }, 
          beginAtZero: true,
          ticks: {
            callback: (val) => 'Rp ' + val.toLocaleString('id-ID')
          }
        }
      }
    }
  });
}

/* ================================================================
   PROFIT CHART — daily profit (last 7 days)
================================================================ */
function renderProfitChart() {
  const canvas = document.getElementById('profitChart');
  const empty  = document.getElementById('emptyProfit');
  if (!canvas) return;

  const dayMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().slice(0,10)] = 0;
  }

  transactions.forEach(t => {
    const dateKey = (t.createdAt || '').slice(0,10);
    if (dateKey && dayMap[dateKey] !== undefined) {
      let profit = t.totalProfit;
      if (profit === undefined) {
        profit = (t.items || []).reduce((sum, item) => {
          const prod = products.find(p => p.id === item.productId);
          const buyPrice = parseInt(prod?.BuyPrice) || parseInt(item.buyPrice) || 0;
          return sum + (item.price - buyPrice) * item.qty;
        }, 0);
      }
      dayMap[dateKey] += profit;
    }
  });

  const labels = Object.keys(dayMap).map(k => { const [y,m,d] = k.split('-'); return `${d}/${m}`; });
  const data   = Object.values(dayMap);

  if (data.every(v => v === 0)) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (empty) empty.style.display = 'none';

  if (_profitChart) _profitChart.destroy();
  _profitChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Profit',
        data,
        borderColor: '#5b9cf6',
        backgroundColor: 'rgba(91,156,246,.12)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#5b9cf6',
        pointBorderColor: '#13161f',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { 
          grid: { color: 'rgba(255,255,255,0.05)' }, 
          beginAtZero: true,
          ticks: { callback: (val) => 'Rp ' + val.toLocaleString('id-ID') }
        }
      }
    }
  });
}

/* ================================================================
   TOP PROFITABLE PRODUCTS
================================================================ */
function renderTopProfitChart() {
  const canvas = document.getElementById('topProfitChart');
  const empty  = document.getElementById('emptyTopProfit');
  if (!canvas) return;

  const profMap = {};
  transactions.forEach(t => {
    (t.items || []).forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      const buyPrice = parseInt(prod?.BuyPrice) || parseInt(item.buyPrice) || 0;
      const profit = (item.price - buyPrice) * item.qty;
      profMap[item.name] = (profMap[item.name] || 0) + profit;
    });
  });

  const sorted = Object.entries(profMap)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (empty) empty.style.display = 'none';

  const labels = sorted.map(e => e[0]);
  const data   = sorted.map(e => e[1]);

  if (_topProfitChart) _topProfitChart.destroy();
  _topProfitChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Profit',
        data,
        backgroundColor: labels.map((_,i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor:     labels.map((_,i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2, borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y', // horizontal bar
      plugins: { legend: { display: false } },
      scales: {
        x: { 
          grid: { color: 'rgba(255,255,255,0.05)' },
          beginAtZero: true,
          ticks: { callback: (val) => 'Rp ' + val.toLocaleString('id-ID') }
        },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

/* ================================================================
   UTIL
================================================================ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

window.loadChartData = renderAll;
