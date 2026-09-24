import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { LIVE } from "@/lib/house";

const C = {
  paper: 0xf1eee9,
  raised: 0xf7f4ef,
  deep: 0xe7e2d9,
  teal: 0x2a4e56,
  tealDeep: 0x1c3940,
  tealSoft: 0x3d6a73,
  terra: 0xae593c,
  sand: 0xe6d2c0,
  umber: 0x4f3528,
  ink: 0x3c3c3c,
  line: 0xd8d3cb,
  glass: 0xf3e6c8,
  panel: 0x142f34,
  rubber: 0x1b1b1b,
  silver: 0xc9c3ba,
} as const;

type Flow = {
  curve: THREE.QuadraticBezierCurve3;
  dots: THREE.Mesh[];
  active: boolean;
  speed: number;
};

export function mountEnergyScene(host: HTMLElement): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.deep);
  scene.fog = new THREE.Fog(C.deep, 16, 34);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.set(11.8, 8.6, 12.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.position = "relative";
  renderer.domElement.style.zIndex = "0";
  renderer.domElement.style.touchAction = "none";
  host.style.position = "relative";
  host.style.overflow = "hidden";
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.style.position = "absolute";
  labels.domElement.style.inset = "0";
  labels.domElement.style.zIndex = "1";
  labels.domElement.style.pointerEvents = "none";
  labels.domElement.style.overflow = "hidden";
  host.appendChild(labels.domElement);

  const canvas = renderer.domElement;
  const captured = new Set<number>();
  const dropCapture = (event?: PointerEvent) => {
    const ids = event ? [event.pointerId] : [...captured];
    for (const id of ids) {
      try {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch {
        /* already released */
      }
      captured.delete(id);
    }
  };
  canvas.addEventListener("pointerdown", (event) => captured.add(event.pointerId));
  window.addEventListener("pointerup", dropCapture);
  window.addEventListener("pointercancel", dropCapture);
  const dropAll = () => dropCapture();
  window.addEventListener("blur", dropAll);

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 8;
  controls.maxDistance = 18;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.22;
  controls.target.set(0, 0.7, 0.4);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.45;

  addLights(scene);
  scene.add(makeGround());
  scene.add(makeHouse());
  scene.add(makeSolar());
  scene.add(makeBattery());
  scene.add(makeGrid());
  // Driveway pad is centered at z≈3.15 (5.8×3.4). Match house photo:
  // Range Rover left bay, Zappi/Cupra right bay — keep both on the bricks.
  scene.add(makeCar(new THREE.Vector3(-1.55, 0, 3.25), C.umber, true, "Range Rover"));
  scene.add(makeCar(new THREE.Vector3(1.85, 0, 3.4), C.teal, false, "Zappi"));
  scene.add(makeTree(-4.35, 2.55));
  scene.add(makeTree(5.35, -3.15));
  scene.add(makeTree(-3.15, -3.85));

  const flows = buildFlows(scene);
  tag(scene, new THREE.Vector3(0, 2.55, 0.2), "Home", `${LIVE.houseW} W`);
  tag(scene, new THREE.Vector3(0.15, 2.15, -4.55), "Solar", `${LIVE.solarNowW} W`);
  tag(scene, new THREE.Vector3(4.55, 1.85, 0.15), "Battery", `${Math.abs(LIVE.batteryW)} W`);
  tag(scene, new THREE.Vector3(-5.05, 4.55, -0.7), "Grid", `${LIVE.gridW} W`);

  const t0 = performance.now();
  const batteryGlow = scene.getObjectByName("battery-glow") as THREE.Mesh | undefined;

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = (performance.now() - t0) / 1000;
    controls.update();
    if (batteryGlow?.material instanceof THREE.MeshStandardMaterial) {
      batteryGlow.material.emissiveIntensity = 0.55 + Math.sin(t * 2.2) * 0.25;
    }
    if (!reduce) {
      for (const flow of flows) {
        if (!flow.active) continue;
        for (let i = 0; i < flow.dots.length; i++) {
          const u = (t * flow.speed + i / flow.dots.length) % 1;
          flow.curve.getPointAt(u, flow.dots[i].position);
        }
      }
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("pointerup", dropCapture);
    window.removeEventListener("pointercancel", dropCapture);
    window.removeEventListener("blur", dropAll);
    dropCapture();
    controls.dispose();
    labels.domElement.remove();
    renderer.dispose();
    renderer.domElement.remove();
    scene.traverse((obj) => {
      if (obj instanceof CSS2DObject) obj.element.remove();
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  };
}

function std(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.08,
    ...extra,
  });
}

function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  cast = true,
) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function addLights(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight(C.raised, C.tealDeep, 0.62);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(C.sand, 1.35);
  sun.position.set(-7.5, 5.4, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(C.tealSoft, 0.38);
  fill.position.set(6, 6, -4);
  scene.add(fill);

  const warm = new THREE.PointLight(C.sand, 1.8, 8, 1.8);
  warm.position.set(0, 1.2, 1.1);
  scene.add(warm);

  if (LIVE.batteryW < 0) {
    const batt = new THREE.PointLight(C.terra, 1.4, 6, 2);
    batt.position.set(4.5, 1.2, 0.2);
    scene.add(batt);
  }
}

function makeGround(): THREE.Group {
  const g = new THREE.Group();
  const pad = mesh(new THREE.CircleGeometry(8.6, 72), std(C.deep, { roughness: 1 }), 0, 0, 0, false);
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);

  const ring = mesh(
    new THREE.RingGeometry(6.4, 8.5, 72),
    std(C.teal, { roughness: 1 }),
    0,
    0.008,
    0,
    false,
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  const drive = mesh(
    new THREE.PlaneGeometry(5.8, 3.4),
    std(C.line, { roughness: 1 }),
    0,
    0.012,
    3.15,
    false,
  );
  drive.rotation.x = -Math.PI / 2;
  g.add(drive);
  return g;
}

function makeHouse(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.9, 1.62, 2.45), std(C.raised), 0, 0.81, 0));
  g.add(mesh(new THREE.BoxGeometry(3.05, 0.08, 2.58), std(C.line), 0, 0.04, 0));

  const roof = mesh(new THREE.ConeGeometry(2.18, 0.98, 4), std(C.teal, { roughness: 0.55 }), 0, 2.1, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  const chimney = mesh(new THREE.BoxGeometry(0.28, 0.7, 0.22), std(C.umber), 0.7, 2.35, -0.35);
  g.add(chimney);

  g.add(mesh(new THREE.BoxGeometry(0.46, 0.92, 0.08), std(C.umber), 0.55, 0.5, 1.24));
  const pane = std(C.glass, { emissive: C.sand, emissiveIntensity: 0.85, roughness: 0.3 });
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.42, 0.05), pane, -0.7, 1.05, 1.24, false));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.42, 0.05), pane, 0.05, 1.05, 1.24, false));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.36, 0.05), pane, -0.85, 1.1, -1.24, false));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.36, 0.05), pane, 0.55, 1.1, -1.24, false));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.5), pane, 1.46, 1.05, 0.35, false));

  const cell = std(C.panel, { metalness: 0.45, roughness: 0.28 });
  for (let i = 0; i < 3; i++) {
    const p = mesh(new THREE.BoxGeometry(0.55, 0.04, 0.72), cell, -0.7 + i * 0.7, 2.18, -0.55);
    p.rotation.x = 0.52;
    g.add(p);
  }
  return g;
}

