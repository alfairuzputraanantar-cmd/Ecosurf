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

try { extra = JSON.parse(localStorage.getItem('cocacoy_extra_cols') || '[]'); }
catch (e) { extra = []; }

const allCols = () => [...CORE, ...extra];
const saveExtra = () => localStorage.setItem('cocacoy_extra_cols', JSON.stringify(extra));

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
  h.innerHTML = allCols().map(c => `<th>${c}</th>`).join('') + '<th>Actions</th>';
}

/* ================================================================
   RENDER COLUMN CHIPS
================================================================ */
function renderChips() {
  const el = chipsEl();
  if (!el) return;
  el.innerHTML = allCols().map(c => `
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
  if (allCols().map(c => c.toLowerCase()).includes(name.toLowerCase())) {
    showToast('Column already exists!', 'error'); return;
  }
  extra.push(name);
  saveExtra();
  renderHeader();
  renderChips();
  inp.value = '';
  showToast(`Column "${name}" added!`, 'success');
}

window.addColumn = addColumn;
window.removeCol = (name) => {
  extra = extra.filter(c => c !== name);
  saveExtra();
  renderHeader();
  renderChips();
  showToast(`Column "${name}" removed.`, 'info');
};

/* ================================================================
   COLUMN VISIBILITY MODAL
================================================================ */
window._renderColToggles = () => {
  const el = document.getElementById('colToggleList');
  if (!el) return;
  el.innerHTML = allCols().map(c => `
    <div class="col-toggle-item">
      <label>${c}</label>
      <label class="switch">
        <input type="checkbox" id="vis-${c}" checked/>
        <span class="slider"></span>
      </label>
    </div>`).join('');
};

window.applyColVisibility = () => {
  renderHeader();
  window.closeCustomizeModal();
  showToast('Columns updated!', 'success');
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
function startTable() {
  onSnapshot(collection(db, 'products'), snap => {
    const tbody = bodyEl();
    const empty = emptyEl();
    if (!tbody) return;

    tbody.innerHTML = '';
    let count = 0;

    snap.forEach(d => {
      const data = d.data();
      if (!data.Name) return;
      count++;

      const stockNum = parseInt(data.Stock) || 0;
      const priceNum = parseInt(data.Price) || 0;
      const threshold = parseInt(data.lowStockThreshold) || 10;
      const stockCls = stockNum <= Math.ceil(threshold * 0.3) ? 'tag-red'
        : stockNum <= threshold ? 'tag-yellow'
          : 'tag-green';

      const tr = document.createElement('tr');

      allCols().forEach(col => {
        const td = document.createElement('td');
        if (col === 'Price') {
          td.style.fontWeight = '700';
          td.style.color = 'var(--brand-1)';
          td.textContent = 'Rp ' + priceNum.toLocaleString('id-ID');
        } else if (col === 'Stock') {
          // Show low-stock warning icon if at/below threshold
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
      editBtn.onclick = () => window.openEditModal(d.id, data);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.title = 'Delete Product';
      delBtn.onclick = () => window.confirmDelete(d.id, data.Name || '', data.Category || 'Others');

      actionTd.appendChild(editBtn);
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });

    if (empty) empty.style.display = count === 0 ? 'block' : 'none';
    renderHeader();
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
    await updateDoc(doc(db, 'products', _editDocId), {
      Name: name,
      Stock: stock,
      Price: price,
      Category: cat,
      Unit: unit,
      Notes: notes,
      lowStockThreshold: thresh,
      updatedAt: now.toISOString()
    });

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
