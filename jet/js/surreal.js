// Realistic vs Surreal render style (visual-only toggle on the opening screen).
// Surreal = pastel hue-shifting palette, gently wavy/melting terrain, soft outlines,
// floating dream shapes and a cheap CSS glow. All GPU-cheap: a few shader lines + 4 draw calls.
import * as THREE from "three";
import { outlineUniforms, toonMaterial, PartBuilder, G, outlineMaterial } from "./toon.js?v=14";

const KEY = "jet-style";
export const style = {
  surreal: (() => { try { return localStorage.getItem(KEY) === "surreal"; } catch { return false; } })(),
  uTime: { value: 0 },
  uSur: { value: 0 },
  uCenter: { value: new THREE.Vector2() },
};
const listeners = new Set();
export function onStyle(fn) { listeners.add(fn); }
export function setSurreal(on) {
  style.surreal = !!on;
  try { localStorage.setItem(KEY, on ? "surreal" : "realistic"); } catch { /* ignore */ }
  applyGlobals();
  for (const fn of listeners) fn(style.surreal);
}
function applyGlobals() {
  style.uSur.value = style.surreal ? 1 : 0;
  outlineUniforms.uSoft.value = style.surreal ? 1 : 0;
  const tm = toonMaterial();
  tm.emissive.setHex(style.surreal ? 0x2a1a3a : 0x000000);
  document.body.classList.toggle("surreal", style.surreal);
}
applyGlobals();
export function tickStyle(t) { style.uTime.value = t; }

// Same wave as the GLSL below, so collisions follow the visible (melting) ground.
export function waveAt(x, z) {
  if (!style.surreal) return 0;
  const t = style.uTime.value;
  const lx = x - style.uCenter.value.x, lz = z - style.uCenter.value.y;
  return Math.sin(lx * 0.0035 + t * 0.55) * 22 + Math.cos(lz * 0.0042 + t * 0.4) * 18 + Math.sin((lx + lz) * 0.0011 - t * 0.3) * 14;
}

const HUE = /* glsl */ `
  vec3 ubuHue(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
  }`;

export function patchTerrain(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = style.uTime; sh.uniforms.uSur = style.uSur; sh.uniforms.uCenter = style.uCenter;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uSur; uniform vec2 uCenter; varying vec2 vWorldXZ;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 ubuW = modelMatrix * vec4(position, 1.0);
        vec2 l = ubuW.xz - uCenter;
        vWorldXZ = ubuW.xz;
        transformed.y += uSur * (sin(l.x * 0.0035 + uTime * 0.55) * 22.0 + cos(l.y * 0.0042 + uTime * 0.4) * 18.0 + sin((l.x + l.y) * 0.0011 - uTime * 0.3) * 14.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uSur; varying vec2 vWorldXZ;" + HUE)
      .replace("#include <map_fragment>", `#include <map_fragment>
        if (uSur > 0.5) {
          float a = uTime * 0.25 + vWorldXZ.x * 0.0004 + vWorldXZ.y * 0.0003;
          vec3 c = ubuHue(diffuseColor.rgb, a);
          float l = dot(c, vec3(0.333));
          c = mix(vec3(l), c, 1.6);
          diffuseColor.rgb = mix(c, vec3(1.0, 0.92, 1.0), 0.28);
        }`);
  };
  mat.customProgramCacheKey = () => "ubu-terrain-surreal";
  mat.needsUpdate = true;
}

export function skyHueChunk() { return HUE; }

// Floating pastel dream shapes around the player (instanced: 4 draw calls).
export function createDreamShapes(scene) {
  const N = 36;
  const sphere = new PartBuilder().add(G.sphereLo, 0xffffff).build();
  const torus = new PartBuilder().add(new THREE.TorusGeometry(1, 0.35, 8, 20), 0xffffff).build();
  const meshes = [];
  const cols = [0xffb3de, 0xb8f3ff, 0xfff1a8, 0xc9b6ff, 0xb5ffd6, 0xffc9a8];
  for (const geo of [sphere, torus]) {
    const m = new THREE.InstancedMesh(geo, toonMaterial(), N);
    const o = new THREE.InstancedMesh(geo, outlineMaterial(0x111111, 0.7), N);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    m.frustumCulled = o.frustumCulled = false;
    scene.add(m, o);
    meshes.push({ m, o });
  }
  const items = [];
  for (let i = 0; i < N * 2; i++) items.push({ p: new THREE.Vector3(), s: 20 + Math.random() * 60, ph: Math.random() * 6.28, c: cols[i % cols.length], init: false });
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < N; i++) { meshes[0].m.setColorAt(i, col.setHex(items[i].c)); meshes[1].m.setColorAt(i, col.setHex(items[i + N].c)); }
  function setVisible(v) { for (const { m, o } of meshes) { m.visible = o.visible = v; } }
  setVisible(style.surreal);
  return {
    setVisible,
    update(dt, center) {
      if (!style.surreal) return;
      const t = style.uTime.value;
      items.forEach((it, i) => {
        if (!it.init || it.p.distanceTo(center) > 4200) {
          const a = Math.random() * 6.28, r = (it.init ? 3000 : 400) + Math.random() * 1200;
          it.p.set(center.x + Math.cos(a) * r, center.y + (Math.random() - 0.3) * 600, center.z + Math.sin(a) * r);
          it.init = true;
        }
        e.set(t * 0.2 + it.ph, t * 0.3 + it.ph, 0);
        q.setFromEuler(e);
        const bob = Math.sin(t * 0.7 + it.ph) * 15;
        sc.setScalar(it.s * (1 + 0.1 * Math.sin(t + it.ph)));
        mat.compose(sc.clone().set(it.p.x, it.p.y + bob, it.p.z), q, sc);
        const k = i < N ? 0 : 1, j = i % N;
        meshes[k].m.setMatrixAt(j, mat); meshes[k].o.setMatrixAt(j, mat);
      });
      for (const { m, o } of meshes) { m.instanceMatrix.needsUpdate = o.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    },
  };
}
