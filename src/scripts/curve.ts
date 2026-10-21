// The experimental page's grid: one 8 × 3 wall of tiles on the inside of a light grey dome.
// The camera stays put. Drag anywhere (mouse or touch) to slide the wall across the dome, only
// within what's on screen: it stops when its edge reaches the edge of the view (a wall wider than
// the screen can be moved until each of its edges comes into view). While it moves, a wave runs
// across its tiles in the drag direction, stronger the faster it goes. A click or tap on a tile
// (without dragging) calls onPick with its project. Reduced motion: no wave and no momentum.

import * as THREE from 'three';

export type CurveProject = { images: string[] };

const DOME = 40;          // dome radius (world units)
const R = 14;             // the wall sits on a sphere of this radius, inside the dome
const CAMERA_BACK = 17;   // the camera sits this far behind the centre, so the wall is a gentle concave curve
const FOV = 42;
const COLS = 8;
const ROWS = 3;
const W = 2.1;            // tile size
const H = 2.6;
const GAP = 0.22;
const deg = Math.PI / 180;
const REST_PITCH = 7 * deg;  // where the wall and the camera start
const MAX_WAVE = 2.6;
// How close the wall can come to the edges of the screen (px); the top leaves room for the nav
const MARGIN = { side: 24, top: 96, bottom: 24 };

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// #E7E7E8, a little darker below the horizon and lighter up top, with faint meridians and parallels
const domeFragment = /* glsl */ `
  varying vec3 vDir;
  float line(float v, float n, float w) {
    float f = abs(fract(v * n) - 0.5);
    return smoothstep(w, 0.0, 0.5 - f);
  }
  void main() {
    vec3 base = vec3(0.906, 0.906, 0.910);
    float lat = asin(clamp(vDir.y, -1.0, 1.0));
    float lon = atan(vDir.x, -vDir.z);
    float shade = 1.0 - 0.10 * smoothstep(0.1, -0.6, vDir.y) + 0.035 * smoothstep(0.3, 1.0, vDir.y);
    float grid = max(line(lon / 6.2832, 24.0, 0.012), line(lat / 3.1416, 12.0, 0.012));
    float horizon = smoothstep(0.006, 0.0, abs(vDir.y)) * 0.6;
    gl_FragColor = vec4(base * shade - vec3(0.085) * grid - vec3(0.05) * horizon, 1.0);
    #include <colorspace_fragment>
  }
`;
const tileVertex = /* glsl */ `
  uniform float uAmp;
  uniform float uTime;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 vp = viewMatrix * wp;
    // a wave travelling across the wall in the drag direction (in screen terms)
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

export function startCurve(host: HTMLElement, projects: CurveProject[], onPick: (project: number) => void): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xe7e7e8);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, host.clientWidth / host.clientHeight, 0.1, 200);

  const domeGeometry = new THREE.SphereGeometry(DOME, 96, 64);
  const domeMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: domeVertex, fragmentShader: domeFragment });
  scene.add(new THREE.Mesh(domeGeometry, domeMaterial));

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

  // Where the wall is on the dome and where it's heading; the camera always looks at the start position
  const wall = { yaw: 0, pitch: REST_PITCH };
  const goal = { yaw: 0, pitch: REST_PITCH };
  const vel = { x: 0, y: 0 }; // px per frame, for momentum
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
    dirOf(0, REST_PITCH, v);
    camera.position.copy(v).multiplyScalar(-CAMERA_BACK);
    camera.lookAt(v.multiplyScalar(R));
    camera.updateMatrixWorld();
  };
  placeCamera();

  // ---------- Keeping the wall on screen ----------
  // The wall's outline on screen (px) if it were at (yaw, pitch), from its four outer corners
  const probe = new THREE.Object3D();
  const corner = new THREE.Vector3();
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
          corner.set(x, yy, 0);
          probe.localToWorld(corner).project(camera);
          const px = ((corner.x + 1) / 2) * host.clientWidth;
          const py = ((1 - corner.y) / 2) * host.clientHeight;
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
  const allowedX = (o: ReturnType<typeof outline>) =>
    fitsX ? o.left >= MARGIN.side && o.right <= host.clientWidth - MARGIN.side : o.left <= MARGIN.side && o.right >= host.clientWidth - MARGIN.side;
  const allowedY = (o: ReturnType<typeof outline>) =>
    fitsY ? o.top >= MARGIN.top && o.bottom <= host.clientHeight - MARGIN.bottom : o.top <= MARGIN.top && o.bottom >= host.clientHeight - MARGIN.bottom;
  const allowed = (y: number, p: number) => {
    const o = outline(y, p);
    return allowedX(o) && allowedY(o);
  };
  // How far the wall can go each way, worked out once (and again on resize). Moving up or down
  // also changes how wide the curved wall looks, so the sideways limit is the tightest one over
  // the whole vertical range, and the box is shrunk until all four of its corners are allowed.
  const box = { yawMin: 0, yawMax: 0, pitchMin: REST_PITCH, pitchMax: REST_PITCH };
  const measure = () => {
    const o = outline(0, REST_PITCH);
    fitsX = o.right - o.left <= host.clientWidth - 2 * MARGIN.side;
    fitsY = o.bottom - o.top <= host.clientHeight - MARGIN.top - MARGIN.bottom;
    limited = allowedX(o) && allowedY(o);
    if (!limited) return; // a window too small for the wall to sit inside at all: no limits
    const far = (ok: (a: number) => boolean) => {
      let lo = 0, hi = 1.2; // radians
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (ok(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const up = far((a) => allowed(0, REST_PITCH + a));
    const down = far((a) => allowed(0, REST_PITCH - a));
    const side = far((a) => allowed(a, REST_PITCH)); // the most it could go sideways
    // At the very top or bottom of its range the wall has no room to move sideways, so give up a
    // little of the vertical range: the most of it that still leaves 80% of the sideways range
    for (let scale = 1; scale >= 0.3; scale -= 0.05) {
      box.pitchMax = REST_PITCH + up * scale;
      box.pitchMin = REST_PITCH - down * scale;
      const pitches = [box.pitchMin, REST_PITCH, box.pitchMax];
      box.yawMax = Math.min(...pitches.map((p) => far((a) => allowed(a, p))));
      box.yawMin = -Math.min(...pitches.map((p) => far((a) => allowed(-a, p))));
      if (Math.min(box.yawMax, -box.yawMin) >= side * 0.8) break;
    }
    for (let i = 0; i < 40; i++) {
      const corners = [[box.yawMin, box.pitchMin], [box.yawMin, box.pitchMax], [box.yawMax, box.pitchMin], [box.yawMax, box.pitchMax]];
      if (corners.every(([y, p]) => allowed(y, p))) break;
      box.yawMin *= 0.97;
      box.yawMax *= 0.97;
      box.pitchMin = REST_PITCH + (box.pitchMin - REST_PITCH) * 0.97;
      box.pitchMax = REST_PITCH + (box.pitchMax - REST_PITCH) * 0.97;
    }
  };
  measure();
  // Keep a position inside the box; says which way it was stopped
  const constrain = (yaw: number, pitch: number) => {
    if (!limited) return { yaw, pitch, stoppedX: false, stoppedY: false };
    const y = Math.max(box.yawMin, Math.min(box.yawMax, yaw));
    const p = Math.max(box.pitchMin, Math.min(box.pitchMax, pitch));
    return { yaw: y, pitch: p, stoppedX: y !== yaw, stoppedY: p !== pitch };
  };

  // Radians per pixel: a drag across the screen moves the wall about a screen's width
  const perPixel = () => (2 * (R + CAMERA_BACK) * Math.tan((FOV / 2) * deg) * camera.aspect) / R / host.clientWidth;

  // ---------- Dragging and picking ----------
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
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
    const next = constrain(goal.yaw + dx * k, goal.pitch - dy * k);
    goal.yaw = next.yaw;
    goal.pitch = next.pitch;
    vel.x = (dx / dt) * 16;
    vel.y = (dy / dt) * 16;
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    if (reduce || performance.now() - last.t > 80) vel.x = vel.y = 0; // a held-still release doesn't fling
    if (moved < 6) {
      const tile = tileAt(e.clientX, e.clientY);
      if (tile) onPick((tile.userData as { project: number }).project);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const onResize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    measure();
    // back on screen if the resize pushed it off
    const back = constrain(goal.yaw, goal.pitch);
    goal.yaw = back.yaw;
    goal.pitch = back.pitch;
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
      const next = constrain(goal.yaw + vel.x * k, goal.pitch - vel.y * k);
      goal.yaw = next.yaw;
      goal.pitch = next.pitch;
      if (next.stoppedX) vel.x = 0; // stop at the edge
      if (next.stoppedY) vel.y = 0;
      vel.x *= 0.94;
      vel.y *= 0.94;
      if (Math.abs(vel.x) + Math.abs(vel.y) < 0.05) vel.x = vel.y = 0;
    }
    // the wall eases toward where it's dragged
    const before = { yaw: wall.yaw, pitch: wall.pitch };
    wall.yaw += (goal.yaw - wall.yaw) * (reduce ? 1 : 0.16);
    wall.pitch += (goal.pitch - wall.pitch) * (reduce ? 1 : 0.16);
    placeWall();

    // the wave follows how fast the wall is actually moving
    const dYaw = wall.yaw - before.yaw;
    const dPitch = wall.pitch - before.pitch;
    const speed = Math.hypot(dYaw, dPitch) / perPixel(); // px this frame
    amp += ((reduce ? 0 : Math.min(MAX_WAVE, speed * 0.16)) - amp) * 0.08;
    if (speed > 0.2) wave.uDir.value.set(dYaw, dPitch).normalize();
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
    domeGeometry.dispose();
    domeMaterial.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
