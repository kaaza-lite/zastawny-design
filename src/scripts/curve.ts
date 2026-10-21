// The experimental page's grid: blocks of 8 × 3 tiles on the inside of a big sphere, all the
// way round. You look at the far side from behind the centre, so a block reads as a gently
// curved wall whose edges come towards you. Drag anywhere (mouse or touch) to turn the sphere,
// with momentum; while it moves a wave runs across the tiles in the drag direction, stronger
// the faster it goes. A click or tap on a tile (without dragging) calls onPick with its project.
// Reduced motion: no wave and no momentum.

import * as THREE from 'three';

export type CurveProject = { images: string[] };

const R = 14;            // sphere radius (world units)
const CAMERA_Z = 17;     // behind the centre, so the wall's edges come closer
const FOV = 42;
const COLS = 8;
const ROWS = 3;
const W = 2.1;           // tile size
const H = 2.6;
const GAP = 0.22;
const RINGS = [          // rows of blocks: pitch (deg) and blocks around
  { pitch: 0, count: 4 },
  { pitch: 48, count: 3 },
  { pitch: -48, count: 3 },
];
const MAX_PITCH = (48 * Math.PI) / 180; // never far enough up or down to see the poles
const MAX_WAVE = 1.6;

const vertexShader = /* glsl */ `
  uniform float uAmp;
  uniform float uTime;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // a wave travelling across the wall in the drag direction
    float w = sin(dot(wp.xy, uDir) * 0.55 - uTime * 3.0) * 0.6 + sin(wp.x * 0.9 + wp.y * 0.7 - uTime * 2.2) * 0.4;
    vec3 n = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    wp.xyz += n * w * uAmp;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 rep;
  uniform vec2 off;
  uniform vec2 corner;
  varying vec2 vUv;
  void main() {
    vec2 q = abs(vUv - 0.5) - (0.5 - corner);
    if (length(max(q / corner, 0.0)) > 1.0) discard; // rounded corners
    gl_FragColor = texture2D(map, vUv * rep + off);
    #include <colorspace_fragment>
  }
`;

