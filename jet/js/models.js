// Jet models. Forward is -Z, up is +Y.
// Player + enemy jets: PBR-lit (metal, glossy canopy, environment reflections) with a thin illustrated outline.
// Ground units: toon + outline. Illustrated look, readable colours.
import * as THREE from "three";
import { PartBuilder, toonModel, G, toonMaterial, outlineMaterial, smoothNormals } from "./toon.js?v=9";

const PI = Math.PI;

// Look of enemy ground targets for this run (set by the game at load).
const TSTYLE = { army: null, desert: { color: 0xe6cf9a }, arctic: { color: 0xdfe8f4 }, navy: { color: 0x9fb2c8 }, alien: { color: 0xc89cff, emissive: 0x2a0c5a } };
let targetStyle = "army";
export function setTargetStyle(s) { targetStyle = TSTYLE[s] !== undefined ? s : "army"; }
const tm = (geo, o = {}, ally = false) => {
  const st = ally ? null : TSTYLE[targetStyle];
  return toonModel(geo, st ? { ...o, material: toonMaterial(st) } : o);
};

// ---------- environment reflections (tiny gradient sky, prefiltered once) ----------
let ENV = null;
export function initEnv(renderer) {
  if (ENV) return ENV;
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 24, 16);
  const col = [];
  const p = geo.attributes.position;
  const top = new THREE.Color(0x4f8dff), hor = new THREE.Color(0xfff0e0), bot = new THREE.Color(0x2c2a3a), mid = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    if (y > 0) mid.copy(hor).lerp(top, Math.pow(y, 0.7)); else mid.copy(hor).lerp(bot, Math.min(1, -y * 2.2));
    // prismatic band so metal picks up a hint of colour
    const hue = (Math.atan2(p.getZ(i), p.getX(i)) / (2 * PI) + 1) % 1;
    mid.lerp(new THREE.Color().setHSL(hue, 0.9, 0.6), 0.16 * Math.max(0, 1 - Math.abs(y) * 2.5));
    col.push(mid.r, mid.g, mid.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 11) }));
  sun.position.set(20, 34, -14); s.add(sun);
  const pm = new THREE.PMREMGenerator(renderer);
  ENV = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return ENV;
}
function pbr(o) { const m = new THREE.MeshStandardMaterial({ envMapIntensity: 0.75, ...o }); if (ENV) m.envMap = ENV; return m; }

function withOutline(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  g.setAttribute("oNormal", new THREE.BufferAttribute(smoothNormals(g.attributes.position.array, g.attributes.normal.array), 3));
  return g;
}

// fuselage: lofted superelliptic cross-sections. st = [z, halfWidth, up, down, yCenter]
function loft(st, seg = 20, n = 2.5, cLo, cHi) {
  const pos = [], col = [], idx = [];
  const lo = new THREE.Color(cLo), hi = new THREE.Color(cHi), c = new THREE.Color();
  const pw = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (const [z, hw, up, dn, yc] of st) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      const x = hw * pw(cx, 2 / n), y = yc + (sy >= 0 ? up : dn) * pw(sy, 2 / n);
      pos.push(x, y, z);
      c.copy(lo).lerp(hi, THREE.MathUtils.clamp(0.5 + sy * 0.5, 0, 1));
      col.push(c.r, c.g, c.b);
    }
  }
  const S = st.length;
  for (let k = 0; k < S - 1; k++) for (let i = 0; i < seg; i++) {
    const a = k * seg + i, b = k * seg + (i + 1) % seg, c2 = (k + 1) * seg + i, d = (k + 1) * seg + (i + 1) % seg;
    idx.push(a, b, c2, b, d, c2);
  }
  // caps
  const cap = (k, flip) => {
    const ci = pos.length / 3; pos.push(0, st[k][4], st[k][0]); col.push(lo.r, lo.g, lo.b);
    for (let i = 0; i < seg; i++) { const a = k * seg + i, b = k * seg + (i + 1) % seg; if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
  };
  cap(0, false); cap(S - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return withOutline(g);
}
// flat planform (x,z points) extruded to a thin plate, with bevel
function plate(pts, thick, bevel = 0.05) {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.rotateX(PI / 2); g.translate(0, thick / 2, 0);
  return withOutline(g);
}
// vertical plate: pts are (z,y); thickness along X
function fin(pts, thick, bevel = 0.04) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.rotateY(-PI / 2); g.translate(thick / 2, 0, 0);
  return withOutline(g);
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}

