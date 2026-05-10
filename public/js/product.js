import { db, userCol, userDoc } from './firebase.js';
import {
  addDoc, onSnapshot, deleteDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   COLUMNS
   Core 5 always shown. Extra saved to localStorage.
================================================================ */
const CORE = ["Name", "Category", "Unit", "Price", "Stock"];
let extra      = [];
let hiddenCols = [];
let productsCache = [];
let _uid = null; // Set when userReady fires

try { extra      = JSON.parse(localStorage.getItem('cocacoy_extra_cols') || '[]'); } catch(e) { extra = []; }
try { hiddenCols = JSON.parse(localStorage.getItem('cocacoy_hidden_cols') || '[]'); } catch(e) { hiddenCols = []; }

const allPossibleCols = () => [...CORE, ...extra];
const visibleCols     = () => allPossibleCols().filter(c => !hiddenCols.includes(c));
const saveExtra       = () => localStorage.setItem('cocacoy_extra_cols', JSON.stringify(extra));
const saveHidden      = () => localStorage.setItem('cocacoy_hidden_cols', JSON.stringify(hiddenCols));

/* ================================================================
   DOM REFS
================================================================ */
const headEl  = () => document.getElementById('productHead');
const bodyEl  = () => document.getElementById('productTable');
const chipsEl = () => document.getElementById('activeColumnsList');
const emptyEl = () => document.getElementById('emptyProducts');

/* ================================================================
   RENDER TABLE HEADER
================================================================ */
function renderHeader() {
  const h = headEl();
  if (!h) return;
  h.innerHTML = visibleCols().map(c => `<th>${c}</th>`).join('');
}

/* ================================================================
   RENDER COLUMN CHIPS
================================================================ */
function renderChips() {
  const el = chipsEl();
  if (!el) return;
  el.innerHTML = allPossibleCols().map(c => `
    <div class="col-chip">
      ${c}
      ${CORE.includes(c) ? '' : `<span onclick="window.removeCol('${c}')" title="Remove">✕</span>`}
    </div>`
  ).join('');
}

/* ================================================================
   ADD COLUMN
================================================================ */
function addColumn() {
  const inp = document.getElementById('newColumnName');
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) { showToast('Enter a column name first.', 'error'); return; }
  if (allPossibleCols().map(c => c.toLowerCase()).includes(name.toLowerCase())) {
    showToast('Column already exists!', 'error'); return;
  }
  if (extra.length >= 2) {
    showToast('Maximum 2 custom columns allowed to keep the table readable.', 'warning');
    return;
  }
  extra.push(name);
  saveExtra();
  renderHeader();
  renderChips();
  renderTableBody();
  inp.value = '';
  showToast(`Column "${name}" added!`, 'success');
}

window.addColumn = addColumn;
window.removeCol = (name) => {
  extra = extra.filter(c => c !== name);
  saveExtra();
  renderHeader();
  renderChips();
  renderTableBody();
  showToast(`Column "${name}" removed.`, 'info');
};

/* ================================================================
   COLUMN VISIBILITY MODAL
================================================================ */
window._renderColToggles = () => {
  const el = document.getElementById('colToggleList');
  if (!el) return;
  el.innerHTML = allPossibleCols().map(c => `
    <div class="col-toggle-item">
      <label>${c}</label>
      <label class="switch">
        <input type="checkbox" id="vis-${c}" ${hiddenCols.includes(c) ? '' : 'checked'}/>
        <span class="slider"></span>
      </label>
    </div>`).join('');
};

window.applyColVisibility = () => {
  const newHidden = [];
  allPossibleCols().forEach(c => {
    const chk = document.getElementById(`vis-${c}`);
    if (chk && !chk.checked) newHidden.push(c);
  });
  hiddenCols = newHidden;
  saveHidden();
  renderHeader();
  renderTableBody();
  window.closeCustomizeModal();
  showToast('Column visibility updated!', 'success');
};

