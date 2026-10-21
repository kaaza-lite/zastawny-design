// A rough screenshot of what's on screen, drawn into a canvas, for the page transition.
// Browsers can't hand a page's pixels to a script, so this redraws the visible parts:
// the background, filled and bordered boxes (cards, pills, dividers), simple gradient
// overlays, images, and every word of text in its own font, colour and position.
// It doesn't need to be perfect: the datamosh starts breaking it up straight away.

const SKIP = 'script, style, .page-mosh, .cursor-glow, .bottom-shade, .top-shade, .pill-trail, .peek-canvas, dialog:not([open]), .site-nav, .song-player, svg';

type Opaque = Element & { checkVisibility?: (o?: object) => boolean };

/** Parse "rgb(1 2 3 / 0.5)" or "rgba(1, 2, 3, 0.5)": is it visible at all? */
const visibleColour = (c: string) => !!c && c !== 'transparent' && !/rgba?\([^)]*[,/]\s*0\s*\)$/.test(c);

/** Opacity of an element including its ancestors' (cached per snapshot). */
function opacityOf(el: Element, cache: Map<Element, number>): number {
  if (cache.has(el)) return cache.get(el)!;
  const own = parseFloat(getComputedStyle(el).opacity || '1');
  const value = own * (el.parentElement ? opacityOf(el.parentElement, cache) : 1);
  cache.set(el, value);
  return value;
}

function roundRect(ctx: CanvasRenderingContext2D, r: DOMRect, radius: number) {
  ctx.beginPath();
  const rad = Math.min(radius, r.width / 2, r.height / 2);
  if (rad > 0 && ctx.roundRect) ctx.roundRect(r.left, r.top, r.width, r.height, rad);
  else ctx.rect(r.left, r.top, r.width, r.height);
}

/** "linear-gradient(to top, rgb(...), rgb(...))" into a canvas gradient over the rect. */
function gradient(ctx: CanvasRenderingContext2D, css: string, r: DOMRect) {
  const m = css.match(/^linear-gradient\((to (top|bottom))?,?\s*(.*)\)$/);
  if (!m) return null;
  const colours = m[3].match(/rgba?\([^)]*\)/g);
  if (!colours || colours.length < 2) return null;
  const up = m[2] === 'top';
  const g = ctx.createLinearGradient(0, up ? r.bottom : r.top, 0, up ? r.top : r.bottom);
  colours.forEach((c, i) => g.addColorStop(i / (colours.length - 1), c));
  return g;
}

/** Draws an image the way object-fit / object-position place it, clipped to its rounded box. */
function drawImg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: DOMRect, cs: CSSStyleDeclaration) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!img.complete || !iw || !ih) return;
  const fit = cs.objectFit;
  const scale = fit === 'contain' ? Math.min(r.width / iw, r.height / ih) : fit === 'fill' ? 0 : Math.max(r.width / iw, r.height / ih);
  const dw = scale ? iw * scale : r.width;
  const dh = scale ? ih * scale : r.height;
  const [px, py] = (cs.objectPosition || '50% 50%').split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  ctx.save();
  roundRect(ctx, r, parseFloat(cs.borderTopLeftRadius) || 0);
  ctx.clip();
  ctx.drawImage(img, r.left + (r.width - dw) * px, r.top + (r.height - dh) * py, dw, dh);
  ctx.restore();
}

