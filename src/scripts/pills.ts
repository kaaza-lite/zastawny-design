// Playful pills: the About page lists and the "open to work" pill.
// Mark a list with data-pill-group and each item with data-pill.
//
//   glow      a soft light follows the cursor inside the pill (the colour is set in CSS)
//   drag      grab a pill and move it (on phones: press and hold first, so scrolling still works)
//   throw     let go while moving and it flies anywhere on screen, bounces off the
//             window edges, then springs back home; nothing stays out of place
//   make room the other pills in the row step aside while one passes through them
//   trail     a moving pill leaves a short datamosh trail of blocks behind it
//
// With reduced motion only the glow is kept. Screen readers still read a plain list.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

const HOLD = 350;       // ms: press and hold on a touch screen before the pill is picked up
const HOME = 70;        // spring pulling a let-go pill home (higher = snappier)
const HOME_DAMP = 9;    // how quickly that spring settles
const ROOM = 200;       // spring moving neighbours out of the way and back
const ROOM_DAMP = 24;
const BOUNCE = 0.55;    // speed kept when a thrown pill hits the edge of the window
const GAP = 8;          // space kept around a pill when neighbours step aside
const TRAIL_BLOCK = 8;  // trail block size in CSS pixels
const TRAIL_FPS = 24;

type Pill = {
  el: HTMLElement;       // the <li>, which moves
  tag: HTMLElement;      // the visible pill inside it
  x: number; y: number;  // offset from its place in the layout
  vx: number; vy: number;
  home: DOMRect;         // its place in the layout (viewport coordinates when the drag began)
};

// Listeners on the window belong to one visit of the page; leaving the page removes them
let page: AbortController | null = null;

export function initPills() {
  page?.abort();
  page = new AbortController();
  const signal = page.signal;
  document.addEventListener('astro:before-swap', () => page?.abort(), { once: true, signal });
  for (const list of document.querySelectorAll<HTMLElement>('[data-pill-group]')) setupList(list, signal);
}

