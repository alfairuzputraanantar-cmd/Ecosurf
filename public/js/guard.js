import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { seedDemoDataIfNeeded } from "./demo.js";

/* ================================================================
   GUARD — redirect to login if not authenticated.
   Also exposes window.__uid so all other modules can use the UID
   without needing to re-import auth.
================================================================ */
/* ── Clear Session Utility ── */
function clearLocalSession() {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('cocacoy_')) {
      localStorage.removeItem(key);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    clearLocalSession();
    window.location.href = "login";
    return;
  }

  // Expose UID globally so other modules can use it
  window.__uid = user.uid;

  // Fire a custom event
  document.dispatchEvent(new CustomEvent("userReady", { detail: { uid: user.uid } }));

  // Profile Elements
  const avatarEl = document.getElementById("sidebarAvatar");
  const nameEl   = document.getElementById("sidebarName");
  const roleEl   = document.getElementById("sidebarRole");
  const emailEl  = document.getElementById("profileEmail");
  const joinEl   = document.getElementById("profileJoinDate");

  if (emailEl) emailEl.textContent = user.email;
  if (joinEl && user.metadata.creationTime) {
    joinEl.textContent = new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Profile Sync
  import("./firebase.js").then(({ userDoc }) => {
    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js").then(({ onSnapshot }) => {
      onSnapshot(userDoc(user.uid), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const p = {
            ownerName: data.ownerName || user.displayName || user.email || "Owner",
            role: data.role || "UMKM Admin",
            photoURL: data.photoURL || "",
            storeName: data.storeName || "",
            storeDesc: data.storeDesc || "",
            storePhone: data.storePhone || "",
            storeCategory: data.storeCategory || "food"
          };

          // ✅ UI Update: Only update if changed or elements are empty to prevent flash
          if (nameEl) nameEl.textContent = p.ownerName;
          if (roleEl) roleEl.textContent = p.role;
          if (avatarEl) {
            if (p.photoURL) {
              const imgHtml = `<img src="${p.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;"/>`;
              if (avatarEl.innerHTML !== imgHtml) avatarEl.innerHTML = imgHtml;
              localStorage.setItem('cocacoy_store_logo', p.photoURL);
            } else {
              const letter = p.ownerName.charAt(0).toUpperCase();
              if (avatarEl.textContent !== letter) avatarEl.textContent = letter;
            }
          }
          
          localStorage.setItem('cocacoy_profile', JSON.stringify(p));
          document.dispatchEvent(new CustomEvent("profileUpdated", { detail: p }));
        }
      });
    });
  });

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
        clearLocalSession();
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
    clearLocalSession();
    await signOut(auth);
    window.location.href = "login";
  };
}


