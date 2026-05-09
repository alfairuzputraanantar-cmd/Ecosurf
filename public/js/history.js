import { userCol } from "./firebase.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   HISTORY — realtime, scoped per authenticated user.
   Waits for 'userReady' event dispatched by guard.js.
================================================================ */

const CAT_EMOJI = {
  Food:'🍱', Beverages:'🥤', Electronics:'💡',
  Clothing:'👕', Cosmetics:'💄', Others:'📦'
};

let allRows   = [];
let activeTab = 'all'; // 'all' | 'Added' | 'Edited' | 'Deleted' | 'Sold' | 'Restock'
let activeTimeScope = 'today'; // 'today' | '7days' | '30days' | 'all'

/* ── Start listener only after auth is ready ── */
document.addEventListener('userReady', ({ detail: { uid } }) => {
  onSnapshot(userCol(uid, 'history'), (snapshot) => {
    allRows = [];
    snapshot.forEach(d => allRows.push({ id: d.id, ...d.data() }));

    allRows.sort((a, b) => getCreatedAt(b).localeCompare(getCreatedAt(a)));
    renderHistory();
  });

  onSnapshot(userCol(uid, 'transactions'), (snapshot) => {
    window._allTransactions = [];
    snapshot.forEach(d => window._allTransactions.push({ id: d.id, ...d.data() }));
    if (window.renderSalesTimeline) window.renderSalesTimeline();
  });
});

/* ── Utilities ── */
function getCreatedAt(r) {
  if (r.createdAt) return r.createdAt;
  const t = r.timestamp || '';
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  // Remove .000Z to treat as local time if it's from the old timestamp format
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;
  return new Date().toISOString();
}

function getRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  const todayStr = now.toLocaleDateString('en-CA');
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA');
  
  const targetStr = date.toLocaleDateString('en-CA');
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} mins ago`;
  if (targetStr === todayStr) return `Today • ${timeStr}`;
  if (targetStr === yesterdayStr) return `Yesterday • ${timeStr}`;
  
  return date.toLocaleDateString('en-GB') + ' • ' + timeStr;
}

function getGroupLabel(isoString) {
  if (!isoString) return 'Older Activities';
  
  const date = new Date(isoString);
  const now = new Date();
  const targetStr = date.toLocaleDateString('en-CA');
  
  const todayStr = now.toLocaleDateString('en-CA');
  if (targetStr === todayStr) return 'Today';
  
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA');
  if (targetStr === yesterdayStr) return 'Yesterday';

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  if (date >= startOfWeek) return 'Earlier This Week';

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (date >= startOfMonth) return 'Earlier This Month';

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/* ── Render ── */
function renderHistory() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  const now = new Date();
  let timeLimit = null;
  if (activeTimeScope === 'today') {
    timeLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (activeTimeScope === '7days') {
    timeLimit = new Date(now); timeLimit.setDate(now.getDate() - 7);
  } else if (activeTimeScope === '30days') {
    timeLimit = new Date(now); timeLimit.setDate(now.getDate() - 30);
  }

  // 1. Filter by Time Scope
  const timeFiltered = allRows.filter(r => {
    if (!timeLimit) return true;
    return new Date(getCreatedAt(r)) >= timeLimit;
  });

  // 2. Compute Analytics Summary
  let totalRestocks = 0;
  let totalAdded = 0;
  let totalEdited = 0;
  let totalDeleted = 0;
  const uniqueSales = new Set();
  const otherMovements = [];

  timeFiltered.forEach(r => {
    if (r.action === 'Sold') {
      uniqueSales.add(r.transactionId || getCreatedAt(r));
    } else {
      if (r.action === 'Restock') totalRestocks++;
      else if (r.action === 'Added') totalAdded++;
      else if (r.action === 'Edited') totalEdited++;
      else if (r.action === 'Deleted') totalDeleted++;
      
      otherMovements.push(r.id);
    }
  });

  const totalSales = uniqueSales.size;
  const movements = totalSales + otherMovements.length;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('statSales', totalSales);
  setText('statRestocks', totalRestocks);
  setText('statMovements', movements);
  setText('statAdded', totalAdded);
  setText('statEdited', totalEdited);
  setText('statDeleted', totalDeleted);

  // 3. Filter by Action Tab and Search
  const searchQ = (document.getElementById('historySearch')?.value || '').toLowerCase();
  const actionFiltered = timeFiltered.filter(r => {
    if (activeTab !== 'all' && r.action !== activeTab) return false;
    if (searchQ && !(r.productName || '').toLowerCase().includes(searchQ)) return false;
    return true;
  });

  if (actionFiltered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clock-rotate-left"></i>
        <p>No records found for this filter.</p>
      </div>`;
    return;
  }

  // 4. Group by Time & Transactions
  const groupedRows = [];
  const processedTx = new Set();

  actionFiltered.forEach(r => {
    if (r.action === 'Sold') {
      const txId = r.transactionId || getCreatedAt(r);
      if (processedTx.has(txId)) return;
      
      // Find all items in this transaction
      const txItems = actionFiltered.filter(item => (item.transactionId || getCreatedAt(item)) === txId && item.action === 'Sold');
      
      // Calculate total for this transaction
      let total = 0;
      txItems.forEach(item => {
        // Parse subtotal from details "Subtotal: Rp 15.000"
        const match = (item.details || '').match(/Rp\s*([\d.]+)/);
        if (match) total += parseInt(match[1].replace(/\./g, '')) || 0;
      });

      groupedRows.push({
        isGroup: true,
        action: 'Sold',
        transactionId: txId,
        createdAt: getCreatedAt(r),
        items: txItems,
        total: total
      });
      processedTx.add(txId);
    } else {
      groupedRows.push({ ...r, isGroup: false });
    }
  });

  const groups = {};
  groupedRows.forEach(r => {
    const gl = getGroupLabel(r.createdAt);
    if (!groups[gl]) groups[gl] = [];
    groups[gl].push(r);
  });

  // 5. Render Timeline
  let html = '';
  const groupOrder = ['Today', 'Yesterday', 'Earlier This Week', 'Earlier This Month'];
  const allGroupLabels = Object.keys(groups).sort((a, b) => {
    const idxA = groupOrder.indexOf(a);
    const idxB = groupOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  allGroupLabels.forEach(gl => {
    html += `<div class="timeline-group">
      <div class="timeline-group-header">${gl}</div>`;
    
    groups[gl].forEach(r => {
      if (r.isGroup) {
        // Render Grouped Transaction
        const itemNames = r.items.map(it => it.productName).join(', ');
        const subItemsHtml = r.items.map(it => {
          const qtyMatch = (it.details || '').match(/Sold:\s*(\d+)/);
          const qty = qtyMatch ? qtyMatch[1] : '1';
          const subMatch = (it.details || '').match(/Subtotal:\s*Rp\s*([\d.]+)/);
          const sub = subMatch ? subMatch[1] : '0';
          return `<div class="timeline-sub-item">
            <span><span class="qty">${qty}x</span> ${it.productName}</span>
            <span>Rp ${sub}</span>
          </div>`;
        }).join('');

        html += `
          <div class="timeline-item tl-sold">
            <div class="timeline-icon"><i class="fas fa-cart-shopping"></i></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-badge">Transaction</span>
                <span class="timeline-product">${r.items.length} Items Sold</span>
              </div>
              <div class="timeline-body">
                <div class="timeline-sub-list">${subItemsHtml}</div>
              </div>
              <div class="timeline-footer">
                <div class="timeline-total">Total: Rp ${r.total.toLocaleString('id-ID')}</div>
              </div>
              <div class="timeline-time">${getRelativeTime(r.createdAt)}</div>
            </div>
          </div>`;
      } else {
        // Render Individual Action (Added, Edited, Deleted, Restock)
        const isDeleted = r.action === 'Deleted';
        const isEdited  = r.action === 'Edited';
        const isRestock = r.action === 'Restock';
        
        const emoji   = isDeleted ? '<i class="fas fa-trash"></i>' : isEdited ? '<i class="fas fa-pen"></i>' : isRestock ? '<i class="fas fa-truck"></i>' : '<i class="fas fa-plus"></i>';
        const actionCls = isDeleted ? 'tl-deleted' : isEdited ? 'tl-edited' : isRestock ? 'tl-restock' : 'tl-added';
        
        html += `
          <div class="timeline-item ${actionCls}">
            <div class="timeline-icon">${emoji}</div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-badge">${r.action || 'Added'}</span>
                <span class="timeline-product">${r.productName || '-'}</span>
              </div>
              <div class="timeline-body">${r.details || ''}</div>
              <div class="timeline-time">${getRelativeTime(getCreatedAt(r))}</div>
            </div>
          </div>`;
      }
    });
    html += `</div>`;
  });

  listEl.innerHTML = html;
}

/* ── Tab switching ── */
window.switchHistoryTab = function(tab) {
  activeTab = tab;
  document.querySelectorAll('.hist-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.background  = active ? 'var(--brand-grd)' : 'var(--surface2)';
    btn.style.color       = active ? '#fff'             : 'var(--muted)';
    btn.style.borderColor = active ? 'transparent'      : 'var(--border)';
  });
  renderHistory();
};

window.switchTimeScope = function(scope) {
  activeTimeScope = scope;
  document.querySelectorAll('.hist-time-tab').forEach(btn => {
    const active = btn.dataset.time === scope;
    btn.style.background  = active ? 'var(--brand-grd)' : 'var(--surface2)';
    btn.style.color       = active ? '#fff'             : 'var(--muted)';
    btn.style.borderColor = active ? 'transparent'      : 'var(--border)';
  });
  renderHistory();
};