function setupList(list: HTMLElement, signal: AbortSignal) {
  const pills: Pill[] = [...list.querySelectorAll<HTMLElement>('[data-pill]')].map((el) => ({
    el,
    tag: el.querySelector<HTMLElement>('.tag')!,
    x: 0, y: 0, vx: 0, vy: 0,
    home: el.getBoundingClientRect(),
  }));

  // ---------- Glow: follow the cursor inside the pill ----------
  list.addEventListener('pointermove', (e) => {
    const tag = (e.target as Element).closest<HTMLElement>('.tag');
    if (!tag) return;
    const r = tag.getBoundingClientRect();
    tag.style.setProperty('--mx', `${e.clientX - r.left}px`);
    tag.style.setProperty('--my', `${e.clientY - r.top}px`);
  });

  // ---------- Drag, throw and spring back ----------
  let active: Pill | null = null;  // the pill being dragged or flying
  let dragging = false;
  let grab = { px: 0, py: 0, x: 0, y: 0 };
  let samples: { t: number; x: number; y: number }[] = [];
  let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let raf = 0;
  let last = 0;
  let holdTimer = 0;

  const measure = () => {
    for (const p of pills) {
      const r = p.el.getBoundingClientRect();
      p.home = new DOMRect(r.left - p.x, r.top - p.y, r.width, r.height);
    }
  };

  const pickUp = (p: Pill, e: PointerEvent) => {
    measure();
    active = p;
    dragging = true;
    grab = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
    samples = [{ t: performance.now(), x: p.x, y: p.y }];
    // It can go anywhere in the window
    bounds = {
      minX: -p.home.left,
      maxX: window.innerWidth - p.home.right,
      minY: -p.home.top,
      maxY: window.innerHeight - p.home.bottom,
    };
    p.el.classList.add('is-held');
    trail.start(p);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };

  const letGo = () => {
    if (!active || !dragging) return;
    dragging = false;
    active.el.classList.remove('is-held');
    // Throw speed from the last ~100ms of movement
    const now = performance.now();
    const recent = samples.filter((s) => now - s.t < 100);
    if (recent.length > 1) {
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = Math.max(16, b.t - a.t) / 1000;
      active.vx = (b.x - a.x) / dt;
      active.vy = (b.y - a.y) / dt;
    }
  };

  list.addEventListener('pointerdown', (e) => {
    if (reduce.matches || e.button > 0) return;
    const li = (e.target as Element).closest<HTMLElement>('[data-pill]');
    const p = pills.find((q) => q.el === li);
    if (!p) return;
    if (e.pointerType === 'mouse') {
      e.preventDefault(); // no text selection
      pickUp(p, e);
      return;
    }
    // Touch: press and hold to pick it up; moving first means scrolling
    const start = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => pickUp(p, e), HOLD);
    const cancel = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > 8) clearTimeout(holdTimer);
    };
    list.addEventListener('pointermove', cancel);
    list.addEventListener('pointerup', () => {
      clearTimeout(holdTimer);
      list.removeEventListener('pointermove', cancel);
    }, { once: true });
  });

  window.addEventListener('pointermove', (e) => {
    if (!active || !dragging) return;
    active.x = Math.min(bounds.maxX, Math.max(bounds.minX, grab.x + e.clientX - grab.px));
    active.y = Math.min(bounds.maxY, Math.max(bounds.minY, grab.y + e.clientY - grab.py));
    samples.push({ t: performance.now(), x: active.x, y: active.y });
    if (samples.length > 12) samples.shift();
  }, { signal });
  window.addEventListener('pointerup', letGo, { signal });
  window.addEventListener('pointercancel', letGo, { signal });
  // While a pill is held on a touch screen, the page doesn't scroll
  document.addEventListener('touchmove', (e) => {
    if (dragging) e.preventDefault();
  }, { passive: false, signal });

  // One step of the physics, every frame
  function tick(now: number) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // The let-go pill: flies with its speed, bounces off the window edges, springs home
    if (active && !dragging) {
      const p = active;
      p.vx += (-HOME * p.x - HOME_DAMP * p.vx) * dt;
      p.vy += (-HOME * p.y - HOME_DAMP * p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < bounds.minX) { p.x = bounds.minX; p.vx = -p.vx * BOUNCE; }
      if (p.x > bounds.maxX) { p.x = bounds.maxX; p.vx = -p.vx * BOUNCE; }
      if (p.y < bounds.minY) { p.y = bounds.minY; p.vy = -p.vy * BOUNCE; }
      if (p.y > bounds.maxY) { p.y = bounds.maxY; p.vy = -p.vy * BOUNCE; }
      if (Math.hypot(p.x, p.y) < 0.5 && Math.hypot(p.vx, p.vy) < 5) {
        p.x = p.y = p.vx = p.vy = 0;
        active = null;
      }
    }

    // Neighbours step aside from the moving pill, then return
    for (const p of pills) {
      if (p === active) continue;
      let tx = 0;
      let ty = 0;
      if (active) {
        const a = active.home;
        const ax = a.left + active.x;
        const ay = a.top + active.y;
        const b = p.home;
        const overlapX = Math.min(ax + a.width, b.right) - Math.max(ax, b.left) + GAP;
        const overlapY = Math.min(ay + a.height, b.bottom) - Math.max(ay, b.top) + GAP;
        if (overlapX > 0 && overlapY > 0) {
          // push along the shorter overlap, away from the moving pill
          if (overlapX < overlapY) tx = (b.left + b.width / 2 < ax + a.width / 2 ? -1 : 1) * overlapX;
          else ty = (b.top + b.height / 2 < ay + a.height / 2 ? -1 : 1) * overlapY;
        }
      }
      p.vx += (ROOM * (tx - p.x) - ROOM_DAMP * p.vx) * dt;
      p.vy += (ROOM * (ty - p.y) - ROOM_DAMP * p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Move everything (transform only)
    let moving = !!active;
    for (const p of pills) {
      const still = Math.abs(p.x) < 0.3 && Math.abs(p.y) < 0.3 && Math.abs(p.vx) < 3 && Math.abs(p.vy) < 3;
      if (still && p !== active) {
        p.x = p.y = p.vx = p.vy = 0;
        p.el.style.transform = '';
      } else {
        moving = true;
        p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
    }
    trail.step(now, active);

    if (moving || trail.alive) raf = requestAnimationFrame(tick);
    else raf = 0;
  }

  // ---------- Datamosh trail ----------
  const trail = makeTrail();
}

/** A fixed canvas under the page content where moving pills leave blocks behind. */
function makeTrail() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let sprite: HTMLCanvasElement | null = null; // the pill drawn into a small canvas
  let lastFrame = 0;
  let lastPos: { x: number; y: number } | null = null;
  let fade = 0; // frames left until the canvas is clear

  const ensureCanvas = () => {
    if (canvas && canvas.isConnected) return;
    canvas = document.createElement('canvas');
    canvas.className = 'pill-trail';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
  };

  // Draw the pill (background, border, text) so its blocks can be smeared
  const drawSprite = (p: Pill) => {
    const r = p.tag.getBoundingClientRect();
    const cs = getComputedStyle(p.tag);
    const c = document.createElement('canvas');
    c.width = Math.ceil(r.width * dpr);
    c.height = Math.ceil(r.height * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.beginPath();
    g.roundRect(0.5, 0.5, r.width - 1, r.height - 1, r.height / 2);
    g.fillStyle = cs.backgroundColor;
    g.fill();
    g.strokeStyle = cs.borderTopColor;
    g.stroke();
    g.fillStyle = cs.color;
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.textBaseline = 'middle';
    g.fillText(p.tag.textContent?.trim() ?? '', parseFloat(cs.paddingLeft), r.height / 2);
    return c;
  };

  return {
    alive: false,
    start(p: Pill) {
      ensureCanvas();
      canvas!.width = Math.round(window.innerWidth * dpr);
      canvas!.height = Math.round(window.innerHeight * dpr);
      sprite = drawSprite(p);
      lastPos = null;
    },
    step(now: number, p: Pill | null) {
      if (!ctx || !canvas || now - lastFrame < 1000 / TRAIL_FPS) return;
      lastFrame = now;
      const w = canvas.width;
      const h = canvas.height;
      // Older blocks fade out
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgb(0 0 0 / 0.3)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';

      if (p && sprite) {
        const r = p.tag.getBoundingClientRect();
        const pos = { x: r.left, y: r.top };
        const moved = lastPos ? Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) : 0;
        if (lastPos && moved > 2) {
          // Blocks of the pill, dropped along the path it just travelled, snapped to a grid
          const b = TRAIL_BLOCK;
          const count = Math.min(40, Math.round(moved / 3) + 6);
          for (let i = 0; i < count; i++) {
            const t = Math.random();
            const sx = Math.floor((Math.random() * r.width) / b) * b;
            const sy = Math.floor((Math.random() * r.height) / b) * b;
            const x = Math.round((lastPos.x + (pos.x - lastPos.x) * t + sx) / b) * b;
            const y = Math.round((lastPos.y + (pos.y - lastPos.y) * t + sy) / b) * b;
            ctx.globalAlpha = 0.35 + Math.random() * 0.5;
            ctx.drawImage(sprite, sx * dpr, sy * dpr, b * dpr, b * dpr, x * dpr, y * dpr, b * dpr, b * dpr);
          }
          ctx.globalAlpha = 1;
          fade = 12;
        }
        lastPos = pos;
      }
      fade = Math.max(0, fade - 1);
      this.alive = fade > 0;
      if (!this.alive && !p) ctx.clearRect(0, 0, w, h);
    },
  };
}