const flameGeo = (() => { const g = new THREE.ConeGeometry(0.5, 1, 14, 1, true); g.rotateX(PI / 2); g.translate(0, 0, 0.5); return g; })();
const addMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

const PAL = {
  player: { lo: 0x2f3b50, hi: 0x9aaac4, wing: 0x66768f, dark: 0x1a2029, glass: 0xffc15a, glow: 0x35e6ff, burn: [0xff7a2e, 0xffd27a, 0xcfeaff] },
  ally: { lo: 0x1d4a44, hi: 0xcdeee2, wing: 0x2f8f78, dark: 0x0f2a26, glass: 0x7affc0, glow: 0x3dff8b, burn: [0x3dffb0, 0xb8ffe0, 0xeafff6] },
  enemy: { lo: 0x2a1418, hi: 0x7a3a40, wing: 0x4a2a30, dark: 0x120a0c, glass: 0xff5a4a, glow: 0xff4030, burn: [0xff3a1a, 0xff9a40, 0xffe0b0] },
};
const jetGeo = {};
const WING_SHAPES = [
  [[1.2, -2.8], [5.7, 1.3], [5.7, 3.0], [2.6, 4.5], [1.2, 4.5]],
  [[1.2, -2.0], [5.0, 2.8], [5.0, 3.8], [2.4, 4.8], [1.2, 4.8]],
  [[1.2, -1.0], [6.2, 1.6], [6.2, 3.2], [2.6, 4.2], [1.2, 4.2]],
];
function jetGeometry(kind, vk, pal) {
  const ck = kind + ":" + vk;
  if (jetGeo[ck]) return jetGeo[ck];
  const G2 = {};
  G2.fus = loft([
    [-8.2, 0.02, 0.02, 0.02, 0.05], [-7.4, 0.22, 0.22, 0.17, 0.02], [-6.2, 0.55, 0.45, 0.34, 0.0], [-4.6, 0.92, 0.66, 0.46, 0.02],
    [-3.0, 1.18, 0.78, 0.56, 0.08], [-1.2, 1.55, 0.74, 0.6, 0.06], [0.8, 1.85, 0.7, 0.58, 0.04], [2.8, 1.8, 0.66, 0.56, 0.02],
    [4.6, 1.5, 0.58, 0.5, 0.0], [6.0, 1.2, 0.52, 0.48, 0.0], [6.5, 1.1, 0.5, 0.46, 0.0],
  ], 20, 2.7, pal.lo, pal.hi);
  const wingPts = WING_SHAPES[pal.shape || 0];
  G2.wing = plate(wingPts, 0.12);
  G2.stab = plate([[1.3, 3.9], [3.9, 5.7], [3.9, 6.6], [1.3, 6.6]], 0.1, 0.04);
  G2.fin = fin([[3.2, 0], [4.9, 2.7], [6.2, 2.7], [6.5, 0]], 0.1);
  G2.canard = plate([[1.1, -4.6], [2.7, -3.6], [2.7, -3.0], [1.1, -3.0]], 0.08, 0.03);
  return (jetGeo[ck] = G2);
}

