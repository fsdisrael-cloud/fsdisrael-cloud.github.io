// Jet models. Forward is -Z, up is +Y.
// Player + enemy jets: PBR-lit (metal, glossy canopy, environment reflections) with a thin illustrated outline.
// Ground units: toon + outline. Illustrated look, readable colours.
import * as THREE from "three";
import { PartBuilder, toonModel, G, toonMaterial, outlineMaterial, smoothNormals } from "./toon.js?v=38";
import { patchDetail, missileTex } from "./tex.js?v=38";

const PI = Math.PI;

// Look of enemy ground targets for this run (set by the game at load).
const TSTYLE = { army: null, desert: { color: 0xe6cf9a }, arctic: { color: 0xdfe8f4 }, navy: { color: 0x9fb2c8 } };
let targetStyle = "army";
export function setTargetStyle(s) { targetStyle = TSTYLE[s] !== undefined ? s : "army"; }
const tm = (geo, o = {}, ally = false) => {
  const st = ally ? null : TSTYLE[targetStyle];
  return toonModel(geo, st ? { ...o, material: toonMaterial({ ...st, detail: { kind: "panel", s: 0.14, k: 0.8 } }) } : { detail: { kind: "panel", s: 0.14, k: 0.8 }, ...o });
};

// ---------- environment reflections (tiny gradient sky, prefiltered once) ----------
let ENV = null;
export function initEnv(renderer) {
  if (ENV) return ENV;
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 24, 16);
  const col = [];
  const p = geo.attributes.position;
  const top = new THREE.Color(0x4f8dff), hor = new THREE.Color(0xe6d6c2), bot = new THREE.Color(0x14161c), mid = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    if (y > 0) mid.copy(hor).lerp(top, Math.pow(y, 0.7)); else mid.copy(hor).lerp(bot, Math.min(1, -y * 2.2));
    // prismatic band so metal picks up a hint of colour
    const hue = (Math.atan2(p.getZ(i), p.getX(i)) / (2 * PI) + 1) % 1;
    
    col.push(mid.r, mid.g, mid.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 11) }));
  sun.position.set(20, 34, -14); s.add(sun);
  // b25: studio soft-boxes: long bright strips give the airframe crisp, glossy highlight lines along fuselage and wings
  const sb = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.2, 5.6), side: THREE.DoubleSide });
  for (const [x, y, z, w, h, ry] of [[-30, 22, 10, 40, 4, 1.2], [32, 14, 22, 36, 3, -1.1], [0, 40, 0, 6, 34, 0], [-10, 6, -38, 30, 2.5, 0.2]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sb); m.position.set(x, y, z); m.lookAt(0, 0, 0); m.rotateZ(ry); s.add(m); }
  const pm = new THREE.PMREMGenerator(renderer);
  ENV = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return ENV;
}
function pbr(o, det) { const m = new THREE.MeshStandardMaterial({ envMapIntensity: 0.75, ...o }); if (ENV) m.envMap = ENV; if (det) patchDetail(m, det); return m; }

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
  player: { lo: 0x2b323b, hi: 0x79838f, wing: 0x4b535d, dark: 0x0f1317, glass: 0xc99a46, glow: 0x35c8e0, burn: [0xff7a2e, 0xffd27a, 0xcfeaff] },
  ally: { lo: 0x22302b, hi: 0x93a89c, wing: 0x56695f, dark: 0x0e1613, glass: 0x7acfa0, glow: 0x3dd98b, burn: [0x3dffb0, 0xb8ffe0, 0xeafff6] },
  enemy: { lo: 0x1c1f23, hi: 0x5a5148, wing: 0x3a3836, dark: 0x0d0f11, glass: 0xd8503c, glow: 0xff4030, burn: [0xff3a1a, 0xff9a40, 0xffe0b0] },
};
const jetGeo = {};
// planforms (right wing, x outwards): [rootX, rootLE, rootTE, tipX, tipLE, tipTE, thickRoot, thickTip, dropTip]
const WING_SHAPES = [
  [1.3, -1.9, 3.1, 5.8, 1.5, 3.3, 0.36, 0.07, -0.12],   // 0: trapezoid air-superiority wing
  [1.3, -2.4, 3.7, 5.5, 2.2, 3.5, 0.34, 0.06, -0.08],   // 1: diamond / delta-ish
  [1.3, -1.2, 3.1, 6.2, 2.4, 3.8, 0.32, 0.06, -0.1],    // 2: swept multirole
  [1.3, 0.7, 3.7, 5.8, -1.7, 1.3, 0.34, 0.06, -0.05],   // 3: forward-swept blade (sci-fi)
  [1.1, -3.5, 3.5, 7.0, 2.9, 4.7, 0.30, 0.05, -0.2],    // 4: manta arrowhead (sci-fi)
];
// tapered, lens-section lifting surface. spans along +x from x0; chord points (z) LE/TE per station; thickness tapers
function surfGeo(x0, le0, te0, x1, le1, te1, t0, t1, drop = 0, NS = 5, NC = 8) {
  const pos = [], idx = [], col = [];
  const prof = (u) => Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.72);
  for (let i = 0; i <= NS; i++) {
    const k = i / NS, x = x0 + (x1 - x0) * k, le = le0 + (le1 - le0) * k, te = te0 + (te1 - te0) * k, th = t0 + (t1 - t0) * k, y0 = drop * k * k;
    for (let j = 0; j <= NC; j++) { const u = j / NC; pos.push(x, y0 + th * 0.58 * prof(u), le + (te - le) * u); }
    for (let j = NC - 1; j >= 1; j--) { const u = j / NC; pos.push(x, y0 - th * 0.42 * prof(u), le + (te - le) * u); }
  }
  const R = NC + NC - 1;
  for (let i = 0; i < NS; i++) for (let j = 0; j < R; j++) {
    const a = i * R + j, b = i * R + (j + 1) % R, c = (i + 1) * R + j, d = (i + 1) * R + (j + 1) % R;
    idx.push(a, b, c, b, d, c);
  }
  // tip cap
  const base = NS * R, ci = pos.length / 3;
  pos.push(x1, drop, (le1 + te1) / 2);
  for (let j = 0; j < R; j++) idx.push(ci, base + (j + 1) % R, base + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function wingFor(sh) { const w = WING_SHAPES[sh] || WING_SHAPES[0]; return surfGeo(w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], w[8]); }
function jetGeometry(kind, vk, pal) {
  const ck = kind + ":" + vk;
  if (jetGeo[ck]) return jetGeo[ck];
  const G2 = {};
  // main fuselage: long pointed radome, shouldered cockpit, flat blended centre-body, tapering to the engine bay
  G2.fus = loft([
    [-8.6, 0.02, 0.02, 0.02, 0.0], [-8.0, 0.14, 0.15, 0.13, 0.0], [-7.2, 0.34, 0.3, 0.26, 0.0], [-6.2, 0.58, 0.46, 0.38, 0.02],
    [-5.0, 0.84, 0.62, 0.46, 0.05], [-3.8, 1.06, 0.78, 0.52, 0.1], [-2.4, 1.38, 0.74, 0.56, 0.06], [-0.6, 1.74, 0.66, 0.56, 0.0],
    [1.4, 1.9, 0.6, 0.55, -0.02], [3.2, 1.86, 0.56, 0.52, -0.02], [4.6, 1.74, 0.5, 0.48, -0.02], [5.5, 1.64, 0.46, 0.45, -0.02],
  ], 26, 3.1, pal.lo, pal.hi);
  // intake trunks (caret scoops) on each side, swept body-side
  G2.intake = loft([
    [-3.5, 0.46, 0.5, 0.5, -0.12], [-2.8, 0.52, 0.56, 0.52, -0.14], [-1.4, 0.56, 0.56, 0.5, -0.1], [0.6, 0.54, 0.5, 0.46, -0.06],
  ], 16, 4.2, pal.lo, pal.hi);
  G2.wing = wingFor(pal.shape || 0);
  G2.stab = surfGeo(1.5, 3.4, 5.7, 4.7, 5.1, 6.4, 0.16, 0.05, 0, 3, 6);
  G2.strake = surfGeo(0.9, -5.2, 0.6, 2.4, -1.4, 0.6, 0.22, 0.04, 0, 3, 6);
  G2.canard = surfGeo(0.9, -5.0, -3.3, 2.8, -3.9, -3.2, 0.1, 0.03, 0.05, 2, 5);
  // vertical tails, built along +x then rotated up and outwards (cant)
  G2.fin = surfGeo(0, 2.1, 5.8, 2.7, 4.5, 6.0, 0.22, 0.05, 0, 4, 7).rotateZ(PI / 2 - 0.42);
  G2.finTip = new THREE.BoxGeometry(0.07, 0.34, 0.6);
  // engine nozzle: shroud + converging flaps
  G2.shroud = new THREE.CylinderGeometry(0.66, 0.64, 1.4, 18, 1, true).rotateX(PI / 2);
  G2.petals = new THREE.CylinderGeometry(0.46, 0.64, 0.7, 12, 1, true).rotateX(PI / 2);
  // canopy bubble + frame
  G2.canopy = loft([
    [-4.7, 0.02, 0.02, 0.0, 0.5], [-4.2, 0.34, 0.26, 0.0, 0.5], [-3.4, 0.56, 0.54, 0.0, 0.5], [-2.3, 0.62, 0.52, 0.0, 0.5], [-1.1, 0.5, 0.3, 0.0, 0.5], [0.0, 0.18, 0.08, 0.0, 0.5],
  ], 18, 2.3, 0xffffff, 0xffffff);
  return (jetGeo[ck] = G2);
}

