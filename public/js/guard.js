import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* ================================================================
   GUARD — redirect to login if not authenticated.
   Also exposes window.__uid so all other modules can use the UID
   without needing to re-import auth.
================================================================ */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login";
    return;
  }

  // Expose UID globally so dashboard.js / product.js / history.js can use it
  window.__uid = user.uid;

  // Update sidebar avatar & name
  const avatarEl = document.getElementById("sidebarAvatar");
  const nameEl   = document.getElementById("sidebarName");
  if (avatarEl) avatarEl.textContent = (user.email || "U")[0].toUpperCase();
  if (nameEl)   nameEl.textContent   = user.displayName || user.email || "Owner";

  // Fire a custom event so other scripts can start their Firestore listeners
  document.dispatchEvent(new CustomEvent("userReady", { detail: { uid: user.uid } }));
});

/* ── Logout ── */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "login";
  };
}
