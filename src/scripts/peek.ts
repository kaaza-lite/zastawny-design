// The experimental page (/lorem-ipsum): a moving 3D grid of project tiles, and a glass
// modal that shows one project's images one at a time.
//
// Grid: the tiles float at different depths on a plane larger than the screen. It drifts
// slowly by itself, tilts toward the pointer, and can be dragged, scrolled or swiped
// (with a little momentum). Tabbing to a tile brings it into view.
// Modal: one scroll (or swipe, or arrow key) moves exactly one image. The indicator on
// the right shows which image is on screen.

import { startDome } from './dome';

let page: AbortController | null = null;

export function initPeek() {
  page?.abort();
  page = new AbortController();
  const signal = page.signal;
  document.addEventListener('astro:before-swap', () => page?.abort(), { once: true, signal });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Background: a gradient dome, in the colours of the page you came from ----------
  const dome = document.querySelector<HTMLElement>('.peek-dome');
  if (dome) {
    let from = 'neutral';
    try {
      from = sessionStorage.getItem('came-from') || 'neutral';
    } catch {}
    signal.addEventListener('abort', startDome(dome, from));
  }

  // ---------- Grid ----------
  const stage = document.querySelector<HTMLElement>('.peek-stage');
  const field = stage?.querySelector<HTMLElement>('.peek-field');
  if (!stage || !field) return;
  const tiles = [...field.querySelectorAll<HTMLButtonElement>('.peek-tile')];

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let W = 0;
  let H = 0;
  const pan = { x: 0, y: 0 };      // where the plane is
  const goal = { x: 0, y: 0 };     // where it's heading
  const vel = { x: 0, y: 0 };      // momentum after a drag
  const tilt = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };  // -1..1 across the screen

  const layout = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const phone = vw < 800;
    W = Math.round(phone ? vw * 2.6 : Math.max(vw * 1.7, 1500));
    H = Math.round(phone ? vh * 2.3 : Math.max(vh * 1.9, 1400));
    field.style.width = `${W}px`;
    field.style.height = `${H}px`;
    goal.x = pan.x = (vw - W) / 2;
    goal.y = pan.y = (vh - H) / 2;
  };
  const clamp = () => {
    goal.x = Math.min(0, Math.max(vw - W, goal.x));
    goal.y = Math.min(0, Math.max(vh - H, goal.y));
  };
  layout();
  window.addEventListener('resize', layout, { signal });

  // Drag (mouse and touch), with momentum
  let dragging = false;
  let moved = 0;
  let lastP = { x: 0, y: 0, t: 0 };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    dragging = true;
    moved = 0;
    lastP = { x: e.clientX, y: e.clientY, t: performance.now() };
    vel.x = vel.y = 0;
  }, { signal });
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / vw) * 2 - 1;
    pointer.y = (e.clientY / vh) * 2 - 1;
    if (!dragging) return;
    const dx = e.clientX - lastP.x;
    const dy = e.clientY - lastP.y;
    const dt = Math.max(1, performance.now() - lastP.t);
    moved += Math.abs(dx) + Math.abs(dy);
    goal.x += dx;
    goal.y += dy;
    vel.x = (dx / dt) * 16;
    vel.y = (dy / dt) * 16;
    lastP = { x: e.clientX, y: e.clientY, t: performance.now() };
    clamp();
  }, { signal });
  window.addEventListener('pointerup', () => {
    dragging = false;
    if (reduce) vel.x = vel.y = 0;
  }, { signal });
  // A drag isn't a click: don't open a project after dragging
  stage.addEventListener('click', (e) => {
    if (e.detail > 0 && moved > 6) { // e.detail is 0 for keyboard clicks
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Scroll wheel and trackpad move the plane
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    goal.x -= e.deltaX;
    goal.y -= e.deltaY;
    clamp();
  }, { passive: false, signal });

  // Keyboard: the focused tile comes into view
  stage.addEventListener('focusin', (e) => {
    const tile = (e.target as Element).closest<HTMLElement>('.peek-tile');
    if (!tile) return;
    goal.x = vw / 2 - (tile.offsetLeft + tile.offsetWidth / 2);
    goal.y = vh / 2 - (tile.offsetTop + tile.offsetHeight / 2);
    clamp();
  }, { signal });

  // Every frame: momentum, easing toward the goal, a slow drift and the tilt
  const start = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!dragging && (vel.x || vel.y)) {
      goal.x += vel.x;
      goal.y += vel.y;
      vel.x *= 0.92;
      vel.y *= 0.92;
      if (Math.abs(vel.x) + Math.abs(vel.y) < 0.1) vel.x = vel.y = 0;
      clamp();
    }
    const ease = reduce ? 1 : 0.12;
    pan.x += (goal.x - pan.x) * ease;
    pan.y += (goal.y - pan.y) * ease;
    const t = (now - start) / 1000;
    const drift = reduce ? { x: 0, y: 0 } : { x: Math.sin(t * 0.07) * 40, y: Math.cos(t * 0.05) * 30 };
    if (!reduce) {
      tilt.x += (6 - pointer.y * 5 - tilt.x) * 0.06;
      tilt.y += (-8 + pointer.x * 7 - tilt.y) * 0.06;
    } else {
      tilt.x = 6;
      tilt.y = -8;
    }
    // tilt around the middle of the screen, wherever the plane is
    field.style.transformOrigin = `${vw / 2 - pan.x}px ${vh / 2 - pan.y}px`;
    field.style.transform = `translate3d(${(pan.x + drift.x).toFixed(1)}px, ${(pan.y + drift.y).toFixed(1)}px, 0) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`;
  };
  raf = requestAnimationFrame(frame);
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));

  // ---------- Modal ----------
  const dialog = document.querySelector<HTMLDialogElement>('.peek-modal');
  if (!dialog) return;
  const lists = [...dialog.querySelectorAll<HTMLElement>('.peek-slides')];
  const dots = dialog.querySelector<HTMLElement>('.peek-dots')!;
  const count = dialog.querySelector<HTMLElement>('.peek-count')!;
  let list: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  let index = 0;
  let total = 0;

  const show = (i: number) => {
    index = i;
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    [...dots.children].forEach((d, n) => d.classList.toggle('is-on', n === i));
  };
  const goTo = (i: number) => {
    if (!list) return;
    const next = Math.max(0, Math.min(total - 1, i));
    list.scrollTo({ top: next * list.clientHeight, behavior: reduce ? 'auto' : 'smooth' });
    show(next);
  };

  for (const tile of tiles) {
    tile.addEventListener('click', () => {
      const n = Number(tile.dataset.project);
      opener = tile;
      lists.forEach((l, i) => (l.hidden = i !== n));
      list = lists[n];
      total = list.children.length;
      dots.replaceChildren(...Array.from({ length: total }, () => document.createElement('i')));
      list.scrollTop = 0;
      show(0);
      dialog.showModal();
      dialog.focus(); // focus the modal itself (Tab reaches the close button next)
      stage.classList.add('is-behind');
    }, { signal });
  }
  dialog.querySelector('.peek-close')?.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', () => {
    stage.classList.remove('is-behind');
    opener?.focus({ preventScroll: true });
  }, { signal });

  // Keep the indicator in step with swipes and native scrolling
  for (const l of lists) {
    l.addEventListener('scroll', () => {
      if (l !== list) return;
      const i = Math.round(l.scrollTop / l.clientHeight);
      if (i !== index) show(i);
    }, { passive: true, signal });
  }

  // One wheel gesture = one image. Trackpads keep sending events after a flick (momentum),
  // so a new step only starts after a short pause in the events, and not too soon after the last.
  let lastWheel = 0;
  let lastStep = 0;
  dialog.addEventListener('wheel', (e) => {
    if (!list) return;
    e.preventDefault();
    const now = performance.now();
    const pause = now - lastWheel > 180;
    lastWheel = now;
    if (!pause || now - lastStep < 450 || Math.abs(e.deltaY) < 2) return;
    lastStep = now;
    goTo(index + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false, signal });

  dialog.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      goTo(index + 1);
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      goTo(index - 1);
    }
  }, { signal });
}
