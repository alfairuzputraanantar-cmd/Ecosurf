import { userCol } from "./firebase.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { animateEntrance } from "./motion.js";

/* ================================================================
   HISTORY — realtime, scoped per authenticated user.
   Waits for 'userReady' event dispatched by guard.js.
================================================================ */

const CAT_EMOJI = {
  Food: '🍱', Beverages: '🥤', Electronics: '💡',
  Clothing: '👕', Cosmetics: '💄', Others: '📦'
};

let allRows = [];
let activeTab = 'all'; // 'all' | 'Added' | 'Edited' | 'Deleted' | 'Sold' | 'Restock'
let activeTimeScope = 'all'; // 'today' | '7days' | '30days' | 'all'

/* ── Start listener only after auth is ready ── */
document.addEventListener('userReady', ({ detail: { uid } }) => {
  onSnapshot(userCol(uid, 'history'), (snapshot) => {
    allRows = [];
    snapshot.forEach(d => allRows.push({ id: d.id, ...d.data() }));

    allRows.sort((a, b) => getCreatedAt(b).localeCompare(getCreatedAt(a)));
    renderHistory();
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
  startOfWeek.setHours(0, 0, 0, 0);
  if (date >= startOfWeek) return 'Earlier This Week';

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (date >= startOfMonth) return 'Earlier This Month';

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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
        const isEdited = r.action === 'Edited';
        const isRestock = r.action === 'Restock';

        const emoji = isDeleted ? '<i class="fas fa-trash"></i>' : isEdited ? '<i class="fas fa-pen"></i>' : isRestock ? '<i class="fas fa-truck"></i>' : '<i class="fas fa-plus"></i>';
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
  
  // Trigger entrance animation for new items
  animateEntrance('.timeline-item, .history-item', 25);
}

/* ── Tab switching ── */
window.switchHistoryTab = function (tab) {
  activeTab = tab;
  document.querySelectorAll('.hist-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.background = active ? 'var(--brand-grd)' : 'var(--surface2)';
    btn.style.color = active ? '#fff' : 'var(--muted)';
    btn.style.borderColor = active ? 'transparent' : 'var(--border)';
  });
  renderHistory();
};

window.switchTimeScope = function (scope) {
  activeTimeScope = scope;
  document.querySelectorAll('.hist-time-tab').forEach(btn => {
    const active = btn.dataset.time === scope;
    btn.style.background = active ? 'var(--brand-grd)' : 'var(--surface2)';
    btn.style.color = active ? '#fff' : 'var(--muted)';
    btn.style.borderColor = active ? 'transparent' : 'var(--border)';
  });
  renderHistory();
};

/* ── Search ── */
window.filterHistory = function () {
  renderHistory();
};