/** Borders: one rounded outline when all sides match, otherwise each side as a line. */
function drawBorders(ctx: CanvasRenderingContext2D, r: DOMRect, cs: CSSStyleDeclaration) {
  const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((s) => ({
    s,
    w: parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0,
    style: cs.getPropertyValue(`border-${s.toLowerCase()}-style`),
    colour: cs.getPropertyValue(`border-${s.toLowerCase()}-color`),
  })).filter((b) => b.w > 0 && b.style !== 'none' && b.style !== 'hidden' && visibleColour(b.colour));
  if (!sides.length) return;
  const radius = parseFloat(cs.borderTopLeftRadius) || 0;
  if (sides.length === 4 && radius > 0) {
    ctx.strokeStyle = sides[0].colour;
    ctx.lineWidth = sides[0].w;
    ctx.setLineDash(sides[0].style === 'dashed' ? [3 * sides[0].w, 3 * sides[0].w] : []);
    const inset = sides[0].w / 2;
    roundRect(ctx, new DOMRect(r.left + inset, r.top + inset, r.width - 2 * inset, r.height - 2 * inset), radius - inset);
    ctx.stroke();
  } else {
    for (const b of sides) {
      ctx.strokeStyle = b.colour;
      ctx.lineWidth = b.w;
      ctx.setLineDash(b.style === 'dashed' ? [3 * Math.max(1, b.w), 3 * Math.max(1, b.w)] : []);
      ctx.beginPath();
      const half = b.w / 2;
      if (b.s === 'Top') { ctx.moveTo(r.left, r.top + half); ctx.lineTo(r.right, r.top + half); }
      if (b.s === 'Bottom') { ctx.moveTo(r.left, r.bottom - half); ctx.lineTo(r.right, r.bottom - half); }
      if (b.s === 'Left') { ctx.moveTo(r.left + half, r.top); ctx.lineTo(r.left + half, r.bottom); }
      if (b.s === 'Right') { ctx.moveTo(r.right - half, r.top); ctx.lineTo(r.right - half, r.bottom); }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

/** A ::before / ::after layer that covers its element (gradient fades, image tints). */
function drawOverlayLayer(ctx: CanvasRenderingContext2D, el: Element, r: DOMRect, which: '::before' | '::after') {
  const ps = getComputedStyle(el, which);
  if (!ps.content || ps.content === 'none' || ps.position !== 'absolute') return;
  if (![ps.top, ps.left].every((v) => v === '0px')) return;
  if (visibleColour(ps.backgroundColor)) {
    ctx.fillStyle = ps.backgroundColor;
    ctx.fillRect(r.left, r.top, r.width, r.height);
  }
  if (ps.backgroundImage && ps.backgroundImage !== 'none') {
    const g = gradient(ctx, ps.backgroundImage, r);
    if (g) {
      ctx.fillStyle = g;
      ctx.fillRect(r.left, r.top, r.width, r.height);
    }
  }
}

/** Every word of the visible text, drawn where the browser laid it out. */
function drawText(ctx: CanvasRenderingContext2D, vw: number, vh: number, visible: (el: Element) => boolean, opacity: (el: Element) => number) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    const parent = node.parentElement;
    if (!parent || !text.trim() || parent.closest(SKIP) || !visible(parent)) continue;
    const box = parent.getBoundingClientRect();
    if (box.bottom < 0 || box.top > vh || box.right < 0 || box.left > vw) continue;
    // Text kept for screen readers only (a 1px box, like the page title announced on each page change)
    if (box.width <= 1 || box.height <= 1) continue;
    const cs = getComputedStyle(parent);
    if (!visibleColour(cs.color)) continue;
    ctx.globalAlpha = opacity(parent);
    ctx.fillStyle = cs.color;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const transform = cs.textTransform;
    const put = (start: number, end: number) => {
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = range.getClientRects();
      // A word broken across two lines (after a hyphen): draw it letter by letter
      if (rects.length > 1 && end - start > 1) {
        for (let i = start; i < end; i++) put(i, i + 1);
        return;
      }
      const rect = rects[0];
      if (!rect || rect.width < 1 || rect.bottom < 0 || rect.top > vh) return;
      const raw = text.slice(start, end);
      const word = transform === 'uppercase' ? raw.toUpperCase() : transform === 'lowercase' ? raw.toLowerCase() : raw;
      const metrics = ctx.measureText(word);
      const asc = metrics.fontBoundingBoxAscent ?? rect.height * 0.8;
      const desc = metrics.fontBoundingBoxDescent ?? rect.height * 0.2;
      ctx.fillText(word, rect.left, rect.top + (rect.height - asc - desc) / 2 + asc);
    };
    for (const m of text.matchAll(/\S+/g)) put(m.index!, m.index! + m[0].length);
  }
  ctx.globalAlpha = 1;
}

/** The visible page as a canvas, `scale` canvas pixels per CSS pixel. */
export function snapshot(scale = 1): HTMLCanvasElement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, vw, vh);

  const cache = new Map<Element, number>();
  const opacity = (el: Element) => opacityOf(el, cache);
  const visible = (el: Element) => {
    const o = el as Opaque;
    if (o.checkVisibility) return o.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && opacity(el) > 0;
  };

  // Paint order: the box, its ::before, its children, then its ::after on top
  const walk = (el: Element) => {
    if (el.matches(SKIP) || !visible(el)) return;
    const r = el.getBoundingClientRect();
    const onScreen = r.width >= 1 && r.height >= 1 && r.bottom >= 0 && r.top <= vh && r.right >= 0 && r.left <= vw;
    const cs = getComputedStyle(el);
    if (onScreen) {
      ctx.globalAlpha = opacity(el);
      if (visibleColour(cs.backgroundColor)) {
        ctx.fillStyle = cs.backgroundColor;
        roundRect(ctx, r, parseFloat(cs.borderTopLeftRadius) || 0);
        ctx.fill();
      }
      if (el instanceof HTMLImageElement) drawImg(ctx, el, r, cs);
      else if (el instanceof HTMLCanvasElement) ctx.drawImage(el, r.left, r.top, r.width, r.height); // a card mid-hover
      else if (el instanceof HTMLIFrameElement || el instanceof HTMLVideoElement) {
        ctx.fillStyle = '#000';
        roundRect(ctx, r, parseFloat(cs.borderTopLeftRadius) || 0);
        ctx.fill();
      }
      drawOverlayLayer(ctx, el, r, '::before');
      drawBorders(ctx, r, cs);
      // List bullets sit outside the item, on its first line
      if (cs.display === 'list-item' && cs.listStyleType === 'disc' && visibleColour(cs.color)) {
        const size = parseFloat(cs.fontSize);
        const line = parseFloat(cs.lineHeight) || size * 1.4;
        ctx.fillStyle = cs.color;
        ctx.beginPath();
        ctx.arc(r.left - size * 0.75, r.top + line / 2, size * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const child of el.children) walk(child);
    if (onScreen) {
      ctx.globalAlpha = opacity(el);
      drawOverlayLayer(ctx, el, r, '::after');
    }
  };
  for (const child of document.body.children) walk(child);
  ctx.globalAlpha = 1;
  drawText(ctx, vw, vh, visible, opacity);
  return canvas;
}
