import * as THREE from 'three';

type Pt = [number, number];

// Ascelstack mark, in the same 100x100 space as /mark.svg
const TOP: Pt[] = [[50, 6], [66, 38], [34, 38]];
const MID: Pt[] = [[32, 42], [68, 42], [70, 46], [80, 66], [60, 66], [50, 46], [40, 66], [20, 66], [30, 46]];
const BASE_L: Pt[] = [[18, 70], [38, 70], [26, 94], [6, 94]];
const BASE_R: Pt[] = [[82, 70], [62, 70], [74, 94], [94, 94]];

const SCALE = 0.065;

function toShape(pts: Pt[]) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    const X = (x - 50) * SCALE;
    const Y = (50 - y) * SCALE;
    if (i === 0) s.moveTo(X, Y);
    else s.lineTo(X, Y);
  });
  s.closePath();
  return s;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

/**
 * Mounts an animated, extruded 3D Ascelstack mark on a canvas.
 * Layers drop in, float, follow the pointer and "unstack" on hover.
 * Returns false when WebGL is unavailable so the caller can show a fallback.
 */
export function mountLogo3D(canvas: HTMLCanvasElement): boolean {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return false;
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.4, 13);

  scene.add(new THREE.HemisphereLight(0xe6eef7, 0x1d2d3d, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x94bce3, 2.4);
  rim.position.set(-6, -2, -5);
  scene.add(rim);
  const fill = new THREE.PointLight(0x5980a6, 18, 30);
  fill.position.set(-4, 3, 5);
  scene.add(fill);

  const extrude: THREE.ExtrudeGeometryOptions = {
    depth: 0.9,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 4,
    curveSegments: 1,
  };

  const makeLayer = (pts: Pt[][], color: number, roughness: number) => {
    const geo = new THREE.ExtrudeGeometry(pts.map(toShape), extrude);
    geo.translate(0, 0, -0.45);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 30),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
    );
    mesh.add(edges);
    return mesh;
  };

  const layers = [
    makeLayer([TOP], 0x94bce3, 0.25),
    makeLayer([MID], 0x5980a6, 0.3),
    makeLayer([BASE_L, BASE_R], 0x1d2d3d, 0.35),
  ];
  const logo = new THREE.Group();
  layers.forEach((l) => logo.add(l));
  scene.add(logo);

  // Orbit rings
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5980a6, transparent: true, opacity: 0.35 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.012, 8, 160), ringMat);
  ring1.rotation.set(1.25, 0.2, 0);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.008, 8, 160), ringMat.clone());
  (ring2.material as THREE.MeshBasicMaterial).opacity = 0.2;
  ring2.rotation.set(1.05, -0.5, 0.3);
  scene.add(ring1, ring2);

  // Orbiting nodes on the rings
  const nodeGeo = new THREE.SphereGeometry(0.07, 16, 16);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x94bce3 });
  const nodes = [0, 1, 2].map(() => new THREE.Mesh(nodeGeo, nodeMat));
  nodes.forEach((n) => scene.add(n));

  // Particle field
  const COUNT = 160;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 5 + Math.random() * 4;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t) * 0.7;
    pos[i * 3 + 2] = r * Math.cos(p) - 3;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ color: 0x5980a6, size: 0.05, transparent: true, opacity: 0.6 })
  );
  scene.add(particles);

  // Sizing
  const host = canvas.parentElement ?? canvas;
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.85 ? 17.5 : 15;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  // Pointer + hover
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let hovering = false;
  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  host.addEventListener('pointerenter', () => (hovering = true));
  host.addEventListener('pointerleave', () => (hovering = false));

  // Run only while visible
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  let spread = 0;

  const frame = () => {
    const t = clock.getElapsedTime();

    pointer.x += (Math.max(-1, Math.min(1, pointer.tx)) - pointer.x) * 0.05;
    pointer.y += (Math.max(-1, Math.min(1, pointer.ty)) - pointer.y) * 0.05;

    const target = hovering ? 1 : 0.18 + 0.12 * Math.sin(t * 1.2);
    spread += (target - spread) * 0.06;

    layers.forEach((l, i) => {
      const intro = reduce ? 1 : easeOut((t - 0.2 - i * 0.22) / 1.1);
      const dir = 1 - i; // top: +1, mid: 0, base: -1
      l.position.y = (1 - intro) * 7 + dir * spread * 0.55;
      l.position.z = dir * spread * 0.9;
      l.rotation.z = (1 - intro) * -0.4;
    });

    logo.rotation.y = Math.sin(t * 0.45) * 0.35 + pointer.x * 0.55;
    logo.rotation.x = -0.08 + pointer.y * 0.25;
    logo.position.y = Math.sin(t * 0.9) * 0.12;

    ring1.rotation.z = t * 0.15;
    ring2.rotation.z = -t * 0.1;
    nodes.forEach((n, i) => {
      const a = t * (0.5 + i * 0.12) + (i * Math.PI * 2) / 3;
      const r = i === 1 ? 4.9 : 4.3;
      const v = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
      v.applyEuler(i === 1 ? ring2.rotation : ring1.rotation);
      n.position.copy(v);
    });
    particles.rotation.y = t * 0.03;

    renderer.render(scene, camera);
  };

  if (reduce) {
    spread = 0.35;
    frame();
    window.addEventListener('resize', () => frame());
    return true;
  }

  renderer.setAnimationLoop(() => {
    if (visible) frame();
  });
  return true;
}