let _decal = null;
function decalTex() {
  if (_decal) return _decal;
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const g = c.getContext("2d");
  // tail flash: diagonal bands + serial
  g.save(); g.translate(0, 0);
  g.fillStyle = "rgba(20,40,110,0.92)"; g.beginPath(); g.moveTo(0, 20); g.lineTo(256, 0); g.lineTo(256, 58); g.lineTo(0, 86); g.fill();
  g.fillStyle = "rgba(235,235,240,0.95)"; g.beginPath(); g.moveTo(0, 86); g.lineTo(256, 58); g.lineTo(256, 78); g.lineTo(0, 106); g.fill();
  g.fillStyle = "rgba(200,40,40,0.95)"; g.beginPath(); g.moveTo(0, 106); g.lineTo(256, 78); g.lineTo(256, 92); g.lineTo(0, 120); g.fill();
  g.restore();
  g.fillStyle = "rgba(30,34,40,0.92)"; g.font = "bold 72px Arial"; g.textAlign = "center"; g.fillText("JX", 128, 190); g.font = "bold 40px Arial"; g.fillText("01", 128, 236);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; _decal = t; return t;
}
let _round = null;
function roundelTex() {
  if (_round) return _round;
  const c = document.createElement("canvas"); c.width = 128; c.height = 128; const g = c.getContext("2d");
  const ring = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, r, 0, 7); g.fill(); };
  ring(60, "rgba(235,235,240,0.95)"); ring(48, "rgba(20,40,110,0.95)"); ring(30, "rgba(235,235,240,0.95)"); ring(14, "rgba(240,170,40,0.95)");
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; _round = t; return t;
}
function buildJet(kind, vk = "", variant = null) {
  const pal = { ...PAL[kind], ...(variant || {}) }, g = jetGeometry(kind, vk, pal), lean = kind === "enemy";
  const root = new THREE.Group();
  const eK = kind === "ally" ? 0.82 : 0.78;
  const body = pbr({ vertexColors: true, metalness: 0.76, roughness: 0.34, emissive: 0x10151c, emissiveIntensity: 0.35, envMapIntensity: eK }, { kind: "panel", s: 0.2, k: 0.5 });
  const wingM = pbr({ color: pal.wing, metalness: 0.72, roughness: 0.36, emissive: 0x10151c, emissiveIntensity: 0.3, envMapIntensity: eK }, { kind: "panel", s: 0.26, k: 0.5 });
  const darkM = pbr({ color: pal.dark, metalness: 0.7, roughness: 0.5 });
  const metalM = pbr({ color: 0x3b4047, metalness: 0.95, roughness: 0.36, flatShading: true, envMapIntensity: 1.1 });
  const glassM = pbr({ color: pal.glass, metalness: 1, roughness: 0.05, envMapIntensity: 1.25, transparent: true, opacity: 0.96 });
  const accentM = new THREE.MeshStandardMaterial({ color: pal.glow, emissive: pal.glow, emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.5 });
  const glowM = new THREE.MeshBasicMaterial({ color: pal.glow, toneMapped: false, fog: false });
  const add = (geo, mat, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (o.pos) m.position.set(...o.pos); if (o.rot) m.rotation.set(...o.rot); if (o.scale) m.scale.set(...o.scale);
    (o.parent || root).add(m); return m;
  };
  { const fu = add(g.fus, body); if (pal.long) fu.scale.set(0.85, 0.85, 1.3); if (pal.flat) fu.scale.set(1.25, 0.6, 0.9); }   /* b38: per-type airframe */
  const exotic = (pal.shape || 0) >= 3;
  const stabs = [], flps = [], ails = [], ruds = [], petalsL = [];
  let brake = null;
  const ctlM = pbr({ color: new THREE.Color(pal.wing).multiplyScalar(0.92), metalness: 0.35, roughness: 0.46, emissive: 0x161c25, emissiveIntensity: 0.5, envMapIntensity: eK });
  for (const s of [-1, 1]) {
    add(g.wing, wingM, { pos: [0, -0.2, 0], scale: [s, 1, 1] });
    { const sg = new THREE.Group(); sg.position.set(0, -0.02, 4.9); root.add(sg); stabs.push([sg, s]); add(g.stab, wingM, { pos: [0, 0, -4.9], scale: [s, 1, 1], parent: sg });
      if ((pal.shape || 0) < 3) {
        const w = WING_SHAPES[pal.shape || 0], slope = (w[5] - w[2]) / (w[3] - w[0]);
        for (const [xa, xb, ch, list] of [[1.9, 3.7, 0.95, flps], [3.9, 5.6, 0.8, ails]]) {
          const xm = (xa + xb) / 2, k = (xm - w[0]) / (w[3] - w[0]), th = (w[6] + (w[7] - w[6]) * k) * 0.5, hl = (xb - xa) / 2;
          const gp = new THREE.Group(); gp.position.set(s * xm, -0.2 + w[8] * k * k + 0.005, w[2] + (w[5] - w[2]) * k - ch); gp.rotation.y = -s * Math.atan(slope); root.add(gp);
          const fg = surfGeo(-hl, 0, ch, hl, 0, ch, th, th * 0.8, 0, 1, 7);
          const fm = new THREE.Mesh(fg, ctlM); gp.add(fm); list.push([gp, s]);
          gp.add(new THREE.Mesh(G.box, darkM)).scale.set(hl * 2, 0.02, 0.02);
        }
      } }
    add(g.strake, wingM, { pos: [0, 0.05, 0], scale: [s, 1, 1] });
    if (!pal.tailless) { add(g.fin, wingM, { pos: [s * 1.0, 0.35, 0], scale: [s, 1, 1] });   /* b38: tailless types (B-21, J-36, F-47) have no fins */
    { const rp = new THREE.Group(); rp.position.set(s * 1.55, 1.58, 5.15); rp.rotation.z = -s * 0.42; root.add(rp);
      const rm = new THREE.Mesh(G.box, ctlM); rm.scale.set(0.09, 1.5, 0.78); rm.position.z = 0.39; rp.add(rm); ruds.push(rp); }
    // fin-tip band in team accent colour
    add(g.finTip, accentM, { pos: [s * 1.0 + s * 1.15, 2.5, 5.45], rot: [0, 0, -s * 0.42] }); }
    if (pal.long) { const nc = add(new THREE.CylinderGeometry(0.55, 0.62, 7.5, 16).rotateX(PI / 2), body, { pos: [s * 3.0, -0.15, 2.4] }); add(new THREE.ConeGeometry(0.5, 1.6, 14).rotateX(-PI / 2), darkM, { pos: [s * 3.0, -0.15, -2.1] }); add(g.fin, wingM, { pos: [s * 2.5, -0.1, 0.4], scale: [s * 0.7, 0.8, 0.9] }); add(new THREE.TorusGeometry(0.5, 0.05, 5, 18), glowM, { pos: [s * 3.0, -0.15, 6.2] }); }   /* b38: SR-71/A-12 engine nacelles */
    if (lean || exotic || pal.canard) add(g.canard, wingM, { pos: [0, 0.05, 0], scale: [s, 1, 1] });
    // intake scoop + dark mouth + splitter
    add(g.intake, body, { pos: [s * 1.5, -0.1, 0], rot: [0, -s * 0.03, 0] });
    add(G.box, darkM, { pos: [s * 1.5, -0.2, -3.52], scale: [0.78, 0.8, 0.1] });
    add(G.box, metalM, { pos: [s * 1.02, -0.18, -2.4], scale: [0.04, 1.0, 2.4] });
    // nozzles
    add(g.shroud, metalM, { pos: [s * 0.9, -0.02, 5.7] });
    const pet = add(g.petals, metalM, { pos: [s * 0.9, -0.02, 6.45] }); petalsL.push(pet);
    add(new THREE.CircleGeometry(0.46, 14), new THREE.MeshBasicMaterial({ color: 0x2a1006, fog: false }), { pos: [s * 0.9, -0.02, 6.78] });
    add(new THREE.TorusGeometry(0.47, 0.035, 5, 18), glowM, { pos: [s * 0.9, -0.02, 6.8] });
    // pylons + wing-tip rails
    add(G.box, darkM, { pos: [s * 5.7, -0.12, 2.2], scale: [0.16, 0.12, 1.3] });
    add(G.sphere, new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff3030 : 0x30ff60, fog: false }), { pos: [s * 5.85, -0.2, 1.6], scale: [0.1, 0.1, 0.1] });
    // control-surface hinge lines on the wing trailing edge
    add(G.box, darkM, { pos: [s * 3.4, -0.15, 3.05], scale: [3.0, 0.02, 0.025] });
    add(G.box, darkM, { pos: [s * 2.7, -0.02, 1.0], scale: [0.025, 0.02, 3.0], rot: [0, 0, 0] });
    if (exotic) add(G.box, glowM, { pos: [s * 3.45, -0.17, -0.75], scale: [0.05, 0.06, 6.0], rot: [0, s * 0.83, 0] });
  }
  if (kind === "player" || kind === "ally") {
    const dm = new THREE.MeshStandardMaterial({ map: decalTex(), transparent: true, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    const rm = new THREE.MeshStandardMaterial({ map: roundelTex(), transparent: true, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 1.55, 1.58, 4.6); piv.rotation.z = -s * 0.42; root.add(piv);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), dm); d.position.x = s * 0.13; d.rotation.y = s * PI / 2; piv.add(d);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), rm); r.position.set(s * 3.6, -0.045, 1.9); r.rotation.x = -PI / 2; root.add(r);
    }
  }
  // central tail sting between the engines, gun port, antennas, weapons-bay seams, spine
  add(new THREE.CylinderGeometry(0.08, 0.2, 2.8, 8).rotateX(PI / 2), metalM, { pos: [0, 0.1, 6.0] });
  add(G.box, darkM, { pos: [-0.95, 0.22, -1.9], scale: [0.14, 0.12, 0.4] });
  add(new THREE.CylinderGeometry(0.018, 0.03, 1.0, 6).rotateX(PI / 2), metalM, { pos: [0, 0, -9.0] });
  for (const z of [0.9, 3.2]) add(G.box, darkM, { pos: [0, 0.62, z], scale: [0.05, 0.28, 0.5], rot: [0.2, 0, 0] });
  for (const s of [-1, 1]) add(G.box, darkM, { pos: [s * 0.52, -0.55, 0.9], scale: [0.04, 0.03, 2.8] });
  add(G.box, wingM, { pos: [0, 0.62, 1.6], scale: [1.1, 0.14, 2.0] });
  { brake = new THREE.Group(); brake.position.set(0, 0.7, 2.7); root.add(brake); const bp = new THREE.Mesh(G.box, ctlM); bp.scale.set(0.95, 0.07, 1.5); bp.position.z = 0.75; brake.add(bp); }
  // canopy: tinted glass bubble, frame, seat + pilot
  const canopy = new THREE.Group(); root.add(canopy);
  const cg = add(g.canopy, glassM, { pos: [0, 0.22, 0], parent: canopy });
  void cg;
  const bar = (px, py, pz, sx, sy, sz, rx = 0, rz = 0) => add(G.box, darkM, { pos: [px, py, pz], scale: [sx, sy, sz], rot: [rx, 0, rz], parent: canopy });
  bar(0, 0.84, -3.45, 1.0, 0.07, 0.07, 0.5);              // windscreen bow
  for (const s of [-1, 1]) { bar(s * 0.56, 0.77, -3.2, 0.06, 0.06, 2.4, 0, 0); bar(s * 0.3, 0.9, -4.0, 0.05, 0.05, 1.1, 0.5, -s * 0.5); }
  bar(0, 0.86, -1.5, 1.1, 0.06, 0.06);                      // rear arch
  bar(0, 1.04, -2.2, 0.05, 0.05, 2.4);                      // centre rail
  const pilot = new THREE.Group(); root.add(pilot);
  { const pl = createPilot(); pl.position.set(0, -0.12, -2.68); pilot.add(pl); pilot.userData.pl = pl; }   // b26: realistic flight-suit pilot
  // afterburners
  const burners = [];
  const bc = pal.burn;
  const flame = new THREE.Group(), core = new THREE.Group();
  for (const s of [-1, 1]) {
    const o = new THREE.Mesh(flameGeo, addMat(bc[0], 0.65)); o.position.set(s * 0.9, -0.02, 6.8); o.scale.set(1.0, 1.0, 5);
    const m = new THREE.Mesh(flameGeo, addMat(bc[1], 0.8)); m.position.copy(o.position); m.scale.set(0.75, 0.75, 3.4);
    const c = new THREE.Mesh(flameGeo, addMat(bc[2], 0.95)); c.position.copy(o.position); c.scale.set(0.42, 0.42, 2.0);
    for (const z of [0.2, 0.42, 0.64]) { const dmd = new THREE.Mesh(G.sphere, addMat(0xe8f6ff, 0.9)); dmd.scale.set(1.0 * (1 - z), 1.0 * (1 - z), 0.1); dmd.position.set(0, 0, z); c.add(dmd); }
    flame.add(o, m); core.add(c); burners.push(o, m, c);
  }
  root.add(flame, core);
  const glow = glowSprite(bc[0], 7, 0.9); glow.position.set(0, 0, 7.4); root.add(glow);
  const navL = new THREE.Object3D(), navR = new THREE.Object3D();
  // b21: wingtip anchors = the real outer tip of the wing mesh (same offset/mirroring as the wing meshes), used by the vapour trails
  { const pa = g.wing.attributes.position; let mx = 0; for (let i = 0; i < pa.count; i++) mx = Math.max(mx, Math.abs(pa.getX(i)));
    let n = 0, sy = 0, sz = 0, sx = 0; for (let i = 0; i < pa.count; i++) if (Math.abs(pa.getX(i)) > mx - 0.08) { n++; sx += Math.abs(pa.getX(i)); sy += pa.getY(i); sz += pa.getZ(i); }
    const tx = n ? sx / n : 5, ty = n ? sy / n : 0, tz = n ? sz / n : 1;
    navL.position.set(-tx, ty - 0.2, tz); navR.position.set(tx, ty - 0.2, tz); }
  root.add(navL, navR);
  // cockpit (first-person) extras
  const cockpit = new THREE.Group();
  const frameM = pbr({ color: 0x15181d, metalness: 0.7, roughness: 0.5 });
  const cbar = (px, py, pz, sx, sy, sz, rz = 0) => { const m = new THREE.Mesh(G.box, frameM); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.rotation.z = rz; cockpit.add(m); };
  // b30: centre glareshield block removed (it sat in the middle of the cockpit view)
  // b32: canopy side rails removed (the "iron bars")
  cockpit.visible = false; root.add(cockpit);

  // b26: gloved pilot hands (cockpit view): right on the stick, left on the throttle, eject handle between the knees
  const hands = (() => {
    const gHold = new THREE.Group(); gHold.position.set(0, 0, 0); cockpit.add(gHold);
    const cloth = pbr({ color: 0x4b5338, metalness: 0.0, roughness: 0.9 }), leather = pbr({ color: 0x1c1d1a, metalness: 0.0, roughness: 0.7 });
    const pad = pbr({ color: 0x2a2d25, metalness: 0.0, roughness: 0.6 }), metal = pbr({ color: 0x23272c, metalness: 0.85, roughness: 0.35 });
    const strap = pbr({ color: 0x8b8f7a, metalness: 0.0, roughness: 0.85 });
    cloth.side = leather.side = pad.side = strap.side = THREE.DoubleSide;
    const capG = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
    const gl = {};
    // one hand: back of hand + 4 fingers (3 joints) + thumb + cuff + forearm sleeve; fingers wrap towards -z around a vertical grip
    const makeHand = (mirror) => {
      const g = new THREE.Group(); if (mirror) g.scale.x = -1;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.15, 0.04), cloth); back.position.set(0, 0, 0.075); g.add(back);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.012), pad); plate.position.set(-0.012, 0.0, 0.098); g.add(plate);
      const fing = [];
      const lens = [0.052, 0.058, 0.05, 0.044];
      for (let i = 0; i < 4; i++) {
        const y = 0.054 - i * 0.036, k = new THREE.Group(); k.position.set(-0.05, y, 0.065); g.add(k);
        const knuck = new THREE.Mesh(G.sphereLo, pad); knuck.scale.setScalar(0.021); k.add(knuck);
        const segs = []; let par = k;
        const L = lens[i];
        for (let j = 0; j < 3; j++) {
          const sg = new THREE.Group(); par.add(sg);
          const cap = new THREE.Mesh(capG(0.0155 - j * 0.0012, L * (1 - j * 0.12)), j === 2 ? leather : cloth);
          cap.rotation.z = Math.PI / 2; cap.position.x = -L * (1 - j * 0.12) * 0.5 - 0.012; sg.add(cap);
          const nx = new THREE.Group(); nx.position.x = -L * (1 - j * 0.12) - 0.018; sg.add(nx);
          segs.push(sg); par = nx;
        }
        fing.push(segs);
      }
      const th = new THREE.Group(); th.position.set(0.045, 0.06, 0.085); g.add(th);
      const thSegs = [];
      let tp = th;
      for (let j = 0; j < 2; j++) { const sg = new THREE.Group(); tp.add(sg); const cap = new THREE.Mesh(capG(0.0185 - j * 0.002, 0.04), j ? leather : cloth); cap.rotation.x = Math.PI / 2; cap.position.z = -0.03; sg.add(cap); const nx = new THREE.Group(); nx.position.z = -0.062; sg.add(nx); thSegs.push(sg); tp = nx; }
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.07, 14), leather); cuff.rotation.x = Math.PI / 2 - 0.35; cuff.position.set(0.0, -0.075, 0.125); g.add(cuff);
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.018, 0.02), strap); sb.position.set(0, -0.082, 0.122); sb.rotation.x = -0.35; g.add(sb);
      const arm = new THREE.Mesh(capG(0.07, 0.5), cloth); arm.rotation.x = Math.PI / 2 - 0.5; arm.position.set(0.0, -0.22, 0.38); g.add(arm);
      return { g, fing, thSegs };
    };
    // stick (right hand)
    const stick = new THREE.Group(); stick.position.set(0.04, 0.25, 0.8); stick.scale.setScalar(1.4); cockpit.add(stick);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.34, 10), metal); bar.position.y = 0.17; stick.add(bar);
    const grip = new THREE.Mesh(capG(0.03, 0.12), leather); grip.position.y = 0.36; stick.add(grip);
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.07, 12), leather); boot.position.y = 0.03; stick.add(boot);
    const rh = makeHand(false); rh.g.position.set(0.0, 0.36, 0.0); rh.g.rotation.y = 0.0; stick.add(rh.g);
    // throttle (left hand)
    const thr = new THREE.Group(); thr.position.set(-0.66, 0.25, 0.8); thr.scale.setScalar(1.4); cockpit.add(thr);
    const tbar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.3, 10), metal); tbar.position.y = 0.15; thr.add(tbar);
    const tgrip = new THREE.Mesh(capG(0.034, 0.1), leather); tgrip.position.y = 0.33; thr.add(tgrip);
    const quad = new THREE.Mesh(G.box, metal); quad.position.set(0, 0.0, 0); quad.scale.set(0.12, 0.04, 0.5); cockpit.add(quad); quad.position.set(-0.66, 0.2, 0.8);
    const lh = makeHand(true); lh.g.position.set(0, 0.33, 0); thr.add(lh.g);
    // eject handle (black/yellow hazard ring)
    const ej = new THREE.Group(); ej.position.set(0.0, 0.3, 0.95); cockpit.add(ej);
    const hz = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 18), pbr({ color: 0xffc400, metalness: 0.2, roughness: 0.5 })); hz.rotation.x = Math.PI / 2 - 0.6; hz.scale.setScalar(2.2); ej.add(hz);
    const hz2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), pbr({ color: 0x111111, metalness: 0.2, roughness: 0.6 })); hz2.rotation.z = Math.PI / 2; hz2.position.set(0, 0.0, 0.03); ej.add(hz2);
    stick.visible = thr.visible = quad.visible = ej.visible = gHold.visible = false;   // b35: nothing mechanical over the sky in cockpit view
    const curl = (h, c, trig, k) => {
      for (let i = 0; i < 4; i++) { const base = c + (i === 0 ? trig * 0.35 : 0) + Math.sin(k * 1.7 + i) * 0.02; h.fing[i][0].rotation.y = -(0.62 + base * 0.5); h.fing[i][1].rotation.y = -(0.95 + base * 0.45); h.fing[i][2].rotation.y = -(0.8 + base * 0.35); }
      h.thSegs[0].rotation.set(0.1, 0.5 - c * 0.2, 0.0); h.thSegs[1].rotation.x = 0.35;
    };
    let tk = 0;
    return {
      stick, thr, rh, cockpit,
      /** st = {pitch, roll} in -1..1, thr 0..1, fire 0/1, eject 0..1 (0 = hand on stick, 1 = pulled the handle) */
      update(dt, st, thrK, fire, eject) {
        tk += dt;
        const e = eject * eject * (3 - 2 * eject);
        const sx = st.pitch * 0.32 + Math.sin(tk * 1.3) * 0.012, sz = -st.roll * 0.42 + Math.sin(tk * 0.9 + 1) * 0.012;
        stick.rotation.set(sx, 0, sz);
        thr.rotation.x = (0.5 - thrK) * 0.9 + 0.1 + Math.sin(tk * 1.1) * 0.01;
        curl(rh, 0.0, fire, tk); curl(lh, 0.05, 0, tk + 2);
        // eject: the right hand leaves the stick, drops to the handle between the knees and pulls up/back
        if (eject > 0.001) {
          stick.remove(rh.g); cockpit.add(rh.g);
          const pull = Math.max(0, (eject - 0.55) / 0.45);
          rh.g.scale.setScalar(1.4); rh.g.position.set(0.04 * (1 - e), 0.75 - e * 0.36 + pull * 0.12, 0.8 + e * 0.14 + pull * 0.16);
          rh.g.rotation.set(-0.5 * e, 0, 0);
          ej.position.set(0, 0.3 + pull * 0.12, 0.95 + pull * 0.16);
        } else { if (rh.g.parent !== stick) { cockpit.remove(rh.g); stick.add(rh.g); rh.g.position.set(0, 0.36, 0); rh.g.rotation.set(0, 0, 0); rh.g.scale.setScalar(1); } ej.position.set(0, 0.3, 0.95); }
      },
    };
  })();
  // b26: landing gear (nose + two mains with struts, wheels, doors); gearK 1 = down, 0 = stowed. Legs fold into the fuselage with a motor-like ease.
  const gear = new THREE.Group(); root.add(gear);
  const gm = pbr({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.3 }), tireM = pbr({ color: 0x0e0e10, metalness: 0.0, roughness: 0.85 }), hubM = pbr({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.25 }), doorM = pbr({ color: 0x555c63, metalness: 0.6, roughness: 0.4 });
  const legs = [];
  const mkLeg = (x, z, len, wheels, wr, foldZ) => {
    const piv = new THREE.Group(); piv.position.set(x, -0.55, z); gear.add(piv);
    add(G.cyl, gm, { pos: [0, -len / 2, 0], scale: [0.07, len, 0.07], parent: piv });
    add(G.cyl, doorM, { pos: [0, -len * 0.3, 0.1], scale: [0.045, len * 0.4, 0.045], rot: [0.3, 0, 0], parent: piv });   // scissor link
    for (let i = 0; i < wheels; i++) {
      const wx = (wheels === 2 ? (i ? 1 : -1) * wr * 0.75 : 0);
      add(G.cyl, tireM, { pos: [wx, -len, 0], rot: [0, 0, PI / 2], scale: [wr, wr * 0.55, wr], parent: piv });
      add(G.cyl, hubM, { pos: [wx + (wx < 0 ? -0.03 : 0.03), -len, 0], rot: [0, 0, PI / 2], scale: [wr * 0.55, wr * 0.6, wr * 0.55], parent: piv });
    }
    legs.push({ piv, x, foldZ });
    return piv;
  };
  mkLeg(0, -4.3, 1.55, 2, 0.34, -1);
  mkLeg(-1.85, 1.3, 1.6, 1, 0.5, 1); mkLeg(1.85, 1.3, 1.6, 1, 0.5, 1);
  const gdoor = [];
  for (const sd of [-1, 1]) { const d = add(G.box, doorM, { pos: [sd * 1.35, -0.62, 1.3], scale: [0.7, 0.04, 2.0], parent: gear }); gdoor.push([d, sd]); }
  let gearK = 1;
  gear.visible = true;
  const setGear = (k) => {
    gearK = k; gear.visible = k > 0.01;
    for (const lg of legs) {
      const e = k * k * (3 - 2 * k);
      if (lg.foldZ < 0) lg.piv.rotation.x = (1 - e) * 1.55;           // nose leg folds backwards
      else lg.piv.rotation.z = (lg.x < 0 ? -1 : 1) * (1 - e) * 1.5;   // mains fold into the fuselage
      lg.piv.scale.setScalar(0.55 + 0.45 * e);
    }
    for (const [d, sd] of gdoor) { d.rotation.z = sd * Math.sin(Math.min(1, (1 - k) * 2) * PI) * 0.9; d.visible = k > 0.02; }
  };
  const body0 = [];
  root.traverse((o) => { if (!o.isMesh) return; for (let q = o; q; q = q.parent) if (q === canopy || q === pilot || q === cockpit) return; body0.push(o); });
  const light = kind !== "player" ? null : new THREE.PointLight(0xff9a50, 0, 60);
  if (light) { light.position.set(0, 0, 8); root.add(light); }
  if (pal.tailless) for (const [sg] of stabs) sg.visible = false;
  root.userData = {
    flame, core, navL, navR, canopy, pilot, cockpit, hands, radius: lean ? 7 : 6, eye: new THREE.Vector3(0, 1.0, -2.4),
    burn(fl, boost) {
      const k = fl * (1 + boost * 0.9);
      for (let i = 0; i < burners.length; i += 3) {
        burners[i].scale.set(1.0, 1.0, 5 * k); burners[i + 1].scale.set(0.75, 0.75, 3.4 * k); burners[i + 2].scale.set(0.42, 0.42, 2.0 * k);
      }
      glow.scale.setScalar(3.4 + 1.8 * k); glow.material.opacity = 0.28 + 0.2 * Math.min(1.4, k);
      if (light) light.intensity = 0.8 + boost;
    },
    bodyMeshes: body0, setGear, gearK: () => gearK, gearLen: 2.15,
    ctl(c) {
      const L = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * 0.28; };
      for (const [o, sd] of stabs) L(o, "x", -c.pitch * 0.6 - sd * c.roll * 0.3);
      for (const [o, sd] of flps) L(o, "x", -sd * c.roll * 0.5 + c.flap * 0.5);
      for (const [o, sd] of ails) L(o, "x", -sd * c.roll * 0.8 + c.flap * 0.18 - (pal.tailless ? c.pitch * 0.55 : 0));   /* b38: elevons on tailless jets */
      for (const o of ruds) L(o, "y", -c.yaw * 0.5 + c.roll * 0.22);   // b35: coordinated rudder (right roll -> TE right)
      if (brake) L(brake, "x", -c.brake * 0.95);
      for (const o of petalsL) o.scale.setScalar(1 + c.burn * 0.16);
    },
  };
  return root;
}

