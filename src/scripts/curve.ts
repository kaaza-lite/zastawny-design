// The experimental page's grid: one 8 × 3 wall of tiles, gently curved (it sits on the inside
// of a sphere, seen from behind the centre), on a solid grey background.
//
// Mouse: the wall follows the pointer, within what's on screen (pointer left = wall left);
// the scroll wheel zooms in and out. The pointer is a VR-style laser: a hand holding a controller
// in the bottom right (src/scripts/vrhand.ts) aims at the pointer, and a beam runs from the
// controller to a dot, which gets a ring over a tile. Touch: drag to move the wall, with momentum.
// While the wall moves, a wave runs across its tiles in the direction it's going, stronger the
// faster it goes. A click or tap on a tile calls onPick with its project.
// The wall never leaves the view: each edge stops at the screen edge (below the page title at
// the top). Zoomed in so far that it's bigger than the view, it moves until each edge comes in.
// Reduced motion: no wave and no momentum.

import * as THREE from 'three';
import { loadVrHand, type VrHand } from './vrhand';

export type CurveProject = { images: string[] };

const R = 14;             // the wall sits on a sphere of this radius
const FOV = 42;
const COLS = 8;
const ROWS = 3;
const W = 2.1;            // tile size
const H = 2.6;
const GAP = 0.22;
const deg = Math.PI / 180;
const VIEW_PITCH = 7 * deg; // the camera looks at this height on the sphere
const ZOOM = { start: 17, min: 6, max: 26 }; // camera distance behind the centre (smaller = closer)
const MAX_WAVE = 2.6;
const MARGIN = { side: 24, top: 96, bottom: 24 }; // px; the top is raised to clear the page title
const BEAM = { color: '95, 227, 255', dot: '#ff5c8a' };
const HAND = { at: new THREE.Vector2(0.62, -0.92), depth: 7, scale: 0.8, reach: 30 }; // screen spot (-1..1), distance, size, aim distance

const tileVertex = /* glsl */ `
  uniform float uAmp;
  uniform float uTime;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 vp = viewMatrix * wp;
    // a wave travelling across the wall in the direction it moves (in screen terms)
    float w = sin(dot(vp.xy, uDir) * 0.55 - uTime * 3.0) * 0.6 + sin(vp.x * 0.9 + vp.y * 0.7 - uTime * 2.2) * 0.4;
    vec3 n = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    wp.xyz += n * w * uAmp;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const tileFragment = /* glsl */ `
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

const dirOf = (yaw: number, pitch: number, out = new THREE.Vector3()) =>
  out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

type Options = { topInset?: () => number }; // px from the top the wall must stay below

