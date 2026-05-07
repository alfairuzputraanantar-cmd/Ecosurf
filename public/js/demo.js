import { db } from "./firebase.js";
import { collection, doc, writeBatch, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEMO_PRODUCTS = [
  { Name: "Indomie Goreng", Category: "Food", Cost: 2500, Price: 3500, Stock: 150, lowStockThreshold: 20, Unit: "pcs", Code: "IND-01", description: "Mie instan goreng" },
  { Name: "Aqua 600ml", Category: "Beverage", Cost: 2000, Price: 3500, Stock: 8, lowStockThreshold: 10, Unit: "btl", Code: "AQU-01", description: "Air mineral botol sedang" },
  { Name: "Coca Cola 330ml", Category: "Beverage", Cost: 4000, Price: 6000, Stock: 45, lowStockThreshold: 15, Unit: "can", Code: "COC-01", description: "Minuman soda kaleng" },
  { Name: "Beras Pandan Wangi 5kg", Category: "Groceries", Cost: 60000, Price: 75000, Stock: 12, lowStockThreshold: 5, Unit: "sak", Code: "BRS-01", description: "Beras premium 5kg" },
  { Name: "Minyak Goreng Bimoli 2L", Category: "Groceries", Cost: 32000, Price: 38000, Stock: 25, lowStockThreshold: 10, Unit: "pch", Code: "MYK-01", description: "Minyak goreng pouch 2L" }
];

export async function seedDemoDataIfNeeded(uid) {
  if (!uid) return;
  
  const prodCol = collection(db, `users/${uid}/products`);
  const snap = await getDocs(query(prodCol, limit(1)));
  
  // If we already have at least 1 product, assume demo data is intact
  if (!snap.empty) return; 
  
  console.log("Seeding Demo Data...");
  const batch = writeBatch(db);
  const now = new Date();
  
  // Seed Products
  DEMO_PRODUCTS.forEach(p => {
    const ref = doc(prodCol);
    batch.set(ref, { ...p, createdAt: now.toISOString() });
  });

  // Add some history
  const histCol = collection(db, `users/${uid}/history`);
  [
    { action: "Added", productName: "Indomie Goreng", details: "Added product Indomie Goreng", category: "Food" },
    { action: "Updated", productName: "Aqua 600ml", details: "Changed stock from 50 to 8", category: "Beverage" },
    { action: "Sold", productName: "Coca Cola 330ml", details: "Sold: 2 can | Subtotal: Rp 12.000", category: "Beverage" }
  ].forEach((h, i) => {
    const ref = doc(histCol);
    const d = new Date(now.getTime() - i * 3600000); // Past hours
    batch.set(ref, {
      ...h,
      timestamp: d.toLocaleString('en-GB'),
      createdAt: d.toISOString()
    });
  });

  // Add some transactions (today)
  const transCol = collection(db, `users/${uid}/transactions`);
  const todayStr = now.toISOString().slice(0, 10);
  [
    { total: 12000, items: [{name: "Coca Cola 330ml", qty: 2, price: 6000}] },
    { total: 35000, items: [{name: "Indomie Goreng", qty: 10, price: 3500}] }
  ].forEach(t => {
    const ref = doc(transCol);
    batch.set(ref, {
      ...t,
      createdAt: now.toISOString() // This ensures it counts as today's sales
    });
  });

  try {
    await batch.commit();
    console.log("Demo data seeded successfully.");
    // Force reload so listeners pick up the new data
    window.location.reload();
  } catch (err) {
    console.error("Failed to seed demo data:", err);
  }
}
