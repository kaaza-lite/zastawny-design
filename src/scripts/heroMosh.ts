// Datamosh on the case study hero image, the same effect as the case study cards:
// when the mouse moves over the top of the page the picture turns into the case
// study's colours, gets dragged along with the pointer, settles back while it rests,
// and returns to the photo when the mouse leaves. The hero stays behind the content,
// so this listens to the mouse anywhere over the hero's area.
// Only for a mouse; skipped with reduced motion.
import { Mosh, waves, gradientMap, MOSH_FPS } from './datamosh';
import { palettes, type PaletteName } from '../data/palettes';

const BLOCK = 16;   // block size in CSS pixels (the hero is big, so blocks are a bit larger than on the cards)
const BURST = 650;  // ms: the colour floods in when the pointer arrives
const REACH = 0.3;  // how far around the pointer the image gets dragged (share of the hero width)

let page: AbortController | null = null;

export function initHeroMosh() {
  page?.abort();
  page = null;
  const hero = document.querySelector<HTMLElement>('.hero-image');
  const img = hero?.querySelector<HTMLImageElement>('img');
  if (!hero || !img) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  page = new AbortController();
  const signal = page.signal;
  document.addEventListener('astro:before-swap', () => page?.abort(), { once: true, signal });

  const theme = document.body.dataset.theme as PaletteName | undefined;
  const ramp = palettes[theme ?? 'neutral'] ?? palettes.neutral;

  // The canvas sits over the photo, under the hero's fade
  const cnv = document.createElement('canvas');
  cnv.className = 'hero-mosh';
  cnv.setAttribute('aria-hidden', 'true');
  hero.prepend(cnv);
  signal.addEventListener('abort', () => cnv.remove());

  let mosh: Mosh | null = null;
  let clean: HTMLCanvasElement | null = null;   // the photo, drawn as it appears on screen
  let tinted: HTMLCanvasElement | null = null;  // the photo in the case study's colours
  let raf = 0;
  let hovering = false;
  let leftAt = 0;
  let burstAt = 0;
  let lastFrame = 0;
  let still = 0;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, inside: false };
  let wave = waves();

  // Draw the photo exactly where and how the page shows it (object-fit: cover and its position)
  const ready = () => {
    const box = hero.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (!img.complete || !img.naturalWidth || !w || !h) return false;
    if (clean && clean.width === w && clean.height === h) return true;
    cnv.width = w;
    cnv.height = h;
    clean = document.createElement('canvas');
    clean.width = w;
    clean.height = h;
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(r.width / iw, r.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const [px, py] = (cs.objectPosition || '50% 50%').split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
    clean.getContext('2d')!.drawImage(img, r.left - box.left + (r.width - dw) * px, r.top - box.top + (r.height - dh) * py, dw, dh);
    tinted = gradientMap(clean, ramp);
    mosh = new Mosh(cnv, BLOCK);
    return true;
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 1000 / MOSH_FPS || !mosh || !clean || !tinted) return;
    lastFrame = now;

    const burst = Math.max(0, 1 - (now - burstAt) / BURST);
    const leaving = !hovering;
    const moving = Math.min(1, Math.hypot(pointer.vx, pointer.vy) / 6);
    const reach = cnv.width * REACH;
    const swirl = 18 * burst;

    mosh.step(
      (x, y) => {
        // Blocks near the pointer get dragged the way it's moving
        const near = pointer.inside ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / reach) ** 1.5 : 0;
        const [dx, dy, s] = wave(x, y);
        return [pointer.vx * near * 1.4 + dx * s * swirl, pointer.vy * near * 1.4 + dy * s * swirl];
      },
      () => {
        const r = Math.random();
        // Arriving: the colour floods in. Leaving: the photo comes back fast.
        // Still pointer: catches up slowly. Moving: barely.
        const catchUp = leaving ? 0.35 : Math.max(0.3 * burst, 0.015 + 0.09 * (1 - moving) * (1 - burst));
        if (r < catchUp) return 'clean';
        return r < 0.88 ? 'move' : 'keep';
      },
      leaving ? clean : tinted,
    );

    // Movement fades between frames, so the smear stops when the pointer does
    pointer.vx *= 0.5;
    pointer.vy *= 0.5;

    // Resting pointer and a settled picture: pause until it moves again
    if (!leaving && burst <= 0 && moving < 0.05) still++;
    else still = 0;
    if (!leaving && still > 36) {
      mosh.draw(tinted);
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }

    // After leaving, stop once the picture has had time to come back clean
    if (leaving && now - leftAt > 450) {
      cancelAnimationFrame(raf);
      raf = 0;
      cnv.classList.remove('is-on');
    }
  };

  const enter = () => {
    if (!ready() || !mosh || !clean) return;
    hovering = true;
    burstAt = performance.now();
    wave = waves();
    if (!raf) {
      mosh.draw(clean);
      cnv.classList.add('is-on');
      raf = requestAnimationFrame(frame);
    }
  };
  const leave = () => {
    hovering = false;
    pointer.inside = false;
    leftAt = performance.now();
    if (!raf) cnv.classList.remove('is-on');
  };

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const box = hero.getBoundingClientRect();
    const over = e.clientY >= box.top && e.clientY <= box.bottom && e.clientX >= box.left && e.clientX <= box.right;
    if (!over) {
      if (hovering) leave();
      return;
    }
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    if (pointer.inside) {
      pointer.vx += x - pointer.x;
      pointer.vy += y - pointer.y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.inside = true;
    if (!hovering) enter();
    else if (!raf) {
      still = 0;
      raf = requestAnimationFrame(frame);
    }
  }, { signal });
  document.documentElement.addEventListener('pointerleave', () => hovering && leave(), { signal });
  window.addEventListener('resize', () => { clean = null; }, { signal });
}
