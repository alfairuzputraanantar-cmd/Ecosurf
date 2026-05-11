/* ================================================================
   motion.js — CocaCoy ERP Shared Animation Utilities
   GPU-friendly (transform + opacity only). No dependencies.
================================================================ */

/**
 * Staggered entrance animation via IntersectionObserver.
 * Animates matching elements as they enter the viewport.
 * @param {string} selector  CSS selector for elements to animate
 * @param {number} stagger   Delay increment per item in ms (default 40)
 */
export function animateEntrance(selector = '.stat-card, .card, .timeline-item, tbody tr, .history-item', stagger = 40) {
  // Respect user preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const els = document.querySelectorAll(selector);
  if (!els.length) return;

  els.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = `opacity .3s cubic-bezier(.4,0,.2,1) ${i * stagger}ms, transform .3s cubic-bezier(.4,0,.2,1) ${i * stagger}ms`;
    el.style.willChange = 'opacity, transform';
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        io.unobserve(entry.target);
        // Clean up will-change after animation
        setTimeout(() => { entry.target.style.willChange = ''; }, 400 + stagger * els.length);
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });

  els.forEach(el => io.observe(el));
}

/**
 * Pulse-highlight a stat card / element to signal a realtime update.
 * Adds .stat-pulse class, removes after animation completes.
 * @param {string} id  Element ID
 */
export function pulseHighlight(id) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('stat-pulse');
  void el.offsetWidth; // trigger reflow to restart animation
  el.classList.add('stat-pulse');
  setTimeout(() => el.classList.remove('stat-pulse'), 800);
}

/**
 * Animate a number counter from `from` to `to` over `duration` ms.
 * Uses requestAnimationFrame for smooth counting.
 * @param {HTMLElement} el
 * @param {number} from
 * @param {number} to
 * @param {number} duration  ms
 * @param {Function} formatter  Optional function(value) → string
 */
export function animateNumber(el, from, to, duration = 600, formatter = null) {
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formatter ? formatter(to) : to;
    return;
  }
  const start = performance.now();
  const diff = to - from;
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    const val = Math.round(from + diff * ease);
    el.textContent = formatter ? formatter(val) : val;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Trigger badge bounce animation on a cart badge element.
 * @param {HTMLElement} badgeEl
 */
export function bounceBadge(badgeEl) {
  if (!badgeEl) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  badgeEl.classList.remove('badge-bounce');
  void badgeEl.offsetWidth;
  badgeEl.classList.add('badge-bounce');
  badgeEl.addEventListener('animationend', () => badgeEl.classList.remove('badge-bounce'), { once: true });
}

/**
 * Show animated toast notification.
 * Replaces the plain showToast with entrance + exit animations.
 * @param {string} msg
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration  ms before auto-dismiss
 */
export function showToast(msg, type = 'info', duration = 3200) {
  const ic = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    info:    'fa-circle-info',
    warning: 'fa-triangle-exclamation'
  };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${ic[type] || ic.info}"></i> ${msg}`;
  container.appendChild(el);

  const dismiss = () => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  setTimeout(dismiss, duration);
}
