import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// REGISTER
const registerBtn = document.getElementById("registerBtn");
if (registerBtn) {
  registerBtn.onclick = async () => {
    const companyName = document.getElementById("companyName").value;
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create company
    const companyRef = doc(db, "companies", user.uid);
    await setDoc(companyRef, {
      name: companyName,
      ownerId: user.uid,
      createdAt: serverTimestamp()
    });

    // Create user profile
    await setDoc(doc(db, "users", user.uid), {
      name,
      email,
      role: "admin",
      companyId: user.uid
    });

    window.location.href = "index.html";
  };
}

// LOGIN
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.onclick = async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "index.html";
  };
}

loginBtn.onclick = async () => {
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    await signInWithEmailAndPassword(auth, email, password);

    alert("Login success!");
    window.location.href = "index.html";

  } catch (error) {
    alert(error.code);
    console.error(error);
  }
};


const email = document.getElementById("email").value.trim();
const password = document.getElementById("password").value.trim();
