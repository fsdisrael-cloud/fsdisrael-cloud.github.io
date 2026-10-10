// Ubu-style models: round, soft, chunky, vertex-coloured, thick outlines.
// Forward is -Z, up is +Y. Every model = 2 draw calls (toon body + outline).
import * as THREE from "three";
import { PartBuilder, toonModel, G, toonMaterial } from "./toon.js?v=5";

const PI = Math.PI;
export const JET_COLORS = {
  sky: { body: 0x45b4ff, accent: 0xffd23f, name: "Sky" },
  bubblegum: { body: 0xff7eb9, accent: 0x7cf2ff, name: "Bubblegum" },
  sunny: { body: 0xffc93c, accent: 0xff5e5b, name: "Sunny" },
  mint: { body: 0x3fe0a5, accent: 0xff8a3d, name: "Mint" },
  grape: { body: 0xa67cff, accent: 0xffe14d, name: "Grape" },
  tomato: { body: 0xff6040, accent: 0xffffff, name: "Tomato" },
};

export function createPlayerJet(colorKey = "sky") {
  const pal = JET_COLORS[colorKey] || JET_COLORS.sky;
  const body = pal.body, acc = pal.accent, white = 0xf4f6fa, dark = 0x2d3440, metal = 0x6d7685;
  const b = new PartBuilder();
  b.add(G.capsule, body, { rot: [PI / 2, 0, 0], scale: [1.05, 2.3, 0.95] });
  b.add(G.sphere, white, { pos: [0, -0.05, -4.4], scale: [0.78, 0.72, 1.5] });
  b.add(G.sphere, acc, { pos: [0, -0.05, -5.7], scale: [0.28, 0.28, 0.4] }); // nose bump
  b.add(G.sphere, white, { pos: [0, -0.5, 0.2], scale: [0.85, 0.5, 3.2] });
  for (const s of [-1, 1]) {
    b.add(G.sphere, body, { pos: [s * 2.9, -0.25, 0.7], rot: [0, s * -0.38, s * -0.04], scale: [3.5, 0.22, 1.55] });
    b.add(G.sphere, acc, { pos: [s * 5.9, -0.2, 2.0], scale: [0.34, 0.34, 1.15] });
    b.add(G.sphere, acc, { pos: [s * 0.82, 1.15, 3.55], rot: [0.35, 0, s * -0.32], scale: [0.15, 1.35, 1.0] });
    b.add(G.sphere, body, { pos: [s * 1.75, -0.12, 3.95], rot: [0, s * -0.3, 0], scale: [1.55, 0.15, 0.7] });
    b.add(G.sphere, dark, { pos: [s * 1.02, -0.32, -0.9], scale: [0.48, 0.55, 1.25] });
    // rockets on pylons
    b.add(G.capsule, white, { pos: [s * 2.6, -0.72, 0.6], rot: [PI / 2, 0, 0], scale: [0.17, 0.42, 0.17] });
    b.add(G.sphere, 0xff4a3d, { pos: [s * 2.6, -0.72, -0.75], scale: [0.17, 0.17, 0.25] });
  }
  b.add(G.sphere, 0x4f5a3a, { pos: [0, -1.12, 0.5], scale: [0.36, 0.36, 0.95] }); // bomb
  b.add(G.cyl, metal, { pos: [0, 0, 4.85], rot: [PI / 2, 0, 0], scale: [0.78, 0.8, 0.78] });
  b.add(G.torus, dark, { pos: [0, 0, 5.25], scale: [0.66, 0.66, 0.9] });
  const jet = toonModel(b.build());

  // canopy + pilot as separate meshes (hidden in cockpit view)
  const cb = new PartBuilder();
  cb.add(G.sphere, 0x22405e, { pos: [0, 0.78, -2.05], scale: [0.62, 0.56, 1.55] });
  cb.add(G.sphere, 0xbfe9ff, { pos: [0.22, 1.12, -2.55], scale: [0.14, 0.07, 0.45] });
  const canopy = toonModel(cb.build());
  const pb = new PartBuilder();
  pb.add(G.sphere, white, { pos: [0, 0.98, -1.75], scale: [0.3, 0.32, 0.3] });
  pb.add(G.sphere, 0x1b1b1b, { pos: [0, 1.0, -1.98], scale: [0.24, 0.14, 0.12] });
  const pilot = toonModel(pb.build(), { outlineScale: 0.5 });
  const root = new THREE.Group();
  root.add(jet, pilot, canopy);

  // afterburner flame (additive, no outline)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(G.cone, flameMat);
  flame.rotation.x = -PI / 2; // tip points +Z
  flame.position.set(0, 0, 6.2);
  flame.scale.set(0.55, 1.8, 0.55);
  root.add(flame);
  const core = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.rotation.x = -PI / 2; core.position.set(0, 0, 5.8); core.scale.set(0.3, 1.0, 0.3);
  root.add(core);

  const navL = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  navL.position.set(-6.0, -0.2, 3.05); navL.scale.setScalar(0.16);
  const navR = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x30ff60 }));
  navR.position.set(6.0, -0.2, 3.05); navR.scale.setScalar(0.16);
  root.add(navL, navR);

  // cockpit interior (only visible in cockpit view)
  const ck = new PartBuilder();
  ck.add(G.sphere, 0x394150, { pos: [0, 0.58, -2.95], scale: [0.72, 0.3, 0.42] });
  const dialCols = [0x6fe3ff, 0xffd23f, 0x7dff8a, 0xff7eb9];
  dialCols.forEach((c, i) => {
    const x = (i - 1.5) * 0.24;
    ck.add(G.cyl, 0x111418, { pos: [x, 0.74, -2.6], rot: [PI / 2 - 0.5, 0, 0], scale: [0.085, 0.02, 0.085] });
    ck.add(G.cyl, c, { pos: [x, 0.745, -2.585], rot: [PI / 2 - 0.5, 0, 0], scale: [0.06, 0.02, 0.06] });
  });
  ck.add(G.capsule, 0x2a2f38, { pos: [0, 0.55, -2.15], rot: [-0.3, 0, 0], scale: [0.045, 0.1, 0.045] }); // stick
  ck.add(G.sphere, 0xff4a3d, { pos: [0, 0.72, -2.2], scale: [0.06, 0.06, 0.06] });
  const cockpit = toonModel(ck.build(), { outlineScale: 0.35 });
  cockpit.visible = false;
  // HUD glass combiner
  const hudGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  hudGlass.position.set(0, 0.98, -2.72); hudGlass.rotation.x = -0.25;
  cockpit.add(hudGlass);
  root.add(cockpit);

  root.userData = { jet, canopy, pilot, flame, core, navL, navR, cockpit, radius: 6 };
  return root;
}

