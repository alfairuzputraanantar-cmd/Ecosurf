// Sidebar drawer toggle (mobile)
document.addEventListener("click", (e) => {
  const menuBtn = e.target.closest('#menuToggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');

  if (menuBtn && sidebar) {
    sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('open');
  }

  const isBackdrop = e.target.classList.contains('sidebar-backdrop');
  if (isBackdrop && sidebar) {
    sidebar.classList.remove('open');
    e.target.classList.remove('open');
  }
});

// Create backdrop if not exists
document.addEventListener("DOMContentLoaded", () => {
  if (!document.querySelector('.sidebar-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }
});

// Fix for type="number" inputs: prevent mouse wheel from changing values accidentally
document.addEventListener("wheel", function(e) {
  if (document.activeElement.type === "number") {
    e.preventDefault();
  }
}, { passive: false });

