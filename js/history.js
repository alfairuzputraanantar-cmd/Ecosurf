import { db } from "./firebase.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const table = document.getElementById("historyTable");

async function loadHistory() {

  const snapshot = await getDocs(collection(db, "history"));

  table.innerHTML = "";

  snapshot.forEach((doc) => {

    const data = doc.data();

    table.innerHTML += `
      <tr>
        <td>${data.productName}</td>
        <td>${data.details}</td>
        <td>${data.timestamp}</td>
      </tr>
    `;
  });
}

loadHistory();