export const HARDPOINTS = [[-4.3, -0.62, 1.2], [-2.5, -0.72, 0.8], [2.5, -0.72, 0.8], [4.3, -0.62, 1.2]];
export function createPlayerJet(vk = "viper", variant = null) {
  const j = buildJet("player", vk, variant);
  // four underwing pylons, each carrying a visible missile that disappears when it is launched
  const pyl = pbr({ color: 0x15181d, metalness: 0.7, roughness: 0.5 }), mis = pbr({ color: 0xffffff, map: missileTex(), bumpMap: missileTex(), bumpScale: 1.2, metalness: 0.3, roughness: 0.42, envMapIntensity: 0.9 });
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
  const hull = toonModel(new PartBuilder().add(hg, 0x6f7a88).build(), { outlineScale: 1.6, detail: { kind: "panel", s: 0.05, k: 0.85 } });
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
    const olive = ally ? 0x2f9a7e : 0x7f8e4b, dark = 0x34362f, sand = ally ? 0xe9f6ef : 0xb7a76a, camo = ally ? 0x1f7a60 : 0x5a6a38, steel = 0x6a6e66;
    const b = new PartBuilder();
    b.add(G.box, olive, { pos: [0, 0.95, 0.1], scale: [2.3, 0.7, 4.0] });                       // hull
    b.add(G.sphere, olive, { pos: [0, 0.95, -2.1], scale: [1.25, 0.5, 0.9] });                  // sloped glacis
    b.add(G.box, camo, { pos: [0.45, 1.32, 0.3], scale: [0.9, 0.05, 1.7] });                    // camo patches
    for (const s of [-1, 1]) {
      b.add(G.box, dark, { pos: [s * 1.38, 0.5, 0], scale: [0.62, 0.6, 4.5] });                 // track run
      b.add(G.box, olive, { pos: [s * 1.38, 0.95, 0], scale: [0.7, 0.14, 4.2] });               // side skirt / fender
      for (let i = -2; i <= 2; i++) b.add(G.sphereLo, steel, { pos: [s * 1.72, 0.55, i * 0.85], scale: [0.12, 0.42, 0.42] });   // road wheels
      b.add(G.sphereLo, steel, { pos: [s * 1.72, 0.7, 2.25], scale: [0.14, 0.34, 0.34] });
      b.add(G.sphereLo, steel, { pos: [s * 1.72, 0.7, -2.25], scale: [0.14, 0.34, 0.34] });
    }
    b.add(G.sphere, sand, { pos: [0, 1.75, 0.2], scale: [1.25, 0.58, 1.45] });                  // turret
    b.add(G.box, olive, { pos: [0, 1.7, 0.95], scale: [1.5, 0.5, 0.9] });                       // turret bustle
    b.add(G.sphere, dark, { pos: [0, 1.82, -0.8], scale: [0.5, 0.36, 0.4] });                   // gun mantlet
    b.add(G.capsule, olive, { pos: [0, 1.85, -2.5], rot: [PI / 2, 0, 0], scale: [0.15, 1.15, 0.15] });   // barrel
    b.add(G.cyl, dark, { pos: [0, 1.85, -3.85], rot: [PI / 2, 0, 0], scale: [0.24, 0.32, 0.24] });       // muzzle brake
    b.add(G.cyl, dark, { pos: [-0.45, 2.36, 0.55], scale: [0.3, 0.14, 0.3] });                  // commander hatch
    b.add(G.cyl, steel, { pos: [0.45, 2.3, 0.3], scale: [0.22, 0.1, 0.22] });                   // loader hatch
    b.add(G.cyl, dark, { pos: [-0.45, 2.55, 0.55], rot: [PI / 2, 0, 0], scale: [0.05, 0.4, 0.05] });     // machine gun
    b.add(G.cyl, dark, { pos: [1.05, 3.0, 1.15], scale: [0.03, 1.9, 0.03] });                   // antenna
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.add(G.cyl, dark, { pos: [s * 1.2, 1.9, -0.55 + i * 0.08], rot: [0, 0, PI / 2], scale: [0.07, 0.16, 0.07] });  // smoke launchers
    b.add(G.box, 0x4a4d3a, { pos: [-1.1, 1.45, 1.75], scale: [0.35, 0.3, 0.6] });               // stowage
    b.add(G.sphere, ally ? 0x3dff8b : 0xff4d3d, { pos: [0.45, 2.65, 0.9], scale: [0.14, 0.14, 0.14] });
    if (ally) b.add(G.box, 0x3dff8b, { pos: [0, 2.45, 0.3], scale: [0.9, 0.08, 0.9] });
    return b.build();
  });
  const g = tm(geo, {}, ally);
  if (ally) { const m = glowSprite(0x3dff8b, 11, 0.8); m.position.set(0, 3.6, 0); g.add(m); }
  g.scale.setScalar(3.2);
  g.userData.radius = 11;
  return g;
}

