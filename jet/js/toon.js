// Ubu toon toolkit: soft cel shading + thick black screen-space outlines.
import * as THREE from "three";
import { patchDetail } from "./tex.js?v=20";

let gradientMap = null;
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  // build 15: soft 16-step ramp (near-continuous Lambert wrap) instead of 4 hard cel bands
  const N = 16, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { const t = i / (N - 1), v = Math.round(255 * (0.26 + 0.74 * Math.pow(t, 0.75))); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  gradientMap = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.LinearFilter;
  gradientMap.magFilter = THREE.LinearFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const toonCache = new Map();
export function toonMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (toonCache.has(key)) return toonCache.get(key);
  const { detail, ...mo } = opts;
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap(), ...mo });
  if (detail) patchDetail(m, typeof detail === "object" ? detail : { kind: "panel", s: 0.2, k: 0.75 });
  toonCache.set(key, m);
  return m;
}

export const outlineUniforms = {
  uRes: { value: new THREE.Vector2(844, 390) },
  uPx: { value: 1.5 },
  uSoft: { value: 0 }, // 0 = crisp black Ubu outline (realistic), 1 = soft dreamy outline (surreal)
};

const outlineCache = new Map();
export function outlineMaterial(color = 0x111111, scale = 1) {
  const key = color + ":" + scale;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: new THREE.Color(color) }, uScale: { value: scale } },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 oNormal;
      uniform vec2 uRes;
      uniform float uPx;
      uniform float uScale;
      uniform float uSoft;
      void main() {
        vec4 lp = vec4(position, 1.0);
        vec3 ln = oNormal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          ln = mat3(instanceMatrix) * ln;
        #endif
        vec4 mvPosition = modelViewMatrix * lp;
        vec4 clip = projectionMatrix * mvPosition;
        vec3 vn = normalize(normalMatrix * ln);
        vec4 cn = projectionMatrix * vec4(vn, 0.0);
        vec2 dir = cn.xy;
        float l = length(dir);
        dir = l > 1e-5 ? dir / l : vec2(0.0);
        float dist = -mvPosition.z;
        float px = uPx * uScale * clamp(60.0 / max(dist, 1.0), 0.45, 1.35) * (1.0 - 0.35 * uSoft);
        clip.xy += dir * px * 2.0 / uRes * clip.w;
        gl_Position = clip;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uSoft;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(mix(uColor, vec3(0.45, 0.33, 0.66), uSoft * 0.85), 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uRes = outlineUniforms.uRes;
  m.uniforms.uPx = outlineUniforms.uPx;
  m.uniforms.uSoft = outlineUniforms.uSoft;
  outlineCache.set(key, m);
  return m;
}

// --- geometry builder: merge many primitive parts into ONE vertex-coloured geometry ---
export class PartBuilder {
  constructor() { this.parts = []; }
  add(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], order = "XYZ" } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)),
      new THREE.Vector3(...scale),
    );
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  build() {
    let total = 0;
    for (const p of this.parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (const p of this.parts) {
      pos.set(p.attributes.position.array, o * 3);
      nor.set(p.attributes.normal.array, o * 3);
      col.set(p.attributes.color.array, o * 3);
      o += p.attributes.position.count;
      p.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("oNormal", new THREE.BufferAttribute(smoothNormals(pos, nor), 3));
    g.computeBoundingSphere();
    return g;
  }
}

// Averaged normals per position so hard edges don't crack the outline.
export function smoothNormals(pos, nor) {
  const map = new Map();
  const n = pos.length / 3;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos[i * 3] * 200) + "," + Math.round(pos[i * 3 + 1] * 200) + "," + Math.round(pos[i * 3 + 2] * 200);
    keys[i] = k;
    let a = map.get(k);
    if (!a) { a = [0, 0, 0]; map.set(k, a); }
    a[0] += nor[i * 3]; a[1] += nor[i * 3 + 1]; a[2] += nor[i * 3 + 2];
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = map.get(keys[i]);
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  return out;
}

// One toon mesh + one outline mesh (2 draw calls per model).
export function toonModel(geo, { outline = 0x111111, outlineScale = 1, material, detail } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, material || toonMaterial(detail ? { detail } : {}));
  group.add(body);
  if (outline !== null) {
    const ol = new THREE.Mesh(geo, outlineMaterial(outline, outlineScale));
    ol.renderOrder = -1;
    group.add(ol);
    group.userData.outline = ol;
  }
  group.userData.body = body;
  return group;
}

// shared primitive geometries (low poly but round)
export const G = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  capsule: new THREE.CapsuleGeometry(1, 2, 6, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 14),
  torus: new THREE.TorusGeometry(1, 0.3, 8, 18),
  box: new THREE.BoxGeometry(1, 1, 1),
};
