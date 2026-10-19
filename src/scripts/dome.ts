// Background of the experimental page: a dome seen from inside, made only with gradients
// (the layers are in src/pages/lorem-ipsum.astro). This sets its colours, taken from the
// page you came from, and leans the light gently toward the pointer.

type Colours = { base: string; deep: string; bright: string; accent: string };

/** Near-black base, a deep colour, a bright one and an accent, per page the visitor can arrive from. */
const domeColours: Record<string, Colours> = {
  neutral: { base: '#03040a', deep: '#0b0f8c', bright: '#00b6bd', accent: '#c4479c' },
  calastone: { base: '#02030c', deep: '#0a1fa0', bright: '#2f8bff', accent: '#19c8e0' },
  bamboo: { base: '#020805', deep: '#06603a', bright: '#1fd08a', accent: '#12b3c0' },
  juicyway: { base: '#08030a', deep: '#4a0c78', bright: '#e0459f', accent: '#7c4dff' },
};

/** Colours the dome and starts the light following the pointer. Returns a function that stops it. */
export function startDome(dome: HTMLElement, from: string): () => void {
  const c = domeColours[from] ?? domeColours.neutral;
  for (const [name, value] of Object.entries(c)) dome.style.setProperty(`--dome-${name}`, value);
  document.body.style.setProperty('--peek-bg', c.base);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  // The light sits near the top centre and moves at most a little toward the pointer
  const light = { x: 50, y: 18 };
  const target = { x: 50, y: 18 };
  let raf = 0;
  const tick = () => {
    light.x += (target.x - light.x) * 0.06;
    light.y += (target.y - light.y) * 0.06;
    dome.style.setProperty('--light-x', `${light.x.toFixed(2)}%`);
    dome.style.setProperty('--light-y', `${light.y.toFixed(2)}%`);
    raf = Math.abs(target.x - light.x) + Math.abs(target.y - light.y) > 0.05 ? requestAnimationFrame(tick) : 0;
  };
  const move = (x: number, y: number) => {
    target.x = 50 + (x / window.innerWidth - 0.5) * 16;
    target.y = 18 + (y / window.innerHeight - 0.5) * 10;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const onPointer = (e: PointerEvent) => move(e.clientX, e.clientY);
  const onTouch = (e: TouchEvent) => e.touches[0] && move(e.touches[0].clientX, e.touches[0].clientY);
  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('touchmove', onTouch, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('pointermove', onPointer);
    document.removeEventListener('touchmove', onTouch);
  };
}