export function createJeep() {
  const geo = cached("jeep", () => {
    const olive = 0x6f7d43, dark = 0x24261f, tan = 0xa99b63;
    const b = new PartBuilder();
    b.add(G.box, olive, { pos: [0, 0.75, 0], scale: [1.5, 0.55, 3.3] });                 // hull
    b.add(G.box, olive, { pos: [0, 1.25, 0.6], scale: [1.35, 0.5, 1.1] });               // cab
    b.add(G.box, 0x1b2a30, { pos: [0, 1.45, -0.05], scale: [1.25, 0.28, 0.12] });        // windshield
    b.add(G.box, tan, { pos: [0, 1.2, 1.5], scale: [1.4, 0.3, 0.9] });                   // tarp load
    b.add(G.box, dark, { pos: [0, 1.7, 1.1], scale: [0.08, 0.5, 0.08] });                // gun post
    b.add(G.capsule, dark, { pos: [0, 2.0, 0.7], rot: [PI / 2, 0, 0], scale: [0.1, 0.55, 0.1] });
    for (const sx of [-1, 1]) for (const z of [-1.1, 1.2]) b.add(G.sphereLo, dark, { pos: [sx * 0.95, 0.42, z], scale: [0.22, 0.45, 0.45] });
    return b.build();
  });
  const g = tm(geo, {}, false);
  g.scale.setScalar(3.0);
  g.userData.radius = 8;
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
    const olive = 0x8a8f4e, white = 0xf4f4f0, red = 0xff4a3d, dark = 0x2a2c26, steel = 0x6a6e66;
    const b = new PartBuilder();
    b.add(G.box, olive, { pos: [0, 0.95, 0.4], scale: [1.9, 0.5, 4.2] });                      // truck chassis
    b.add(G.box, olive, { pos: [0, 1.5, -1.5], scale: [1.7, 0.9, 1.2] });                      // cab
    b.add(G.box, 0x1b2a30, { pos: [0, 1.65, -2.12], scale: [1.5, 0.4, 0.1] });                 // windscreen
    for (const sx of [-1, 1]) for (const z of [-1.5, 0.2, 1.8]) b.add(G.sphereLo, dark, { pos: [sx * 1.0, 0.55, z], scale: [0.26, 0.55, 0.55] });
    b.add(G.cyl, steel, { pos: [0, 1.35, 1.0], scale: [0.7, 0.3, 0.7] });                      // turntable
    b.add(G.box, olive, { pos: [0, 1.75, 1.0], scale: [1.6, 0.35, 1.6] });                     // elevating frame
    for (const x of [-0.55, 0.55]) for (const y of [0, 0.5]) {
      b.add(G.box, steel, { pos: [x, 2.1 + y, 0.2], rot: [-0.55, 0, 0], scale: [0.5, 0.5, 3.2] });          // canister
      b.add(G.sphere, white, { pos: [x, 2.1 + y + 1.0, -1.1], scale: [0.2, 0.2, 0.3] });                     // missile nose
      b.add(G.sphere, red, { pos: [x, 2.1 + y + 1.1, -1.45], scale: [0.14, 0.14, 0.18] });
    }
    b.add(G.cyl, dark, { pos: [0.9, 2.6, 2.0], scale: [0.05, 1.4, 0.05] });                    // radar mast
    b.add(G.sphere, white, { pos: [0.9, 3.4, 2.0], rot: [0.2, 0.6, 0], scale: [0.9, 0.9, 0.12] });          // radar dish
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
  const key = "rocket27" + color + tip;
  const geo = cached(key, () => {
    const b = new PartBuilder();
    b.add(G.capsule, color, { rot: [PI / 2, 0, 0], scale: [0.09, 0.8, 0.09] });
    b.add(G.cone, tip, { pos: [0, 0, -1.55], rot: [-PI / 2, 0, 0], scale: [0.09, 0.75, 0.09] });
    b.add(G.cyl, 0xc23a2e, { pos: [0, 0, -0.5], rot: [PI / 2, 0, 0], scale: [0.10, 0.12, 0.10] });
    for (const r of [0, PI / 2]) b.add(G.box, tip, { pos: [0, 0, 1.0], rot: [0, 0, r], scale: [0.64, 0.025, 0.45] });
    for (const r of [0, PI / 2]) b.add(G.box, tip, { pos: [0, 0, -0.55], rot: [0, 0, r], scale: [0.38, 0.025, 0.22] });
    b.add(G.cyl, 0x1a1c20, { pos: [0, 0, 1.32], rot: [PI / 2, 0, 0], scale: [0.085, 0.18, 0.085] });
    return b.build();
  });
  const g = toonModel(geo, { outlineScale: 0.5, detail: { kind: "panel", s: 1.6, k: 0.8 } });
  const exhaust = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending,
    vertexShader:"varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader:"varying vec2 vU; void main(){ float a=pow(1.-vU.y,1.7)*.8; gl_FragColor=vec4(mix(vec3(2.8,2.,.8),vec3(1.5,.28,.03),vU.y),a); }" });
  const fl = new THREE.Mesh(flameGeo, exhaust); fl.position.z = 1.32; fl.scale.set(.32,.32,3.0);
  const glw = glowSprite(0xffc070, 2.6, 0.9); glw.position.z = 1.8;
  g.add(fl, glw);
  g.scale.setScalar(1.4);
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
  const g = toonModel(geo, { outlineScale: 0.7, detail: { kind: "panel", s: 1.2, k: 0.8 } });
  g.scale.setScalar(1.8);
  return g;
}

