// "Computer vision" glitch, drawn on a canvas.
// Each frame layers random blocks over the image: false-colour panels (the image
// gradient-mapped to a monochrome ramp), sideways displacement, smeared pixel rows,
// pixelated patches, solid masks, plus a tracking overlay of boxes, tags and lines.
//
// Used by the case study card hovers; the full-screen page transition reuses it.

export type Ramp = readonly string[];

type Prepared = {
  w: number;
  h: number;
  base: HTMLCanvasElement;    // the image, cropped like object-fit: cover
  mapped: HTMLCanvasElement;  // gradient-mapped to the ramp
  inverse: HTMLCanvasElement; // gradient-mapped with the ramp reversed
  scratch: HTMLCanvasElement; // for pixelated patches
};

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// 256-step lookup table from luminance to a colour along the ramp
function lut(ramp: Ramp, reverse = false): Uint8ClampedArray {
  const stops = (reverse ? [...ramp].reverse() : [...ramp]).map(hexToRgb);
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const pos = (i / 255) * (stops.length - 1);
    const a = Math.floor(pos);
    const b = Math.min(stops.length - 1, a + 1);
    const t = pos - a;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = stops[a][c] + (stops[b][c] - stops[a][c]) * t;
  }
  return out;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Crop the image like object-fit: cover and build the colour-mapped versions. */
export function prepare(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }, w: number, h: number, ramp: Ramp): Prepared | null {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  if (!iw || !ih || !w || !h) return null;

  const base = canvas(w, h);
  const bctx = base.getContext('2d', { willReadFrequently: true });
  if (!bctx) return null;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  bctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);

  const src = bctx.getImageData(0, 0, w, h);
  const make = (table: Uint8ClampedArray) => {
    const c = canvas(w, h);
    const out = new ImageData(w, h);
    const s = src.data;
    const d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      const lum = (s[i] * 54 + s[i + 1] * 183 + s[i + 2] * 19) >> 8;
      d[i] = table[lum * 3];
      d[i + 1] = table[lum * 3 + 1];
      d[i + 2] = table[lum * 3 + 2];
      d[i + 3] = 255;
    }
    c.getContext('2d')!.putImageData(out, 0, 0);
    return c;
  };

  return { w, h, base, mapped: make(lut(ramp)), inverse: make(lut(ramp, true)), scratch: canvas(64, 64) };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * Draw one glitch frame. `k` is intensity from 0 (clean image) to 1 (heavy).
 * `unit` scales line widths and tag sizes (use devicePixelRatio).
 */
