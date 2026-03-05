import { db } from './firebase.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let myChart;

function updateChart(labels, values) {
  const ctx = document.getElementById('stockChart').getContext('2d');
  
  if (myChart) myChart.destroy(); // Prevent duplicate charts

  myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Stock Quantity',
        data: values,
        backgroundColor: '#3498db',
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      }
    }
  });
}

// Fetch data for chart
onSnapshot(collection(db, "products"), (snapshot) => {
  const labels = [];
  const values = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    labels.push(data.Name || "Unnamed");
    values.push(Number(data.Stock) || 0);
  });
  updateChart(labels, values);
});