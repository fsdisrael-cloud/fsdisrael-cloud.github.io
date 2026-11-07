// Realistic vs Surreal render style (visual-only toggle on the opening screen).
// Surreal = pastel hue-shifting palette, gently wavy/melting terrain, soft outlines,
// floating dream shapes and a cheap CSS glow. All GPU-cheap: a few shader lines + 4 draw calls.
import * as THREE from "three";
import { noiseTex, FX, terrainPhotos, BUMP_GLSL } from "./tex.js?v=32";
import { outlineUniforms, toonMaterial, PartBuilder, G, outlineMaterial } from "./toon.js?v=32";

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

const LAKE = { tex: { value: null }, box: { value: new THREE.Vector3(0, 0, 1) }, on: { value: 0 } };
export function setLake(info) {
  if (info && info.tex) { LAKE.tex.value = info.tex; LAKE.box.value.set(info.x0, info.z0, info.W); LAKE.on.value = 1; } else { LAKE.on.value = 0; }
}
export function patchTerrain(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = style.uTime; sh.uniforms.uSur = style.uSur; sh.uniforms.uCenter = style.uCenter;
    sh.uniforms.uLake = LAKE.tex; sh.uniforms.uLakeB = LAKE.box; sh.uniforms.uLakeOn = LAKE.on; sh.uniforms.uNoise = { value: noiseTex() }; const ph = terrainPhotos(); sh.uniforms.uTxG = ph.g; sh.uniforms.uTxR = ph.r; sh.uniforms.uT2 = FX.time; sh.uniforms.uSunD = FX.sunDir; sh.uniforms.uSunC = FX.sunCol;
    const HI = (FX.hi ? "#define UBU_HI\n" : "") + (/[?&]nodet/.test(location.search) ? "#define UBU_OFF\n" : "");
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uSur; uniform vec2 uCenter; varying vec2 vWorldXZ; varying vec3 vWP; varying vec3 vWN;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 ubuW = modelMatrix * vec4(position, 1.0);
        vec2 l = ubuW.xz - uCenter;
        vWorldXZ = ubuW.xz; vWP = ubuW.xyz; vWN = normal;
        transformed.y += uSur * (sin(l.x * 0.0035 + uTime * 0.55) * 22.0 + cos(l.y * 0.0042 + uTime * 0.4) * 18.0 + sin((l.x + l.y) * 0.0011 - uTime * 0.3) * 14.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", HI + "#include <common>\nuniform float uTime; uniform float uSur; varying vec2 vWorldXZ; varying vec3 vWP; varying vec3 vWN; uniform sampler2D uNoise; uniform float uT2; uniform vec3 uSunD; uniform vec3 uSunC; uniform sampler2D uTxG; uniform sampler2D uTxR; float ubuH = 0.0; float ubuBF = 0.0;" + BUMP_GLSL + HUE)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n        #ifdef UBU_HI\n        if (ubuBF > 0.0) normal = ubuBump(normal, -vViewPosition, ubuH * 2.0, 0.045 * ubuBF);\n        #endif")
      .replace("uniform sampler2D uTxR;", "uniform sampler2D uTxR; uniform sampler2D uLake; uniform vec3 uLakeB; uniform float uLakeOn;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += ubuGlint;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 ubuGlint = vec3(0.0);
        #ifndef UBU_OFF
        {
          float dd = length(vWP - cameraPosition);
          vec4 n1 = texture2D(uNoise, vWP.xz * 0.0019);
          vec4 n2 = texture2D(uNoise, vWP.xz * 0.014);
          float fade2 = 1.0 - smoothstep(900.0, 6000.0, dd);
          float det = (n1.r - 0.5) * 0.2 + (n2.g - 0.5) * 0.42 * fade2;
          #ifdef UBU_HI
            vec4 n3 = texture2D(uNoise, vWP.xz * 0.09);
            det += (n3.b - 0.5) * 0.55 * (1.0 - smoothstep(250.0, 2600.0, dd));
          #endif
          float lakeM = 0.0;
          if (uLakeOn > 0.5) { vec2 lu = (vWP.xz - uLakeB.xy) / uLakeB.z; if (lu.x > 0.0 && lu.y > 0.0 && lu.x < 1.0 && lu.y < 1.0) lakeM = texture2D(uLake, lu).r; }
          bool wat = (vWP.y < 0.12 || lakeM > 0.5) && uSur < 0.5;
          float pg = 0.0, pr = 0.0;
          #ifdef UBU_HI
          {
            float nearK = 1.0 - smoothstep(900.0, 5500.0, dd);
            vec3 aw = pow(abs(normalize(vWN)), vec3(3.0)); aw /= (aw.x + aw.y + aw.z);
            pg = (texture2D(uTxG, vWP.xz * 0.05).r - 0.5) * 0.85 + (texture2D(uTxG, vWP.xz * 0.0063 + 0.37).r - 0.5) * 0.7;
            pr = (texture2D(uTxR, vWP.zy * 0.035).r - 0.5) * aw.x + (texture2D(uTxR, vWP.xz * 0.035).r - 0.5) * aw.y + (texture2D(uTxR, vWP.xy * 0.035).r - 0.5) * aw.z;
            pg *= mix(0.55, 1.0, nearK); pr *= mix(0.55, 1.0, nearK);
            ubuBF = nearK * (wat ? 0.0 : 1.0);
          }
          #endif
          float slope = 1.0 - clamp(normalize(vWN).y, 0.0, 1.0);
          float rock = smoothstep(0.22, 0.5, slope) * (wat ? 0.0 : 1.0);
          vec3 base = diffuseColor.rgb;
          float lum = dot(base, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(base, vec3(lum) * vec3(1.0, 0.95, 0.88) * 0.95, rock * 0.35);
          float phd = wat ? 0.0 : mix(pg, pr, clamp(rock * 1.6, 0.0, 1.0));
          ubuH = phd;
          diffuseColor.rgb *= 1.0 + (wat ? (n1.r - 0.5) * 0.08 : det * 0.40 * (1.0 + rock * 0.6) + phd * 0.72);
          if (wat) {
            vec2 q1 = vWP.xz * 0.011 + vec2(uT2 * 0.012, uT2 * 0.006);
            vec2 q2 = vWP.xz * 0.037 - vec2(uT2 * 0.02, -uT2 * 0.01);
            vec4 w1 = texture2D(uNoise, q1), w2 = texture2D(uNoise, q2);
            float wFar = 1.0 - smoothstep(300.0, 3200.0, dd);
            vec3 wn = normalize(vec3(((w1.r - w1.g) * 0.3 + (w2.b - w2.a) * 0.22) * wFar, 1.0, ((w1.b - w1.a) * 0.3 + (w2.r - w2.g) * 0.22) * wFar));
            vec3 V = normalize(cameraPosition - vWP);
            vec3 H = normalize(normalize(uSunD) + V);
            float sp = pow(max(dot(wn, H), 0.0), 140.0) * 2.2 * mix(0.3, 1.0, wFar) + pow(max(dot(wn, H), 0.0), 18.0) * 0.12;
            float fr = pow(1.0 - clamp(dot(wn, V), 0.0, 1.0), 3.0);
            ubuGlint = uSunC * sp + diffuseColor.rgb * fr * 0.6;
            // b30: realistic sea - no satellite pixels: procedural depth colour (shallow turquoise -> deep navy), coast foam, smooth multi-scale waves
            vec2 q3 = mat2(0.8, -0.6, 0.6, 0.8) * vWP.xz * 0.0047 + vec2(-uT2 * 0.007, uT2 * 0.009);
            vec4 w3 = texture2D(uNoise, q3);
            wn = normalize(vec3(((w1.r - w1.g) * 0.22 + (w2.b - w2.a) * 0.16 + (w3.g - w3.r) * 0.2) * wFar, 1.0, ((w1.b - w1.a) * 0.22 + (w2.r - w2.g) * 0.16 + (w3.a - w3.b) * 0.2) * wFar));
            H = normalize(normalize(uSunD) + V);
            sp = pow(max(dot(wn, H), 0.0), 220.0) * 3.0 * mix(0.35, 1.0, wFar) + pow(max(dot(wn, H), 0.0), 24.0) * 0.14;
            fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(wn, V), 0.0, 1.0), 5.0);
            float depth = lakeM > 0.5 ? 0.6 : clamp(-vWP.y / 35.0, 0.0, 1.0);
            float lumM = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            depth = max(depth, clamp(1.0 - lumM * 3.2, 0.0, 1.0) * 0.7);   // imagery brightness only as a soft depth hint, never as pixels
            vec3 deepC = vec3(0.015, 0.075, 0.16), shallowC = vec3(0.06, 0.36, 0.42);
            diffuseColor.rgb = mix(shallowC, deepC, smoothstep(0.0, 0.85, depth));
            float foam = (1.0 - smoothstep(0.0, 0.12, depth)) * smoothstep(0.45, 0.75, w2.g * 0.6 + w3.r * 0.4 + 0.15 * sin(uT2 * 1.3 + vWP.x * 0.02));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.92), foam * 0.7 * (1.0 - smoothstep(400.0, 3000.0, dd)));
            ubuGlint = uSunC * sp + vec3(0.0);
            #ifdef USE_FOG
              vec3 skyR = fogColor * 1.08;
              float lumF = dot(fogColor, vec3(0.333));
              float cap = smoothstep(0.80, 0.97, w1.g * 0.55 + w2.r * 0.45) * (1.0 - smoothstep(600.0, 3500.0, dd));
              ubuGlint += skyR * fr * 0.9 * mix(0.55, 1.0, uSunC.r) + vec3(cap * 0.22 * lumF);
              ubuGlint += skyR * 0.25 * smoothstep(2500.0, 14000.0, dd);   // fade into the horizon haze
            #endif
          }
        }
        #endif
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
