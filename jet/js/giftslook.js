// Hard-edged glass gifts. No halo, no outline, no letters.
// Medical = red cube, fuel = green ball, shield = blue ball, MOAB = orange ball,
// money = translucent bag. Symbols sit in the glass.
import * as THREE from "three";

const COL = {
  health: 0xff2a2a, fuel: 0x2dff62, shield: 0x3aa6ff, moab: 0xff8a14,
  missile: 0xd8e8ff, bomb: 0xff7a18, cash: 0xffd35a, life: 0xe7eef6,
};

const geo = {};
function shared(name, build) { return geo[name] || (geo[name] = build()); }

let symbolCache = {};
function symbolTex(kind) {
  if (symbolCache[kind]) return symbolCache[kind];
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 256, 256);
  x.fillStyle = "#ffffff";
  x.strokeStyle = "#ffffff";
  x.lineJoin = "miter";
  x.lineCap = "butt";
  if (kind === "health" || kind === "fuel") {
    x.fillRect(108, 28, 40, 200);
    x.fillRect(28, 108, 200, 40);
  } else if (kind === "moab") {
    x.save();
    x.translate(128, 132);
    x.beginPath();
    x.arc(0, 0, 18, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 3; i++) {
      x.rotate((Math.PI * 2) / 3);
      x.beginPath();
      x.moveTo(-16, -22);
      x.arc(0, -8, 62, Math.PI * 1.16, Math.PI * 1.84);
      x.closePath();
      x.fill();
    }
    x.restore();
  } else if (kind === "missile") {
    x.beginPath();
    x.moveTo(128, 22);
    x.lineTo(162, 96);
    x.lineTo(144, 96);
    x.lineTo(144, 168);
    x.lineTo(176, 206);
    x.lineTo(128, 178);
    x.lineTo(80, 206);
    x.lineTo(112, 168);
    x.lineTo(112, 96);
    x.lineTo(94, 96);
    x.closePath();
    x.fill();
  } else if (kind === "bomb") {
    x.beginPath();
    x.ellipse(128, 148, 48, 62, 0, 0, Math.PI * 2);
    x.fill();
    x.fillRect(118, 72, 20, 30);
    x.fillRect(104, 64, 48, 12);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  symbolCache[kind] = tex;
  return tex;
}

let shadowTex = null;
function softShadowTex() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}

function glassMat(col, opacity) {
  const m = new THREE.MeshPhysicalMaterial({
    color: col,
    metalness: 0.04,
    roughness: 0.16,
    transparent: true,
    opacity,
    emissive: col,
    emissiveIntensity: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    flatShading: true,
    fog: false,
    depthWrite: false,
  });
  m.userData.own = 1;
  m.userData.baseOp = opacity;
  return m;
}

function markMat(tex, opacity = 0.92) {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: false });
  m.userData.own = 1;
  m.userData.baseOp = opacity;
  return m;
}

function addShadow(g, y, s) {
  const m = new THREE.Mesh(
    shared("shadow", () => new THREE.PlaneGeometry(1, 1)),
    new THREE.MeshBasicMaterial({ map: softShadowTex(), transparent: true, opacity: 0.38, depthWrite: false, fog: false }),
  );
  m.material.userData.own = 1;
  m.material.userData.baseOp = 0.38;
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.scale.set(s, s, 1);
  m.frustumCulled = false;
  g.add(m);
}

function addShine(g, x, y, z, s) {
  const m = new THREE.Mesh(
    shared("shine", () => new THREE.SphereGeometry(1, 10, 8)),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false, fog: false }),
  );
  m.material.userData.own = 1;
  m.material.userData.baseOp = 0.72;
  m.position.set(x, y, z);
  m.scale.set(s, s * 0.62, s * 0.45);
  m.frustumCulled = false;
  g.add(m);
}

function addMark(g, kind, z, s) {
  if (kind === "shield" || kind === "cash" || kind === "life") return;
  const m = new THREE.Mesh(shared("mark", () => new THREE.PlaneGeometry(1, 1)), markMat(symbolTex(kind)));
  m.position.z = z;
  m.scale.set(s, s, 1);
  m.frustumCulled = false;
  g.add(m);
}

/** Glass gift. `opt.color` overrides the type colour (money tiers). */
export function createGiftObject(kind, opt = {}) {
  const col = opt.color != null ? opt.color : (COL[kind] || 0xfff2c4);
  const opacity = kind === "cash" ? 0.5 : 0.6;
  const g = new THREE.Group();
  g.frustumCulled = false;
  let shell;
  if (kind === "health") {
    shell = new THREE.Mesh(shared("cube", () => new THREE.BoxGeometry(26, 26, 26)), glassMat(col, opacity));
    g.add(shell);
    addMark(g, kind, 13.2, 18);
    addShine(g, -6, 8, 12, 4.2);
    addShadow(g, -18, 40);
  } else if (kind === "cash") {
    shell = new THREE.Mesh(shared("bag", () => new THREE.SphereGeometry(13, 12, 10)), glassMat(col, opacity));
    shell.scale.set(1.05, 1.28, 0.82);
    g.add(shell);
    const neck = new THREE.Mesh(shared("neck", () => new THREE.CylinderGeometry(3.1, 4.6, 5.5, 8)), glassMat(col, Math.min(0.62, opacity + 0.08)));
    neck.position.y = 15.5;
    g.add(neck);
    const tie = new THREE.Mesh(shared("tie", () => new THREE.BoxGeometry(7, 1.6, 5)), glassMat(0xfff6d0, 0.7));
    tie.position.y = 18.2;
    g.add(tie);
    addShine(g, -4, 8, 9, 3.4);
    addShadow(g, -16, 36);
  } else if (kind === "life") {
    const body = glassMat(col, 0.6);
    shell = new THREE.Mesh(shared("lifeBody", () => new THREE.BoxGeometry(6, 4, 22)), body);
    g.add(shell);
    const wing = new THREE.Mesh(shared("lifeWing", () => new THREE.BoxGeometry(22, 1.2, 7)), glassMat(col, 0.6));
    wing.position.set(0, -0.4, 1);
    g.add(wing);
    const tail = new THREE.Mesh(shared("lifeTail", () => new THREE.BoxGeometry(8, 1, 3.2)), glassMat(col, 0.6));
    tail.position.set(0, 0.2, 9);
    g.add(tail);
    const fin = new THREE.Mesh(shared("lifeFin", () => new THREE.BoxGeometry(1.1, 5, 3.4)), glassMat(col, 0.6));
    fin.position.set(0, 2.2, 8.2);
    g.add(fin);
    addShine(g, -2, 2.2, 4, 1.6);
    addShadow(g, -6, 28);
  } else {
    shell = new THREE.Mesh(shared("ball", () => new THREE.SphereGeometry(15, 16, 12)), glassMat(col, opacity));
    g.add(shell);
    addMark(g, kind, 8.2, 16);
    addShine(g, -5, 7, 10, 4);
    addShadow(g, -18, 42);
  }
  g.userData.shell = shell;
  g.userData.col = col;
  g.traverse((o) => { o.frustumCulled = false; });
  // ~80% of the jet's length (airframe is about 16 units; the raw glass is ~26).
  if (kind !== "life") g.scale.setScalar(0.5);
  return g;
}

export const GIFT_PREVIEW = ["health", "fuel", "shield", "moab", "missile", "bomb", "cash", "life"];