export function drawFrame(ctx: CanvasRenderingContext2D, p: Prepared, ramp: Ramp, k: number, unit = 1) {
  const { w, h } = p;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1;
  ctx.drawImage(p.base, 0, 0);
  if (k <= 0) return;

  // Blocks
  const blocks = Math.round(3 + 10 * k);
  for (let n = 0; n < blocks; n++) {
    const thin = Math.random() < 0.3;
    const bw = rand(0.08, 0.45) * w;
    const bh = (thin ? rand(0.01, 0.05) : rand(0.05, 0.32)) * h;
    const x = rand(-0.05, 0.95) * w;
    const y = rand(0, 0.97) * h;
    const r = Math.random();

    if (r < 0.3) {
      // false-colour panel
      ctx.drawImage(p.mapped, x, y, bw, bh, x, y, bw, bh);
    } else if (r < 0.43) {
      // reversed ramp panel
      ctx.drawImage(p.inverse, x, y, bw, bh, x, y, bw, bh);
    } else if (r < 0.63) {
      // sideways displacement
      const dx = rand(-0.14, 0.14) * w * k;
      ctx.drawImage(Math.random() < 0.5 ? p.base : p.mapped, x, y, bw, bh, x + dx, y, bw, bh);
    } else if (r < 0.78) {
      // smear: one row stretched down the block
      const row = y + Math.random() * bh;
      ctx.drawImage(p.base, x, row, bw, Math.max(1, unit), x, y, bw, bh);
    } else if (r < 0.9) {
      // pixelated patch
      const size = rand(8, 22) * unit;
      const sw = Math.max(1, Math.round(bw / size));
      const sh = Math.max(1, Math.round(bh / size));
      p.scratch.width = sw;
      p.scratch.height = sh;
      p.scratch.getContext('2d')!.drawImage(Math.random() < 0.6 ? p.mapped : p.base, x, y, bw, bh, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(p.scratch, 0, 0, sw, sh, x, y, bw, bh);
      ctx.imageSmoothingEnabled = true;
    } else {
      // solid mask: darkest, or a flat segmentation fill
      ctx.fillStyle = Math.random() < 0.6 ? ramp[0] : pick([ramp[3], ramp[4]]);
      ctx.fillRect(x, y, bw, bh);
    }
  }

  // Tracking overlay: bounding boxes with tags, and thin lines between points
  if (k > 0.25) {
    ctx.lineWidth = Math.max(1, unit);
    const boxes = Math.round(1 + 3 * k);
    const points: [number, number][] = [];
    for (let n = 0; n < boxes; n++) {
      const bw = rand(0.12, 0.35) * w;
      const bh = rand(0.25, 0.7) * h;
      const x = rand(0, 1) * (w - bw);
      const y = rand(0, 1) * (h - bh);
      ctx.strokeStyle = ramp[5];
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(bw), Math.round(bh));
      ctx.globalAlpha = 1;
      ctx.fillStyle = pick([ramp[4], ramp[5], ramp[3]]);
      ctx.fillRect(x, y - 7 * unit, rand(14, 30) * unit, 6 * unit);
      points.push([x + bw * rand(0.2, 0.8), y + bh * rand(0.1, 0.5)]);
    }
    // small floating tags
    for (let n = 0; n < Math.round(2 + 4 * k); n++) {
      ctx.fillStyle = pick([ramp[4], ramp[5], ramp[2]]);
      const tx = rand(0, w);
      const ty = rand(0, h);
      ctx.fillRect(tx, ty, rand(8, 20) * unit, rand(4, 7) * unit);
      points.push([tx, ty]);
    }
    // connecting lines
    ctx.strokeStyle = ramp[5];
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let n = 1; n < points.length; n += 2) {
      ctx.moveTo(points[n - 1][0], points[n - 1][1]);
      ctx.lineTo(points[n][0], points[n][1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Frames per second for the glitch: stepped, not smooth, on purpose. */
export const GLITCH_FPS = 14;

// ---------- Text scramble ----------

/** Characters swapped in while text glitches (letters, digits and symbols). */
export const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789#&/<>_+=';

/**
 * The text at moment t (0 to 1) of a glitch. A full glitch resolves left to right;
 * a light one keeps the text and swaps a few characters.
 */
export function scrambled(text: string, t: number, full: boolean) {
  const randomChar = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
  const resolved = full ? Math.floor(text.length * Math.min(1, t / 0.85)) : text.length;
  return [...text]
    .map((ch, i) => {
      if (ch === ' ') return ' ';
      if (i < resolved) return !full && Math.random() < 0.22 ? randomChar() : ch;
      return randomChar();
    })
    .join('');
}

// ---------- Full-screen overlay (page load and page transitions) ----------

/**
 * Draw one frame of the full-screen glitch over a transparent canvas: flat ramp
 * panels, dark masks, thin bands, scanline patches and the tracking overlay.
 * The page shows through between the blocks.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, ramp: Ramp, k: number, unit = 1) {
  ctx.clearRect(0, 0, w, h);
  if (k <= 0) return;

  const blocks = Math.round(6 + 18 * k);
  for (let n = 0; n < blocks; n++) {
    const r = Math.random();
    const bw = rand(0.06, 0.5) * w;
    const bh = rand(0.02, 0.22) * h;
    const x = rand(-0.05, 0.95) * w;
    const y = rand(0, 0.98) * h;

    if (r < 0.5) {
      // flat ramp panel
      ctx.globalAlpha = rand(0.75, 1);
      ctx.fillStyle = pick(ramp.slice(1));
      ctx.fillRect(x, y, bw, bh);
    } else if (r < 0.65) {
      // dark mask
      ctx.globalAlpha = 1;
      ctx.fillStyle = ramp[0];
      ctx.fillRect(x, y, bw, bh);
    } else if (r < 0.85) {
      // thin band across most of the screen
      ctx.globalAlpha = rand(0.6, 1);
      ctx.fillStyle = pick(ramp);
      ctx.fillRect(rand(-0.1, 0.3) * w, y, rand(0.5, 1.1) * w, rand(1, 6) * unit);
    } else {
      // scanline patch
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = pick(ramp.slice(2));
      for (let ly = y; ly < y + bh; ly += 3 * unit) ctx.fillRect(x, ly, bw, unit);
    }
  }
  ctx.globalAlpha = 1;

  // Tracking overlay
  ctx.lineWidth = Math.max(1, unit);
  const points: [number, number][] = [];
  for (let n = 0; n < Math.round(2 + 4 * k); n++) {
    const bw = rand(0.08, 0.3) * w;
    const bh = rand(0.12, 0.45) * h;
    const x = rand(0, 1) * (w - bw);
    const y = rand(0, 1) * (h - bh);
    ctx.strokeStyle = ramp[5];
    ctx.globalAlpha = 0.85;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(bw), Math.round(bh));
    ctx.globalAlpha = 1;
    ctx.fillStyle = pick([ramp[3], ramp[4], ramp[5]]);
    ctx.fillRect(x, y - 8 * unit, rand(18, 40) * unit, 7 * unit);
    points.push([x + bw * rand(0.2, 0.8), y + bh * rand(0.1, 0.6)]);
  }
  ctx.strokeStyle = ramp[5];
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let n = 1; n < points.length; n++) {
    ctx.moveTo(points[n - 1][0], points[n - 1][1]);
    ctx.lineTo(points[n][0], points[n][1]);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
