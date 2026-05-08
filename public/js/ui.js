// Sidebar drawer toggle (mobile)
document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  
  if (sidebar) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
    
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }
    
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }
});