function buildJet(kind, vk = "", variant = null) {
  const pal = { ...PAL[kind], ...(variant || {}) }, g = jetGeometry(kind, vk, pal), lean = kind === "enemy";
  const root = new THREE.Group();
  const eK = kind === "ally" ? 0.75 : 0.3;
  const body = pbr({ vertexColors: true, metalness: 0.4, roughness: 0.45, emissive: 0x05080c, emissiveIntensity: 0.4, envMapIntensity: eK });
  const wingM = pbr({ color: pal.wing, metalness: 0.4, roughness: 0.45, emissive: 0x05080c, emissiveIntensity: 0.4, envMapIntensity: eK });
  const darkM = pbr({ color: pal.dark, metalness: 0.8, roughness: 0.4 });
  const glassM = pbr({ color: pal.glass, metalness: 1, roughness: 0.04, envMapIntensity: 1.8 });
  const glowM = new THREE.MeshBasicMaterial({ color: pal.glow, toneMapped: false, fog: false });
  const OL = outlineMaterial(0x0a0d12, 0.42);
  const add = (geo, mat, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (o.pos) m.position.set(...o.pos); if (o.rot) m.rotation.set(...o.rot); if (o.scale) m.scale.set(...o.scale);
    if (o.ol && geo.attributes.oNormal) { const ol = new THREE.Mesh(geo, OL); ol.renderOrder = -1; ol.position.copy(m.position); ol.rotation.copy(m.rotation); ol.scale.copy(m.scale); root.add(ol); }
    root.add(m); return m;
  };
  add(g.fus, body, { ol: true });
  for (const s of [-1, 1]) {
    add(g.wing, wingM, { pos: [s * 0, -0.2, 0], scale: [s, 1, 1], ol: true });
    add(g.stab, wingM, { pos: [0, 0.0, 0], scale: [s, 1, 1], ol: true });
    add(g.fin, wingM, { pos: [s * 1.2, 0.45, 0], rot: [0, 0, -s * 0.5], ol: true });
    if (lean) add(g.canard, wingM, { pos: [0, 0.05, 0], scale: [s, 1, 1], ol: true });
    // intakes
    add(G.box, darkM, { pos: [s * 1.38, -0.12, -1.3], scale: [0.62, 0.55, 1.9], rot: [0, -s * 0.06, 0] });
    // nozzle housings
    const nz = add(new THREE.CylinderGeometry(0.62, 0.7, 1.5, 16, 1, true).rotateX(PI / 2), darkM, { pos: [s * 0.88, -0.02, 6.1] });
    add(new THREE.TorusGeometry(0.55, 0.07, 6, 18), glowM, { pos: [s * 0.88, -0.02, 6.78], rot: [0, 0, 0] });
    void nz;
    if (!lean) {
      // glowing edge strips: wing tips, fuselage chine, fin tips
      add(G.box, glowM, { pos: [s * 5.68, -0.2, 2.1], scale: [0.07, 0.08, 1.7] });
      add(G.box, glowM, { pos: [s * 3.45, -0.17, -0.75], scale: [0.07, 0.08, 6.0], rot: [0, s * 0.83, 0] });
      add(G.box, glowM, { pos: [s * 1.1 + s * 1.0, 3.0, 5.5].map((v, i) => (i === 0 ? v : v)), scale: [0.06, 0.06, 1.1] });
      add(G.sphereLo, new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff3030 : 0x30ff60, fog: false }), { pos: [s * 5.75, -0.2, 3.1], scale: [0.14, 0.14, 0.14] });
    }
  }
  // canopy: glossy tinted bubble + pilot
  const canopy = add(G.sphere, glassM, { pos: [0, 0.8, -3.1], scale: [0.62, 0.5, 1.9] });
  const pilot = add(G.sphere, pbr({ color: 0xe6e9ef, roughness: 0.5 }), { pos: [0, 0.86, -2.7], scale: [0.2, 0.22, 0.24] });
  if (!lean) {
    // panel details: weapons-bay doors + spine
    for (const s of [-1, 1]) add(G.box, darkM, { pos: [s * 0.52, -0.55, 0.9], scale: [0.04, 0.03, 2.8] });
    add(G.box, darkM, { pos: [0, 0.78, 2.6], scale: [0.7, 0.07, 3.4] });
  }
  // afterburners
  const burners = [];
  const bc = pal.burn;
  const flame = new THREE.Group(), core = new THREE.Group();
  for (const s of [-1, 1]) {
    const o = new THREE.Mesh(flameGeo, addMat(bc[0], 0.65)); o.position.set(s * 0.88, -0.02, 6.8); o.scale.set(1.1, 1.1, 5);
    const m = new THREE.Mesh(flameGeo, addMat(bc[1], 0.8)); m.position.copy(o.position); m.scale.set(0.8, 0.8, 3.4);
    const c = new THREE.Mesh(flameGeo, addMat(bc[2], 0.95)); c.position.copy(o.position); c.scale.set(0.45, 0.45, 2.0);
    flame.add(o, m); core.add(c); burners.push(o, m, c);
  }
  root.add(flame, core);
  const glow = glowSprite(bc[0], 7, 0.9); glow.position.set(0, 0, 7.4); root.add(glow);
  const navL = new THREE.Object3D(), navR = new THREE.Object3D();
  root.add(navL, navR);
  // cockpit (first-person) extras
  const cockpit = new THREE.Group();
  const frameM = pbr({ color: 0x15181d, metalness: 0.7, roughness: 0.5 });
  const cbar = (px, py, pz, sx, sy, sz, rz = 0) => { const m = new THREE.Mesh(G.box, frameM); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.rotation.z = rz; cockpit.add(m); };
  cbar(0, 0.62, -3.55, 1.3, 0.22, 0.9);
  for (const s of [-1, 1]) cbar(s * 0.62, 0.9, -3.0, 0.07, 0.07, 3.2, -s * 0.5);
  cockpit.visible = false; root.add(cockpit);
  const body0 = [];
  root.traverse((o) => { if (o.isMesh && o !== canopy && o !== pilot) body0.push(o); });
  const light = kind !== "player" ? null : new THREE.PointLight(0xff9a50, 0, 60);
  if (light) { light.position.set(0, 0, 8); root.add(light); }
  root.userData = {
    flame, core, navL, navR, canopy, pilot, cockpit, radius: lean ? 7 : 6, eye: new THREE.Vector3(0, 1.0, -2.4),
    burn(fl, boost) {
      const k = fl * (1 + boost * 0.9);
      for (let i = 0; i < burners.length; i += 3) {
        burners[i].scale.set(1.1, 1.1, 5 * k); burners[i + 1].scale.set(0.8, 0.8, 3.4 * k); burners[i + 2].scale.set(0.45, 0.45, 2.0 * k);
      }
      glow.scale.setScalar(6 + 3 * k); glow.material.opacity = 0.55 + 0.3 * Math.min(1.4, k);
      if (light) light.intensity = 0.8 + boost;
    },
    bodyMeshes: body0,
  };
  return root;
}

