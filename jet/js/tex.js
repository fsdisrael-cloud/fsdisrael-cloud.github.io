// Build 15: procedural PBR-style detail textures (all generated locally, tiny, mipmapped, no downloads).
// - noiseTex: tileable 4-channel fbm (terrain mottling, rock, water ripples, organic skin)
// - panelTex: tileable aircraft skin: panel seams, rivets, scuffs, exhaust/grime streaks (R = albedo, G = roughness)
// - patchDetail(): injects object-space triplanar skin detail into any Standard/Toon material
// - FX: shared uniforms (sun, time) for the water glint, and a quality switch for low-end phones
import * as THREE from "three";

export const FX = { hi: true, time: { value: 0 }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2) }, sunCol: { value: new THREE.Color(0, 0, 0) } };
export function setQuality(q) { FX.hi = q !== "low" && !/[?&]q=low/.test(location.search); }

function rngf(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function lattice(n, seed) { const r = rngf(seed), a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return a; }
function fbmTile(size, cells, oct, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0, c = cells;
  for (let o = 0; o < oct; o++) {
    const L = lattice(c, seed + o * 77);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * c, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * c, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % c, y1 = (y0 + 1) % c, xx = x0 % c, yy = y0 % c;
        const v = (L[yy * c + xx] * (1 - sx) + L[yy * c + x1] * sx) * (1 - sy) + (L[y1 * c + xx] * (1 - sx) + L[y1 * c + x1] * sx) * sy;
        out[y * size + x] += v * amp;
      }
    }
    tot += amp; amp *= 0.5; c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function finish(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

let _noise = null;
export function noiseTex() {
  if (_noise) return _noise;
  const S = 128, ch = [fbmTile(S, 4, 4, 11), fbmTile(S, 8, 4, 23), fbmTile(S, 16, 3, 37), fbmTile(S, 6, 5, 51)];
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) for (let k = 0; k < 4; k++) d[i * 4 + k] = Math.max(0, Math.min(255, (ch[k][i] - 0.5) * 2.2 * 255 + 128));
  _noise = finish(new THREE.DataTexture(d, S, S, THREE.RGBAFormat));
  return _noise;
}

let _panel = null;
export function panelTex() {
  if (_panel) return _panel;
  const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), r = rngf(5);
  g.fillStyle = "#c8c8c8"; g.fillRect(0, 0, S, S);
  const n = fbmTile(S, 8, 4, 91), im = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) { const v = 215 + (n[i] - 0.5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; }
  g.putImageData(im, 0, 0);
  // exhaust / weather streaks along one axis (tile-safe: wrap by drawing at both edges)
  for (let i = 0; i < 46; i++) {
    const x = r() * S, w = 1 + r() * 4, y = r() * S, h = 30 + r() * 120;
    g.fillStyle = `rgba(30,28,24,${0.05 + r() * 0.1})`;
    for (const dx of [0, -S]) for (const dy of [0, -S]) g.fillRect(x + dx, y + dy, w, h);
  }
  // panel seams (darker lines at irregular spacing) + rivet rows
  g.lineWidth = 1.6; g.strokeStyle = "rgba(10,12,14,0.78)";
  const xs = [0, 58, 131, 190], ys = [0, 74, 120, 205];
  for (const x of xs) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  for (const y of ys) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 1;
  for (const x of xs) { g.beginPath(); g.moveTo(x + 2, 0); g.lineTo(x + 2, S); g.stroke(); }
  for (const y of ys) { g.beginPath(); g.moveTo(0, y + 2); g.lineTo(S, y + 2); g.stroke(); }
  g.fillStyle = "rgba(10,12,14,0.6)";
  for (const x of xs) for (let y = 6; y < S; y += 11) { g.beginPath(); g.arc(x + 6, y, 0.9, 0, 7); g.fill(); }
  for (const y of ys) for (let x = 6; x < S; x += 11) { g.beginPath(); g.arc(x, y + 6, 0.9, 0, 7); g.fill(); }
  // access hatches + scuffs
  g.strokeStyle = "rgba(10,12,14,0.6)"; g.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) { const x = 8 + r() * 200, y = 8 + r() * 200; g.strokeRect(x, y, 16 + r() * 22, 10 + r() * 14); }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.04 + r() * 0.1})`; g.fillRect(r() * S, r() * S, 2 + r() * 10, 1); }
  // G channel = roughness offset: seams/scuffs rougher; reuse luminance inverted
  const d = g.getImageData(0, 0, S, S), o = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const l = d.data[i * 4]; o[i * 4] = l; o[i * 4 + 1] = Math.max(0, Math.min(255, 255 - l + 40)); o[i * 4 + 2] = l; o[i * 4 + 3] = 255; }
  _panel = finish(new THREE.DataTexture(o, S, S, THREE.RGBAFormat));
  return _panel;
}

// derivative-based bump mapping (no tangents needed): perturbs a view-space normal by the gradient of height h
export const BUMP_GLSL = `
vec3 ubuBump(vec3 N, vec3 P, float h, float k) {
  vec3 dpx = dFdx(P), dpy = dFdy(P);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - k * g);
}`;

// CC0 photo detail (Poly Haven aerial_grass_rock + rock_face, grayscale high-pass 512px): terrain micro detail
let _ph = null;
export function terrainPhotos() {
  if (_ph) return _ph;
  const gray = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat); gray.needsUpdate = true;
  _ph = { g: { value: gray }, r: { value: gray } };
  const L = new THREE.TextureLoader();
  const go = (u, k) => L.load(u, (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; _ph[k].value = t; });
  go("img/tx_ground.jpg", "g"); go("img/tx_rock.jpg", "r");
  return _ph;
}

const PV = `#include <common>\nvarying vec3 vDOP; varying vec3 vDON;`;
const PB = `#include <begin_vertex>\nvDOP = position; vDON = normal;`;
const cache = new WeakSet();
// kind "panel" = riveted aircraft skin, "skin" = organic mottling (alien). s = texture repeats per world unit.
export function patchDetail(mat, { kind = "panel", s = 0.17, k = 0.9 } = {}) {
  if (cache.has(mat)) return mat;
  cache.add(mat);
  const std = !!mat.isMeshStandardMaterial;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uDT = { value: kind === "skin" ? noiseTex() : panelTex() };
    sh.uniforms.uDS = { value: s }; sh.uniforms.uDK = { value: k };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", PV).replace("#include <begin_vertex>", PB);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vDOP; varying vec3 vDON; uniform sampler2D uDT; uniform float uDS, uDK;\n${BUMP_GLSL}\nfloat ubuH;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 dW = pow(abs(normalize(vDON)), vec3(4.0)); dW /= (dW.x + dW.y + dW.z);
        vec3 dQ = vDOP * uDS;
        vec4 dA = texture2D(uDT, dQ.zy), dB = texture2D(uDT, dQ.xz), dC = texture2D(uDT, dQ.xy);
        vec4 dN = dA * dW.x + dB * dW.y + dC * dW.z;
        ${kind === "skin" ? "float dL = (dN.r - 0.5) * 0.9 + (dN.b - 0.5) * 0.7; diffuseColor.rgb *= 1.0 + dL * uDK;" : "diffuseColor.rgb *= mix(1.0, dN.r * 1.18, uDK);"}`);
    if (std && kind !== "skin") sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n        normal = ubuBump(normal, -vViewPosition, dN.r * 1.0, 0.1 * uDK);");
    if (std) sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n        roughnessFactor = clamp(roughnessFactor + ${kind === "skin" ? "(dN.g - 0.5) * 0.4" : "(dN.g - 0.5) * 0.55"}, 0.08, 1.0);`);
  };
  const key = "ubu-detail-" + kind + "-" + s + "-" + k + (std ? "S" : "T");
  const pk = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (pk ? pk() : "") + key;
  mat.needsUpdate = true;
  return mat;
}

