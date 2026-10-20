// The warm shades along the top and bottom of Home and About glow when the pointer is over them:
// a soft light centred under the pointer fades in (the .is-glowing styles in global.css).

let raf = 0;
let x = 0;
let y = 0;

const update = () => {
  raf = 0;
  for (const shade of document.querySelectorAll<HTMLElement>('.bottom-shade:not(.bottom-shade--dark), .top-shade:not(.top-shade--dark)')) {
    const box = shade.getBoundingClientRect();
    const over = y >= box.top && y <= box.bottom;
    shade.classList.toggle('is-glowing', over);
    if (over) shade.style.setProperty('--glow-x', `${x}px`);
  }
};

document.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    if (!raf) raf = requestAnimationFrame(update);
  },
  { passive: true },
);
document.documentElement.addEventListener('pointerleave', () => {
  for (const shade of document.querySelectorAll('.bottom-shade, .top-shade')) shade.classList.remove('is-glowing');
});