export const HARDPOINTS = [[-4.3, -0.62, 1.2], [-2.5, -0.72, 0.8], [2.5, -0.72, 0.8], [4.3, -0.62, 1.2]];
export function createPlayerJet(vk = "viper", variant = null) {
  const j = buildJet("player", vk, variant);
  // four underwing pylons, each carrying a visible missile that disappears when it is launched
  const pyl = pbr({ color: 0x15181d, metalness: 0.7, roughness: 0.5 }), mis = pbr({ color: 0xe9ecef, metalness: 0.2, roughness: 0.45 });
  const missGeo = new THREE.CapsuleGeometry(0.13, 1.5, 3, 8).rotateX(PI / 2);
  const noseGeo = new THREE.ConeGeometry(0.13, 0.4, 8).rotateX(-PI / 2);
  const loaded = [];
  for (const [x, y, z] of HARDPOINTS) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const p = new THREE.Mesh(G.box, pyl); p.scale.set(0.12, 0.3, 1.1); p.position.y = 0.2; g.add(p);
    const m = new THREE.Group(); m.position.y = -0.16;
    m.add(new THREE.Mesh(missGeo, mis));
    const nz = new THREE.Mesh(noseGeo, pyl); nz.position.z = -0.95; m.add(nz);
    for (const r of [0, PI / 2]) { const f = new THREE.Mesh(G.box, pyl); f.scale.set(r ? 0.5 : 0.02, r ? 0.02 : 0.5, 0.25); f.position.z = 0.6; m.add(f); }
    g.add(m); j.add(g); loaded.push(m);
  }
  j.userData.hardMissiles = loaded;
  return j;
}
export function setCockpitMode(plane, on) {
  const u = plane.userData;
  u.canopy.visible = !on; u.pilot.visible = !on;
  u.cockpit.visible = on;
  if (u.hardMissiles) for (const m of u.hardMissiles) m.parent.visible = !on;
  u.flame.visible = !on; u.core.visible = !on;
  for (const m of u.bodyMeshes) m.visible = !on;
}
export function createEnemyJet(vk = "red", variant = null) {
  const g = buildJet("enemy", vk, variant);
  const beacon = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false }));
  beacon.position.set(0, 3.4, 5.6); beacon.scale.setScalar(0.35);
  g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

