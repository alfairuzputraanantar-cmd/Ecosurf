import { db } from './firebase.js';
import {
  collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   COLUMNS
   Core 5 always shown. Extra saved to localStorage.
================================================================ */
const CORE = ["Name", "Category", "Unit", "Price", "Stock"];
let extra = [];
let hiddenCols = []; // List of hidden column names
let productsCache = []; // Global cache for real-time rendering

try { extra = JSON.parse(localStorage.getItem('cocacoy_extra_cols') || '[]'); }
catch (e) { extra = []; }

try { hiddenCols = JSON.parse(localStorage.getItem('cocacoy_hidden_cols') || '[]'); }
catch (e) { hiddenCols = []; }

const allPossibleCols = () => [...CORE, ...extra];
const visibleCols = () => allPossibleCols().filter(c => !hiddenCols.includes(c));

const saveExtra = () => localStorage.setItem('cocacoy_extra_cols', JSON.stringify(extra));
const saveHidden = () => localStorage.setItem('cocacoy_hidden_cols', JSON.stringify(hiddenCols));

/* ================================================================
   DOM REFS
================================================================ */
const headEl = () => document.getElementById('productHead');
const bodyEl = () => document.getElementById('productTable');
const chipsEl = () => document.getElementById('activeColumnsList');
const emptyEl = () => document.getElementById('emptyProducts');

/* ================================================================
   RENDER TABLE HEADER
================================================================ */
function renderHeader() {
  const h = headEl();
  if (!h) return;
  h.innerHTML = visibleCols().map(c => `<th>${c}</th>`).join('') + '<th>Actions</th>';
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
  extra.push(name);
  saveExtra();
  renderHeader();
  renderChips();
  renderTableBody(); // Re-render body with new column
  inp.value = '';
  showToast(`Column "${name}" added!`, 'success');
}

window.addColumn = addColumn;
window.removeCol = (name) => {
  extra = extra.filter(c => c !== name);
  saveExtra();
  renderHeader();
  renderChips();
  renderTableBody(); // Re-render body after removing column
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
    if (chk && !chk.checked) {
      newHidden.push(c);
    }
  });
  hiddenCols = newHidden;
  saveHidden();
  renderHeader();
  renderTableBody(); // Update body in real-time
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
  document.getElementById('addModal').classList.add('open');
};

/* ================================================================
   SAVE NEW PRODUCT
================================================================ */
window.saveProduct = async () => {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const name = v('core-name');
  const stock = v('core-stock');
  const price = v('core-price') || '0';
  const cat = v('core-category');
  const sku = v('core-sku');
  const unit = v('core-unit') || 'pcs';
  const notes = v('core-notes');
  const thresh = v('core-threshold') || '10';

  if (!name) { showToast('Product name is required!', 'error'); return; }
  if (!stock) { showToast('Stock quantity is required!', 'error'); return; }
  if (isNaN(Number(stock)) || Number(stock) < 0) {
    showToast('Stock must be a non-negative number!', 'error'); return;
  }
  if (isNaN(Number(price)) || Number(price) < 0) {
    showToast('Price must be a non-negative number!', 'error'); return;
  }

  const btn = document.getElementById('addBtn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Saving...'; btn.disabled = true; }

  try {
    const now = new Date();
    const product = {
      Name: name, Stock: stock, Price: price,
      Category: cat, SKU: sku, Unit: unit, Notes: notes,
      lowStockThreshold: thresh,
      createdAt: now.toISOString()
    };
    extra.forEach(c => {
      product[c] = (document.getElementById(`dyn-${c}`)?.value || '').trim();
    });

    await addDoc(collection(db, 'products'), product);

    await addDoc(collection(db, 'history'), {
      productName: name,
      action: 'Added',
      details: `Stock: ${stock} | Price: Rp ${Number(price).toLocaleString('id-ID')} | Category: ${cat || '-'}`,
      timestamp: now.toLocaleString('en-GB'),
      createdAt: now.toISOString(),
      category: cat || 'Others'
    });

    showToast(`"${name}" saved successfully!`, 'success');
    window.closeAddModal();

    // clear form
    ['core-name', 'core-stock', 'core-price', 'core-sku', 'core-notes', 'core-threshold']
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
   REALTIME PRODUCT TABLE
================================================================ */
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
    const id = prod.id;
    if (!data.Name) return;
    count++;

    const stockNum = parseInt(data.Stock) || 0;
    const priceNum = parseInt(data.Price) || 0;
    const threshold = parseInt(data.lowStockThreshold) || 10;
    const stockCls = stockNum <= Math.ceil(threshold * 0.3) ? 'tag-red'
      : stockNum <= threshold ? 'tag-yellow'
        : 'tag-green';

    const tr = document.createElement('tr');

    visibleCols().forEach(col => {
      const td = document.createElement('td');
      if (col === 'Price') {
        td.style.fontWeight = '700';
        td.style.color = 'var(--brand-1)';
        td.textContent = 'Rp ' + priceNum.toLocaleString('id-ID');
      } else if (col === 'Stock') {
        const warn = stockNum <= threshold
          ? `<i class="fas fa-triangle-exclamation" style="color:var(--yellow);margin-left:5px;font-size:11px;" title="Low stock!"></i>`
          : '';
        td.innerHTML = `<span class="tag ${stockCls}">${stockNum} ${data.Unit || ''}</span>${warn}`;
      } else if (col === 'Category') {
        td.innerHTML = data.Category
          ? `<span class="tag tag-copper">${data.Category}</span>`
          : '-';
      } else {
        td.textContent = (data[col] !== undefined && data[col] !== '') ? data[col] : '-';
      }
      tr.appendChild(td);
    });

    // Actions cell
    const actionTd = document.createElement('td');
    actionTd.style.whiteSpace = 'nowrap';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-warn btn-sm';
    editBtn.style.marginRight = '6px';
    editBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
    editBtn.title = 'Edit Product';
    editBtn.onclick = () => window.openEditModal(id, data);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
    delBtn.title = 'Delete Product';
    delBtn.onclick = () => window.confirmDelete(id, data.Name || '', data.Category || 'Others');

    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });

  if (empty) empty.style.display = count === 0 ? 'block' : 'none';
  renderHeader();
}

