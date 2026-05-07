import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { seedDemoDataIfNeeded } from "./demo.js";

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

  // Demo Mode Handling
  if (user.email === "demo@cocacoy.com") {
    seedDemoDataIfNeeded(user.uid);
    if (!document.getElementById("demoBanner")) {
      const banner = document.createElement("div");
      banner.id = "demoBanner";
      banner.style.cssText = "background: rgba(245,166,35,.15); border-bottom: 1px solid rgba(245,166,35,.3); color: var(--yellow); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; z-index: 1000;";
      banner.innerHTML = `
        <div><i class="fas fa-circle-info" style="margin-right:8px;"></i> You are currently exploring the Demo Account. Data is shared and periodically reset.</div>
        <button id="exitDemoBtn" class="btn btn-warn btn-sm" style="flex-shrink:0;"><i class="fas fa-right-from-bracket"></i> Exit Demo</button>
      `;
      const mainWrap = document.querySelector(".main-wrap");
      if (mainWrap) {
        mainWrap.prepend(banner);
      } else {
        document.body.prepend(banner);
      }
      document.getElementById("exitDemoBtn").onclick = async () => {
        await signOut(auth);
        window.location.href = "login";
      };
    }
  }
});

/* ── Logout ── */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "login";
  };
}
