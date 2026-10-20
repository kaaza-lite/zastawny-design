// The warm shade along the bottom of Home and About glows when the pointer is over it:
// a soft light centred under the pointer fades in (the .is-glowing styles in global.css).

let raf = 0;
let x = 0;
let y = 0;

const update = () => {
  raf = 0;
  const shade = document.querySelector<HTMLElement>('.bottom-shade:not(.bottom-shade--dark)');
  if (!shade) return;
  const box = shade.getBoundingClientRect();
  const over = y >= box.top && y <= box.bottom;
  shade.classList.toggle('is-glowing', over);
  if (over) shade.style.setProperty('--glow-x', `${x}px`);
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
  document.querySelector('.bottom-shade')?.classList.remove('is-glowing');
});