/** Friendly AI jet: green/white livery, green glow strips and a green marker so it is never confused with an enemy. */
export function createAllyJet() {
  const g = buildJet("ally");
  const star = glowSprite(0x3dff8b, 15, 0.85); star.position.set(0, 4.2, 0); g.add(star);
  const stripe = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: 0x3dff8b, toneMapped: false, fog: false }));
  stripe.position.set(0, 1.9, 3.2); stripe.scale.set(2.6, 0.06, 0.55); g.add(stripe);
  const beacon = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x3dff8b, fog: false }));
  beacon.position.set(0, 3.4, 5.6); beacon.scale.setScalar(0.35); g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

// ---------- carrier (friendly landing deck) ----------
export const CARRIER = { len: 300, width: 66, deckY: 16 };
export function createCarrier() {
  const root = new THREE.Group();
  const hullPts = [[0, -150], [20, -122], [31, -60], [33, 40], [33, 150], [-33, 150], [-33, 40], [-31, -60], [-20, -122]];
  const hs = new THREE.Shape(hullPts.map(([x, z]) => new THREE.Vector2(x, z)));
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 24, bevelEnabled: false });
  hg.rotateX(PI / 2); hg.translate(0, CARRIER.deckY - 1.5, 0);
  const pb = new PartBuilder();
  pb.add(hg, 0x6f7a88);
  pb.add(G.box, 0xc3412f, { pos: [0, -5, 0], scale: [1, 0, 1] }); // placeholder (zero-size) keeps builder happy
  const hull = toonModel(new PartBuilder().add(hg, 0x6f7a88).build(), { outlineScale: 1.6 });
  root.add(hull);
  const ib = new PartBuilder();
  ib.add(G.box, 0x9aa5b2, { pos: [25, 24, -10], scale: [9, 16, 28] });
  ib.add(G.box, 0xb8c2cd, { pos: [25, 34, -9], scale: [12, 3, 16] });
  ib.add(G.box, 0x2b3139, { pos: [20.3, 33, -9], scale: [0.6, 1.4, 14] });
  ib.add(G.cyl, 0x4a525c, { pos: [25, 42, -9], scale: [0.5, 12, 0.5] });
  ib.add(G.sphere, 0xdfe5ec, { pos: [25, 48.5, -9], scale: [4.2, 1.2, 4.2] });
  ib.add(G.box, 0xff5a3d, { pos: [25, 52, -9], scale: [0.8, 0.8, 0.8] });
  ib.add(G.box, 0xffffff, { pos: [-8, 17, -60], scale: [3, 0.2, 40] }); // bow marking
  root.add(toonModel(ib.build(), { outlineScale: 1.2 }));
  // deck texture
  const c = document.createElement("canvas"); c.width = 256; c.height = 1024;
  const x = c.getContext("2d");
  x.fillStyle = "#3f454e"; x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; x.fillRect(Math.random() * 256, Math.random() * 1024, 18, 3); }
  x.fillStyle = "#ffffff"; x.fillRect(6, 0, 4, 1024); x.fillRect(246, 0, 4, 1024);
  x.fillStyle = "#ffd23f"; for (let y = 20; y < 1024; y += 64) x.fillRect(125, y, 6, 36);
  x.fillStyle = "#ff8a2a"; for (const y of [700, 770, 840]) x.fillRect(20, y, 216, 5); // arrestor wires
  x.fillStyle = "#ffffff"; x.font = "bold 110px sans-serif"; x.textAlign = "center"; x.fillText("JET", 128, 960);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(66, 300).rotateX(-PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
  deck.position.set(0, CARRIER.deckY + 0.08, 0); root.add(deck);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(68, 1.6, 302), new THREE.MeshLambertMaterial({ color: 0x59616c }));
  slab.position.set(0, CARRIER.deckY - 0.8, 0); root.add(slab);
  // landing lights (glowing strip + beacon)
  const lamp = new THREE.MeshBasicMaterial({ color: 0x7dff9a, toneMapped: false, fog: false });
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(G.sphereLo, lamp); m.position.set(-34, CARRIER.deckY + 0.6, 40 + i * 9); m.scale.setScalar(0.7); root.add(m); const m2 = m.clone(); m2.position.x = 34; root.add(m2); }
  const beacon = glowSprite(0x7dff9a, 70, 0.8); beacon.position.set(0, CARRIER.deckY + 30, 120); root.add(beacon);
  root.userData = { radius: 40, beacon };
  return root;
}

