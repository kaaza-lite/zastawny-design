// Datamosh, drawn on a canvas.
// Video codecs store most frames as "move this block of the previous frame by this much".
// Datamoshing breaks that on purpose: blocks of an old picture keep being pushed around by
// motion that doesn't belong to them, so the image smears, drags and melts, until a clean
// frame arrives and the blocks snap back.
//
// Here the canvas is cut into square blocks. Every step, each block is either
//   moved  - copied from the previous frame, shifted by its motion vector (the smear)
//   kept   - left as it is (stuck blocks)
//   clean  - redrawn from the clean picture (the stream catching up)
//   clear  - made transparent, showing whatever is under the canvas
//
// Used by the case study card hovers and the page transitions.

/** Frames per second: stepped like a stuttering video stream, not smooth. */
export const MOSH_FPS = 24;

/** A motion vector in canvas pixels for the block at (x, y). */
export type Field = (x: number, y: number) => [number, number];

/** What happens to the block at (x, y) this step. */
export type Decide = (x: number, y: number) => 'move' | 'keep' | 'clean' | 'clear';

export class Mosh {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly block: number;
  private prev: HTMLCanvasElement;
  private prevCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, block: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.block = Math.max(4, Math.round(block));
    this.prev = document.createElement('canvas');
    this.prevCtx = this.prev.getContext('2d')!;
  }

  /** Start from a picture: draw it over the whole canvas. */
  draw(source: CanvasImageSource) {
    const { width: w, height: h } = this.canvas;
    this.ctx.clearRect(0, 0, w, h);
    if ((source as HTMLCanvasElement).width === 0 || (source as HTMLCanvasElement).height === 0) return;
    this.ctx.drawImage(source, 0, 0, w, h);
  }

  /** One step of the stream. `clean` is the picture used by 'clean' blocks. */
  step(field: Field, decide: Decide, clean?: CanvasImageSource) {
    const { canvas, ctx, block: b } = this;
    const w = canvas.width;
    const h = canvas.height;

    // The previous frame, which moving blocks copy from
    if (this.prev.width !== w || this.prev.height !== h) {
      this.prev.width = w;
      this.prev.height = h;
    }
    this.prevCtx.clearRect(0, 0, w, h);
    this.prevCtx.drawImage(canvas, 0, 0);

    for (let y = 0; y < h; y += b) {
      for (let x = 0; x < w; x += b) {
        const what = decide(x, y);
        if (what === 'keep') continue;
        if (what === 'clear') {
          ctx.clearRect(x, y, b, b);
          continue;
        }
        if (what === 'clean') {
          ctx.clearRect(x, y, b, b);
          if (clean) ctx.drawImage(clean, x, y, b, b, x, y, b, b);
          continue;
        }
        const [vx, vy] = field(x, y);
        if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) continue;
        // Copy from where this block's pixels were a frame ago (kept inside the canvas)
        const sx = Math.min(w - b, Math.max(0, Math.round(x - vx)));
        const sy = Math.min(h - b, Math.max(0, Math.round(y - vy)));
        ctx.clearRect(x, y, b, b);
        ctx.drawImage(this.prev, sx, sy, b, b, x, y, b, b);
      }
    }
  }
}

/**
 * A smooth, swirly motion field: a few overlapping waves, so neighbouring blocks move
 * together (like real motion vectors) and some regions barely move at all.
 */
export function waves(seed = Math.random() * 1000) {
  const r = (n: number) => {
    const s = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const f1 = 0.004 + r(1) * 0.006;
  const f2 = 0.008 + r(2) * 0.01;
  const p1 = r(3) * 6.28;
  const p2 = r(4) * 6.28;
  /** Returns a direction (-1..1 each) and a strength (0..1) for the point. */
  return (x: number, y: number): [number, number, number] => {
    const a = Math.sin(x * f1 + p1) + Math.cos(y * f2 + p2);
    const angle = a * 1.6;
    const strength = Math.max(0, Math.sin(x * f2 - y * f1 + p2) * 0.5 + 0.5);
    return [Math.cos(angle), Math.sin(angle), strength];
  };
}

/** Crop a picture like object-fit: cover into a canvas of the given size. */
export function cover(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return c;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  c.getContext('2d')!.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  return c;
}

/**
 * The picture recoloured into a monochrome ramp (darkest to lightest colour):
 * each pixel's brightness picks its colour along the ramp.
 */
export function gradientMap(source: HTMLCanvasElement, ramp: readonly string[]) {
  const w = source.width;
  const h = source.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  if (!w || !h) return out;
  const stops = ramp.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const pos = (i / 255) * (stops.length - 1);
    const a = Math.floor(pos);
    const b = Math.min(stops.length - 1, a + 1);
    for (let c = 0; c < 3; c++) table[i * 3 + c] = stops[a][c] + (stops[b][c] - stops[a][c]) * (pos - a);
  }
  const data = source.getContext('2d')!.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8;
    d[i] = table[lum * 3];
    d[i + 1] = table[lum * 3 + 1];
    d[i + 2] = table[lum * 3 + 2];
  }
  out.getContext('2d')!.putImageData(data, 0, 0);
  return out;
}