/* ================================================================
   REALTIME PRODUCT SNAPSHOT
================================================================ */
function startTable() {
  onSnapshot(collection(db, 'products'), snap => {
    productsCache = [];
    snap.forEach(d => {
      productsCache.push({ id: d.id, data: d.data() });
    });
    renderTableBody();
  });
}

/* ================================================================
   EDIT PRODUCT MODAL
================================================================ */
let _editDocId = null;

window.openEditModal = (id, data) => {
  _editDocId = id;
  const set = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.value = val ?? '';
  };
  set('edit-name', data.Name);
  set('edit-stock', data.Stock);
  set('edit-price', data.Price);
  set('edit-category', data.Category);
  set('edit-unit', data.Unit);
  set('edit-notes', data.Notes);
  set('edit-threshold', data.lowStockThreshold ?? 10);

  // Inject custom fields into edit modal too
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
  document.getElementById('editModal').classList.add('open');
};

window.saveEdit = async () => {
  if (!_editDocId) return;

  const v = id => (document.getElementById(id)?.value || '').trim();
  const name = v('edit-name');
  const stock = v('edit-stock');
  const price = v('edit-price') || '0';
  const cat = v('edit-category');
  const unit = v('edit-unit') || 'pcs';
  const notes = v('edit-notes');
  const thresh = v('edit-threshold') || '10';

  // Validation
  if (!name) { showToast('Product name is required!', 'error'); return; }
  if (!stock && stock !== '0') { showToast('Stock quantity is required!', 'error'); return; }
  if (isNaN(Number(stock)) || Number(stock) < 0) {
    showToast('Stock cannot be negative!', 'error'); return;
  }
  if (isNaN(Number(price)) || Number(price) < 0) {
    showToast('Price must be a valid number!', 'error'); return;
  }
  if (isNaN(Number(thresh)) || Number(thresh) < 0) {
    showToast('Threshold must be a valid number!', 'error'); return;
  }

  const btn = document.getElementById('editSaveBtn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Saving...'; btn.disabled = true; }

  try {
    const now = new Date();
    const updateData = {
      Name: name, Stock: stock, Price: price,
      Category: cat, Unit: unit, Notes: notes,
      lowStockThreshold: thresh,
      updatedAt: now.toISOString()
    };
    // Save custom fields too
    extra.forEach(col => {
      const el = document.getElementById(`edit-dyn-${col}`);
      if (el) updateData[col] = el.value.trim();
    });

    await updateDoc(doc(db, 'products', _editDocId), updateData);

    await addDoc(collection(db, 'history'), {
      productName: name,
      action: 'Edited',
      details: `Stock: ${stock} | Price: Rp ${Number(price).toLocaleString('id-ID')} | Category: ${cat || '-'}`,
      timestamp: now.toLocaleString('en-GB'),
      createdAt: now.toISOString(),
      category: cat || 'Others'
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
    try {
      await deleteDoc(doc(db, 'products', id));
      const now = new Date();
      await addDoc(collection(db, 'history'), {
        productName: name,
        action: 'Deleted',
        details: 'Product removed from inventory',
        timestamp: now.toLocaleString('en-GB'),
        createdAt: now.toISOString(),
        category: category || 'Others'
      });
      showToast(`"${name}" deleted.`, 'success');
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
    window.closeDeleteModal();
  };
};

/* ================================================================
   BOOT
================================================================ */
function boot() {
  renderHeader();
  renderChips();
  startTable();

  const addColBtn = document.getElementById('addColumnBtn');
  if (addColBtn) addColBtn.onclick = addColumn;

  const inp = document.getElementById('newColumnName');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') addColumn(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
