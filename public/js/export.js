import { db, userCol } from './firebase.js';
import { getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================================================================
   EXPORT MODULE — Client-side PDF & Excel Generation
   Dynamically loads jsPDF and SheetJS only when needed.
================================================================ */

let scriptsLoaded = false;
let isExporting = false;

// Format utilities
const formatCur = (num) => 'Rp ' + (num || 0).toLocaleString('id-ID');
const formatNum = (num) => (num || 0).toLocaleString('id-ID');

// Initialize Modal
function initExportModal() {
  if (document.getElementById('exportModalOverlay')) return;
  
  const html = `
    <div class="cart-sheet-overlay" id="exportModalOverlay" style="z-index:900;"></div>
    <div class="cart-sheet" id="exportModal" style="z-index:901; max-width: 500px; margin: 0 auto; left: 0; right: 0; bottom: 0; border-radius: 20px 20px 0 0;">
      <div class="cart-sheet-handle"></div>
      <div class="cart-sheet-header">
        <span><i class="fas fa-file-export" style="color:var(--brand-1);margin-right:8px;"></i>Export Report</span>
        <button class="cart-sheet-close" onclick="closeExportModal()"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="cart-sheet-body" style="padding: 20px;">
        
        <div style="margin-bottom: 16px;">
          <label style="display:block;font-size:13px;color:var(--muted);margin-bottom:6px;font-weight:600;">Report Type</label>
          <select id="exportType" style="width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;outline:none;">
            <option value="full">Full Business Report</option>
            <option value="inventory">Inventory Only</option>
            <option value="transactions">Transactions Only</option>
          </select>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display:block;font-size:13px;color:var(--muted);margin-bottom:6px;font-weight:600;">Date Range</label>
          <select id="exportDateRange" onchange="toggleCustomDate()" style="width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;outline:none;">
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days" selected>Last 30 Days</option>
            <option value="thismonth">This Month</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        <div id="exportCustomDateWrap" style="display:none; gap:10px; margin-bottom: 16px;">
          <div style="flex:1;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Start Date</label>
            <input type="date" id="exportStartDate" style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;outline:none; color-scheme: dark;">
          </div>
          <div style="flex:1;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">End Date</label>
            <input type="date" id="exportEndDate" style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;outline:none; color-scheme: dark;">
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <label style="display:block;font-size:13px;color:var(--muted);margin-bottom:6px;font-weight:600;">Format</label>
          <div style="display:flex;gap:10px;">
            <label class="export-format-radio" style="flex:1; cursor:pointer;">
              <input type="radio" name="exportFormat" value="pdf" checked style="display:none;">
              <div class="format-card" style="padding:12px; border:2px solid var(--brand-1); border-radius:12px; text-align:center; background:rgba(200,149,108,.1);">
                <i class="fas fa-file-pdf" style="font-size:24px;color:#e74c3c;margin-bottom:6px;"></i>
                <div style="font-size:14px;font-weight:700;">PDF</div>
              </div>
            </label>
            <label class="export-format-radio" style="flex:1; cursor:pointer;">
              <input type="radio" name="exportFormat" value="excel" style="display:none;">
              <div class="format-card" style="padding:12px; border:2px solid transparent; border-radius:12px; text-align:center; background:var(--surface2);">
                <i class="fas fa-file-excel" style="font-size:24px;color:#27ae60;margin-bottom:6px;"></i>
                <div style="font-size:14px;font-weight:700;">Excel</div>
              </div>
            </label>
          </div>
        </div>

        <button id="exportActionBtn" class="cart-checkout-btn" onclick="executeExport()">
          <i class="fas fa-download"></i> Generate Report
        </button>

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  // Add event listeners for radio buttons to update UI
  document.querySelectorAll('input[name="exportFormat"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      document.querySelectorAll('.format-card').forEach(card => {
        card.style.borderColor = 'transparent';
        card.style.background = 'var(--surface2)';
      });
      const selected = e.target.nextElementSibling;
      selected.style.borderColor = 'var(--brand-1)';
      selected.style.background = 'rgba(200,149,108,.1)';
    });
  });

  // Setup click outside to close
  document.getElementById('exportModalOverlay').addEventListener('click', closeExportModal);
}

window.toggleCustomDate = function() {
  const v = document.getElementById('exportDateRange').value;
  document.getElementById('exportCustomDateWrap').style.display = v === 'custom' ? 'flex' : 'none';
}

window.openExportModal = function() {
  initExportModal();
  document.getElementById('exportModalOverlay').classList.add('open');
  document.getElementById('exportModal').classList.add('open');
}

window.closeExportModal = function() {
  const ov = document.getElementById('exportModalOverlay');
  const md = document.getElementById('exportModal');
  if (ov) ov.classList.remove('open');
  if (md) md.classList.remove('open');
}

// Dynamic Script Loader
function loadExportLibraries() {
  return new Promise((resolve, reject) => {
    if (scriptsLoaded) return resolve();
    
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });

    // We load jsPDF, jsPDF-AutoTable, and SheetJS (xlsx)
    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.1/jspdf.plugin.autotable.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
    ]).then(() => {
      scriptsLoaded = true;
      resolve();
    }).catch(err => {
      console.error("Failed to load export libraries", err);
      reject(err);
    });
  });
}

window.executeExport = async function() {
  if (isExporting || !window.__uid) return;
  const btn = document.getElementById('exportActionBtn');
  btn.innerHTML = '<span class="spinner"></span> Generating...';
  btn.disabled = true;
  isExporting = true;

  try {
    const type = document.getElementById('exportType').value;
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const dateFilter = document.getElementById('exportDateRange').value;
    let startDate = null;
    let endDate = null;

    if (dateFilter === 'custom') {
      startDate = document.getElementById('exportStartDate').value;
      endDate = document.getElementById('exportEndDate').value;
      if (!startDate || !endDate) throw new Error("Please select start and end dates.");
    }

    // Load libraries if needed
    await loadExportLibraries();

    // Fetch Data
    const data = await fetchReportData(window.__uid, dateFilter, startDate, endDate);

    // Generate
    if (format === 'pdf') {
      await generatePDF(data, type);
    } else {
      await generateExcel(data, type);
    }

    if (window.showToast) window.showToast('Report downloaded successfully!', 'success');
    closeExportModal();

  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
    console.error(err);
  } finally {
    btn.innerHTML = '<i class="fas fa-download"></i> Generate Report';
    btn.disabled = false;
    isExporting = false;
  }
}

async function fetchReportData(uid, dateFilter, customStart, customEnd) {
  const productsSnap = await getDocs(userCol(uid, 'products'));
  const products = [];
  productsSnap.forEach(d => { if(d.data().Name) products.push({ id: d.id, ...d.data() }); });

  const txSnap = await getDocs(userCol(uid, 'transactions'));
  const allTx = [];
  txSnap.forEach(d => { allTx.push({ id: d.id, ...d.data() }); });

  // Filter transactions
  const now = new Date();
  let limitTime = null;
  let endLimitTime = null;

  if (dateFilter === 'today') {
    limitTime = new Date(now.toLocaleDateString('en-CA')).getTime();
  } else if (dateFilter === '7days') {
    const d = new Date(now); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0);
    limitTime = d.getTime();
  } else if (dateFilter === '30days') {
    const d = new Date(now); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0);
    limitTime = d.getTime();
  } else if (dateFilter === 'thismonth') {
    limitTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else if (dateFilter === 'custom') {
    limitTime = new Date(customStart).getTime();
    endLimitTime = new Date(customEnd).getTime() + 86400000; // end of day
  }

  const filteredTx = allTx.filter(tx => {
    if (dateFilter === 'all') return true;
    const tTime = new Date(tx.createdAt || tx.timestamp).getTime();
    if (endLimitTime) return tTime >= limitTime && tTime < endLimitTime;
    return tTime >= limitTime;
  });

  // Calculate Analytics
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalItemsSold = 0;
  const productSales = {};

  filteredTx.forEach(tx => {
    totalRevenue += tx.total || 0;
    
    // Dynamic Profit Fallback
    let pft = tx.totalProfit;
    if (pft === undefined) {
      pft = (tx.items || []).reduce((sum, item) => {
        const prod = products.find(p => p.id === item.productId);
        const buyPrice = parseInt(prod?.BuyPrice) || parseInt(item.buyPrice) || 0;
        return sum + (item.price - buyPrice) * item.qty;
      }, 0);
    }
    totalProfit += pft;
    totalItemsSold += tx.itemCount || 0;

    (tx.items || []).forEach(it => {
      if (!productSales[it.productId]) productSales[it.productId] = { name: it.name, qty: 0, rev: 0, profit: 0 };
      productSales[it.productId].qty += it.qty;
      productSales[it.productId].rev += (it.qty * it.price);
      
      const prod = products.find(p => p.id === it.productId);
      const buyPrice = parseInt(prod?.BuyPrice) || parseInt(it.buyPrice) || 0;
      productSales[it.productId].profit += (it.qty * (it.price - buyPrice));
    });
  });

  let bestSelling = null;
  let mostProfitable = null;
  Object.values(productSales).forEach(ps => {
    if (!bestSelling || ps.qty > bestSelling.qty) bestSelling = ps;
    if (!mostProfitable || ps.profit > mostProfitable.profit) mostProfitable = ps;
  });

  // Inventory Value
  let inventoryValue = 0;
  products.forEach(p => {
    const buyPrice = parseInt(p.BuyPrice) || 0;
    const stock = parseInt(p.Stock) || 0;
    inventoryValue += (buyPrice * stock);
  });

  return {
    products,
    transactions: filteredTx,
    analytics: {
      revenue: totalRevenue,
      profit: totalProfit,
      margin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0',
      txCount: filteredTx.length,
      itemsSold: totalItemsSold,
      inventoryValue: inventoryValue,
      bestSelling: bestSelling ? `${bestSelling.name} (${bestSelling.qty} sold)` : '-',
      mostProfitable: mostProfitable ? `${mostProfitable.name} (${formatCur(mostProfitable.profit)})` : '-',
      dateRange: dateFilter === 'custom' ? `${customStart} to ${customEnd}` : dateFilter.toUpperCase()
    }
  };
}

// ----------------------------------------------------------------------
// PDF Generation
// ----------------------------------------------------------------------
async function generatePDF(data, type) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const profile = window._initialProfile || JSON.parse(localStorage.getItem('cocacoy_profile') || '{}');
  const storeName = profile.ownerName || 'CocaCoy Store';
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  doc.text("CocaCoy ERP", 14, 20);
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Store: ${storeName}`, 14, 28);
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, 34);
  doc.text(`Date Range: ${data.analytics.dateRange}`, 14, 40);

  let startY = 48;

  // Summary Cards (only for Full or Analytics/Transactions)
  if (type === 'full') {
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text("Business Analytics Summary", 14, startY);
    startY += 8;

    doc.autoTable({
      startY: startY,
      theme: 'grid',
      headStyles: { fillColor: [245, 245, 245], textColor: [40, 40, 40] },
      body: [
        ["Total Revenue", formatCur(data.analytics.revenue), "Total Profit", formatCur(data.analytics.profit)],
        ["Profit Margin", `${data.analytics.margin}%`, "Transactions", formatNum(data.analytics.txCount)],
        ["Inventory Value", formatCur(data.analytics.inventoryValue), "Items Sold", formatNum(data.analytics.itemsSold)],
        ["Best Seller", data.analytics.bestSelling, "Top Profit Item", data.analytics.mostProfitable]
      ]
    });
    startY = doc.lastAutoTable.finalY + 14;
  }

  // Inventory Table
  if (type === 'full' || type === 'inventory') {
    doc.setFontSize(14);
    doc.text("Inventory Status", 14, startY);
    startY += 8;

    const invData = data.products.map(p => [
      p.Name,
      p.Category || '-',
      formatCur(parseInt(p.BuyPrice) || 0),
      formatCur(parseInt(p.SellPrice) || 0),
      p.Stock || '0',
      formatCur((parseInt(p.BuyPrice) || 0) * (parseInt(p.Stock) || 0))
    ]);

    doc.autoTable({
      startY: startY,
      head: [['Product', 'Category', 'Buy Price', 'Sell Price', 'Stock', 'Inv. Value']],
      body: invData,
      theme: 'striped',
      headStyles: { fillColor: [44, 62, 80] }
    });
    startY = doc.lastAutoTable.finalY + 14;
  }

  // Transactions Table
  if (type === 'full' || type === 'transactions') {
    // If we are on a new page, don't draw text off-screen
    if (startY > 270) { doc.addPage(); startY = 20; }
    
    doc.setFontSize(14);
    doc.text("Transaction History", 14, startY);
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    
    // Limit to 50 for PDF to avoid massive files
    let txList = [...data.transactions].reverse();
    const isCapped = txList.length > 50;
    if (isCapped && type === 'full') {
      txList = txList.slice(0, 50);
      doc.text("(Showing latest 50 transactions)", 65, startY);
    }
    startY += 8;

    const txData = [];
    txList.forEach(tx => {
      const time = new Date(tx.createdAt || tx.timestamp).toLocaleString('en-GB');
      const itemsStr = (tx.items || []).map(i => `${i.name} (${i.qty})`).join(', ');
      
      let pft = tx.totalProfit;
      if (pft === undefined) {
        pft = (tx.items || []).reduce((sum, item) => {
          const prod = data.products.find(p => p.id === item.productId);
          const buyPrice = parseInt(prod?.BuyPrice) || parseInt(item.buyPrice) || 0;
          return sum + (item.price - buyPrice) * item.qty;
        }, 0);
      }

      txData.push([
        time,
        itemsStr.length > 40 ? itemsStr.substring(0, 37) + '...' : itemsStr,
        formatNum(tx.itemCount || 0),
        formatCur(tx.total || 0),
        formatCur(pft)
      ]);
    });

    doc.autoTable({
      startY: startY,
      head: [['Date', 'Items', 'Qty', 'Revenue', 'Profit']],
      body: txData,
      theme: 'striped',
      headStyles: { fillColor: [39, 174, 96] },
      columnStyles: { 1: { cellWidth: 70 } } // Wrap items column
    });
  }

  // Footer
  const pages = doc.internal.getNumberOfPages();
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Generated by CocaCoy ERP — Page ${i} of ${pages}`, 14, 290);
  }

  doc.save(`CocaCoy_Report_${new Date().getTime()}.pdf`);
}

// ----------------------------------------------------------------------
// Excel Generation
// ----------------------------------------------------------------------
async function generateExcel(data, type) {
  const wb = XLSX.utils.book_new();

  // 1. Summary & Analytics
  const summaryData = [
    ["CocaCoy ERP Business Report"],
    ["Generated", new Date().toLocaleString('en-GB')],
    ["Date Range", data.analytics.dateRange],
    [],
    ["Metric", "Value"],
    ["Total Revenue", data.analytics.revenue],
    ["Total Profit", data.analytics.profit],
    ["Profit Margin (%)", parseFloat(data.analytics.margin) || 0],
    ["Total Transactions", data.analytics.txCount],
    ["Total Items Sold", data.analytics.itemsSold],
    ["Inventory Value", data.analytics.inventoryValue],
    ["Best Selling Product", data.analytics.bestSelling],
    ["Most Profitable Product", data.analytics.mostProfitable]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Analytics");

  // 2. Inventory
  if (type === 'full' || type === 'inventory') {
    const invData = data.products.map(p => ({
      "Product Name": p.Name,
      "Category": p.Category || '-',
      "Buy Price": parseInt(p.BuyPrice) || 0,
      "Sell Price": parseInt(p.SellPrice) || 0,
      "Current Stock": parseInt(p.Stock) || 0,
      "Inventory Value": (parseInt(p.BuyPrice) || 0) * (parseInt(p.Stock) || 0),
      "Unit": p.Unit || 'pcs'
    }));
    const wsInv = XLSX.utils.json_to_sheet(invData);
    XLSX.utils.book_append_sheet(wb, wsInv, "Inventory");
  }

  // 3. Transactions
  if (type === 'full' || type === 'transactions') {
    const txData = [];
    [...data.transactions].reverse().forEach(tx => {
      let pft = tx.totalProfit;
      if (pft === undefined) {
        pft = (tx.items || []).reduce((sum, item) => {
          const prod = data.products.find(p => p.id === item.productId);
          const buyPrice = parseInt(prod?.BuyPrice) || parseInt(item.buyPrice) || 0;
          return sum + (item.price - buyPrice) * item.qty;
        }, 0);
      }

      // Flatten items for Excel
      (tx.items || []).forEach(it => {
        txData.push({
          "Date": new Date(tx.createdAt || tx.timestamp).toLocaleString('en-GB'),
          "Transaction ID": tx.id,
          "Product": it.name,
          "Category": it.category || '-',
          "Qty": it.qty,
          "Price": it.price,
          "Subtotal": it.qty * it.price,
          "Transaction Revenue": tx.total,
          "Transaction Profit": pft
        });
      });
    });
    const wsTx = XLSX.utils.json_to_sheet(txData);
    XLSX.utils.book_append_sheet(wb, wsTx, "Transactions");
  }

  XLSX.writeFile(wb, `CocaCoy_Report_${new Date().getTime()}.xlsx`);
}
