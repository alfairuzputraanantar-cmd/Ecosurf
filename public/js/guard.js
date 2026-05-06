import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  } else {
    const avatarEl = document.getElementById("sidebarAvatar");
    const nameEl   = document.getElementById("sidebarName");
    if (avatarEl) avatarEl.textContent = (user.email || "U")[0].toUpperCase();
    if (nameEl)   nameEl.textContent   = user.displayName || user.email || "Owner";
  }
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "login.html";
  };
}
