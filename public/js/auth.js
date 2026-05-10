import { auth, userDoc, setDoc } from "./firebase.js";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
      window.location.href = "/";
    } catch (err) {
      showToast(err.code === "auth/invalid-credential" ? "Wrong email or password." : err.message, "error");
      loginBtn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In';
      loginBtn.disabled  = false;
    }
  };
}

/* ── DEMO LOGIN ── */
const demoBtn = document.getElementById("demoBtn");
if (demoBtn) {
  demoBtn.onclick = async () => {
    demoBtn.innerHTML = '<span class="spinner"></span> Preparing Demo...';
    demoBtn.disabled  = true;
    try {
      await signInWithEmailAndPassword(auth, "demo@cocacoy.com", "DemoCocacoy123!");
      window.location.href = "/";
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
        try {
          // Jika akun belum ada, buat otomatis
          await createUserWithEmailAndPassword(auth, "demo@cocacoy.com", "DemoCocacoy123!");
          window.location.href = "/";
          return;
        } catch (createErr) {
          showToast("Failed to create demo account: " + createErr.message, "error");
          console.error(createErr);
        }
      } else {
        showToast("Demo initialization failed: " + err.message, "error");
        console.error(err);
      }
      
      demoBtn.innerHTML = '<i class="fas fa-rocket"></i> Try Demo';
      demoBtn.disabled  = false;
    }
  };
}


/* ── REGISTER ── */
const registerBtn = document.getElementById("registerBtn");
if (registerBtn) {
  registerBtn.onclick = async () => {
    const email       = document.getElementById("email").value.trim();
    const password    = document.getElementById("password").value.trim();
    const ownerName   = document.getElementById("name").value.trim();
    const companyName = document.getElementById("companyName").value.trim();

    if (!email || !password || !ownerName || !companyName) { 
      showToast("Please fill in all fields.", "error"); 
      return; 
    }
    if (password.length < 6) { 
      showToast("Password must be at least 6 characters.", "error"); 
      return; 
    }

    registerBtn.innerHTML = '<span class="spinner"></span> Creating...';
    registerBtn.disabled  = true;
    try {
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Set Display Name in Auth
      await updateProfile(user, { displayName: ownerName });

      // 3. Create Firestore Profile Document
      await setDoc(userDoc(user.uid), {
        ownerName: ownerName,
        storeName: companyName,
        role: "UMKM Admin",
        storeCategory: "food",
        updatedAt: new Date().toISOString()
      });

      window.location.href = "/";
    } catch (err) {
      showToast(err.code === "auth/email-already-in-use" ? "Email already registered." : err.message, "error");
      registerBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      registerBtn.disabled  = false;
    }
  };
}


// Password update utilities
export async function reauthenticateUser(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  return await reauthenticateWithCredential(user, credential);
}

export async function changeUserPassword(newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  return await updatePassword(user, newPassword);
}

// Expose to window for inline scripts
window.reauthenticateUser = reauthenticateUser;
window.changeUserPassword = changeUserPassword;