// ---------- army base buildings + flak gun ----------
export function createBaseBuilding(sub) {
  const geo = cached("base-" + sub, () => {
    const b = new PartBuilder();
    if (sub === "hangar") {
      b.add(G.cyl, 0x8e9a8a, { pos: [0, 4, 0], rot: [0, 0, PI / 2], scale: [7, 18, 7] });
      b.add(G.box, 0x6d7a6a, { pos: [0, 2, 0], scale: [18, 4, 13] });
      b.add(G.box, 0x2c3138, { pos: [0, 3, 6.6], scale: [9, 5.5, 0.4] });
      b.add(G.box, 0xff4d3d, { pos: [6, 8.5, 0], scale: [1.4, 0.5, 1.4] });
    } else if (sub === "fuel") {
      for (const [x, z] of [[-5, -4], [5, -4], [-5, 5], [5, 5]]) {
        b.add(G.cyl, 0xf1f3f5, { pos: [x, 3.2, z], scale: [3.6, 6.4, 3.6] });
        b.add(G.cyl, 0xe04a3a, { pos: [x, 4.4, z], scale: [3.7, 1.0, 3.7] });
        b.add(G.sphere, 0xdfe4e8, { pos: [x, 6.4, z], scale: [3.5, 1.3, 3.5] });
      }
    } else if (sub === "radar") {
      b.add(G.box, 0x7b8794, { pos: [0, 2, 0], scale: [6, 4, 6] });
      b.add(G.cyl, 0x4a525c, { pos: [0, 7, 0], scale: [0.7, 8, 0.7] });
      b.add(G.sphere, 0xe9edf2, { pos: [0, 11.5, 0], rot: [0.5, 0, 0], scale: [5.5, 5.5, 0.9] });
      b.add(G.box, 0xff4d3d, { pos: [0, 12.2, 0.6], scale: [0.7, 0.7, 0.7] });
    } else {
      b.add(G.box, 0x9d9072, { pos: [0, 1.8, 0], scale: [15, 3.6, 8] });
      b.add(G.box, 0x6f6450, { pos: [0, 3.9, 0], scale: [15.6, 0.8, 8.6] });
      b.add(G.box, 0x2c3138, { pos: [0, 1.6, 4.05], scale: [3, 2.8, 0.3] });
    }
    return b.build();
  });
  const g = tm(geo, { outlineScale: 1.1 });
  g.userData.radius = sub === "fuel" ? 12 : 11;
  g.userData.sub = sub;
  return g;
}
export function createFlakGun() {
  const baseGeo = cached("flakBase", () => {
    const b = new PartBuilder();
    b.add(G.cyl, 0xb9a97a, { pos: [0, 0.3, 0], scale: [5.2, 0.6, 5.2] });
    b.add(G.torus, 0x8f8460, { pos: [0, 0.9, 0], rot: [PI / 2, 0, 0], scale: [4.8, 4.8, 1.3] });
    b.add(G.cyl, 0x4b5240, { pos: [0, 1.6, 0], scale: [1.6, 2.2, 1.6] });
    return b.build();
  });
  const gunGeo = cached("flakGun", () => {
    const b = new PartBuilder();
    b.add(G.sphere, 0x6a7350, { pos: [0, 0, 0], scale: [1.5, 1.1, 1.8] });
    for (const x of [-0.55, 0.55]) {
      b.add(G.capsule, 0x2b2f2a, { pos: [x, 0.2, -2.2], rot: [PI / 2, 0, 0], scale: [0.22, 1.4, 0.22] });
      b.add(G.sphere, 0xffb23d, { pos: [x, 0.2, -4.6], scale: [0.3, 0.3, 0.3] });
    }
    return b.build();
  });
  const g = new THREE.Group();
  g.add(tm(baseGeo, { outlineScale: 1.1 }));
  const gun = tm(gunGeo, { outlineScale: 1.0 });
  const pivot = new THREE.Group(); pivot.position.y = 3.2; pivot.add(gun); g.add(pivot);
  g.scale.setScalar(1.5);
  g.userData = { pivot, radius: 8 };
  return g;
}

const geoCache = {};
function cached(name, fn) { return geoCache[name] || (geoCache[name] = fn()); }