function makeSolar(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0.1, 0, -4.55);
  g.add(mesh(new THREE.BoxGeometry(3.1, 0.12, 0.12), std(C.umber), 0, 0.55, 0.55));
  g.add(mesh(new THREE.BoxGeometry(3.1, 0.12, 0.12), std(C.umber), 0, 1.05, -0.55));
  g.add(mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), std(C.silver), -1.45, 0.55, 0.2));
  g.add(mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), std(C.silver), 1.45, 0.55, 0.2));

  const rack = new THREE.Group();
  rack.position.set(0, 1.15, 0);
  rack.rotation.x = -0.55;
  const cell = std(C.panel, { metalness: 0.5, roughness: 0.22 });
  const frame = std(C.ink, { metalness: 0.3, roughness: 0.4 });
  rack.add(mesh(new THREE.BoxGeometry(2.95, 0.05, 1.7), frame, 0, 0, 0, false));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      rack.add(mesh(new THREE.BoxGeometry(0.64, 0.04, 0.72), cell, -1.1 + c * 0.73, 0.04, -0.38 + r * 0.78));
    }
  }
  g.add(rack);
  return g;
}

function makeBattery(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(4.55, 0, 0.15);
  g.add(mesh(new THREE.BoxGeometry(1.25, 0.12, 0.7), std(C.line), 0, 0.06, 0));
  const shell = std(C.tealDeep, { metalness: 0.25, roughness: 0.45 });
  for (let i = 0; i < 3; i++) {
    g.add(mesh(new THREE.BoxGeometry(1.15, 0.42, 0.58), shell, 0, 0.36 + i * 0.46, 0));
    g.add(mesh(new THREE.BoxGeometry(1.05, 0.04, 0.5), std(C.sand), 0, 0.52 + i * 0.46, 0.02, false));
  }
  const fillH = 1.05 * (LIVE.soc / 100);
  const glow = mesh(
    new THREE.BoxGeometry(0.08, fillH, 0.42),
    std(C.terra, { emissive: C.terra, emissiveIntensity: 0.7 }),
    -0.58,
    0.28 + fillH / 2,
    0,
    false,
  );
  glow.name = "battery-glow";
  g.add(glow);
  return g;
}

