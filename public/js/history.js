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
});

/* ── Utilities ── */
function getCreatedAt(r) {
  if (r.createdAt) return r.createdAt;
  const t = r.timestamp || '';
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00.000Z`;
  return new Date().toISOString();
}

function getRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  const todayStr = now.toISOString().slice(0, 10);
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const yestStr = yest.toISOString().slice(0, 10);
  
  const targetStr = isoString.slice(0, 10);
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} mins ago`;
  if (diffHr < 24 && targetStr === todayStr) return `Today • ${timeStr}`;
  if (targetStr === yestStr) return `Yesterday • ${timeStr}`;
  
  return date.toLocaleDateString('en-GB') + ' • ' + timeStr;
}

function getGroupLabel(isoString) {
  if (!isoString) return 'Older Activities';
  
  const date = new Date(isoString);
  const now = new Date();
  const targetStr = isoString.slice(0, 10);
  
  const todayStr = now.toISOString().slice(0, 10);
  if (targetStr === todayStr) return 'Today';
  
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (targetStr === yest.toISOString().slice(0, 10)) return 'Yesterday';

  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
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
  let totalSales = 0;
  let totalRestocks = 0;
  let movements = timeFiltered.length;
  let productCounts = {};

  timeFiltered.forEach(r => {
    if (r.action === 'Sold') totalSales++;
    if (r.action === 'Restock') totalRestocks++;
    const pName = r.productName || 'Unknown';
    productCounts[pName] = (productCounts[pName] || 0) + 1;
  });

  let topProduct = '-';
  let maxCount = 0;
  for (const [pName, count] of Object.entries(productCounts)) {
    if (count > maxCount && pName !== 'Unknown') {
      maxCount = count;
      topProduct = pName;
    }
  }

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('statSales', totalSales);
  setText('statRestocks', totalRestocks);
  setText('statMovements', movements);
  setText('statTopProduct', topProduct);

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

  // 4. Group by Time
  const groups = {};
  actionFiltered.forEach(r => {
    const gl = getGroupLabel(getCreatedAt(r));
    if (!groups[gl]) groups[gl] = [];
    groups[gl].push(r);
  });

  // 5. Render Timeline
  let html = '';
  const groupOrder = ['Today', 'Yesterday', 'Earlier This Week', 'Earlier This Month']; // Ensure order
  const allGroupLabels = Object.keys(groups).sort((a, b) => {
    const idxA = groupOrder.indexOf(a);
    const idxB = groupOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    // For months, sort backwards, but they are already sorted implicitly because rows are sorted descending
    return 0; 
  });

  allGroupLabels.forEach(gl => {
    html += `<div class="timeline-group">
      <div class="timeline-group-header">${gl}</div>`;
    
    groups[gl].forEach(r => {
      const isDeleted = r.action === 'Deleted';
      const isEdited  = r.action === 'Edited';
      const isSold    = r.action === 'Sold';
      const isRestock = r.action === 'Restock';
      
      const emoji   = isDeleted ? '<i class="fas fa-trash"></i>' : isEdited ? '<i class="fas fa-pen"></i>' : isSold ? '<i class="fas fa-cart-shopping"></i>' : isRestock ? '<i class="fas fa-truck"></i>' : '<i class="fas fa-plus"></i>';
      const actionCls = isDeleted ? 'tl-deleted' : isEdited ? 'tl-edited' : isSold ? 'tl-sold' : isRestock ? 'tl-restock' : 'tl-added';
      
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
