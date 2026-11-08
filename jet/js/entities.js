// Extra Ubu props for training levels: rings, balloons, practice targets, drones.
import * as THREE from "three";
import { PartBuilder, toonModel, G } from "./toon.js?v=36";

const ringGeo = new THREE.TorusGeometry(1, 0.11, 10, 40);
const cache = {};
function once(k, fn) { return cache[k] || (cache[k] = fn()); }

export function createRing(night) {
  const geo = once("ring" + night, () => new PartBuilder().add(ringGeo, night ? 0x9ef7ff : 0xffd23f).build());
  const g = toonModel(geo, { outlineScale: 1.2 });
  if (night) {
    const glow = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9ef7ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.04);
    g.add(glow);
  }
  return g;
}

const BALLOON_COLS = [0xff7eb9, 0x45b4ff, 0xffc93c, 0x3fe0a5, 0xa67cff, 0xff6040];
export function createBalloon(i = 0) {
  const c = BALLOON_COLS[i % BALLOON_COLS.length];
  const geo = once("balloon" + c, () => {
    const b = new PartBuilder();
    b.add(G.sphere, c, { pos: [0, 0, 0], scale: [1, 1.15, 1] });
    b.add(G.sphere, 0xffffff, { pos: [-0.35, 0.45, 0.62], scale: [0.18, 0.26, 0.12] });
    b.add(G.cone, c, { pos: [0, -1.2, 0], rot: [Math.PI, 0, 0], scale: [0.22, 0.25, 0.22] });
    b.add(G.cyl, 0x333333, { pos: [0, -2.4, 0], scale: [0.03, 2.2, 0.03] });
    b.add(G.box, 0xc58b4a, { pos: [0, -3.6, 0], scale: [0.5, 0.35, 0.5] });
    return b.build();
  });
  const g = toonModel(geo);
  g.scale.setScalar(9);
  g.userData.radius = 14;
  return g;
}

export function createPracticeTarget() {
  const geo = once("ptarget", () => {
    const b = new PartBuilder();
    const cols = [0xff4a3d, 0xffffff, 0xff4a3d, 0xffffff, 0xffc93c];
    cols.forEach((c, i) => {
      const r = 1 - i * 0.19;
      b.add(G.cyl, c, { pos: [0, 0, i * 0.04], rot: [Math.PI / 2, 0, 0], scale: [r, 0.12, r] });
    });
    b.add(G.sphere, 0xdddddd, { pos: [0, 1.15, 0], scale: [0.18, 0.18, 0.18] });
    return b.build();
  });
  const g = toonModel(geo);
  g.scale.setScalar(12);
  g.userData.radius = 13;
  return g;
}

export function createDrone() {
  const geo = once("drone", () => {
    const b = new PartBuilder();
    b.add(G.sphere, 0xa67cff, { scale: [1.1, 0.7, 1.1] });
    b.add(G.sphere, 0x22303f, { pos: [0, 0.1, -0.85], scale: [0.45, 0.32, 0.25] });
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      b.add(G.capsule, 0x3a3d45, { pos: [x * 0.9, 0.1, z * 0.9], rot: [Math.PI / 2, 0, Math.atan2(z, x) + Math.PI / 2], scale: [0.12, 0.35, 0.12] });
      b.add(G.cyl, 0xffd23f, { pos: [x * 1.5, 0.35, z * 1.5], scale: [0.65, 0.06, 0.65] });
    }
    return b.build();
  });
  const g = toonModel(geo);
  g.scale.setScalar(5);
  g.userData.radius = 10;
  return g;
}