// Puffy toon sphere geometry usable by InstancedMesh (with outline normals).
export function puffGeometry() {
  return cached("puff", () => new PartBuilder().add(G.sphereLo, 0xffffff).build());
}
export { toonMaterial };



/** b23: enemy warship (destroyer / frigate): long grey hull, bow gun, mast + radar, CIWS, missile cells, bow wake. */
export function createWarship() {
  const geo = cached("warship", () => {
    const hull = 0x6f7b88, deck = 0x59636f, light = 0xc9d0d8, dark = 0x23272e, red = 0x8f3a34;
    const b = new PartBuilder();
    b.add(G.sphere, hull, { pos: [0, 0.5, 0], scale: [2.5, 1.7, 13.5] });                       // hull
    b.add(G.sphere, hull, { pos: [0, 1.1, -10.6], scale: [0.95, 1.5, 4.2] });                   // raked bow
    b.add(G.sphere, red, { pos: [0, -0.35, 0], scale: [2.55, 0.5, 13.2] });                     // anti-fouling waterline
    b.add(G.box, deck, { pos: [0, 1.75, 0.5], scale: [2.9, 0.12, 15.5] });                      // main deck
    b.add(G.box, light, { pos: [0, 2.9, 1.6], scale: [2.3, 1.7, 4.4] });                        // superstructure
    b.add(G.box, light, { pos: [0, 4.3, 0.9], scale: [1.7, 1.2, 2.4] });                        // bridge
    b.add(G.box, dark, { pos: [0, 4.45, -0.38], scale: [1.75, 0.38, 0.18] });                   // bridge windows
    b.add(G.cyl, dark, { pos: [0, 6.6, 1.1], scale: [0.14, 3.2, 0.14] });                       // mast
    b.add(G.box, light, { pos: [0, 7.4, 1.1], scale: [1.9, 0.14, 0.1] });                       // yardarm
    b.add(G.box, dark, { pos: [0, 8.2, 1.1], scale: [1.5, 0.35, 0.12] });                       // radar
    b.add(G.cyl, dark, { pos: [0, 5.6, 3.1], scale: [0.55, 1.3, 0.55] });                       // funnel
    b.add(G.sphere, light, { pos: [0, 2.3, -6.6], scale: [1.15, 0.75, 1.5] });                  // main gun turret
    b.add(G.capsule, dark, { pos: [0, 2.4, -8.5], rot: [PI / 2, 0, 0], scale: [0.17, 1.4, 0.17] });
    b.add(G.sphere, light, { pos: [0, 2.1, -3.6], scale: [0.9, 0.5, 0.9] });                    // fwd missile cells
    for (const x of [-0.5, 0.5]) for (let i = 0; i < 3; i++) b.add(G.box, dark, { pos: [x, 2.0, -4.3 + i * 0.75], scale: [0.5, 0.06, 0.6] });
    b.add(G.sphere, 0xe8ecf0, { pos: [0, 3.3, 4.6], scale: [0.7, 0.8, 0.7] });                  // CIWS dome
    b.add(G.cyl, dark, { pos: [0, 2.0, 6.8], scale: [1.1, 0.08, 1.1] });                        // helipad
    b.add(G.sphere, light, { pos: [0, 2.35, 8.6], scale: [0.9, 0.6, 1.0] });                    // hangar
    b.add(G.sphere, light, { pos: [0, 2.2, 5.8], scale: [0.55, 0.4, 0.6] });                    // aft gun
    return b.build();
  });
  const g = tm(geo, {}, false);
  g.scale.setScalar(1.7);
  g.add(makeWake(1));
  g.userData.radius = 24;
  return g;
}

