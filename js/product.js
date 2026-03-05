import { db } from './firebase.js';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  deleteDoc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/*
==============================
CONFIG
==============================
*/

const columnDoc = doc(db, "settings", "columns");

let customColumns = [];

const headArea = document.getElementById('productHead');
const inputArea = document.getElementById('dynamicInputs');
const tableBody = document.getElementById('productTable');
const activeList = document.getElementById('activeColumnsList');

/*
==============================
LOAD COLUMN FROM FIREBASE
==============================
*/

async function loadColumns() {

  const snap = await getDoc(columnDoc);

  if (snap.exists()) {
    customColumns = snap.data().columns;
  } else {
    customColumns = ["Name", "Stock"];

    await setDoc(columnDoc, {
      columns: customColumns
    });
  }

  renderUI();
}

async function saveColumns() {
  await setDoc(columnDoc, {
    columns: customColumns
  });
}

/*
==============================
RENDER UI
==============================
*/

function renderUI() {

  /* TABLE HEADER */
    headArea.innerHTML =
`<tr>
${customColumns.map(c => `
  <th>${c}</th>
`).join('')}
<th>Actions</th>
</tr>`;

  /* FORM INPUT */
  inputArea.innerHTML = customColumns.map(c => `
    <div style="margin-bottom:10px;">
      <label>${c}</label>
      <input id="input-${c}"
        placeholder="Enter ${c}"
        type="${c === 'Stock' ? 'number' : 'text'}">
    </div>
  `).join('');

  activeList.innerText = "Active: " + customColumns.join(', ');

  attachDeleteColumn();
}

/*
==============================
DELETE COLUMN BUTTON
==============================
*/

function attachDeleteColumn() {

  document.querySelectorAll('.deleteColumn')
    .forEach(btn => {

      btn.onclick = async () => {

        const col = btn.dataset.col;

        if (col === "Name" || col === "Stock") {
          alert("Default column cannot be deleted");
          return;
        }

        if (confirm(`Delete column ${col}?`)) {

          customColumns =
            customColumns.filter(c => c !== col);

          await saveColumns();
          renderUI();
        }
      };

    });
}

/*
==============================
ADD COLUMN
==============================
*/

document.getElementById('addColumnBtn').onclick = async () => {

  const input = document.getElementById('newColumnName');
  const colName = input.value.trim();

  if (!colName) return;

  if (customColumns.includes(colName)) {
    alert("Column already exists");
    return;
  }

  customColumns.push(colName);

  await saveColumns();

  renderUI();

  input.value = "";
};

/*
==============================
SAVE PRODUCT
==============================
*/

document.getElementById('addBtn').onclick = async () => {

  const productData = {};

  customColumns.forEach(c => {
    productData[c] =
      document.getElementById(`input-${c}`).value;
  });

  if (!productData.Name)
    return alert("Product Name required");

  await addDoc(collection(db, "products"), productData);

  await addDoc(collection(db, "history"), {
    productName: productData.Name,
    action: "Created",
    details: `Added with ${productData.Stock || 0} stock`,
    timestamp: new Date().toLocaleString()
  });

  customColumns.forEach(c =>
    document.getElementById(`input-${c}`).value = ""
  );
};

/*
==============================
REALTIME PRODUCT TABLE
==============================
*/

onSnapshot(collection(db, "products"), snapshot => {

  tableBody.innerHTML = "";

  snapshot.forEach(productDoc => {

    const data = productDoc.data();
    const id = productDoc.id;

    /* ❌ skip data kosong */
    if (!data.Name) return;

    const row = document.createElement("tr");

    const cells =
      customColumns.map(col =>
        `<td>${data[col] || "-"}</td>`
      ).join("");

    row.innerHTML = `
      ${cells}
      <td>
        <button class="deleteBtn">Delete</button>
      </td>
    `;

    row.querySelector(".deleteBtn").onclick = async () => {

      await deleteDoc(doc(db, "products", id));

      await addDoc(collection(db,"history"),{
        productName:data.Name,
        action:"Deleted",
        details:"Removed product",
        timestamp:new Date().toLocaleString()
      });
    };

    tableBody.appendChild(row);
  });

});

/*
==============================
START APP
==============================
*/

loadColumns();