/* ── Search ── */
window.filterHistory = function() {
  renderHistory();
};

/* ================================================================
   SALES TIMELINE TAB LOGIC
================================================================ */
let activeSalesTimeScope = 'today';

window.switchSalesTimeScope = function(scope) {
  activeSalesTimeScope = scope;
  document.querySelectorAll('.hist-sales-tab').forEach(btn => {
    const active = btn.dataset.time === scope;
    btn.style.background  = active ? 'var(--brand-grd)' : 'var(--surface2)';
    btn.style.color       = active ? '#fff'             : 'var(--muted)';
    btn.style.borderColor = active ? 'transparent'      : 'var(--border)';
  });
  window.renderSalesTimeline();
};

window.renderSalesTimeline = function() {
  const listEl = document.getElementById('salesTimelineList');
  if (!listEl) return;

  const txs = window._allTransactions || [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  let timeLimit = null;
  if (activeSalesTimeScope === 'today') {
    timeLimit = todayStart;
  } else if (activeSalesTimeScope === '7days') {
    timeLimit = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  } else if (activeSalesTimeScope === '30days') {
    timeLimit = now.getTime() - (30 * 24 * 60 * 60 * 1000);
  }

  // 1. Filter Transactions
  const filteredTxs = txs.filter(tx => {
    if (!timeLimit) return true;
    const txTime = new Date(tx.createdAt).getTime();
    return txTime >= timeLimit;
  });

  // Sort descending
  filteredTxs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 2. Compute Summary
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalQty = 0;

  filteredTxs.forEach(tx => {
    totalRevenue += tx.total || 0;
    totalProfit += tx.totalProfit || 0;
    (tx.items || []).forEach(item => {
      totalQty += item.qty || 0;
    });
  });

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('salesTabRevenue', 'Rp ' + totalRevenue.toLocaleString('id-ID'));
  setText('salesTabProfit', 'Rp ' + totalProfit.toLocaleString('id-ID'));
  setText('salesTabQty', totalQty);

  if (filteredTxs.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-shopping-cart"></i>
        <p>No sales found for this period.</p>
      </div>`;
    return;
  }

  // 3. Group by Time
  const groups = {};
  filteredTxs.forEach(tx => {
    const gl = getGroupLabel(tx.createdAt);
    if (!groups[gl]) groups[gl] = [];
    groups[gl].push(tx);
  });

  // 4. Render
  let html = '';
  const groupOrder = ['Today', 'Yesterday', 'Earlier This Week', 'Earlier This Month'];
  const allGroupLabels = Object.keys(groups).sort((a, b) => {
    const idxA = groupOrder.indexOf(a);
    const idxB = groupOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  allGroupLabels.forEach(gl => {
    html += `<div class="timeline-group">
      <div class="timeline-group-header">${gl}</div>`;
    
    groups[gl].forEach(tx => {
      const subItemsHtml = (tx.items || []).map(it => {
        return `<div class="timeline-sub-item">
          <span><span class="qty">${it.qty}x</span> ${it.name}</span>
          <span style="color:var(--text); font-weight:600;">Rp ${(it.price * it.qty).toLocaleString('id-ID')} <br>
          <span style="font-size:10px; color:var(--muted); font-weight:400; display:block; text-align:right;">Profit: Rp ${(it.profit || 0).toLocaleString('id-ID')}</span></span>
        </div>`;
      }).join('');

      const isQris = tx.paymentMethod === 'QRIS' || tx.paymentMethod === 'GoPay / QRIS';
      const methodBadge = tx.paymentMethod 
        ? `<span style="font-size:10px; padding: 2px 6px; border-radius: 4px; background: ${isQris ? 'rgba(34,201,151,.1)' : 'rgba(160,113,79,.1)'}; color: ${isQris ? 'var(--green)' : 'var(--brand-1)'}; font-weight: 600; margin-left: 6px;">${tx.paymentMethod}</span>` 
        : '';

      html += `
        <div class="timeline-item tl-sold">
          <div class="timeline-icon"><i class="fas fa-cart-shopping"></i></div>
          <div class="timeline-content">
            <div class="timeline-header" style="justify-content: flex-start; align-items: center;">
              <span class="timeline-badge" style="background: rgba(34,201,151,.1); color: var(--green); border-color: rgba(34,201,151,.2);">Sale</span>
              ${methodBadge}
            </div>
            <div class="timeline-body">
              <div class="timeline-sub-list">${subItemsHtml}</div>
            </div>
            <div class="timeline-footer" style="display: flex; justify-content: space-between; align-items: center;">
              <div class="timeline-time" style="margin-top:0;">${getRelativeTime(tx.createdAt)}</div>
              <div class="timeline-total" style="color: var(--brand-1);">Total: Rp ${(tx.total || 0).toLocaleString('id-ID')}</div>
            </div>
          </div>
        </div>`;
    });
    html += `</div>`;
  });

  listEl.innerHTML = html;
};