function makeGrid(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(-5.05, 0, -0.7);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.3, 12), std(C.umber, { roughness: 0.9 }), 0, 2.15, 0));
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), std(C.ink), 0, 3.95, 0));
  g.add(mesh(new THREE.BoxGeometry(1.15, 0.06, 0.06), std(C.ink), 0, 3.55, 0));
  const ins = std(C.sand, { roughness: 0.35 });
  for (const x of [-0.65, 0, 0.65]) {
    g.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), ins, x, 3.82, 0, false));
  }
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.85, 0.5), std(C.teal), 0.55, 1.15, 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.45, 0.4), std(C.tealDeep), -0.35, 0.28, 0.2));
  return g;
}

function makeTree(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.7, 8), std(C.umber, { roughness: 0.95 }), 0, 0.35, 0));
  g.add(mesh(new THREE.ConeGeometry(0.62, 1.35, 8), std(C.teal, { roughness: 0.9 }), 0, 1.22, 0));
  g.add(mesh(new THREE.ConeGeometry(0.48, 0.9, 8), std(C.tealDeep, { roughness: 0.9 }), 0, 1.7, 0));
  return g;
}

function makeCar(at: THREE.Vector3, color: number, suv: boolean, name: string): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(at);
  g.rotation.y = Math.PI / 2;
  const L = suv ? 2.35 : 2.05;
  const W = suv ? 1.05 : 0.9;
  const ride = suv ? 0.22 : 0.2;

  g.add(mesh(new THREE.BoxGeometry(L, 0.36, W), std(color, { metalness: 0.42, roughness: 0.32 }), 0, ride + 0.18, 0));
  const hood = mesh(
    new THREE.BoxGeometry(L * 0.32, 0.16, W * 0.92),
    std(color, { metalness: 0.42, roughness: 0.32 }),
    L * 0.28,
    ride + 0.34,
    0,
  );
  hood.rotation.z = -0.18;
  g.add(hood);
  g.add(
    mesh(
      new THREE.BoxGeometry(L * 0.5, suv ? 0.46 : 0.38, W * 0.88),
      std(C.tealDeep, { metalness: 0.22, roughness: 0.38 }),
      -L * 0.08,
      ride + 0.48,
      0,
    ),
  );
  const glass = std(C.glass, { roughness: 0.15, metalness: 0.2, emissive: C.sand, emissiveIntensity: 0.12 });
  g.add(mesh(new THREE.BoxGeometry(L * 0.36, 0.22, W * 0.8), glass, 0.06, ride + 0.52, 0, false));

  const lamp = std(C.sand, { emissive: C.sand, emissiveIntensity: 0.7 });
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), lamp, L / 2 - 0.04, ride + 0.28, W * 0.32, false));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), lamp, L / 2 - 0.04, ride + 0.28, -W * 0.32, false));
  const tail = std(C.terra, { emissive: C.terra, emissiveIntensity: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.22), tail, -L / 2 + 0.04, ride + 0.28, W * 0.28, false));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.22), tail, -L / 2 + 0.04, ride + 0.28, -W * 0.28, false));

  const rubber = std(C.rubber, { roughness: 0.95 });
  const wheel = new THREE.CylinderGeometry(suv ? 0.22 : 0.19, suv ? 0.22 : 0.19, 0.16, 16);
  for (const [x, z] of [
    [-L * 0.32, W / 2 - 0.02],
    [L * 0.3, W / 2 - 0.02],
    [-L * 0.32, -W / 2 + 0.02],
    [L * 0.3, -W / 2 + 0.02],
  ] as const) {
    const w = mesh(wheel, rubber, x, suv ? 0.22 : 0.19, z);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }

  const post = new THREE.Group();
  post.position.set(suv ? -0.2 : 0.2, 0, suv ? -0.95 : 0.95);
  post.add(mesh(new THREE.BoxGeometry(0.2, 1.08, 0.24), std(C.tealDeep), 0, 0.54, 0));
  post.add(
    mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.08),
      std(C.sand, { emissive: C.sand, emissiveIntensity: 0.45 }),
      0,
      0.88,
      0.12,
      false,
    ),
  );
  g.add(post);
  tag(g, new THREE.Vector3(0, suv ? 1.62 : 1.4, 0), name, "Idle");
  return g;
}

