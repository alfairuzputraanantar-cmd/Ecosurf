import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

export const auth = getAuth(app);
export const db = getFirestore(app);