export function createTank(ally = false) {
  const geo = cached(ally ? "tank-ally" : "tank", () => {
    const olive = ally ? 0x2f9a7e : 0x7f8e4b, dark = 0x34362f, sand = ally ? 0xe9f6ef : 0xb7a76a;
    const b = new PartBuilder();
    b.add(G.sphere, olive, { pos: [0, 0.9, 0], scale: [1.7, 0.62, 2.6] });
    for (const s of [-1, 1]) {
      b.add(G.capsule, dark, { pos: [s * 1.55, 0.55, 0], rot: [PI / 2, 0, 0], scale: [0.55, 1.15, 0.55] });
      for (let i = -1; i <= 1; i++) b.add(G.sphereLo, 0x55574d, { pos: [s * 1.95, 0.55, i * 1.2], scale: [0.12, 0.38, 0.38] });
    }
    b.add(G.sphere, sand, { pos: [0, 1.55, 0.3], scale: [1.1, 0.62, 1.25] });
    b.add(G.capsule, olive, { pos: [0, 1.65, -1.9], rot: [PI / 2, 0, 0], scale: [0.16, 0.85, 0.16] });
    b.add(G.sphere, dark, { pos: [0, 1.65, -3.6], scale: [0.22, 0.22, 0.3] });
    b.add(G.sphere, ally ? 0x3dff8b : 0xff4d3d, { pos: [0.45, 2.15, 0.6], scale: [0.18, 0.18, 0.18] });
    if (ally) b.add(G.box, 0x3dff8b, { pos: [0, 2.0, 0.3], scale: [0.9, 0.08, 0.9] });
    return b.build();
  });
  const g = tm(geo, {}, ally);
  if (ally) { const m = glowSprite(0x3dff8b, 11, 0.8); m.position.set(0, 3.6, 0); g.add(m); }
  g.scale.setScalar(2.4);
  g.userData.radius = 9;
  return g;
}

export function createShip(ally = false) {
  const geo = cached(ally ? "ship-ally" : "ship", () => {
    const hull = ally ? 0xdfe9e6 : 0x7d8a99, deck = ally ? 0x4f8f80 : 0x5d6876, light = 0xd2d9e2, dark = 0x2b3038, red = ally ? 0x2fbf6f : 0xd9443a;
    const b = new PartBuilder();
    b.add(G.sphere, hull, { pos: [0, 0, 0], scale: [2.7, 1.5, 12] });
    b.add(G.sphere, red, { pos: [0, -0.35, 0], scale: [2.75, 0.5, 11.6] });
    b.add(G.sphere, deck, { pos: [0, 1.05, 0], scale: [2.25, 0.32, 10.4] });
    b.add(G.sphere, light, { pos: [0, 2.0, 1.5], scale: [1.55, 1.3, 2.7] });
    b.add(G.sphere, dark, { pos: [0, 2.8, 0.3], scale: [1.3, 0.32, 1.1] });
    b.add(G.capsule, light, { pos: [0, 3.0, 4.2], scale: [0.6, 0.6, 0.7] });
    b.add(G.cyl, dark, { pos: [0, 4.4, 1.8], scale: [0.12, 3, 0.12] });
    b.add(G.sphere, light, { pos: [0, 6.0, 1.8], scale: [0.45, 0.45, 0.45] });
    b.add(G.sphere, light, { pos: [0, 1.5, -6], scale: [0.8, 0.55, 0.9] });
    b.add(G.capsule, dark, { pos: [0, 1.6, -7.4], rot: [PI / 2, 0, 0], scale: [0.12, 0.6, 0.12] });
    b.add(G.sphere, light, { pos: [0, 1.5, 7.5], scale: [0.7, 0.5, 0.8] });
    return b.build();
  });
  const g = tm(geo, {}, ally);
  if (ally) { const m = glowSprite(0x3dff8b, 16, 0.8); m.position.set(0, 9, 0); g.add(m); }
  g.scale.setScalar(1.7);
  g.userData.radius = 22;
  return g;
}