// Missile / bomb skin (UV mapped on a capsule: v runs nose 0 -> tail 1). Muted military grey with stencils and bands.
let _missile = null;
export function missileTex() {
  if (_missile) return _missile;
  const W = 128, H = 256, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), r = rngf(8);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, "#9aa1a6"); gr.addColorStop(0.5, "#c3c8cb"); gr.addColorStop(1, "#8d949a");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1c1f22"; g.fillRect(0, 0, W, H * 0.13);               // radome
  g.fillStyle = "#2a2d30"; g.fillRect(0, H * 0.13, W, 3);
  const band = (v, h, col) => { g.fillStyle = col; g.fillRect(0, H * v, W, H * h); };
  band(0.2, 0.018, "#d9b21f"); band(0.25, 0.012, "#c43a2c"); band(0.66, 0.02, "#d9b21f"); band(0.7, 0.012, "#2a2d30");
  g.fillStyle = "#1b1e21"; g.fillRect(0, H * 0.9, W, H * 0.1);           // motor
  g.fillStyle = "rgba(20,22,24,0.7)"; g.fillRect(0, H * 0.4, W, 1); g.fillRect(0, H * 0.56, W, 1); g.fillRect(0, H * 0.78, W, 1);
  g.save(); g.translate(W * 0.25, H * 0.5); g.rotate(-Math.PI / 2); g.fillStyle = "rgba(20,22,24,0.85)"; g.font = "bold 14px Arial"; g.textAlign = "center"; g.fillText("AAM-9 LIVE", 0, 4); g.restore();
  for (let i = 0; i < 180; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.03 + r() * 0.08})`; g.fillRect(r() * W, r() * H, 1 + r() * 8, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _missile = t; return t;
}