/** b23: submarine: black hull, sail, periscope. Surfaces and dives (handled in game.js). */
export function createSub() {
  const geo = cached("sub", () => {
    const hull = 0x2b333d, dark = 0x1a1e24, steel = 0x59616c;
    const b = new PartBuilder();
    b.add(G.capsule, hull, { pos: [0, 0.3, 0], rot: [PI / 2, 0, 0], scale: [1.6, 5.4, 1.6] });  // pressure hull
    b.add(G.sphere, dark, { pos: [0, 0.75, 0], scale: [1.35, 0.35, 8.0] });                     // casing
    b.add(G.sphere, hull, { pos: [0, 1.8, -0.8], scale: [0.78, 1.15, 2.0] });                   // sail
    b.add(G.box, dark, { pos: [0, 1.9, -2.6], scale: [0.5, 0.16, 0.12] });
    b.add(G.cyl, steel, { pos: [0, 3.2, -0.5], scale: [0.07, 1.4, 0.07] });                     // periscope
    b.add(G.cyl, steel, { pos: [0.2, 3.0, -0.2], scale: [0.05, 1.0, 0.05] });                   // mast
    b.add(G.box, dark, { pos: [0, 1.95, -0.6], scale: [2.6, 0.07, 0.6] });                      // sail planes
    b.add(G.box, dark, { pos: [0, 0.55, 7.6], scale: [3.4, 0.08, 0.9] });                       // stern planes
    b.add(G.box, dark, { pos: [0, 1.2, 7.8], scale: [0.08, 1.6, 0.9] });                        // rudder
    return b.build();
  });
  const g = tm(geo, {}, false);
  g.scale.setScalar(1.6);
  g.add(makeWake(0.55));
  g.userData.radius = 14;
  return g;
}