export function setCockpitMode(plane, on) {
  const u = plane.userData;
  u.canopy.visible = !on;
  u.pilot.visible = !on;
  u.cockpit.visible = on;
  u.flame.visible = !on;
  u.core.visible = !on;
}

let enemyGeo = null;
export function createEnemyJet() {
  if (!enemyGeo) {
    const body = 0x5b6475, acc = 0xff4d3d, dark = 0x262b33;
    const b = new PartBuilder();
    b.add(G.capsule, body, { rot: [PI / 2, 0, 0], scale: [0.95, 2.2, 0.9] });
    b.add(G.sphere, acc, { pos: [0, 0, -4.2], scale: [0.7, 0.66, 1.5] });
    b.add(G.sphere, 0x8a1f1f, { pos: [0, 0.72, -1.9], scale: [0.55, 0.48, 1.35] });
    b.add(G.sphere, 0xffb0a0, { pos: [0.18, 1.0, -2.3], scale: [0.12, 0.06, 0.38] });
    for (const s of [-1, 1]) {
      b.add(G.sphere, body, { pos: [s * 2.6, -0.1, 1.2], rot: [0, s * -0.55, 0], scale: [3.2, 0.2, 1.7] });
      b.add(G.sphere, acc, { pos: [s * 5.1, -0.05, 2.9], scale: [0.3, 0.3, 0.9] });
      b.add(G.sphere, body, { pos: [s * 1.5, 0, -2.6], rot: [0, s * -0.4, 0], scale: [1.1, 0.12, 0.5] });
      b.add(G.sphere, dark, { pos: [s * 0.95, -0.35, -0.6], scale: [0.4, 0.5, 1.1] });
    }
    b.add(G.sphere, acc, { pos: [0, 1.45, 3.4], rot: [0.5, 0, 0], scale: [0.16, 1.6, 1.15] });
    b.add(G.cyl, dark, { pos: [0, 0, 4.7], rot: [PI / 2, 0, 0], scale: [0.7, 0.7, 0.7] });
    enemyGeo = b.build();
  }
  const g = toonModel(enemyGeo);
  const flame = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -PI / 2; flame.position.set(0, 0, 5.6); flame.scale.set(0.45, 1.4, 0.45);
  g.add(flame);
  const beacon = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  beacon.position.set(0, 2.9, 4.0); beacon.scale.setScalar(0.25);
  g.add(beacon);
  g.userData.beacon = beacon;
  g.userData.radius = 7;
  return g;
}