/* ================================================================
   OPEN ADD PRODUCT MODAL
================================================================ */
window.openAddModal = () => {
  const dyn = document.getElementById('dynamicInputs');
  if (dyn) {
    dyn.innerHTML = extra.length === 0 ? '' : `
      <div style="margin:14px 0 0;border-top:1px solid var(--border);padding-top:14px;">
        <div class="form-label" style="color:var(--brand-1);margin-bottom:10px;">
          <i class="fas fa-plus-circle"></i> Custom Fields
        </div>
        ${extra.map(c => `
          <div class="form-group">
            <label class="form-label">${c}</label>
            <input class="form-control" id="dyn-${c}" placeholder="Enter ${c}..."/>
          </div>`).join('')}
      </div>`;
  }
  
  // ✅ Pre-fill Low Stock Threshold from Global Settings
  const globalThreshold = localStorage.getItem('cocacoy_low_stock_threshold') || '10';
  const threshEl = document.getElementById('core-threshold');
  if (threshEl) threshEl.value = globalThreshold;

  // ✅ Auto-generate Barcode
  setTimeout(() => window.regenerateBarcode('add'), 100);

  const modalEl = document.getElementById('addModal');
  modalEl.classList.add('open');
  const modalInner = modalEl.querySelector('.modal');
  if (modalInner) modalInner.scrollTop = 0;
};

