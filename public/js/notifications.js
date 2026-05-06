import { userCol } from './firebase.js';
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   NOTIFICATIONS — Low Stock Watcher, scoped per authenticated user.
   Waits for 'userReady' event dispatched by guard.js.
================================================================ */

let _lowItems = [];

/* ── Start listener only after auth is ready ── */
document.addEventListener('userReady', ({ detail: { uid } }) => {
  // ✅ Listen to users/{uid}/products
  onSnapshot(userCol(uid, 'products'), snap => {
    _lowItems = [];
    snap.forEach(d => {
      const data = d.data();
      if (!data.Name) return;
      const stock     = parseInt(data.Stock)             || 0;
      const threshold = parseInt(data.lowStockThreshold) || 10;
      if (stock <= threshold) {
        _lowItems.push({
          id: d.id,
          name: data.Name,
          stock,
          threshold,
          category: data.Category || 'Others',
          unit: data.Unit || 'pcs'
        });
      }
    });
    // Sort: most critical (lowest stock) first
    _lowItems.sort((a, b) => a.stock - b.stock);
    renderBadge();
    renderPanel();
  });
});

/* ── Badge count ── */
function renderBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (_lowItems.length === 0) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'flex';
    badge.textContent   = _lowItems.length > 99 ? '99+' : _lowItems.length;
  }
}

/* ── Panel body ── */
function renderPanel() {
  const body = document.getElementById('notifPanelBody');
  if (!body) return;

  if (_lowItems.length === 0) {
    body.innerHTML = `
      <div class="notif-panel-empty">
        <i class="fas fa-circle-check" style="color:var(--green);opacity:1;"></i>
        All products have sufficient stock!
      </div>`;
    return;
  }

  body.innerHTML = _lowItems.map(item => {
    const isCritical = item.stock <= Math.ceil(item.threshold * 0.3);
    const cls   = isCritical ? 'critical' : 'warning';
    const emoji = isCritical ? '🚨' : '⚠️';
    return `
      <div class="notif-item">
        <div class="notif-item-icon ${cls}">${emoji}</div>
        <div class="notif-item-info">
          <div class="notif-item-name">${item.name}</div>
          <div class="notif-item-sub">${item.category} · Threshold: ${item.threshold} ${item.unit}</div>
        </div>
        <div class="notif-item-stock ${cls}">${item.stock} ${item.unit}</div>
      </div>`;
  }).join('');
}

/* ── Toggle panel on bell click ── */
window.toggleNotifPanel = function() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.classList.toggle('open');
};

/* ── Close panel if click is outside ── */
document.addEventListener('click', e => {
  const wrap  = document.getElementById('bellWrap');
  const panel = document.getElementById('notifPanel');
  if (!wrap || !panel) return;
  if (!wrap.contains(e.target)) panel.classList.remove('open');
});
