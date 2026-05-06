import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* ── LOGIN ── */
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.onclick = async () => {
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    if (!email || !password) { showToast("Please fill in all fields.", "error"); return; }

    loginBtn.innerHTML = '<span class="spinner"></span> Signing in...';
    loginBtn.disabled  = true;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "index.html";
    } catch (err) {
      showToast(err.code === "auth/invalid-credential" ? "Wrong email or password." : err.message, "error");
      loginBtn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In';
      loginBtn.disabled  = false;
    }
  };
}

/* ── REGISTER ── */
const registerBtn = document.getElementById("registerBtn");
if (registerBtn) {
  registerBtn.onclick = async () => {
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    if (!email || !password) { showToast("Please fill in all fields.", "error"); return; }
    if (password.length < 6) { showToast("Password must be at least 6 characters.", "error"); return; }

    registerBtn.innerHTML = '<span class="spinner"></span> Creating...';
    registerBtn.disabled  = true;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "index.html";
    } catch (err) {
      showToast(err.code === "auth/email-already-in-use" ? "Email already registered." : err.message, "error");
      registerBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      registerBtn.disabled  = false;
    }
  };
}