export function startCurve(host: HTMLElement, projects: CurveProject[], onPick: (project: number) => void): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, host.clientWidth / host.clientHeight, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  const world = new THREE.Group();
  scene.add(world);

  // Shared by every tile: the wave
  const wave = { uAmp: { value: 0 }, uTime: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) } };
  const geometry = new THREE.PlaneGeometry(W, H, 12, 14);
  const loader = new THREE.TextureLoader();

  // One material per image, cropped to cover the tile once it has loaded
  const materials = new Map<string, THREE.ShaderMaterial>();
  const textures: THREE.Texture[] = [];
  const material = (url: string) => {
    let m = materials.get(url);
    if (m) return m;
    m = new THREE.ShaderMaterial({
      uniforms: {
        ...wave,
        map: { value: null },
        rep: { value: new THREE.Vector2(1, 1) },
        off: { value: new THREE.Vector2(0, 0) },
        corner: { value: new THREE.Vector2(0.04, 0.04 * (W / H)) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      visible: false, // until its image is in
    });
    const mat = m;
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const ia = t.image.width / t.image.height;
      const ta = W / H;
      if (ia > ta) {
        mat.uniforms.rep.value.set(ta / ia, 1);
        mat.uniforms.off.value.set((1 - ta / ia) / 2, 0);
      } else {
        mat.uniforms.rep.value.set(1, ia / ta);
        mat.uniforms.off.value.set(0, (1 - ia / ta) / 2);
      }
      mat.uniforms.map.value = t;
      mat.visible = true;
      textures.push(t);
    });
    materials.set(url, m);
    return m;
  };

  // Lay the blocks out round the sphere; every tile keeps its size, wherever it sits
  const tiles: THREE.Mesh[] = [];
  let block = 0;
  for (const ring of RINGS) {
    for (let b = 0; b < ring.count; b++, block++) {
      const yaw0 = (b / ring.count) * Math.PI * 2;
      const pitch0 = (ring.pitch * Math.PI) / 180;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const n = r * COLS + c + block * 5; // shift each block, so neighbours differ
          const project = n % projects.length;
          const images = projects[project].images;
          const url = images[Math.floor(n / projects.length) % images.length];
          const pitch = pitch0 + (((ROWS - 1) / 2 - r) * (H + GAP)) / R;
          const yaw = yaw0 + ((c - (COLS - 1) / 2) * (W + GAP)) / (R * Math.cos(pitch));
          const mesh = new THREE.Mesh(geometry, material(url));
          mesh.position.set(R * Math.sin(yaw) * Math.cos(pitch), R * Math.sin(pitch), -R * Math.cos(yaw) * Math.cos(pitch));
          mesh.lookAt(0, 0, 0);
          mesh.userData.project = project;
          world.add(mesh);
          tiles.push(mesh);
        }
      }
    }
  }

  // ---------- Turning ----------
  const turn = { yaw: 0, pitch: 0 };   // where it is
  const goal = { yaw: 0, pitch: 0 };   // where it's heading
  const vel = { x: 0, y: 0 };          // px per frame, for momentum and the wave
  let amp = 0;
  // Radians per pixel: a drag across the screen moves the wall about a screen's width
  const perPixel = () => (2 * (R + CAMERA_Z) * Math.tan(((FOV / 2) * Math.PI) / 180) * camera.aspect) / R / host.clientWidth;

  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  let dragging = false;
  let moved = 0;
  let last = { x: 0, y: 0, t: 0 };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tileAt = (x: number, y: number) => {
    const box = canvas.getBoundingClientRect();
    ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(tiles, false)[0]?.object as THREE.Mesh | undefined;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    dragging = true;
    moved = 0;
    vel.x = vel.y = 0;
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) {
      canvas.style.cursor = tileAt(e.clientX, e.clientY) ? 'pointer' : 'grab';
      return;
    }
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dt = Math.max(1, performance.now() - last.t);
    moved += Math.abs(dx) + Math.abs(dy);
    const k = perPixel();
    goal.yaw -= dx * k;
    goal.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, goal.pitch + dy * k));
    vel.x = (dx / dt) * 16;
    vel.y = (dy / dt) * 16;
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    if (reduce || performance.now() - last.t > 80) vel.x = vel.y = 0; // a held still release doesn't fling
    if (moved < 6) {
      const tile = tileAt(e.clientX, e.clientY);
      if (tile) onPick(tile.userData.project as number);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.cursor = 'grab';

  const onResize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  // ---------- Every frame ----------
  let raf = 0;
  let prev = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!dragging && (vel.x || vel.y)) {
      const k = perPixel();
      goal.yaw -= vel.x * k;
      goal.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, goal.pitch + vel.y * k));
      vel.x *= 0.94;
      vel.y *= 0.94;
      if (Math.abs(vel.x) + Math.abs(vel.y) < 0.05) vel.x = vel.y = 0;
    }
    const ease = reduce ? 1 : 0.14;
    const before = { yaw: turn.yaw, pitch: turn.pitch };
    turn.yaw += (goal.yaw - turn.yaw) * ease;
    turn.pitch += (goal.pitch - turn.pitch) * ease;
    world.rotation.set(turn.pitch, turn.yaw, 0, 'YXZ');

    // The wave follows how fast the wall is actually moving
    const speed = Math.hypot(turn.yaw - before.yaw, turn.pitch - before.pitch) / perPixel(); // px this frame
    const target = reduce ? 0 : Math.min(MAX_WAVE, speed * 0.09);
    amp += (target - amp) * 0.08;
    if (speed > 0.2) wave.uDir.value.set(-(turn.yaw - before.yaw), turn.pitch - before.pitch).normalize();
    wave.uAmp.value = amp;
    wave.uTime.value += dt;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    geometry.dispose();
    for (const m of materials.values()) m.dispose();
    for (const t of textures) t.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