/* ================================================================
   SAVE NEW PRODUCT
================================================================ */
window.saveProduct = async () => {
  if (!_uid) { showToast('Not authenticated.', 'error'); return; }

  const v     = id => (document.getElementById(id)?.value || '').trim();
  const name  = v('core-name');
  const stock = v('core-stock');
  const buyPrice = v('core-buyPrice') || '0';
  const sellPrice = v('core-sellPrice') || '0';
  const cat   = v('core-category');
  const unit  = v('core-unit') || 'pcs';
  const thresh = v('core-threshold') || '10';
  const notes = v('core-notes');
  const barcode = v('core-barcode');

  if (!name)  { showToast('Product name is required!',   'error'); return; }
  if (!stock) { showToast('Stock quantity is required!', 'error'); return; }
  if (isNaN(Number(stock)) || Number(stock) < 0) { showToast('Stock must be a non-negative number!', 'error'); return; }
  if (isNaN(Number(buyPrice)) || Number(buyPrice) < 0) { showToast('Buy Price must be a non-negative number!', 'error'); return; }
  if (isNaN(Number(sellPrice)) || Number(sellPrice) < 0) { showToast('Sell Price must be a non-negative number!', 'error'); return; }

  const btn = document.getElementById('addBtn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Saving...'; btn.disabled = true; }

  try {
    const now = new Date();
    const product = {
      Name: name, 
      Stock: Number(stock), 
      Price: Number(sellPrice),
      BuyPrice: Number(buyPrice), 
      SellPrice: Number(sellPrice),
      Category: cat, 
      Unit: unit, 
      Notes: notes,
      lowStockThreshold: Number(thresh),
      barcode: barcode,
      createdAt: now.toISOString()
    };
    extra.forEach(c => {
      product[c] = (document.getElementById(`dyn-${c}`)?.value || '').trim();
    });

    // ✅ Write to users/{uid}/products
    await addDoc(userCol(_uid, 'products'), product);

    // ✅ Write to users/{uid}/history
    await addDoc(userCol(_uid, 'history'), {
      productName: name,
      action:      'Added',
      details:     `Stock: ${stock} | Sell: Rp ${Number(sellPrice).toLocaleString('id-ID')} | Buy: Rp ${Number(buyPrice).toLocaleString('id-ID')}`,
      timestamp:   now.toLocaleString('en-GB'),
      createdAt:   now.toISOString(),
      category:    cat || 'Others'
    });

    showToast(`"${name}" saved successfully!`, 'success');
    window.closeAddModal();

    ['core-name','core-stock','core-price','core-sku','core-notes','core-threshold']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const catEl = document.getElementById('core-category');
    if (catEl) catEl.value = '';
    extra.forEach(c => { const el = document.getElementById(`dyn-${c}`); if (el) el.value = ''; });

  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    console.error('saveProduct error:', e);
  }

  if (btn) { btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Product'; btn.disabled = false; }
};

/* ================================================================
   SEARCH
================================================================ */
window.filterTable = () => {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  document.querySelectorAll('#productTable tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

/* ================================================================
   RENDER TABLE BODY
================================================================ */
function renderTableBody() {
  const tbody = bodyEl();
  const empty = emptyEl();
  if (!tbody) return;

  tbody.innerHTML = '';
  let count = 0;

  productsCache.forEach(prod => {
    const data = prod.data;
    const id   = prod.id;
    if (!data.Name) return;
    count++;

    const stockNum  = parseInt(data.Stock)             || 0;
    const priceNum  = parseInt(data.Price)             || 0;
    const threshold = parseInt(data.lowStockThreshold) || 10;
    const stockCls  = stockNum <= Math.ceil(threshold * 0.3) ? 'tag-red'
                    : stockNum <= threshold                   ? 'tag-yellow'
                    : 'tag-green';

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => window.openDetailModal(id, data);

    visibleCols().forEach(col => {
      const td = document.createElement('td');
      td.setAttribute('data-label', col);
      if (col === 'Name') {
        const barcodeHtml = data.barcode ? 
          `<div style="font-size:11px;color:var(--muted);font-weight:400;margin-top:4px;font-family:monospace;">
             <i class="fas fa-barcode"></i> ${data.barcode}
           </div>` : '';
        td.innerHTML = `
          <div style="font-weight:600;">${data.Name}</div>
          ${barcodeHtml}
        `;
      } else if (col === 'Price') {
        const sell = parseInt(data.SellPrice || data.Price) || 0;
        const buy  = parseInt(data.BuyPrice) || 0;
        
        td.style.fontWeight = '700';
        td.style.color = 'var(--brand-1)';
        td.innerHTML = `
          <div>Rp ${sell.toLocaleString('id-ID')}</div>
          <div style="font-size:11px;color:var(--muted);font-weight:400;margin-top:4px;">
            Buy: Rp ${buy.toLocaleString('id-ID')}
          </div>
        `;
      } else if (col === 'Stock') {
        const warn = stockNum <= threshold
          ? `<i class="fas fa-triangle-exclamation" style="color:var(--yellow);margin-left:5px;font-size:11px;" title="Low stock!"></i>`
          : '';
        td.innerHTML = `<span class="tag ${stockCls}">${stockNum} ${data.Unit||''}</span>${warn}`;
      } else if (col === 'Category') {
        td.innerHTML = data.Category
          ? `<span class="tag tag-copper">${data.Category}</span>`
          : '-';
      } else {
        td.textContent = (data[col] !== undefined && data[col] !== '') ? data[col] : '-';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (empty) empty.style.display = count === 0 ? 'block' : 'none';
}

/* ================================================================
   PRODUCT DETAIL MODAL
================================================================ */
window.openDetailModal = (id, data) => {
  const title = document.getElementById('detail-title');
  const body  = document.getElementById('detail-body');
  if (!title || !body) return;

  title.innerHTML = `<i class="fas fa-box"></i> ${data.Name}`;
  
  const buy = parseInt(data.BuyPrice) || 0;
  const sell = parseInt(data.SellPrice || data.Price) || 0;
  const margin = sell - buy;
  const marginPct = sell > 0 ? Math.round((margin / sell) * 100) : 0;

  body.innerHTML = `
    <!-- BARCODE DISPLAY -->
    <div style="background: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; display: flex; flex-direction: column; align-items: center; border: 1px solid var(--border); box-shadow: inset 0 0 15px rgba(0,0,0,0.1);">
      <svg id="detail-barcode-svg" style="max-height: 150px; width: 100%;"></svg>
      <div style="font-family: monospace; font-size: 18px; color: #333; margin-top: 12px; font-weight: 800; letter-spacing: 2px;">${data.barcode || 'NO BARCODE'}</div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <div class="stat-label" style="font-size:11px; margin-bottom:4px;">CATEGORY</div>
        <div style="font-weight:700;">${data.Category || 'Others'}</div>
      </div>
      <div>
        <div class="stat-label" style="font-size:11px; margin-bottom:4px;">STOCK</div>
        <div style="font-weight:700;">${data.Stock} ${data.Unit || 'pcs'}</div>
      </div>
      <div>
        <div class="stat-label" style="font-size:11px; margin-bottom:4px;">BUY PRICE</div>
        <div style="font-weight:700;">Rp ${buy.toLocaleString('id-ID')}</div>
      </div>
      <div>
        <div class="stat-label" style="font-size:11px; margin-bottom:4px;">SELL PRICE</div>
        <div style="font-weight:700; color:var(--brand-1);">Rp ${sell.toLocaleString('id-ID')}</div>
      </div>
    </div>

    <div style="margin-top:20px; padding-top:20px; border-top: 1px solid var(--border);">
      <div class="stat-label" style="font-size:11px; margin-bottom:4px;">MARGIN / PROFIT</div>
      <div style="font-weight:700; color:var(--green);">
        Rp ${margin.toLocaleString('id-ID')} (${marginPct}%)
      </div>
    </div>

    <div style="margin-top:20px; padding-top:20px; border-top: 1px solid var(--border);">
      <div class="stat-label" style="font-size:11px; margin-bottom:4px;">NOTES</div>
      <div style="font-size:14px; color:var(--muted); font-style: italic;">
        ${data.Notes || 'No notes available.'}
      </div>
    </div>

    ${extra.length > 0 ? `
      <div style="margin-top:20px; padding-top:20px; border-top: 1px solid var(--border);">
        <div class="stat-label" style="font-size:11px; margin-bottom:10px;">CUSTOM FIELDS</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          ${extra.map(c => `
            <div>
              <div style="font-size:10px; color:var(--muted); text-transform:uppercase;">${c}</div>
              <div style="font-size:13px; font-weight:600;">${data[c] || '-'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- ACTION BUTTONS (Moved Inside Scroll) -->
    <div class="modal-grid-actions" style="margin-top: 30px; padding: 0; background: none; border-top: 1px solid var(--border); padding-top: 25px;">
      <button class="btn btn-info" id="detail-print-btn" style="justify-content: center; padding: 14px;">
        <i class="fas fa-print"></i> Print Barcode
      </button>
      <button class="btn btn-success" id="detail-restock-btn" style="justify-content: center; padding: 14px;">
        <i class="fas fa-plus-circle"></i> Restock
      </button>
      <button class="btn btn-warn" id="detail-edit-btn" style="justify-content: center; padding: 14px;">
        <i class="fas fa-pen-to-square"></i> Edit
      </button>
      <button class="btn btn-danger" id="detail-delete-btn" style="justify-content: center; padding: 14px;">
        <i class="fas fa-trash"></i> Delete
      </button>
    </div>
  `;

  // Render Barcode
  if (data.barcode) {
    setTimeout(() => window.renderBarcodePreview('detail-barcode-svg', data.barcode), 50);
  }

  // Setup actions (Now inside the rendered HTML)
  const btnPrint   = document.getElementById('detail-print-btn');
  const btnRestock = document.getElementById('detail-restock-btn');
  const btnEdit    = document.getElementById('detail-edit-btn');
  const btnDelete  = document.getElementById('detail-delete-btn');

  if (btnPrint)   btnPrint.onclick   = () => window.printBarcode(data);
  if (btnRestock) btnRestock.onclick = () => { window.closeDetailModal(); window.openRestockModal(id, data); };
  if (btnEdit)    btnEdit.onclick    = () => { window.closeDetailModal(); window.openEditModal(id, data); };
  if (btnDelete)  btnDelete.onclick  = () => { window.closeDetailModal(); window.confirmDelete(id, data.Name || '', data.Category || 'Others'); };

  document.getElementById('detailModal').classList.add('open');
};

/* ================================================================
   REALTIME PRODUCT SNAPSHOT — waits for userReady
================================================================ */
function startTable(uid) {
  // ✅ Listen to users/{uid}/products
  onSnapshot(userCol(uid, 'products'), snap => {
    productsCache = [];
    snap.forEach(d => productsCache.push({ id: d.id, data: d.data() }));
    renderTableBody();
  });
}

/* ================================================================
   EDIT PRODUCT MODAL
================================================================ */
let _editDocId = null;

window.openEditModal = (id, data) => {
  _editDocId = id;
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('edit-name',      data.Name);
  set('edit-stock',     data.Stock);
  set('edit-buyPrice',  data.BuyPrice || '0');
  set('edit-sellPrice', data.SellPrice || data.Price || '0');
  set('edit-category',  data.Category);
  set('edit-unit',      data.Unit);
  set('edit-threshold', data.lowStockThreshold ?? 10);
  set('edit-notes',     data.Notes);

  const dyn = document.getElementById('editDynamicInputs');
  if (dyn) {
    dyn.innerHTML = extra.length === 0 ? '' : `
      <div style="margin:14px 0 0;border-top:1px solid var(--border);padding-top:14px;">
        <div class="form-label" style="color:var(--brand-1);margin-bottom:10px;">
          <i class="fas fa-sliders"></i> Custom Fields
        </div>
        ${extra.map(col => `
          <div class="form-group">
            <label class="form-label">${col}</label>
            <input class="form-control" id="edit-dyn-${col}"
              value="${(data[col] || '').replace(/"/g, '&quot;')}"
              placeholder="Enter ${col}..."/>
          </div>`).join('')}
      </div>`;
  }
  
  // ✅ Handle Barcode for Edit Modal
  setTimeout(() => {
    if (data.barcode) {
      document.getElementById('edit-barcode').value = data.barcode;
      window.renderBarcodePreview('edit-barcode-svg', data.barcode);
    } else {
      window.regenerateBarcode('edit'); // Generate new if legacy product
    }
  }, 100);

  const modalEl = document.getElementById('editModal');
  modalEl.classList.add('open');
  const modalInner = modalEl.querySelector('.modal');
  if (modalInner) modalInner.scrollTop = 0;
};

window.saveEdit = async () => {
  if (!_editDocId || !_uid) return;

  const v     = id => (document.getElementById(id)?.value || '').trim();
  const name  = v('edit-name');
  const stock = v('edit-stock');
  const buyPrice  = v('edit-buyPrice') || '0';
  const sellPrice = v('edit-sellPrice') || '0';
  const cat   = v('edit-category');
  const unit  = v('edit-unit') || 'pcs';
  const thresh = v('edit-threshold') || '10';
  const notes = v('edit-notes');
  const barcode = v('edit-barcode');

  if (!name)  { showToast('Product name is required!', 'error'); return; }
  if (!stock && stock !== '0') { showToast('Stock quantity is required!', 'error'); return; }
  if (isNaN(Number(stock)) || Number(stock) < 0) { showToast('Stock cannot be negative!', 'error'); return; }
  if (isNaN(Number(buyPrice)) || Number(buyPrice) < 0) { showToast('Buy Price must be a valid number!', 'error'); return; }
  if (isNaN(Number(sellPrice)) || Number(sellPrice) < 0) { showToast('Sell Price must be a valid number!', 'error'); return; }

  const btn = document.getElementById('editSaveBtn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Saving...'; btn.disabled = true; }

  try {
    const now = new Date();
    const updateData = {
      Name: name, 
      Stock: Number(stock), 
      Price: Number(sellPrice),
      BuyPrice: Number(buyPrice), 
      SellPrice: Number(sellPrice),
      Category: cat, 
      Unit: unit, 
      Notes: notes,
      lowStockThreshold: Number(thresh),
      barcode: barcode,
      updatedAt: now.toISOString()
    };
    extra.forEach(col => {
      const el = document.getElementById(`edit-dyn-${col}`);
      if (el) updateData[col] = el.value.trim();
    });

    // ✅ Update users/{uid}/products/{id}
    await updateDoc(userDoc(_uid, 'products', _editDocId), updateData);

    // ✅ Log to users/{uid}/history
    await addDoc(userCol(_uid, 'history'), {
      productName: name,
      action:      'Edited',
      details:     `Stock: ${stock} | Sell: Rp ${Number(sellPrice).toLocaleString('id-ID')} | Buy: Rp ${Number(buyPrice).toLocaleString('id-ID')}`,
      timestamp:   now.toLocaleString('en-GB'),
      createdAt:   now.toISOString(),
      category:    cat || 'Others'
    });

    showToast(`"${name}" updated successfully!`, 'success');
    window.closeEditModal();
  } catch (e) {
    showToast('Update failed: ' + e.message, 'error');
    console.error('saveEdit error:', e);
  }

  if (btn) { btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Changes'; btn.disabled = false; }
};

window.closeEditModal = () => {
  document.getElementById('editModal')?.classList.remove('open');
  _editDocId = null;
};

/* ================================================================
   DELETE
================================================================ */
window.confirmDelete = (id, name, category) => {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.add('open');

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (!confirmBtn) return;

  const fresh = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

  fresh.onclick = async () => {
    if (!_uid) return;
    try {
      // ✅ Delete from users/{uid}/products/{id}
      await deleteDoc(userDoc(_uid, 'products', id));
      const now = new Date();
      // ✅ Log to users/{uid}/history
      await addDoc(userCol(_uid, 'history'), {
        productName: name,
        action:      'Deleted',
        details:     'Product removed from inventory',
        timestamp:   now.toLocaleString('en-GB'),
        createdAt:   now.toISOString(),
        category:    category || 'Others'
      });
      showToast(`"${name}" deleted.`, 'success');
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
    window.closeDeleteModal();
  };
};


/* ================================================================
   BOOT — wait for userReady event from guard.js
================================================================ */
document.addEventListener('userReady', ({ detail: { uid } }) => {
  _uid = uid;
  renderHeader();
  renderChips();
  startTable(uid);

  const addColBtn = document.getElementById('addColumnBtn');
  if (addColBtn) addColBtn.onclick = addColumn;

  const inp = document.getElementById('newColumnName');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') addColumn(); });
});
/* ================================================================
   RESTOCK LOGIC
================================================================ */
window.openRestockModal = function(id, data) {
  document.getElementById('restockProductId').value = id;
  document.getElementById('restockProductName').value = data.Name || '-';
  document.getElementById('restockCurrentStock').value = data.Stock || 0;
  document.getElementById('restockQuantity').value = '';
  document.getElementById('restockNote').value = '';
  document.getElementById('restockModalOverlay').classList.add('open');
};

window.closeRestockModal = function() {
  document.getElementById('restockModalOverlay').classList.remove('open');
};

window.processRestock = async function() {
  const id = document.getElementById('restockProductId').value;
  const name = document.getElementById('restockProductName').value;
  const current = parseInt(document.getElementById('restockCurrentStock').value) || 0;
  const add = parseInt(document.getElementById('restockQuantity').value);
  const note = document.getElementById('restockNote').value.trim();

  if (!add || add <= 0) {
    return window.showToast('Please enter a valid quantity.', 'error');
  }

  const btn = document.getElementById('confirmRestockBtn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

  try {
    // 1. Update Stock
    const pRef = userDoc(_uid, 'products', id);
    await updateDoc(pRef, {
      Stock: increment(add)
    });

    // 2. Add History
    const hCol = userCol(_uid, 'history');
    await addDoc(hCol, {
      action: 'Restock',
      productName: name,
      category: 'Restock', // Using Restock as a category for visual grouping
      details: `Restocked ${add} units. Stock increased from ${current} to ${current + add}.`,
      quantity: add,
      prevStock: current,
      newStock: current + add,
      note: note || '-',
      timestamp: new Date().toLocaleString('id-ID')
    });

    window.showToast(`Restocked ${add} items for ${name}!`, 'success');
    window.closeRestockModal();
  } catch (e) {
    console.error(e);
    window.showToast('Failed to restock. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
};

/* ================================================================
   BARCODE GENERATION & RENDERING
================================================================ */

function generateUniqueBarcode() {
  let newBarcode;
  let isUnique = false;
  // Fallback limit to prevent infinite loops (unlikely)
  let attempts = 0;
  
  while (!isUnique && attempts < 100) {
    // Generate a random 6 digit number
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    newBarcode = `CCY-${randomNum}`;
    
    // Check against productsCache
    const exists = productsCache.some(p => p.data.barcode === newBarcode);
    if (!exists) {
      isUnique = true;
    }
    attempts++;
  }
  
  return newBarcode;
}

window.renderBarcodePreview = (svgId, value) => {
  try {
    JsBarcode(`#${svgId}`, value, {
      format: "CODE128",
      lineColor: "#000",
      width: 3.0,
      height: 100,
      displayValue: false,
      margin: 0
    });
  } catch (e) {
    console.error("JsBarcode render error:", e);
  }
};

window.regenerateBarcode = (mode) => {
  const newBarcode = generateUniqueBarcode();
  if (mode === 'add') {
    const input = document.getElementById('core-barcode');
    if (input) input.value = newBarcode;
    window.renderBarcodePreview('add-barcode-svg', newBarcode);
  } else if (mode === 'edit') {
    const input = document.getElementById('edit-barcode');
    if (input) input.value = newBarcode;
    window.renderBarcodePreview('edit-barcode-svg', newBarcode);
  }
};

window.printBarcode = (data) => {
  if (!data.barcode) {
    showToast("This product doesn't have a barcode yet.", "error");
    return;
  }

  const printWindow = window.open('', '_blank', 'width=600,height=400');
  const sellPrice = parseInt(data.SellPrice || data.Price || 0);

  // Generate SVG in a temporary hidden element to get the path/source
  const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  tempSvg.id = "temp-print-svg";
  tempSvg.style.display = "none";
  document.body.appendChild(tempSvg);
  
  JsBarcode(tempSvg, data.barcode, {
    format: "CODE128",
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 16,
    fontOptions: "bold",
    margin: 10
  });

  const svgHtml = tempSvg.outerHTML;
  document.body.removeChild(tempSvg);

  printWindow.document.write(`
    <html>
      <head>
        <title>Print Barcode - ${data.Name}</title>
        <style>
          @page { margin: 0; size: 50mm 30mm; }
          body { 
            margin: 0; padding: 0; 
            font-family: 'Inter', sans-serif; 
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            width: 50mm; height: 30mm; overflow: hidden;
          }
          .name { font-size: 10px; font-weight: 800; text-align: center; margin-bottom: 2px; text-transform: uppercase; max-width: 90%; overflow: hidden; white-space: nowrap; }
          .price { font-size: 12px; font-weight: 900; margin-top: 2px; }
          .barcode-container { transform: scale(0.85); transform-origin: center; }
        </style>
      </head>
      <body>
        <div class="name">${data.Name}</div>
        <div class="barcode-container">${svgHtml}</div>
        <div class="price">Rp ${sellPrice.toLocaleString('id-ID')}</div>
        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.close(), 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
