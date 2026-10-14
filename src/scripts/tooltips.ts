// Escape hides a visible tooltip without moving the pointer or focus (WCAG 1.4.13).
// It comes back the next time the pointer enters the button or the button is focused.
// The tooltip styles are in src/styles/global.css.

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const host of document.querySelectorAll('.tip-host:hover, .tip-host:focus-visible')) {
    host.classList.add('tip-dismissed');
  }
});

// On the first load and after every page change
const ready = new WeakSet<Element>();
document.addEventListener('astro:page-load', () => {
  for (const host of document.querySelectorAll('.tip-host')) {
    if (ready.has(host)) continue;
    ready.add(host);
    const reset = () => host.classList.remove('tip-dismissed');
    host.addEventListener('pointerleave', reset);
    host.addEventListener('blur', reset);
  }
});
