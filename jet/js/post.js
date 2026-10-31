// Post-processing: HDR scene target (MSAA) -> bloom chain -> composite (tone map, grade, vignette, radial speed blur,
// exhaust heat haze, cheap sun lens flare, chromatic fringe, dither). Falls back to direct rendering if unsupported.
import * as THREE from "three";

const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
function mat(fs, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra });
}

export function createPost(renderer, opts = {}) {
  const gl = renderer.getContext();
  const hasHalf = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
  if (!hasHalf) return null;
  const hi = opts.hi !== false;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  const qc = new THREE.Camera();

  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
  let sceneRT = null; const mips = []; let W = 0, H = 0;
  const LEV = hi ? 4 : 3;
  function size() {
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (v.x === W && v.y === H && sceneRT) return;
    W = v.x; H = v.y;
    sceneRT?.dispose(); mips.forEach((m) => m.dispose()); mips.length = 0;
    sceneRT = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, depthBuffer: true, samples: hi ? 4 : 0 });
    let w = W, h = H;
    for (let i = 0; i < LEV; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); mips.push(new THREE.WebGLRenderTarget(w, h, rtOpts)); }
  }

  const pre = mat(`varying vec2 vUv; uniform sampler2D t; uniform vec2 px; uniform float thr;
    void main(){ vec3 a = texture2D(t, vUv + px*vec2(-0.5,-0.5)).rgb + texture2D(t, vUv + px*vec2(0.5,-0.5)).rgb + texture2D(t, vUv + px*vec2(-0.5,0.5)).rgb + texture2D(t, vUv + px*vec2(0.5,0.5)).rgb; a *= 0.25;
      float l = max(a.r, max(a.g, a.b)); float k = clamp((l - thr + 0.35) / 0.7, 0.0, 1.0); k = k*k*(3.0-2.0*k) * max(l - thr*0.5, 0.0) / max(l, 1e-3);
      gl_FragColor = vec4(min(a * k, vec3(8.0)), 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0.9 } });
  const down = mat(`varying vec2 vUv; uniform sampler2D t; uniform vec2 px;
    void main(){ vec3 a = texture2D(t, vUv + px*vec2(-1.0,-1.0)).rgb + texture2D(t, vUv + px*vec2(1.0,-1.0)).rgb + texture2D(t, vUv + px*vec2(-1.0,1.0)).rgb + texture2D(t, vUv + px*vec2(1.0,1.0)).rgb;
      gl_FragColor = vec4(a * 0.25, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() } });
  const up = mat(`varying vec2 vUv; uniform sampler2D t; uniform vec2 px; uniform float k;
    void main(){ vec3 a = texture2D(t, vUv + px*vec2(-1.0,0.0)).rgb + texture2D(t, vUv + px*vec2(1.0,0.0)).rgb + texture2D(t, vUv + px*vec2(0.0,-1.0)).rgb + texture2D(t, vUv + px*vec2(0.0,1.0)).rgb + 2.0*texture2D(t, vUv).rgb;
      gl_FragColor = vec4(a * (k / 6.0), 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, k: { value: 1 } },
  { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
  const comp = mat(`varying vec2 vUv; uniform sampler2D tS, tB; uniform float uBloom, uBlur, uTime, uVig, uAsp, uCA, uHurt;
    uniform vec3 uHaze; uniform vec3 uSun; uniform float uWhite; uniform vec3 uWhiteCol;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      // exhaust heat haze: wobbling refraction behind the jet
      if (uHaze.z > 0.001) { vec2 d = (uv - uHaze.xy) * vec2(uAsp, 1.0); float f = exp(-dot(d, d) * 140.0);
        uv += vec2(sin(uv.y*140.0 + uTime*38.0), cos(uv.x*120.0 + uTime*31.0)) * 0.0020 * uHaze.z * f; }
      vec3 col;
      float r2 = dot(c, c);
      if (uBlur > 0.002) { col = vec3(0.0); for (int i = 0; i < 6; i++) { float s = 1.0 - uBlur * 0.1 * float(i) / 5.0 * (0.25 + r2 * 3.0); col += texture2D(tS, 0.5 + c * s).rgb; } col /= 6.0; }
      else col = texture2D(tS, uv).rgb;
      // chromatic fringe toward the edges
      vec2 o = c * (uCA * r2);
      col.r = mix(col.r, texture2D(tS, uv - o).r, 0.8); col.b = mix(col.b, texture2D(tS, uv + o).b, 0.8);
      vec3 bl = texture2D(tB, uv).rgb;
      col += bl * uBloom;
      // sun lens flare (ghosts + streak), only when the sun disc is visible (bloom lookup)
      if (uSun.z > 0.001) {
        vec2 sp = uSun.xy; float vis = uSun.z * smoothstep(0.03, 0.3, dot(texture2D(tB, sp).rgb, vec3(0.33)));
        vec2 dv = (uv - 0.5) * vec2(uAsp, 1.0); vec2 ds = (sp - 0.5) * vec2(uAsp, 1.0);
        vec3 fl = vec3(0.0);
        for (int i = 0; i < 4; i++) { float k = (i == 0) ? -0.35 : (i == 1) ? 0.45 : (i == 2) ? 0.8 : 1.35; vec2 g = -ds * k; float d = length(dv - g); float rad = 0.05 + 0.03 * float(i);
          fl += (smoothstep(rad, rad*0.2, d) * 0.12 + smoothstep(rad*1.2, rad, d) * smoothstep(rad*0.8, rad*1.15, d) * 0.1) * mix(vec3(1.0,0.75,0.5), vec3(0.5,0.75,1.0), float(i)/3.0); }
        fl += vec3(1.0,0.85,0.65) * exp(-abs(uv.y - sp.y) * 70.0) * exp(-abs(uv.x - sp.x) * 2.2) * 0.35;
        col += fl * vis;
      }
      col = mix(col, uWhiteCol * (0.85 + 0.15 * hash(floor(uv * 6.0) + floor(uTime * 3.0))), uWhite * 0.9);
      // grade: gentle filmic contrast, split toning (cool shadows, warm highlights), saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max((col - 0.16) * 1.07 + 0.16, 0.0);   // b23: a touch more punch
      col = mix(vec3(l), col, 1.16);
      col *= mix(vec3(0.93, 0.99, 1.07), vec3(1.07, 1.0, 0.92), smoothstep(0.05, 0.9, l));
      col *= 1.0 - uVig * smoothstep(0.18, 0.62, r2) * 1.1;
      col = mix(col, col * vec3(1.6, 0.35, 0.3), uHurt * smoothstep(0.05, 0.4, r2));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb += (hash(vUv * 1000.0 + uTime) - 0.5) / 200.0;
    }`, { tS: { value: null }, tB: { value: null }, uBloom: { value: 0.5 }, uBlur: { value: 0 }, uTime: { value: 0 }, uVig: { value: 0.5 }, uAsp: { value: 1 }, uCA: { value: 0.012 }, uHurt: { value: 0 }, uHaze: { value: new THREE.Vector3() }, uWhite: { value: 0 }, uWhiteCol: { value: new THREE.Vector3(0.8, 0.82, 0.86) }, uSun: { value: new THREE.Vector3() } });

  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); };
  const _v = new THREE.Vector3(), _s = new THREE.Vector3();

  function render(scene, camera, p = {}) {
    size();
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    renderer.autoClear = false;
    // bloom chain
    pre.uniforms.t.value = sceneRT.texture; pre.uniforms.px.value.set(1 / W, 1 / H); pre.uniforms.thr.value = p.thr ?? 0.9;
    pass(pre, mips[0]);
    for (let i = 1; i < LEV; i++) { down.uniforms.t.value = mips[i - 1].texture; down.uniforms.px.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); pass(down, mips[i]); }
    for (let i = LEV - 1; i > 0; i--) { up.uniforms.t.value = mips[i].texture; up.uniforms.px.value.set(1 / mips[i].width, 1 / mips[i].height); up.uniforms.k.value = 1; pass(up, mips[i - 1]); }
    // composite
    const u = comp.uniforms;
    u.tS.value = sceneRT.texture; u.tB.value = mips[0].texture;
    u.uBloom.value = p.bloom ?? 0.55; u.uBlur.value = p.blur || 0; u.uTime.value = (p.time || 0) % 100; u.uVig.value = p.vig ?? 0.5; u.uAsp.value = W / H; u.uHurt.value = p.hurt || 0;
    u.uWhite.value = p.white || 0; if (p.whiteCol) u.uWhiteCol.value.set(p.whiteCol.r, p.whiteCol.g, p.whiteCol.b);
    if (p.haze) u.uHaze.value.set(p.haze.x, p.haze.y, p.haze.z); else u.uHaze.value.z = 0;
    // sun position on screen
    if (p.sunDir) {
      _s.copy(camera.position).addScaledVector(p.sunDir, 1000).project(camera);
      _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const facing = _v.dot(p.sunDir);
      u.uSun.value.set(_s.x * 0.5 + 0.5, _s.y * 0.5 + 0.5, facing > 0.2 && Math.abs(_s.x) < 1.2 && Math.abs(_s.y) < 1.2 ? (p.flare ?? 1) : 0);
    } else u.uSun.value.z = 0;
    renderer.setRenderTarget(null);
    pass(comp, null);
    renderer.autoClear = prevAuto;
  }
  function project(vec3, camera, out) { _v.copy(vec3).project(camera); out.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, _v.z); return out; }
  return { render, project, dispose() { sceneRT?.dispose(); mips.forEach((m) => m.dispose()); } };
}
