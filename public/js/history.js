import { db } from "./firebase.js";
import { collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   HISTORY — realtime, separated by action, sorted by date
================================================================ */

const CAT_EMOJI = {
  Food:'🍱', Beverages:'🥤', Electronics:'💡',
  Clothing:'👕', Cosmetics:'💄', Others:'📦'
};

let allRows = [];
let activeTab = 'all'; // 'all' | 'Added' | 'Edited' | 'Deleted'

/* ── Listen realtime ── */
onSnapshot(collection(db, "history"), (snapshot) => {
  allRows = [];
  snapshot.forEach(d => allRows.push({ id: d.id, ...d.data() }));

  // Sort newest first — use createdAt ISO (most reliable)
  // Fallback: parse DD/MM/YYYY HH:mm:ss timestamp string
  function toSortable(r) {
    if (r.createdAt) return r.createdAt; // ISO string, sorts correctly
    // en-GB format: "DD/MM/YYYY, HH:mm:ss" → convert to sortable
    const t = r.timestamp || '';
    const m = t.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
    return t;
  }
  allRows.sort((a, b) => toSortable(b).localeCompare(toSortable(a)));

  renderHistory();
});

/* ── Render with current tab filter ── */
function renderHistory() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  const filtered = activeTab === 'all'
    ? allRows
    : allRows.filter(r => r.action === activeTab);

  const searchQ = (document.getElementById('historySearch')?.value || '').toLowerCase();
  const shown   = filtered.filter(r =>
    (r.productName || '').toLowerCase().includes(searchQ)
  );

  if (shown.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clock-rotate-left"></i>
        <p>${activeTab === 'all' ? 'No transaction history yet.' : `No "${activeTab}" records yet.`}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = shown.map(r => {
    const isDeleted = r.action === 'Deleted';
    const isEdited  = r.action === 'Edited';
    const emoji   = isDeleted ? '🗑️' : isEdited ? '✏️' : (CAT_EMOJI[r.category] || '📦');
    const tagCls  = isDeleted ? 'tag-red' : isEdited ? 'tag-blue' : 'tag-green';
    const iconBg  = isDeleted
      ? 'background:rgba(247,95,95,.13)'
      : isEdited
        ? 'background:rgba(91,156,246,.13)'
        : 'background:rgba(34,201,151,.13)';

    return `
      <div class="history-item" data-search="${(r.productName||'').toLowerCase()}">
        <div class="history-icon" style="${iconBg}">${emoji}</div>
        <div class="history-info">
          <div class="history-name">
            ${r.productName || '-'}
            <span class="tag ${tagCls}" style="margin-left:8px;font-size:10px;padding:2px 8px;">
              ${r.action || 'Added'}
            </span>
          </div>
          <div class="history-meta">${r.details || ''}</div>
        </div>
        <div class="history-date">${r.timestamp || ''}</div>
      </div>`;
  }).join('');
}

/* ── Tab switching ── */
window.switchHistoryTab = function(tab) {
  activeTab = tab;

  // Update tab button styles
  document.querySelectorAll('.hist-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.background    = active ? 'var(--brand-grd)' : 'var(--surface2)';
    btn.style.color         = active ? '#fff' : 'var(--muted)';
    btn.style.borderColor   = active ? 'transparent' : 'var(--border)';
  });

  renderHistory();
};

/* ── Search ── */
window.filterHistory = function() {
  renderHistory();
};
