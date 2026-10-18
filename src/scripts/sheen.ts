// Petrol sheen: the background of the experimental page.
// A thin film of oil on dark water: broad, slow bands of iridescent colour, mostly dark,
// tinted toward the colours of the page you came from. It flows slowly by itself, and
// around the pointer it brightens and swirls a little. Drawn with WebGL at half
// resolution (it's soft anyway). With reduced motion it's drawn once and stays still.

export type SheenColours = { bg: [number, number, number]; tint: [number, number, number] };

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Background and tint for each page the visitor can arrive from. */
export const sheenColours: Record<string, SheenColours> = {
  neutral: { bg: hex('#0f0f11'), tint: hex('#d8d8e0') },
  calastone: { bg: hex('#0c0d17'), tint: hex('#8ab0fe') },
  bamboo: { bg: hex('#0c120e'), tint: hex('#6bc891') },
  juicyway: { bg: hex('#120c11'), tint: hex('#e193cf') },
};

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

// Simplex noise (Ashima Arts, MIT), domain-warped, mapped to thin-film colours
const FRAGMENT = `
precision highp float;
uniform vec2 u_size;    // canvas size in CSS pixels
uniform float u_scale;  // canvas pixels per CSS pixel
uniform float u_time;
uniform vec2 u_mouse;   // CSS pixels, top-left origin
uniform float u_stir;   // 0..1, how much the pointer has been moving lately
uniform vec3 u_bg;
uniform vec3 u_tint;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p *= 2.0; a *= 0.5; }
  return s * 0.7;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_size.y * u_scale - gl_FragCoord.y) / u_scale; // CSS px, top-left origin
  vec2 toMouse = px - u_mouse;
  float d = length(toMouse);
  float glow = pow(max(0.0, 1.0 - d / 900.0), 2.0);

  // the film swirls a little around a moving pointer
  float swirl = u_stir * 0.9 * exp(-d * d / 60000.0);
  float c = cos(swirl), s = sin(swirl);
  vec2 q0 = u_mouse + mat2(c, -s, s, c) * toMouse;

  vec2 p = q0 / 1150.0 + vec2(u_time * 0.010, u_time * 0.005);
  float qx = fbm(p + vec2(0.0, u_time * 0.004));
  float qy = fbm(p + vec2(5.2, 1.3));
  float n = fbm(p + 2.2 * vec2(qx, qy));

  float t = n * 2.1 + qx * 0.9 + px.y / 2600.0;                  // film thickness: broad, slow bands
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67)));
  float sheen = pow(clamp((n + 0.3) * 1.2, 0.0, 1.0), 1.5);       // mostly dark, light on the ridges
  float k = (0.15 + 0.3 * glow + 0.1 * u_stir * glow) * sheen;
  vec3 col = u_bg + (film * 0.55 + u_tint * 0.45) * k;
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(col + grain * 0.012, 1.0);
}`;

/** Starts the sheen on a canvas. Returns a function that stops it. */
export function startSheen(canvas: HTMLCanvasElement, colours: SheenColours): () => void {
  const gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) return () => {};
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {};
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform3fv(u('u_bg'), colours.bg);
  gl.uniform3fv(u('u_tint'), colours.tint);

  const SCALE = 0.5; // half resolution
  const size = () => {
    canvas.width = Math.max(1, Math.round(window.innerWidth * SCALE));
    canvas.height = Math.max(1, Math.round(window.innerHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u('u_size'), window.innerWidth, window.innerHeight);
    gl.uniform1f(u('u_scale'), SCALE);
  };
  size();

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mouse = { x: window.innerWidth * 0.6, y: window.innerHeight * 0.4 };
  const target = { ...mouse };
  let stir = 0;
  let raf = 0;
  let last = 0;
  const start = performance.now();
  const draw = (now: number) => {
    raf = still ? 0 : requestAnimationFrame(draw);
    if (now - last < 1000 / 30) return; // 30fps is plenty for something this slow
    last = now;
    mouse.x += (target.x - mouse.x) * 0.08;
    mouse.y += (target.y - mouse.y) * 0.08;
    stir *= 0.96;
    gl.uniform1f(u('u_time'), (now - start) / 1000);
    gl.uniform2f(u('u_mouse'), mouse.x, mouse.y);
    gl.uniform1f(u('u_stir'), stir);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const move = (x: number, y: number) => {
    stir = Math.min(1, stir + Math.hypot(x - target.x, y - target.y) / 300);
    target.x = x;
    target.y = y;
  };
  const onPointer = (e: PointerEvent) => move(e.clientX, e.clientY);
  const onTouch = (e: TouchEvent) => e.touches[0] && move(e.touches[0].clientX, e.touches[0].clientY);
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    raf = !document.hidden && !still ? requestAnimationFrame(draw) : 0;
  };
  window.addEventListener('resize', size);
  if (!still) {
    document.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('touchmove', onTouch, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
  }
  draw(performance.now()); // first frame now; it keeps itself going unless motion is reduced

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    document.removeEventListener('pointermove', onPointer);
    document.removeEventListener('touchmove', onTouch);
    document.removeEventListener('visibilitychange', onVisibility);
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the GPU memory when leaving the page
  };
}