export function startCurve(host: HTMLElement, projects: CurveProject[], onPick: (project: number) => void, options: Options = {}): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mouse = window.matchMedia('(hover: hover) and (pointer: fine)');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0); // see-through: the page's grey, its shades and the background datamosh show behind
  renderer.autoClear = false; // the hand is drawn over the wall in a second pass
  host.appendChild(renderer.domElement);

  // The laser pointer is drawn on a 2D canvas on top (it ends exactly at the pointer)
  const beam = document.createElement('canvas');
  Object.assign(beam.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  host.appendChild(beam);
  const pen = beam.getContext('2d')!;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, host.clientWidth / host.clientHeight, 0.1, 200);

  // The hand with the controller: its own little scene and camera, drawn on top of the wall
  const handScene = new THREE.Scene();
  handScene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9e, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(-2, 3, 4);
  handScene.add(keyLight);
  const handCam = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.05, 100);
  let hand: VrHand | null = null;
  let stopped = false;
  const handHome = new THREE.Vector3();
  const restAim = new THREE.Quaternion(); // the hand's turn when aiming at the middle of the screen
  const placeHand = () => {
    if (!hand) return;
    handHome.set(HAND.at.x, HAND.at.y, 0.5).unproject(handCam).normalize().multiplyScalar(HAND.depth);
    hand.rig.position.copy(handHome);
    const middle = new THREE.Vector3(0, 0, -HAND.reach).sub(handHome).normalize();
    restAim.setFromUnitVectors(hand.forward, middle);
  };

  // ---------- The wall ----------
  const wave = { uAmp: { value: 0 }, uTime: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) } };
  const geometry = new THREE.PlaneGeometry(W, H, 12, 14);
  const loader = new THREE.TextureLoader();
  const materials: THREE.ShaderMaterial[] = [];
  const textures: THREE.Texture[] = [];
  const tiles: THREE.Mesh[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const n = r * COLS + c;
      const project = n % projects.length;
      const images = projects[project].images;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...wave,
          map: { value: null },
          rep: { value: new THREE.Vector2(1, 1) },
          off: { value: new THREE.Vector2(0, 0) },
          corner: { value: new THREE.Vector2(0.04, 0.04 * (W / H)) },
        },
        vertexShader: tileVertex,
        fragmentShader: tileFragment,
        transparent: true,
        visible: false, // until its image is in
      });
      loader.load(images[Math.floor(n / projects.length) % images.length], (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // cover-crop the image into the tile
        const ia = t.image.width / t.image.height;
        const ta = W / H;
        if (ia > ta) {
          material.uniforms.rep.value.set(ta / ia, 1);
          material.uniforms.off.value.set((1 - ta / ia) / 2, 0);
        } else {
          material.uniforms.rep.value.set(1, ia / ta);
          material.uniforms.off.value.set(0, (1 - ia / ta) / 2);
        }
        material.uniforms.map.value = t;
        material.visible = true;
        textures.push(t);
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { r, c, project };
      scene.add(mesh);
      tiles.push(mesh);
      materials.push(material);
    }
  }

  // Where the wall is on the sphere and where it's heading; how far back the camera is
  const wall = { yaw: 0, pitch: VIEW_PITCH };
  const goal = { yaw: 0, pitch: VIEW_PITCH };
  const zoom = { now: ZOOM.start, goal: ZOOM.start };
  const vel = { x: 0, y: 0 }; // touch momentum, px per frame
  let amp = 0;

  const v = new THREE.Vector3();
  const placeWall = () => {
    for (const mesh of tiles) {
      const { r, c } = mesh.userData as { r: number; c: number };
      const pitch = wall.pitch + (((ROWS - 1) / 2 - r) * (H + GAP)) / R;
      const yaw = wall.yaw + ((c - (COLS - 1) / 2) * (W + GAP)) / (R * Math.cos(pitch));
      mesh.position.copy(dirOf(yaw, pitch, v).multiplyScalar(R));
      mesh.lookAt(0, 0, 0);
    }
  };
  const placeCamera = () => {
    dirOf(0, VIEW_PITCH, v);
    camera.position.copy(v).multiplyScalar(-zoom.now);
    camera.lookAt(v.multiplyScalar(R));
    camera.updateMatrixWorld();
  };
  placeCamera();

  // ---------- Keeping the wall on screen ----------
  // The wall's outline on screen (px) if it were at (yaw, pitch), from its four outer corners
  const probe = new THREE.Object3D();
  const point = new THREE.Vector3();
  const outline = (yaw: number, pitch0: number) => {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const r of [0, ROWS - 1]) {
      for (const c of [0, COLS - 1]) {
        const pitch = pitch0 + (((ROWS - 1) / 2 - r) * (H + GAP)) / R;
        const y = yaw + ((c - (COLS - 1) / 2) * (W + GAP)) / (R * Math.cos(pitch));
        probe.position.copy(dirOf(y, pitch, v).multiplyScalar(R));
        probe.lookAt(0, 0, 0);
        probe.updateMatrixWorld();
        for (const [x, yy] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) {
          point.set(x, yy, 0);
          probe.localToWorld(point).project(camera);
          const px = ((point.x + 1) / 2) * host.clientWidth;
          const py = ((1 - point.y) / 2) * host.clientHeight;
          left = Math.min(left, px); right = Math.max(right, px);
          top = Math.min(top, py); bottom = Math.max(bottom, py);
        }
      }
    }
    return { left, right, top, bottom };
  };
  // Is the wall allowed at (yaw, pitch)? Each edge must stay inside the view (with the margins).
  // A wall wider or taller than the view may instead move until its far edge comes in.
  let fitsX = true;
  let fitsY = true;
  let limited = true;
  let topMargin = MARGIN.top;
  const allowedX = (o: ReturnType<typeof outline>) =>
    fitsX ? o.left >= MARGIN.side && o.right <= host.clientWidth - MARGIN.side : o.left <= MARGIN.side && o.right >= host.clientWidth - MARGIN.side;
  const allowedY = (o: ReturnType<typeof outline>) =>
    fitsY ? o.top >= topMargin && o.bottom <= host.clientHeight - MARGIN.bottom : o.top <= topMargin && o.bottom >= host.clientHeight - MARGIN.bottom;
  const allowed = (y: number, p: number) => {
    const o = outline(y, p);
    return allowedX(o) && allowedY(o);
  };
  // How far the wall can go each way, worked out again whenever the zoom or the window changes.
  // Moving up or down also changes how wide the curved wall looks, so the sideways limit is the
  // tightest one over the vertical range, and the box is shrunk until all its corners are allowed.
  const box = { yawMin: 0, yawMax: 0, pitchMin: VIEW_PITCH, pitchMax: VIEW_PITCH };
  const measure = () => {
    topMargin = Math.max(MARGIN.top, (options.topInset?.() ?? 0) + 24);
    const o = outline(0, VIEW_PITCH);
    fitsX = o.right - o.left <= host.clientWidth - 2 * MARGIN.side;
    fitsY = o.bottom - o.top <= host.clientHeight - topMargin - MARGIN.bottom;
    // a starting height that's allowed: straight ahead, or a little lower if the title is in the way
    let base = VIEW_PITCH;
    while (!allowed(0, base) && base > VIEW_PITCH - 40 * deg) base -= 0.5 * deg;
    limited = allowed(0, base);
    if (!limited) return; // a window too small for the wall to sit inside at all: no limits
    const far = (ok: (a: number) => boolean) => {
      let lo = 0, hi = 1.2; // radians
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (ok(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const up = far((a) => allowed(0, base + a));
    const below = far((a) => allowed(0, base - a));
    const side = far((a) => allowed(a, base)); // the most it could go sideways
    // At the very top or bottom of its range the wall has no room to move sideways, so give up a
    // little of the vertical range: the most of it that still leaves 80% of the sideways range
    for (let scale = 1; scale >= 0.3; scale -= 0.05) {
      box.pitchMax = base + up * scale;
      box.pitchMin = base - below * scale;
      const pitches = [box.pitchMin, base, box.pitchMax];
      box.yawMax = Math.min(...pitches.map((p) => far((a) => allowed(a, p))));
      box.yawMin = -Math.min(...pitches.map((p) => far((a) => allowed(-a, p))));
      if (Math.min(box.yawMax, -box.yawMin) >= side * 0.8) break;
    }
    for (let i = 0; i < 40; i++) {
      const corners = [[box.yawMin, box.pitchMin], [box.yawMin, box.pitchMax], [box.yawMax, box.pitchMin], [box.yawMax, box.pitchMax]];
      if (corners.every(([y, p]) => allowed(y, p))) break;
      box.yawMin *= 0.97;
      box.yawMax *= 0.97;
      box.pitchMin = base + (box.pitchMin - base) * 0.97;
      box.pitchMax = base + (box.pitchMax - base) * 0.97;
    }
  };
  const constrain = (yaw: number, pitch: number) => {
    if (!limited) return { yaw, pitch, stoppedX: false, stoppedY: false };
    const y = Math.max(box.yawMin, Math.min(box.yawMax, yaw));
    const p = Math.max(box.pitchMin, Math.min(box.pitchMax, pitch));
    return { yaw: y, pitch: p, stoppedX: y !== yaw, stoppedY: p !== pitch };
  };
  measure();
  if (mouse.matches) {
    loadVrHand()
      .then((h) => {
        if (stopped) return h.dispose();
        hand = h;
        hand.rig.scale.setScalar(HAND.scale);
        handScene.add(hand.rig);
        placeHand();
      })
      .catch(() => {}); // no hand: the beam starts from the corner instead
  }

  // start in the middle of where it can go
  goal.yaw = wall.yaw = (box.yawMin + box.yawMax) / 2;
  goal.pitch = wall.pitch = (box.pitchMin + box.pitchMax) / 2;

  // ---------- Pointer ----------
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tileAt = (x: number, y: number) => {
    const b = canvas.getBoundingClientRect();
    ndc.set(((x - b.left) / b.width) * 2 - 1, -((y - b.top) / b.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(tiles, false)[0]?.object as THREE.Mesh | undefined;
  };
  // Where the mouse is (share of the window), whether it's over the scene, and over a tile
  const pointer = { x: 0.5, y: 0.5, over: false, onTile: false };
  // Mouse position → wall position: the pointer's place across the window picks the wall's place within its range
  const follow = () => {
    goal.yaw = box.yawMin + (box.yawMax - box.yawMin) * pointer.x;
    goal.pitch = box.pitchMax - (box.pitchMax - box.pitchMin) * pointer.y;
  };

  let down: { moved: number } | null = null;
  let last = { x: 0, y: 0, t: 0 };
  const perPixel = () => (2 * (R + zoom.now) * Math.tan((FOV / 2) * deg) * camera.aspect) / R / host.clientWidth;

  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    down = { moved: 0 };
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    vel.x = vel.y = 0;
    if (e.pointerType !== 'mouse') canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      pointer.x = e.clientX / host.clientWidth;
      pointer.y = e.clientY / host.clientHeight;
      pointer.over = e.target === canvas;
      pointer.onTile = pointer.over && !!tileAt(e.clientX, e.clientY);
      follow();
      if (down) down.moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    // touch and pen: drag the wall
    if (!down) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dt = Math.max(1, performance.now() - last.t);
    down.moved += Math.abs(dx) + Math.abs(dy);
    const k = perPixel();
    const next = constrain(goal.yaw + dx * k, goal.pitch - dy * k);
    goal.yaw = next.yaw;
    goal.pitch = next.pitch;
    vel.x = (dx / dt) * 16;
    vel.y = (dy / dt) * 16;
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    if (reduce || e.pointerType === 'mouse' || performance.now() - last.t > 80) vel.x = vel.y = 0;
    if (e.pointerType === 'mouse' && !reduce) recoil = 1;
    if (down.moved < 6) {
      const tile = tileAt(e.clientX, e.clientY);
      if (tile) onPick((tile.userData as { project: number }).project);
    }
    down = null;
  };
  const onLeave = () => (pointer.over = false);
  // Scroll wheel: zoom in and out
  const onWheel = (e: WheelEvent) => {
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    zoom.goal = Math.max(ZOOM.min, Math.min(ZOOM.max, zoom.goal * Math.exp(e.deltaY * 0.0012)));
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('wheel', onWheel, { passive: false });
  if (mouse.matches) canvas.style.cursor = 'none';

  const sizeBeam = () => {
    const dpr = Math.min(window.devicePixelRatio, 2);
    beam.width = host.clientWidth * dpr;
    beam.height = host.clientHeight * dpr;
    pen.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  sizeBeam();
  const onResize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    handCam.aspect = host.clientWidth / host.clientHeight;
    handCam.updateProjectionMatrix();
    placeHand();
    sizeBeam();
    measure();
    if (mouse.matches) follow();
    const back = constrain(goal.yaw, goal.pitch);
    goal.yaw = back.yaw;
    goal.pitch = back.pitch;
  };
  window.addEventListener('resize', onResize);

  // The laser: from just off the bottom right corner to the pointer, thinning and fading as it goes
  let ring = 0;
  const drawBeam = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    pen.clearRect(0, 0, w, h);
    if (!mouse.matches || !pointer.over) return;
    const end = { x: pointer.x * w, y: pointer.y * h };
    const start = { x: w * 0.86, y: h + 30 };
    if (hand && hand.rig.visible) {
      const tip = hand.rig.localToWorld(hand.tip.clone()).project(handCam);
      start.x = ((tip.x + 1) / 2) * w;
      start.y = ((1 - tip.y) / 2) * h;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const grad = pen.createLinearGradient(start.x, start.y, end.x, end.y);
    grad.addColorStop(0, `rgba(${BEAM.color}, 0.95)`);
    grad.addColorStop(1, `rgba(${BEAM.color}, 0.35)`);
    pen.fillStyle = grad;
    pen.beginPath(); // a long, thin wedge: 3px wide at the hand, 1px at the dot
    pen.moveTo(start.x + nx * 1.5, start.y + ny * 1.5);
    pen.lineTo(end.x + nx * 0.5, end.y + ny * 0.5);
    pen.lineTo(end.x - nx * 0.5, end.y - ny * 0.5);
    pen.lineTo(start.x - nx * 1.5, start.y - ny * 1.5);
    pen.closePath();
    pen.fill();
    // the dot, and a ring around it over a tile
    ring += ((pointer.onTile ? 1 : 0) - ring) * 0.25;
    if (ring > 0.02) {
      pen.strokeStyle = `rgba(255, 255, 255, ${0.9 * ring})`;
      pen.lineWidth = 1.5;
      pen.beginPath();
      pen.arc(end.x, end.y, 6 + 6 * ring, 0, Math.PI * 2);
      pen.stroke();
    }
    pen.fillStyle = BEAM.dot;
    pen.beginPath();
    pen.arc(end.x, end.y, 3.5, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = '#ffffff';
    pen.beginPath();
    pen.arc(end.x, end.y, 1.3, 0, Math.PI * 2);
    pen.fill();
  };

  // The hand turns toward the pointer (smoothly), kicks up a little on a click, then draws over the wall
  const aimQ = new THREE.Quaternion();
  const aimTo = new THREE.Vector3();
  const middle = new THREE.Vector3();
  let recoil = 0;
  const aimHand = () => {
    if (!hand) return;
    hand.rig.visible = mouse.matches;
    if (!hand.rig.visible) return;
    aimTo.set(pointer.x * 2 - 1, 1 - pointer.y * 2, 0.5).unproject(handCam).normalize().multiplyScalar(HAND.reach).sub(handHome).normalize();
    middle.set(0, 0, -HAND.reach).sub(handHome).normalize();
    aimQ.setFromUnitVectors(middle, aimTo).multiply(restAim);
    hand.rig.quaternion.slerp(aimQ, reduce ? 1 : 0.18);
    recoil *= 0.82;
    if (recoil > 0.01) hand.rig.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.12 * recoil);
    renderer.clearDepth();
    renderer.render(handScene, handCam);
  };

  // ---------- Every frame ----------
  let raf = 0;
  let prev = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    // zoom eases in; the limits follow the new size
    if (Math.abs(zoom.goal - zoom.now) > 0.01) {
      zoom.now += (zoom.goal - zoom.now) * (reduce ? 1 : 0.15);
      placeCamera();
      measure();
      if (mouse.matches) follow();
      const back = constrain(goal.yaw, goal.pitch);
      goal.yaw = back.yaw;
      goal.pitch = back.pitch;
    }
    // touch momentum
    if (!down && (vel.x || vel.y)) {
      const k = perPixel();
      const next = constrain(goal.yaw + vel.x * k, goal.pitch - vel.y * k);
      goal.yaw = next.yaw;
      goal.pitch = next.pitch;
      if (next.stoppedX) vel.x = 0;
      if (next.stoppedY) vel.y = 0;
      vel.x *= 0.94;
      vel.y *= 0.94;
      if (Math.abs(vel.x) + Math.abs(vel.y) < 0.05) vel.x = vel.y = 0;
    }
    // the wall eases toward where it's heading
    const before = { yaw: wall.yaw, pitch: wall.pitch };
    wall.yaw += (goal.yaw - wall.yaw) * (reduce ? 1 : 0.12);
    wall.pitch += (goal.pitch - wall.pitch) * (reduce ? 1 : 0.12);
    placeWall();

    // the wave follows how fast the wall is actually moving
    const dYaw = wall.yaw - before.yaw;
    const dPitch = wall.pitch - before.pitch;
    const speed = Math.hypot(dYaw, dPitch) / perPixel(); // px this frame
    amp += ((reduce ? 0 : Math.min(MAX_WAVE, speed * 0.16)) - amp) * 0.08;
    if (speed > 0.2) wave.uDir.value.set(dYaw, dPitch).normalize();
    wave.uAmp.value = amp;
    wave.uTime.value += dt;
    // the background datamosh pauses while the pointer is over the wall
    if (mouse.matches) {
      const o = outline(wall.yaw, wall.pitch);
      const x = pointer.x * host.clientWidth;
      const y = pointer.y * host.clientHeight;
      host.toggleAttribute('data-over-grid', pointer.over && x >= o.left && x <= o.right && y >= o.top && y <= o.bottom);
    }
    renderer.clear();
    renderer.render(scene, camera);
    if (hand) aimHand();
    drawBeam();
  };
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    hand?.dispose();
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('wheel', onWheel);
    geometry.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    renderer.dispose();
    canvas.remove();
    beam.remove();
  };
}
