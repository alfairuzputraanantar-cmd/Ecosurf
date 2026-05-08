import { db, userCol, userDoc } from './firebase.js';
import {
  onSnapshot, addDoc, writeBatch, doc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   CASHIER — Real-time POS for CocaCoy ERP
   All data scoped to authenticated user via guard.js → userReady event
================================================================ */

const CATEGORY_EMOJI = {
  Food:'🍱', Drink:'🥤', Electronics:'💡', Clothing:'👕',
  Cosmetics:'💄', Goods:'📦', Others:'📦'
};

/* ── State ── */
let _uid       = null;
let _products  = [];    // [{id, ...data}]
let _cart      = {};    // {productId: {qty, name, price, stock, unit}}
let _activecat = 'all';
let _searchq   = '';

/* ================================================================
   BOOT — wait for Firebase auth via guard.js
================================================================ */
document.addEventListener('userReady', ({ detail: { uid } }) => {
  _uid = uid;
  startProductListener(uid);
  startTransactionListener(uid);
});

/* ================================================================
   REALTIME PRODUCT LISTENER
================================================================ */
function startProductListener(uid) {
  onSnapshot(userCol(uid, 'products'), snap => {
    _products = [];
    snap.forEach(d => {
      if (d.data().Name) _products.push({ id: d.id, ...d.data() });
    });
    renderCategoryFilter();
    renderProducts();
  });
}

/* ================================================================
   REALTIME TRANSACTION LISTENER — today's summary
================================================================ */
function startTransactionListener(uid) {
  onSnapshot(userCol(uid, 'transactions'), snap => {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    let revenue = 0, txCount = 0, itemCount = 0;
    snap.forEach(d => {
      const data = d.data();
      if ((data.createdAt || '').startsWith(todayStr)) {
        txCount++;
        revenue   += data.total     || 0;
        itemCount += data.itemCount || 0;
      }
    });
    setText('todayRevenue',  'Rp ' + revenue.toLocaleString('id-ID'));
    setText('todayTxCount',  txCount);
    setText('todayItemCount', itemCount);
  });
}

/* ================================================================
   RENDER CATEGORY FILTER TABS
================================================================ */
function renderCategoryFilter() {
  const el = document.getElementById('categoryFilter');
  if (!el) return;

  const cats = [...new Set(_products.map(p => p.Category || 'Others'))].sort();
  el.innerHTML = `<button class="cashier-filter-btn ${_activecat === 'all' ? 'active' : ''}"
    data-cat="all" onclick="setCategory('all', this)">All</button>`;
  cats.forEach(cat => {
    const emoji = CATEGORY_EMOJI[cat] || '📦';
    el.innerHTML += `<button class="cashier-filter-btn ${_activecat === cat ? 'active' : ''}"
      data-cat="${cat}" onclick="setCategory('${cat}', this)">${emoji} ${cat}</button>`;
  });
}

/* ================================================================
   RENDER PRODUCT GRID
================================================================ */
function renderProducts() {
  const el = document.getElementById('productGrid');
  if (!el) return;

  let filtered = _products;
  if (_activecat !== 'all')
    filtered = filtered.filter(p => (p.Category || 'Others') === _activecat);
  if (_searchq)
    filtered = filtered.filter(p => p.Name.toLowerCase().includes(_searchq));

  if (filtered.length === 0) {
    el.innerHTML = `<div class="cashier-empty" style="grid-column:1/-1;">
      <i class="fas fa-box-open"></i>
      <p>No products${_searchq ? ' found' : ''}.</p>
    </div>`;
    return;
  }

  el.innerHTML = filtered.map(p => {
    const stock    = parseInt(p.Stock) || 0;
    const price    = parseInt(p.SellPrice || p.Price) || 0;
    const oos      = stock <= 0;
    const inCart   = _cart[p.id] ? _cart[p.id].qty : 0;
    const emoji    = CATEGORY_EMOJI[p.Category] || '📦';
    const stockCls = stock === 0 ? 'tag-red' : stock <= (parseInt(p.lowStockThreshold)||10) ? 'tag-yellow' : 'tag-green';

    return `
      <div class="product-card ${oos ? 'out-of-stock' : ''} ${inCart ? 'in-cart' : ''}" 
        id="card-${p.id}" 
        onclick="addToCart('${p.id}')"
        ondblclick="removeFromCart('${p.id}', event)"
      >
        <div class="cart-badge" id="badge-${p.id}">${inCart}</div>
        <div class="product-card-emoji">${emoji}</div>
        <div class="product-card-name">${p.Name}</div>
        <div class="product-card-price">Rp ${price.toLocaleString('id-ID')}</div>
        <div class="product-card-stock">
          Stock: <span class="tag ${stockCls}" style="font-size:10px;padding:1px 7px;">${stock} ${p.Unit||'pcs'}</span>
        </div>
        <button
          class="product-card-add"
          ${oos ? 'disabled' : ''}
          title="${oos ? 'Out of stock' : 'Add to cart'}">
          ${oos ? '<i class="fas fa-ban" style="font-size:14px;"></i>' : '<i class="fas fa-plus"></i>'}
        </button>
      </div>`;
  }).join('');
}

/* ================================================================
   CATEGORY FILTER
================================================================ */
window.setCategory = (cat, btn) => {
  _activecat = cat;
  document.querySelectorAll('.cashier-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProducts();
};

/* ================================================================
   SEARCH
================================================================ */
window.filterProducts = (val) => {
  _searchq = val.toLowerCase().trim();
  renderProducts();
};

/* ================================================================
   CART MANAGEMENT
================================================================ */
window.addToCart = (productId) => {
  const prod = _products.find(p => p.id === productId);
  if (!prod) return;
  const stock = parseInt(prod.Stock) || 0;
  const inCart = _cart[productId]?.qty || 0;

  if (inCart >= stock) {
    showToast(`Stock for "${prod.Name}" is only ${stock}!`, 'warning');
    return;
  }

  if (!_cart[productId]) {
    _cart[productId] = {
      qty: 1,
      name: prod.Name,
      price: parseInt(prod.SellPrice || prod.Price) || 0,
      stock: stock,
      unit: prod.Unit || 'pcs',
      category: prod.Category || 'Others'
    };
  } else {
    _cart[productId].qty++;
  }

  updateCartUI();
  // Visual feedback
  const card = document.getElementById(`card-${productId}`);
  if (card) {
    card.classList.add('in-cart');
    const badge = document.getElementById(`badge-${productId}`);
    if (badge) { badge.textContent = _cart[productId].qty; badge.style.display = 'flex'; }
  }
};

window.removeFromCart = (productId, event) => {
  if (event) event.stopPropagation(); // prevent triggering onclick
  if (!_cart[productId]) return;

  const itemName = _cart[productId].name;
  delete _cart[productId];

  const card = document.getElementById(`card-${productId}`);
  if (card) {
    card.classList.remove('in-cart');
    const badge = document.getElementById(`badge-${productId}`);
    if (badge) badge.style.display = 'none';
  }

  showToast(`Removed "${itemName}" from cart`, 'info');
  updateCartUI();
  if (Object.keys(_cart).length > 0) renderCartSheet();
};

window.changeQty = (productId, delta) => {
  if (!_cart[productId]) return;
  const prod = _products.find(p => p.id === productId);
  const maxStock = prod ? (parseInt(prod.Stock) || 0) : _cart[productId].stock;

  _cart[productId].qty += delta;

  if (_cart[productId].qty <= 0) {
    delete _cart[productId];
    const card = document.getElementById(`card-${productId}`);
    if (card) {
      card.classList.remove('in-cart');
      const badge = document.getElementById(`badge-${productId}`);
      if (badge) badge.style.display = 'none';
    }
  } else if (_cart[productId].qty > maxStock) {
    _cart[productId].qty = maxStock;
    showToast('Exceeds available stock!', 'warning');
  } else {
    const badge = document.getElementById(`badge-${productId}`);
    if (badge) badge.textContent = _cart[productId].qty;
  }

  updateCartUI();
  if (Object.keys(_cart).length > 0) renderCartSheet();
};

window.setQty = (productId, val) => {
  if (!_cart[productId]) return;
  const prod = _products.find(p => p.id === productId);
  const maxStock = prod ? (parseInt(prod.Stock) || 0) : _cart[productId].stock;

  let newQty = parseInt(val);
  if (isNaN(newQty) || newQty <= 0) {
    // If user types 0 or invalid, remove it or set to 1. Setting to 1 is safer, but 0 removes.
    // Let's remove if 0, otherwise 1.
    if (newQty === 0) {
      changeQty(productId, -_cart[productId].qty); // Trigger removal logic
      return;
    }
    newQty = 1;
  }

  if (newQty > maxStock) {
    newQty = maxStock;
    showToast('Exceeds available stock!', 'warning');
  }

  _cart[productId].qty = newQty;

  const badge = document.getElementById(`badge-${productId}`);
  if (badge) badge.textContent = _cart[productId].qty;

  updateCartUI();
  if (Object.keys(_cart).length > 0) renderCartSheet();
};

/* ================================================================
   CART UI UPDATE
================================================================ */
function updateCartUI() {
  const items    = Object.entries(_cart);
  const count    = items.reduce((s, [, v]) => s + v.qty, 0);
  const total    = items.reduce((s, [, v]) => s + v.qty * v.price, 0);
  const cartBar  = document.getElementById('cartBar');

  setText('cartBarCount', `${count} item`);
  setText('cartBarTotal', 'Rp ' + total.toLocaleString('id-ID'));
  setText('cartTotalVal', 'Rp ' + total.toLocaleString('id-ID'));

  if (count > 0) cartBar?.classList.add('visible');
  else { cartBar?.classList.remove('visible'); closeCartSheet(); }
}

/* ================================================================
   CART SHEET
================================================================ */
window.openCartSheet = () => {
  renderCartSheet();
  document.getElementById('cartOverlay')?.classList.add('open');
  document.getElementById('cartSheet')?.classList.add('open');
};

window.closeCartSheet = () => {
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.getElementById('cartSheet')?.classList.remove('open');
};

function renderCartSheet() {
  const body = document.getElementById('cartBody');
  if (!body) return;
  const items = Object.entries(_cart);
  if (items.length === 0) { body.innerHTML = '<p style="text-align:center;color:var(--muted);padding:24px;">Cart is empty.</p>'; return; }

  body.innerHTML = items.map(([id, item]) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">Rp ${item.price.toLocaleString('id-ID')} / ${item.unit}</div>
      </div>
      <div class="cart-qty-ctrl">
        <button class="cart-qty-btn remove" onclick="changeQty('${id}', -1)">−</button>
        <input type="number" class="cart-qty-num" value="${item.qty}" min="1" onchange="setQty('${id}', this.value)" onfocus="this.select()" />
        <button class="cart-qty-btn" onclick="changeQty('${id}', 1)">+</button>
      </div>
      <div class="cart-item-subtotal">Rp ${(item.qty * item.price).toLocaleString('id-ID')}</div>
    </div>`).join('');
}

/* ================================================================
   PROCESS CHECKOUT — Atomic Firestore batch write
================================================================ */
window.processCheckout = async () => {
  const items = Object.entries(_cart);
  if (!_uid || items.length === 0) return;

  const btn = document.getElementById('checkoutBtn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Processing...'; btn.disabled = true; }

  try {
    const now   = new Date();
    const batch = writeBatch(db);

    // Validate stock first
    for (const [id, item] of items) {
      const prod = _products.find(p => p.id === id);
      if (!prod) throw new Error(`Product "${item.name}" not found.`);
      const currentStock = parseInt(prod.Stock) || 0;
      if (item.qty > currentStock) throw new Error(`Insufficient stock for "${item.name}"! Available: ${currentStock}.`);
    }

    // 1. Decrease each product's stock
    for (const [id, item] of items) {
      const prodRef = doc(db, 'users', _uid, 'products', id);
      batch.update(prodRef, { Stock: String((parseInt(_products.find(p=>p.id===id)?.Stock)||0) - item.qty) });
    }

    // 2. Add transaction document
    const totalRevenue = items.reduce((s, [, v]) => s + v.qty * v.price, 0);
    const totalItems   = items.reduce((s, [, v]) => s + v.qty, 0);
    const txRef = doc(userCol(_uid, 'transactions'));
    batch.set(txRef, {
      items: items.map(([id, item]) => ({
        productId: id,
        name: item.name,
        qty: item.qty,
        price: item.price,
        unit: item.unit,
        subtotal: item.qty * item.price
      })),
      total: totalRevenue,
      itemCount: totalItems,
      createdAt: now.toISOString(),
      timestamp: now.toLocaleString('id-ID')
    });

    // 3. Add history entries for each product sold
    for (const [id, item] of items) {
      const histRef = doc(userCol(_uid, 'history'));
      batch.set(histRef, {
        productName: item.name,
        action: 'Sold',
        details: `Sold: ${item.qty} ${item.unit} | Subtotal: Rp ${(item.qty * item.price).toLocaleString('id-ID')}`,
        timestamp: now.toLocaleString('en-GB'),
        createdAt: now.toISOString(),
        category: item.category
      });
    }

    await batch.commit();

    // Clear cart
    _cart = {};
    updateCartUI();
    closeCartSheet();
    renderProducts();

    // Success animation
    const overlay = document.getElementById('successOverlay');
    const msg     = document.getElementById('successMsg');
    if (msg) msg.textContent = `Transaction Successful! Rp ${totalRevenue.toLocaleString('id-ID')}`;
    if (overlay) {
      overlay.classList.add('show');
      setTimeout(() => overlay.classList.remove('show'), 2000);
    }

  } catch (err) {
    showToast(err.message || 'Transaction failed!', 'error');
    console.error('checkout error:', err);
  }

  if (btn) { btn.innerHTML = '<i class="fas fa-check-circle"></i> Process Transaction'; btn.disabled = false; }
};

/* ================================================================
   UTIL
================================================================ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