export function createSamSite() {
  const baseGeo = cached("samBase", () => {
    const sand = 0xc9b98b, bag = 0x9c8f63, dark = 0x3a3d35, white = 0xf2f2f2;
    const b = new PartBuilder();
    b.add(G.cyl, sand, { pos: [0, 0.15, 0], scale: [4.5, 0.3, 4.5] });
    b.add(G.torus, bag, { pos: [0, 0.35, 0], rot: [PI / 2, 0, 0], scale: [4.4, 4.4, 1.2] });
    b.add(G.cyl, dark, { pos: [3.0, 1.8, 2.2], scale: [0.15, 3.2, 0.15] });
    b.add(G.sphere, white, { pos: [3.0, 3.6, 2.2], rot: [0.3, 0.5, 0], scale: [1.2, 1.2, 0.35] });
    b.add(G.sphere, 0xff4d3d, { pos: [3.0, 3.7, 2.0], scale: [0.2, 0.2, 0.2] });
    return b.build();
  });
  const lnGeo = cached("samLauncher", () => {
    const olive = 0x8a8f4e, white = 0xf4f4f0, red = 0xff4a3d;
    const b = new PartBuilder();
    b.add(G.sphere, olive, { pos: [0, 0.8, 0], scale: [1.4, 0.8, 1.4] });
    for (const x of [-0.7, 0, 0.7]) {
      b.add(G.capsule, white, { pos: [x, 1.9, -0.3], rot: [PI / 2 - 0.6, 0, 0], scale: [0.25, 0.9, 0.25] });
      b.add(G.sphere, red, { pos: [x, 3.05, -2.0], scale: [0.25, 0.25, 0.3] });
    }
    return b.build();
  });
  const g = new THREE.Group();
  g.add(tm(baseGeo));
  const launcher = tm(lnGeo);
  g.add(launcher);
  g.scale.setScalar(2.0);
  g.userData = { launcher, radius: 10 };
  return g;
}

export function createRocket(color = 0xe6e9ec, tip = 0x2b3036) {
  const key = "rocket2" + color + tip;
  const geo = cached(key, () => {
    const b = new PartBuilder();
    b.add(G.capsule, color, { rot: [PI / 2, 0, 0], scale: [0.17, 0.8, 0.17] });
    b.add(G.cone, tip, { pos: [0, 0, -1.55], rot: [-PI / 2, 0, 0], scale: [0.17, 0.75, 0.17] });
    b.add(G.cyl, 0xc23a2e, { pos: [0, 0, -0.5], rot: [PI / 2, 0, 0], scale: [0.18, 0.12, 0.18] });
    for (const r of [0, PI / 2]) b.add(G.box, tip, { pos: [0, 0, 1.0], rot: [0, 0, r], scale: [0.9, 0.04, 0.45] });
    for (const r of [0, PI / 2]) b.add(G.box, tip, { pos: [0, 0, -0.55], rot: [0, 0, r], scale: [0.5, 0.03, 0.22] });
    b.add(G.cyl, 0x1a1c20, { pos: [0, 0, 1.32], rot: [PI / 2, 0, 0], scale: [0.14, 0.18, 0.14] });
    return b.build();
  });
  const g = toonModel(geo, { outlineScale: 0.5 });
  const fl = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  fl.rotation.x = PI / 2; fl.position.z = 2.4; fl.scale.set(0.2, 1.6, 0.2);
  const glw = glowSprite(0xffc070, 2.6, 0.9); glw.position.z = 1.8;
  g.add(fl, glw);
  g.scale.setScalar(1.7);
  return g;
}

export function createBomb() {
  const geo = cached("bomb", () => {
    const b = new PartBuilder();
    b.add(G.sphere, 0x4f5a3a, { scale: [0.5, 0.5, 1.2] });
    b.add(G.sphere, 0xffd23f, { pos: [0, 0, -0.75], scale: [0.36, 0.36, 0.3] });
    for (const r of [0, PI / 2]) b.add(G.sphere, 0x3a4229, { pos: [0, 0, 1.05], rot: [0, 0, r], scale: [0.65, 0.06, 0.3] });
    return b.build();
  });
  const g = toonModel(geo, { outlineScale: 0.7 });
  g.scale.setScalar(1.8);
  return g;
}

// Puffy toon sphere geometry usable by InstancedMesh (with outline normals).
export function puffGeometry() {
  return cached("puff", () => new PartBuilder().add(G.sphereLo, 0xffffff).build());
}
export { toonMaterial };