const geoCache = {};
function cached(name, fn) { return geoCache[name] || (geoCache[name] = fn()); }

export function createTank() {
  const geo = cached("tank", () => {
    const olive = 0x7f8e4b, dark = 0x34362f, sand = 0xb7a76a;
    const b = new PartBuilder();
    b.add(G.sphere, olive, { pos: [0, 0.9, 0], scale: [1.7, 0.62, 2.6] });
    for (const s of [-1, 1]) {
      b.add(G.capsule, dark, { pos: [s * 1.55, 0.55, 0], rot: [PI / 2, 0, 0], scale: [0.55, 1.15, 0.55] });
      for (let i = -1; i <= 1; i++) b.add(G.sphereLo, 0x55574d, { pos: [s * 1.95, 0.55, i * 1.2], scale: [0.12, 0.38, 0.38] });
    }
    b.add(G.sphere, sand, { pos: [0, 1.55, 0.3], scale: [1.1, 0.62, 1.25] });
    b.add(G.capsule, olive, { pos: [0, 1.65, -1.9], rot: [PI / 2, 0, 0], scale: [0.16, 0.85, 0.16] });
    b.add(G.sphere, dark, { pos: [0, 1.65, -3.6], scale: [0.22, 0.22, 0.3] });
    b.add(G.sphere, 0xff4d3d, { pos: [0.45, 2.15, 0.6], scale: [0.18, 0.18, 0.18] });
    return b.build();
  });
  const g = toonModel(geo);
  g.scale.setScalar(2.4);
  g.userData.radius = 9;
  return g;
}

export function createShip() {
  const geo = cached("ship", () => {
    const hull = 0x7d8a99, deck = 0x5d6876, light = 0xd2d9e2, dark = 0x2b3038, red = 0xd9443a;
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
  const g = toonModel(geo);
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
  g.add(toonModel(baseGeo));
  const launcher = toonModel(lnGeo);
  g.add(launcher);
  g.scale.setScalar(2.0);
  g.userData = { launcher, radius: 10 };
  return g;
}

export function createRocket(color = 0xffffff, tip = 0xff4a3d) {
  const key = "rocket" + color + tip;
  const geo = cached(key, () => {
    const b = new PartBuilder();
    b.add(G.capsule, color, { rot: [PI / 2, 0, 0], scale: [0.22, 0.6, 0.22] });
    b.add(G.sphere, tip, { pos: [0, 0, -0.85], scale: [0.2, 0.2, 0.3] });
    for (const r of [0, PI / 2]) b.add(G.sphere, tip, { pos: [0, 0, 0.7], rot: [0, 0, r], scale: [0.55, 0.06, 0.25] });
    return b.build();
  });
  const g = toonModel(geo, { outlineScale: 0.6 });
  const fl = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  fl.rotation.x = -PI / 2; fl.position.z = 1.4; fl.scale.set(0.22, 1.0, 0.22);
  g.add(fl);
  g.scale.setScalar(1.6);
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
