import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD2bLhAr5yag_eW6mS4d2gRRAmsnQfLjwU",
  authDomain: "cocacoy-52fad.firebaseapp.com",
  projectId: "cocacoy-52fad",
  storageBucket: "cocacoy-52fad.firebasestorage.app",
  messagingSenderId: "470860506280",
  appId: "1:470860506280:web:6cd2f7b61a9584f2b3ce9d",
  measurementId: "G-ZK4CT0FYXM"
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

/**
 * Returns a Firestore collection reference.
 * Usage: userCol(uid, 'products') → users/{uid}/products
 */
export function userCol(uid, name) {
  return collection(db, 'users', uid, name);
}

/**
 * Returns a Firestore document reference.
 * Usage: 
 *   userDoc(uid) → users/{uid}
 *   userDoc(uid, 'products', id) → users/{uid}/products/{id}
 */
export function userDoc(uid, name, id) {
  if (!name) return doc(db, 'users', uid);
  return doc(db, 'users', uid, name, id);
}

export { ref, uploadBytes, getDownloadURL };