function buildFlows(scene: THREE.Scene): Flow[] {
  const house = new THREE.Vector3(0, 1.25, 0);
  const solar = new THREE.Vector3(0.1, 1.55, -4.1);
  const battery = new THREE.Vector3(3.85, 0.95, 0.15);
  const grid = new THREE.Vector3(-4.55, 3.7, -0.7);
  const rover = new THREE.Vector3(-1.55, 0.5, 2.85);
  const drive = new THREE.Vector3(1.85, 0.48, 2.95);

  const solarOn = LIVE.solarNowW > 30;
  const battOut = LIVE.batteryW < -30;
  const battIn = LIVE.batteryW > 30;
  const gridIn = LIVE.gridW > 30;
  const gridOut = LIVE.gridW < -30;

  return [
    addFlow(scene, solar, house, 1.1, C.sand, solarOn, 0.22),
    addFlow(scene, battery, house, 1.15, C.terra, battOut, 0.28),
    addFlow(scene, house, battery, 1.15, C.tealSoft, battIn, 0.28),
    addFlow(scene, grid, house, -0.55, C.tealSoft, gridIn, 0.2),
    addFlow(scene, house, grid, -0.55, C.sand, gridOut, 0.2),
    addFlow(scene, house, rover, 0.9, C.teal, false, 0.24),
    addFlow(scene, house, drive, 0.9, C.teal, false, 0.24),
  ];
}

function addFlow(
  scene: THREE.Scene,
  from: THREE.Vector3,
  to: THREE.Vector3,
  lift: number,
  color: number,
  active: boolean,
  speed: number,
): Flow {
  const mid = from.clone().lerp(to, 0.5);
  mid.y += lift;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, active ? 0.038 : 0.022, 8, false),
    std(color, {
      transparent: true,
      opacity: active ? 0.72 : 0.22,
      emissive: color,
      emissiveIntensity: active ? 0.45 : 0.04,
      roughness: 0.35,
    }),
  );
  tube.castShadow = false;
  scene.add(tube);

  const dots: THREE.Mesh[] = [];
  if (active) {
    const geo = new THREE.SphereGeometry(0.07, 10, 8);
    const mat = std(color, { emissive: color, emissiveIntensity: 1.1, roughness: 0.3 });
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(geo, mat);
      d.castShadow = false;
      scene.add(d);
      dots.push(d);
    }
  }
  return { curve, dots, active, speed };
}

function tag(parent: THREE.Object3D, pos: THREE.Vector3, title: string, sub: string) {
  const wrap = document.createElement("div");
  wrap.style.pointerEvents = "none";
  wrap.className =
    "pointer-events-none whitespace-nowrap rounded-md bg-paper/90 px-2.5 py-1 text-center shadow-sm";
  const a = document.createElement("div");
  a.className = "text-xs font-medium tracking-wide text-ink";
  a.textContent = title;
  const b = document.createElement("div");
  b.className = "text-xs tabular-nums text-ink-soft";
  b.textContent = sub;
  wrap.append(a, b);
  const obj = new CSS2DObject(wrap);
  obj.position.copy(pos);
  parent.add(obj);
}