/** flat white V wake trailing behind a ship (model forward = -z, so the wake streams toward +z) */
function makeWake(k = 1) {
  const key = "wake" + k;
  if (!geoCache[key]) {
    const c = document.createElement("canvas"); c.width = 128; c.height = 256;
    const x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.35, "rgba(235,248,255,0.5)"); gr.addColorStop(1, "rgba(235,248,255,0)");
    x.fillStyle = gr; x.beginPath(); x.moveTo(52, 0); x.lineTo(76, 0); x.lineTo(124, 256); x.lineTo(4, 256); x.closePath(); x.fill();
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`; x.beginPath(); x.arc(64 + (Math.random() - 0.5) * (20 + i * 0.9), Math.random() * 256, 1 + Math.random() * 3, 0, 7); x.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    geoCache[key] = tex;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: geoCache[key], transparent: true, depthWrite: false, fog: true }));
  m.rotation.x = -Math.PI / 2; m.scale.set(9 * k, 40 * k, 1); m.position.set(0, 0.35, 21 * k); m.renderOrder = 3; m.name = "wake";
  return m;
}

// ---------- b26: attack helicopter (enemy = dark charcoal + red glow, ally = olive + green glow). Nose points -Z. userData.rotor / tail spin each frame. ----------
export function createHeli(ally = false) {
  const root = new THREE.Group();
  const body = ally ? 0x34402f : 0x24282c, belly = ally ? 0x1d2619 : 0x15181b, trim = ally ? 0x5a6b50 : 0x3c424a;
  const glow = ally ? 0x3dff8b : 0xff4030;
  const mB = pbr({ color: body, metalness: 0.55, roughness: 0.38, envMapIntensity: 1.0, emissive: 0x0a0d10, emissiveIntensity: 0.4 }, { kind: "panel", s: 0.3, k: 0.5 });
  const mD = pbr({ color: belly, metalness: 0.6, roughness: 0.5 });
  const mT = pbr({ color: trim, metalness: 0.7, roughness: 0.4 });
  const mG = pbr({ color: 0x151a22, metalness: 1, roughness: 0.06, envMapIntensity: 2.2, transparent: true, opacity: 0.92 });
  const mR = pbr({ color: 0x0c0d0e, metalness: 0.4, roughness: 0.6 });
  const add = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); if (o.pos) m.position.set(...o.pos); if (o.rot) m.rotation.set(...o.rot); if (o.scale) m.scale.set(...o.scale); (o.parent || root).add(m); return m; };
  add(G.capsule, mB, { pos: [0, 0, -0.5], rot: [PI / 2, 0, 0], scale: [0.95, 1.5, 0.95] });                    // fuselage (long, narrow, tandem cockpit)
  add(G.sphere, mD, { pos: [0, -0.55, 0.3], scale: [0.9, 0.55, 3.3] });                                        // belly
  add(G.sphere, mG, { pos: [0, 0.55, -3.0], scale: [0.75, 0.62, 1.5] });                                       // front canopy
  add(G.sphere, mG, { pos: [0, 0.95, -1.1], scale: [0.7, 0.58, 1.3] });                                        // rear canopy (raised)
  add(G.box, mT, { pos: [0, -0.2, -4.4], scale: [0.55, 0.45, 0.9] });                                          // chin sensor
  add(G.sphere, mR, { pos: [0, -0.5, -4.95], scale: [0.3, 0.3, 0.3] });
  add(G.cyl, mD, { pos: [0, -0.95, -3.5], rot: [PI / 2, 0, 0], scale: [0.09, 1.1, 0.09] });                    // chin gun
  for (const s of [-1, 1]) {
    add(G.box, mB, { pos: [s * 2.0, -0.05, 0.1], scale: [3.0, 0.16, 1.1] });                                   // stub wings
    add(G.cyl, mT, { pos: [s * 2.9, -0.35, -0.2], rot: [PI / 2, 0, 0], scale: [0.42, 1.7, 0.42] });            // rocket pods
    add(G.cone, mD, { pos: [s * 2.9, -0.35, -1.25], rot: [-PI / 2, 0, 0], scale: [0.42, 0.5, 0.42] });
    add(G.cyl, mT, { pos: [s * 1.35, -0.35, -0.2], rot: [PI / 2, 0, 0], scale: [0.16, 2.0, 0.16] });           // missiles
    add(G.sphere, mD, { pos: [s * 0.95, 0.55, 1.2], scale: [0.55, 0.5, 1.2] });                                // engine nacelles
    add(G.cyl, mR, { pos: [s * 0.95, 0.55, 2.35], rot: [PI / 2, 0, 0], scale: [0.36, 0.2, 0.36] });            // exhausts
    add(G.sphereLo, new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff2a2a : 0x33ff66, toneMapped: false, fog: false }), { pos: [s * 4.55, -0.05, 0.1], scale: [0.14, 0.14, 0.14] });   // nav lights
    add(G.cyl, mD, { pos: [s * 0.8, -1.2, -1.6], scale: [0.07, 0.8, 0.07] });                                  // landing struts
    add(G.sphereLo, mR, { pos: [s * 0.8, -1.65, -1.6], scale: [0.26, 0.26, 0.26] });
  }
  add(G.sphereLo, mR, { pos: [0, -1.5, 3.4], scale: [0.22, 0.22, 0.22] });
  // tail boom, fin, stabiliser
  add(G.cone, mB, { pos: [0, 0.35, 6.2], rot: [-PI / 2, 0, 0], scale: [0.55, 7.2, 0.55] });
  add(G.box, mB, { pos: [0, 1.5, 9.4], rot: [0.0, 0, 0], scale: [0.14, 2.3, 1.7] });
  add(G.box, mB, { pos: [0, 0.65, 8.4], scale: [3.1, 0.1, 1.0] });
  const tail = new THREE.Group(); tail.position.set(0.28, 1.65, 9.75); root.add(tail);
  for (let i = 0; i < 4; i++) { const b = add(G.box, mR, { pos: [0, 0.55, 0], scale: [0.05, 1.0, 0.18], parent: tail }); b.rotation.x = (i * PI) / 2; b.position.set(0, Math.cos(i * PI / 2) * 0.55, Math.sin(i * PI / 2) * 0.55); }
  // main rotor
  add(G.cyl, mD, { pos: [0, 1.55, 0.2], scale: [0.26, 0.7, 0.26] });
  const rotor = new THREE.Group(); rotor.position.set(0, 1.95, 0.2); root.add(rotor);
  add(G.cyl, mT, { pos: [0, 0, 0], scale: [0.42, 0.22, 0.42], parent: rotor });
  for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.y = (i * PI) / 2; rotor.add(arm); add(G.box, mR, { pos: [0, 0, 4.4], scale: [0.5, 0.05, 8.0], parent: arm }); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(8.6, 36).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0x20262c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  disc.position.y = 0.02; rotor.add(disc);
  // glow marks (enemy red / ally green)
  const gl = glowSprite(glow, 16, ally ? 0.8 : 0.55); gl.position.set(0, 3.8, 0); root.add(gl);
  const beacon = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: glow, fog: false })); beacon.position.set(0, 2.6, 0.2); beacon.scale.setScalar(0.3); root.add(beacon);
  root.scale.setScalar(1.7);
  root.userData = { rotor, tail, beacon, radius: 15, heli: true, disc };
  return root;
}

// ---------- b26: pilot in a realistic army flight uniform + ejection seat + parachute ----------
// Pilot faces -Z, seated. Olive nomex flight suit, tan G-suit trousers, black harness straps, white-grey helmet with dark gold visor,
// oxygen mask + hose, leather gloves, boots. userData.hands = [left, right] glove groups (fingers curled).
export function createPilot() {
  const g = new THREE.Group();
  const suit = pbr({ color: 0x4b5a3b, metalness: 0.0, roughness: 0.85, envMapIntensity: 0.25 });
  const gsuit = pbr({ color: 0x7c7254, metalness: 0.0, roughness: 0.9, envMapIntensity: 0.2 });
  const strap = pbr({ color: 0x15171a, metalness: 0.2, roughness: 0.7 });
  const glove = pbr({ color: 0x2c2218, metalness: 0.0, roughness: 0.65 });
  const boot = pbr({ color: 0x121110, metalness: 0.1, roughness: 0.5 });
  const helm = pbr({ color: 0xd6d9dc, metalness: 0.25, roughness: 0.3, envMapIntensity: 1.2 });
  const visor = pbr({ color: 0x5a4412, metalness: 1.0, roughness: 0.05, envMapIntensity: 2.4 });
  const mask = pbr({ color: 0x1a1d20, metalness: 0.2, roughness: 0.6 });
  const vest = pbr({ color: 0xd9732a, metalness: 0.0, roughness: 0.7 });
  const add = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); if (o.pos) m.position.set(...o.pos); if (o.rot) m.rotation.set(...o.rot); if (o.scale) m.scale.set(...o.scale); (o.parent || g).add(m); return m; };
  add(G.capsule, suit, { pos: [0, 0.62, 0.05], scale: [0.2, 0.17, 0.12] });                       // torso
  add(G.box, vest, { pos: [0, 0.74, -0.08], scale: [0.36, 0.1, 0.05] });                           // survival vest chest pocket
  for (const s of [-1, 1]) {
    add(G.box, strap, { pos: [s * 0.12, 0.62, -0.1], rot: [0.1, 0, s * 0.12], scale: [0.04, 0.5, 0.02] });  // harness
    add(G.capsule, gsuit, { pos: [s * 0.11, 0.28, -0.22], rot: [PI / 2 - 0.2, 0, 0], scale: [0.09, 0.1, 0.09] });   // thigh
    add(G.capsule, gsuit, { pos: [s * 0.11, 0.06, -0.5], rot: [0.1, 0, 0], scale: [0.075, 0.1, 0.075] });          // shin
    add(G.box, boot, { pos: [s * 0.11, -0.2, -0.6], scale: [0.11, 0.1, 0.26] });                                  // boots
    add(G.capsule, suit, { pos: [s * 0.27, 0.66, -0.08], rot: [PI / 2 - 0.55, 0, s * 0.3], scale: [0.065, 0.12, 0.065] });   // upper arm
    add(G.capsule, suit, { pos: [s * 0.3, 0.55, -0.34], rot: [PI / 2 - 0.2, 0, s * 0.1], scale: [0.058, 0.11, 0.058] });     // forearm
    add(G.sphere, glove, { pos: [s * 0.3, 0.53, -0.5], scale: [0.065, 0.055, 0.075] });                                       // glove
  }
  const hd = new THREE.Group(); hd.position.set(0, 0.98, -0.04); g.add(hd);
  add(G.sphere, helm, { pos: [0, 0.04, 0], scale: [0.15, 0.17, 0.18], parent: hd });                // helmet shell
  add(G.sphere, visor, { pos: [0, 0.02, -0.07], scale: [0.14, 0.1, 0.11], parent: hd });            // dark gold visor
  add(G.box, mask, { pos: [0, -0.07, -0.12], scale: [0.1, 0.07, 0.07], parent: hd });                // oxygen mask
  add(G.cyl, mask, { pos: [0.1, -0.12, -0.1], rot: [0.4, 0, 1.2], scale: [0.015, 0.2, 0.015], parent: hd });   // hose
  add(G.cyl, helm, { pos: [0, -0.1, 0.05], scale: [0.1, 0.08, 0.1], parent: hd });                   // neck ring
  g.userData = { head: hd };
  return g;
}
/** ejection seat (Martin-Baker style): back pan, headbox, rocket pack + drogue. */
export function createSeat() {
  const g = new THREE.Group();
  const m = pbr({ color: 0x2a2d31, metalness: 0.7, roughness: 0.45 });
  const y = pbr({ color: 0xe8c320, metalness: 0.2, roughness: 0.5 });
  const add = (geo, mat, o = {}) => { const q = new THREE.Mesh(geo, mat); if (o.pos) q.position.set(...o.pos); if (o.rot) q.rotation.set(...o.rot); if (o.scale) q.scale.set(...o.scale); g.add(q); return q; };
  add(G.box, m, { pos: [0, 0.5, 0.2], scale: [0.5, 0.95, 0.12] });
  add(G.box, m, { pos: [0, 0.2, -0.1], scale: [0.5, 0.1, 0.5] });
  add(G.box, y, { pos: [0, 1.15, 0.2], scale: [0.3, 0.2, 0.14] });
  add(G.cyl, m, { pos: [0, 0.2, 0.34], scale: [0.1, 0.8, 0.1] });
  return g;
}
export function createChute() {
  const g = new THREE.Group();
  const cols = [0x5a6b3e, 0xe8e2cf];   // olive drab + off-white panels
  const N = 12, R = 5.6, H = 2.7;
  const mats = cols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5, emissive: c, emissiveIntensity: 0.06 }));
  for (let i = 0; i < N; i++) {
    const geo = new THREE.SphereGeometry(R, 6, 8, (i / N) * PI * 2, PI * 2 / N, 0, PI * 0.43);
    const m = new THREE.Mesh(geo, mats[i % 2]); m.scale.y = H / R; g.add(m);
  }
  const pts = [], top = Math.cos(PI * 0.43) * R * (H / R) * 0 + 0;
  const lineM = new THREE.LineBasicMaterial({ color: 0xdedbd0, transparent: true, opacity: 0.8 });
  const base = R * Math.sin(PI * 0.43), by = R * Math.cos(PI * 0.43) * (H / R);
  for (let i = 0; i < N; i++) { const a = (i / N) * PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * base, by, Math.sin(a) * base), new THREE.Vector3(0, -7.0, 0)); }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineM); lines.frustumCulled = false; g.add(lines);
  g.userData = { lines };
  return g;
}

// ---------- b26: military airstrip (runway with markings + lights, tower, hangars, windsock). Local +Z end = takeoff start, jets roll toward -Z. ----------
export const STRIP = { len: 1500, w: 64 };
export function createAirstrip() {
  const g = new THREE.Group();
  const L = STRIP.len, W = STRIP.w;
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 2048; const x = cv.getContext("2d");
  x.fillStyle = "#3b3d41"; x.fillRect(0, 0, 256, 2048);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},.035)`; x.fillRect(Math.random() * 256, Math.random() * 2048, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  for (let i = 0; i < 18; i++) { x.fillStyle = "rgba(10,10,12,.18)"; x.fillRect(100 + Math.random() * 56, Math.random() * 2048, 4 + Math.random() * 10, 30 + Math.random() * 120); }   // tyre rubber
  x.fillStyle = "#e9e9e4";
  x.fillRect(6, 0, 4, 2048); x.fillRect(246, 0, 4, 2048);                                   // edge lines
  for (let y = 190; y < 2048 - 190; y += 70) x.fillRect(125, y, 6, 36);                        // centre dashes
  for (const base of [14, 2048 - 14 - 130]) for (let i = 0; i < 8; i++) { x.fillRect(24 + i * 26, base, 12, 120); }   // threshold bars
  x.save(); x.font = "bold 74px 'Arial Narrow', Arial"; x.textAlign = "center";
  x.translate(128, 330); x.scale(1, -1); x.rotate(Math.PI); x.fillText("27", 0, 0); x.restore();
  x.save(); x.font = "bold 74px 'Arial Narrow', Arial"; x.textAlign = "center"; x.translate(128, 2048 - 330); x.fillText("09", 0, 0); x.restore();
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0.02, envMapIntensity: 0.3 }));
  road.position.y = 0.12; g.add(road);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + 26, 80, L + 60), new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1 })); skirt.position.y = -40.05; g.add(skirt);
  // lights
  const n = Math.floor(L / 30);
  const edge = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.3, 1.6), fog: false }), n * 2);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) for (const sd of [-1, 1]) { m4.setPosition(sd * (W / 2 + 1.2), 0.5, -L / 2 + i * 30 + 15); edge.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), m4); }
  g.add(edge);
  const thr = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 0.5), fog: false }), 24);
  const thr2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.25, 0.2), fog: false }), 12);
  for (let i = 0; i < 12; i++) { m4.setPosition(-W / 2 + i * (W / 11), 0.5, L / 2 + 1); thr.setMatrixAt(i, m4); m4.setPosition(-W / 2 + i * (W / 11), 0.5, -L / 2 - 1); thr2.setMatrixAt(i, m4); }
  for (let i = 0; i < 12; i++) { m4.setPosition(-W / 2 + i * (W / 11), 0.5, -L / 2 - 1); thr.setMatrixAt(12 + i, m4); }
  g.add(thr, thr2);
  const strobes = [];
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), fog: false })); m.position.set(0, 1.4, L / 2 + 30 + i * 45); g.add(m); strobes.push(m); }
  // base buildings
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa9a699, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 0.85 }), glass = new THREE.MeshStandardMaterial({ color: 0x1b2b3a, roughness: 0.1, metalness: 0.8, emissive: 0x1e5a7a, emissiveIntensity: 0.4 });
  const bx = (mat, sx, sy, sz, px, py, pz, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(px, py, pz); parent.add(m); return m; };
  const sideX = W / 2 + 90;
  bx(concrete, 70, 3, 220, sideX, 0.3, L * 0.18);                                 // apron
  bx(concrete, 12, 26, 12, sideX + 40, 13, L * 0.05); bx(glass, 16, 6, 16, sideX + 40, 29, L * 0.05); bx(dark, 18, 1.2, 18, sideX + 40, 32.4, L * 0.05);   // tower
  for (let i = 0; i < 3; i++) { const h = bx(dark, 42, 13, 52, sideX + 12, 6.5, L * 0.14 + i * 62); bx(concrete, 44, 1, 54, sideX + 12, 13.4, L * 0.14 + i * 62); }
  for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 14), concrete); t.position.set(sideX + 55, 6, L * 0.3 + i * 24); g.add(t); }
  const pole = bx(concrete, 0.5, 9, 0.5, -W / 2 - 24, 4.5, L * 0.3);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1f, side: THREE.DoubleSide })); sock.rotation.z = -Math.PI / 2 + 0.25; sock.position.set(-W / 2 - 21.5, 9, L * 0.3); g.add(sock);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 0.8), fog: false })); beacon.position.set(sideX + 40, 35, L * 0.05); g.add(beacon);
  g.userData = { radius: 900, strobes, beacon };
  return g;
}
