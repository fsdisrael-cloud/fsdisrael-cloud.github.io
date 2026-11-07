// Time of day + weather: sky dome, sun/moon, stars, lights, fog, toon clouds, rain/snow, lightning.
import { FX } from "./tex.js?v=27";
import * as THREE from "three";
import { PartBuilder, G, getGradientMap, outlineMaterial } from "./toon.js?v=27";
import { style, skyHueChunk } from "./surreal.js?v=27";

export const TIMES = ["dawn", "day", "dusk", "night"];
export const WEATHERS = ["clear", "cloudy", "rain", "fog", "snow", "storm"];

const TOD = {
  day: { elev: 55, az: 140, top: 0x2f7fd8, hor: 0xbfe3ff, bot: 0xd9efff, sun: 0xfff4dc, sunI: 2.3, hs: 0xcfe8ff, hg: 0x7a6a50, hI: 1.0, fog: 0xc4dcf0, tint: 0xffffff, cloud: 0xffffff, exp: 1.0, stars: 0 },
  dawn: { elev: 9, az: 85, top: 0x4060a8, hor: 0xffb27a, bot: 0xffd2a8, sun: 0xffb070, sunI: 1.7, hs: 0xffd8c0, hg: 0x5a4a50, hI: 0.8, fog: 0xf0bc9c, tint: 0xffe2cc, cloud: 0xffd2bc, exp: 1.0, stars: 0.15 },
  dusk: { elev: 15, az: 262, top: 0x2b5c9c, hor: 0xffa648, bot: 0xffcf86, sun: 0xffb866, sunI: 2.1, hs: 0xffd2a0, hg: 0x9a7650, hI: 1.7, fog: 0xe8b07c, tint: 0xffdcae, cloud: 0xffcf9a, exp: 1.0, stars: 0.15 },
  night: { elev: 38, az: 200, top: 0x040a1c, hor: 0x1d2d55, bot: 0x26386a, sun: 0xa8c4ff, sunI: 0.9, hs: 0x5876c0, hg: 0x141828, hI: 0.75, fog: 0x15203c, tint: 0x8094c8, cloud: 0x6a7aa4, exp: 1.05, stars: 1 },
};
const WX = {
  clear: { over: 0.0, near: 3000, far: 18000, clouds: 9, sunK: 1, rain: 0, snow: 0, lightning: false },
  cloudy: { over: 0.45, near: 2000, far: 12000, clouds: 30, sunK: 0.7, rain: 0, snow: 0, lightning: false },
  rain: { over: 0.78, near: 300, far: 4200, clouds: 46, sunK: 0.42, rain: 1, snow: 0, lightning: true },
  fog: { over: 0.65, near: 40, far: 1300, clouds: 6, sunK: 0.6, rain: 0, snow: 0, lightning: false },
  snow: { over: 0.6, near: 250, far: 3600, clouds: 24, sunK: 0.6, rain: 0, snow: 1, lightning: false },
  storm: { over: 0.92, near: 250, far: 3000, clouds: 50, sunK: 0.35, rain: 1.6, snow: 0, lightning: true },
};

function grey(c, amt, lum = null) {
  const l = lum ?? (0.3 * c.r + 0.59 * c.g + 0.11 * c.b);
  return c.clone().lerp(new THREE.Color(l, l, l * 1.04), amt);
}

// Psychedelic signature: shared uniforms (time + strength) used by the sky dome and the clouds.
export const psy = { uPsy: { value: 0 }, uPsyAmt: { value: 1 } };

function hemiSkyColor(T, k) { return new THREE.Color(T.hs).multiplyScalar(0.7 * k); }

export function createSky(scene, renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  const amb = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(hemi, sun, sun.target, amb);
  scene.fog = new THREE.Fog(0xffffff, 1000, 10000);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
      stars: { value: 0 }, night: { value: 0 }, over: { value: 0 }, flash: { value: 0 }, uSur: style.uSur, uTime: style.uTime, uPsy: psy.uPsy, uPsyAmt: psy.uPsyAmt,
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top, hor, bot, sunCol, sunDir; uniform float stars, night, over, flash, uSur, uTime, uPsy, uPsyAmt;
      ${skyHueChunk()}
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(hor, top, pow(smoothstep(0.0, 0.75, h), 0.8)) : mix(hor, bot, smoothstep(0.0, -0.25, h));
        float sdot = max(dot(d, normalize(sunDir)), 0.0);
        if (uSur < 0.5) {
          // realistic: Rayleigh-style gradient (pale near the horizon, deeper at the zenith), horizon haze, Mie forward glow
          float hh = max(h, 0.0);
          col = h > 0.0 ? mix(hor, top, pow(1.0 - exp(-hh * 3.6), 1.15)) : mix(hor, bot, smoothstep(0.0, -0.2, h));
          col *= 1.0 - 0.16 * pow(hh, 0.7) * (1.0 - over);
          float hz = exp(-abs(h) * 7.0);
          col = mix(col, hor * 1.04, hz * 0.55);
          float sunSide = pow(sdot, 3.0);
          col += sunCol * sunSide * hz * 0.38 * (1.0 - over * 0.7);
          float g = 0.78; float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * sdot, 1.5);
          col += sunCol * mie * 0.018 * (1.0 - over * 0.85) * (0.35 + 0.65 * smoothstep(-0.05, 0.4, h));
        }
        // ---- psychedelic signature: slowly shifting iridescent gradient + aurora ribbons (sky only) ----
        {
          float ang = atan(d.z, d.x);
          vec3 rb = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + h * 0.9 + ang * 0.16 + uPsy * 0.022));
          float up = smoothstep(-0.1, 0.55, h);
          col = mix(col, col * (0.62 + 0.8 * rb), 0.42 * uPsyAmt * (0.35 + 0.65 * up));
          float w1 = sin(ang * 3.0 + uPsy * 0.09 + h * 5.0) * 0.5 + 0.5;
          float w2 = sin(ang * 5.0 - uPsy * 0.06 + h * 9.0 + sin(uPsy * 0.04) * 2.5) * 0.5 + 0.5;
          float band = pow(w1 * w2, 1.6) * smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.5, 0.95, h));
          col += rb * band * 0.55 * uPsyAmt * (1.0 - over * 0.7);
        }
        float s = sdot;
        float disc = smoothstep(0.9975, 0.9985, s);   // round soft sun/moon disc
        float ring = smoothstep(0.9965, 0.9975, s) - disc; // Ubu outline ring
        vec3 glow = sunCol * (pow(s, 12.0) * 0.45 + pow(s, 200.0) * 0.6) * (1.0 - over * 0.8);
        col += glow;
        vec3 discCol = night > 0.5 ? vec3(0.92, 0.95, 1.0) : vec3(1.0, 0.97, 0.85);
        col = mix(col, discCol, disc * (1.0 - over));
        col = mix(col, vec3(0.08), ring * 0.6 * (1.0 - over) * step(0.5, uSur));
        if (stars > 0.0 && h > 0.0) {
          vec3 g = floor(d * 220.0);
          float r = hash(g);
          float st = step(0.9975, r) * smoothstep(0.0, 0.25, h);
          col += vec3(st) * stars * (1.0 - over) * (0.6 + 0.4 * hash(g + 3.1));
        }
        col += vec3(0.8, 0.85, 1.0) * flash;
        if (uSur > 0.5) {
          col = ubuHue(col, sin(uTime * 0.12 + d.x * 1.5 + d.z) * 0.6);
          float sw = sin(d.x * 9.0 + uTime * 0.4) * sin(d.z * 7.0 - uTime * 0.3) * smoothstep(0.0, 0.5, h);
          col += vec3(0.08, 0.05, 0.1) * sw;
        }
        col += (hash(d * 913.7) - 0.5) / 120.0;   // dither against banding
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Clouds: one merged geometry of puffy toon spheres (2 draw calls)
  const cloudMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap(), color: 0xffffff, emissive: 0x000000 });
  cloudMat.onBeforeCompile = (sh) => {
    sh.uniforms.uPsy = psy.uPsy; sh.uniforms.uPsyAmt = psy.uPsyAmt;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp; uniform float uPsy, uPsyAmt;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += (0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + vWp.x * 0.00035 + vWp.y * 0.0009 + vWp.z * 0.0003 + uPsy * 0.035))) * 0.30 * uPsyAmt;");
  };
  const cloudOutline = outlineMaterial(0x51627e, 0.8);
  // build 16: realistic soft volumetric-looking clouds (fbm-eroded, sun-lit with silver lining) for the realistic style
  const cloudReal = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, vertexColors: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(1, 1, 1) }, uSunD: FX.sunDir, uSunC: FX.sunCol, uAmb: { value: new THREE.Color(0.55, 0.62, 0.75) }, uDark: { value: 0 } }]),
    vertexShader: `
      varying vec3 vWp; varying vec3 vN; varying vec3 vC;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vC = color;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec3 vWp; varying vec3 vN; varying vec3 vC;
      uniform vec3 uCol, uSunD, uSunC, uAmb; uniform float uDark;
      #include <fog_pars_fragment>
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vWp), L = normalize(uSunD);
        float f = abs(dot(N, V));
        vec3 q = vWp * 0.011;
        float n = n3(q) * 0.55 + n3(q * 2.3 + 7.0) * 0.3 + n3(q * 5.1 + 3.0) * 0.15;
        float dens = smoothstep(0.12, 0.62, f * 0.95 + n * 0.62 - 0.3);
        float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        float lit = pow(wrap, 1.35) * (0.55 + 0.45 * n);
        float under = smoothstep(-0.7, 0.5, N.y);
        vec3 base = uCol * vC;
        vec3 shade = mix(uAmb * 0.55, vec3(1.0), under) * mix(0.55, 1.0, uDark * 0.0 + 1.0 - uDark * 0.4);
        vec3 col = base * (shade * 0.62 + uSunC * 0.55 * lit);
        float silver = pow(1.0 - f, 3.0) * pow(max(dot(-V, L), 0.0), 3.0);
        col += uSunC * silver * 0.5;
        float nearF = smoothstep(25.0, 260.0, distance(cameraPosition, vWp));
        gl_FragColor = vec4(col, dens * 0.94 * nearF);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  let cloudGroup = null; let CP = new Float32Array(0);
  /** 0..1 how deep the point is inside a cloud / fog bank (ellipsoid falloff) */
  function cloudDensityAt(p) {
    let m = 0;
    for (let i = 0; i < CP.length; i += 6) {
      const dy = (p.y - CP[i + 1]) / CP[i + 4]; if (dy > 1 || dy < -1) continue;
      const dx = (p.x - CP[i]) / CP[i + 3], dz = (p.z - CP[i + 2]) / CP[i + 5];
      const q = dx * dx + dy * dy + dz * dz; if (q < 1) { const v = 1 - q; if (v > m) m = v; }
    }
    return Math.min(1, m * 1.8);
  }
  function buildClouds(count, center, half, dark, seed, fogBanks = 0) {
    if (cloudGroup) { scene.remove(cloudGroup); cloudGroup.children[0].geometry.dispose(); }
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const b = new PartBuilder(); const cpl = [];
    for (let i = 0; i < count; i++) {
      const cx = center.x + (rnd() * 2 - 1) * half * 1.3, cz = center.z + (rnd() * 2 - 1) * half * 1.3;
      const cy = (dark ? 750 : 1000) + rnd() * 700;
      const n = 5 + Math.floor(rnd() * 5);
      const size = 90 + rnd() * 110;
      for (let j = 0; j < n; j++) {
        const r = size * (0.55 + rnd() * 0.6);
        const shade = dark ? 0xb4bccb : 0xffffff;
        b.add(G.sphereLo, j === 0 ? shade : (dark ? 0xc4cad6 : 0xf4f8ff), {
          pos: [cx + (rnd() - 0.5) * size * 3, cy + (rnd() - 0.3) * size * 0.7, cz + (rnd() - 0.5) * size * 2],
          scale: [r * 1.3, r * 0.8, r],
        });
        cpl.push(cx, cy, cz, r * 1.2, r * 0.75, r * 0.95);
      }
    }
    // low fog / stratus banks you can fly through: wide flat puffs (more of them in murky weather)
    const banks = fogBanks;
    for (let i = 0; i < banks; i++) {
      const cx = center.x + (rnd() * 2 - 1) * half * 0.9, cz = center.z + (rnd() * 2 - 1) * half * 0.9, cy = 380 + rnd() * 380, size = 260 + rnd() * 260;
      for (let j = 0; j < 4; j++) {
        const px = cx + (rnd() - 0.5) * size * 2.2, pz = cz + (rnd() - 0.5) * size * 1.6, py = cy + (rnd() - 0.5) * 40;
        b.add(G.sphereLo, 0xf4f8ff, { pos: [px, py, pz], scale: [size * 1.0, size * 0.34, size * 0.75] });
        cpl.push(px, py, pz, size * 0.95, size * 0.32, size * 0.7);
      }
    }
    CP = new Float32Array(cpl);
    const geo = b.build();
    cloudGroup = new THREE.Group();
    const real = !style.surreal;
    const body = new THREE.Mesh(geo, real ? cloudReal : cloudMat);
    const ol = new THREE.Mesh(geo, cloudOutline);
    ol.visible = !real;
    body.renderOrder = real ? 2 : 0;
    cloudGroup.add(body, ol);
    scene.add(cloudGroup);
  }

  // Rain (GPU-animated line segments)
  const RAIN_N = 2200, BOX = 180;
  const rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(RAIN_N * 6), rEnd = new Float32Array(RAIN_N * 2);
  for (let i = 0; i < RAIN_N; i++) {
    const x = Math.random() * BOX, y = Math.random() * BOX, z = Math.random() * BOX;
    rp.set([x, y, z, x, y, z], i * 6); rEnd[i * 2] = 0; rEnd[i * 2 + 1] = 1;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  rainGeo.setAttribute("aEnd", new THREE.BufferAttribute(rEnd, 1));
  const rainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color(0xcfe0ff) }, uOp: { value: 0.45 }, uLen: { value: 1 } },
    vertexShader: `
      attribute float aEnd; uniform float uTime, uLen; uniform vec3 uCam, uVel; varying float vA;
      void main(){
        vec3 p = position; float B = ${BOX.toFixed(1)};
        p.y -= uTime * 70.0; p.x += uTime * 8.0;
        p = mod(p - uCam, B) - B * 0.5 + uCam;
        vec3 streak = vec3(-8.0, 70.0, 0.0) * 0.022 * uLen + uVel * 0.02;
        p += streak * aEnd;
        vA = 1.0 - aEnd * 0.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uCol, uOp * vA); }`,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);

  // Snow (GPU points)
  const SNOW_N = 1600;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < SNOW_N * 3; i++) sp[i] = Math.random() * BOX;
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPx: { value: 4 } },
    vertexShader: `
      uniform float uTime, uPx; uniform vec3 uCam;
      void main(){
        vec3 p = position; float B = ${BOX.toFixed(1)};
        p.y -= uTime * 9.0; p.x += sin(uTime * 0.7 + position.y) * 3.0;
        p = mod(p - uCam, B) - B * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uPx * 60.0 / -mv.z, 1.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.3, d) * 0.9); }`,
  });
  const snow = new THREE.Points(sg, snowMat);
  snow.frustumCulled = false; snow.visible = false;
  scene.add(snow);

  let state = { time: "day", weather: "clear" };
  let flash = 0, nextBolt = 5, baseHemi = 1, baseSun = 1, baseAmb = 0.2;
  let terrainMats = [];
  let onThunder = null;
  const t0 = performance.now();

  let lastArgs = null;
  function apply(time, weather, opts = {}) {
    lastArgs = [time, weather, opts];
    const { center = new THREE.Vector3(), half = 12000, seed = 1, terrain = [] } = opts;
    state = { time, weather };
    terrainMats = terrain;
    const T = TOD[time] || TOD.day, W = WX[weather] || WX.clear;
    const over = W.over;
    const top = grey(new THREE.Color(T.top), over * 0.85), hor = grey(new THREE.Color(T.hor), over * 0.8), bot = grey(new THREE.Color(T.bot), over * 0.8);
    const fogCol = grey(new THREE.Color(T.fog), over * 0.7);
    if (over > 0.5) { hor.lerp(fogCol, over); bot.copy(fogCol); }
    if (weather === "fog") { top.lerp(fogCol, 0.6); hor.copy(fogCol); bot.copy(fogCol); }
    if (style.surreal) {
      const n = time === "night" ? 0.45 : 1;
      top.setHex(0xa98bff).multiplyScalar(n); hor.setHex(0xffc2ea).multiplyScalar(n); bot.setHex(0xc4fff0).multiplyScalar(n);
      fogCol.setHex(time === "night" ? 0x5a4a8a : 0xf6d8ff).lerp(new THREE.Color(0xd8d0e8), over * 0.4);
      if (weather === "fog") { hor.copy(fogCol); bot.copy(fogCol); }
    }
    const pl = opts.planet && opts.planet.top != null ? opts.planet : null, se = !pl && opts.season ? opts.season : null;
    const nK = time === "night" ? 0.34 : time === "dawn" || time === "dusk" ? 0.78 : 1;
    if (pl) {
      top.setHex(pl.top).multiplyScalar(nK); hor.setHex(pl.hor).multiplyScalar(nK); bot.setHex(pl.bot).multiplyScalar(nK);
      fogCol.setHex(pl.fog).multiplyScalar(nK);
      if (weather === "fog") { hor.copy(fogCol); bot.copy(fogCol); }
    }
    skyMat.uniforms.top.value.copy(top);
    skyMat.uniforms.hor.value.copy(hor);
    skyMat.uniforms.bot.value.copy(bot);
    skyMat.uniforms.sunCol.value.setHex(pl ? pl.sun : T.sun);
    skyMat.uniforms.stars.value = T.stars;
    skyMat.uniforms.night.value = time === "night" ? 1 : 0;
    skyMat.uniforms.over.value = over;
    psy.uPsyAmt.value = style.surreal ? (time === "night" ? 0.75 : 1) * (1 - over * 0.45) : 0;
    const el = THREE.MathUtils.degToRad(T.elev), az = THREE.MathUtils.degToRad(T.az);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    skyMat.uniforms.sunDir.value.copy(dir);
    FX.sunDir.value.copy(dir); FX.sunCol.value.setHex(pl ? pl.sun : T.sun).multiplyScalar(Math.min(1.6, T.sunI * 0.55) * (1 - over * 0.85));
    sun.position.copy(dir).multiplyScalar(5000);
    sun.color.setHex(T.sun);
    baseSun = T.sunI * W.sunK;
    sun.intensity = baseSun;
    hemi.color.setHex(T.hs); hemi.groundColor.setHex(T.hg);
    baseHemi = T.hI * (0.75 + 0.25 * (1 - over));
    hemi.intensity = baseHemi;
    baseAmb = time === "night" ? 0.25 : 0.18;
    amb.intensity = baseAmb;
    scene.fog.color.copy(fogCol);
    scene.fog.near = W.near * (time === "night" ? 0.8 : 1);
    scene.fog.far = W.far * (time === "night" ? 0.75 : 1);
    renderer.toneMappingExposure = T.exp;
    renderer.setClearColor(fogCol);
    const tint = new THREE.Color(style.surreal ? (time === "night" ? 0xb0a0e0 : 0xffffff) : T.tint);
    if (weather === "snow") tint.lerp(new THREE.Color(0xeef4ff), 0.25);
    if (over > 0.4) tint.multiplyScalar(1 - over * 0.15);
    if (pl) tint.multiply(new THREE.Color(pl.tint[0], pl.tint[1], pl.tint[2]));
    else if (se && se.tint) tint.multiply(new THREE.Color(se.tint[0], se.tint[1], se.tint[2]));
    for (const m of terrain) m.color.copy(tint);
    const ct = new THREE.Color(style.surreal ? 0xffd6f4 : T.cloud);
    if (over > 0.5) ct.multiplyScalar(1 - (over - 0.5) * 0.6);
    if (pl) ct.setHex(pl.cloud).multiplyScalar(nK);
    cloudMat.color.copy(ct); cloudReal.uniforms.uCol.value.copy(ct); cloudReal.uniforms.uDark.value = over > 0.5 ? 1 : 0; cloudReal.uniforms.uAmb.value.copy(hemiSkyColor(T, nK));
    cloudMat.emissive.copy(ct).multiplyScalar(time === "night" ? 0.12 : 0.28);
    buildClouds(W.clouds, center, half, over > 0.5, seed, W.near < 500 ? 12 : state.weather === "rain" || state.weather === "storm" ? 10 : state.weather === "cloudy" ? 5 : state.weather === "snow" ? 8 : state.weather === "clear" ? 2 : 0);   // b21: flat stratus banks seen edge-on read as thin bright streaks across the sky -> only in fog/rain/snow
    rain.visible = W.rain > 0;
    rainMat.uniforms.uOp.value = 0.32 + 0.18 * Math.min(1, W.rain - 0.5);
    rainMat.uniforms.uCol.value.setHex(time === "night" ? 0x8aa0d0 : 0xd8e4ff);
    snow.visible = W.snow > 0;
    nextBolt = 3 + Math.random() * 5;
    return { fogColor: fogCol, sunDir: dir };
  }

  function update(dt, camPos, camVel) {
    sky.position.copy(camPos);
    const t = (performance.now() - t0) / 1000;
    psy.uPsy.value = t; FX.time.value = t;
    rainMat.uniforms.uTime.value = t; rainMat.uniforms.uCam.value.copy(camPos);
    if (camVel) rainMat.uniforms.uVel.value.copy(camVel).multiplyScalar(-1);
    snowMat.uniforms.uTime.value = t; snowMat.uniforms.uCam.value.copy(camPos);
    sun.target.position.copy(camPos);
    sun.position.copy(skyMat.uniforms.sunDir.value).multiplyScalar(5000).add(camPos);
    if (WX[state.weather]?.lightning) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        flash = 1; nextBolt = state.weather === "storm" ? 3.5 + Math.random() * 7 : 9 + Math.random() * 12;
        const delay = 0.3 + Math.random() * 1.8;
        setTimeout(() => onThunder?.(), delay * 1000);
      }
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 3.5);
      const f = flash * (0.6 + 0.4 * Math.sin(t * 80));
      skyMat.uniforms.flash.value = f * 0.8;
      hemi.intensity = baseHemi + f * 2.5;
      amb.intensity = baseAmb + f * 1.2;
    } else if (skyMat.uniforms.flash.value) {
      skyMat.uniforms.flash.value = 0; hemi.intensity = baseHemi; amb.intensity = baseAmb;
    }
  }

  return {
    apply, update, state: () => state, cloudDensityAt, cloudAt: (i) => CP.length > i * 6 ? [CP[i * 6], CP[i * 6 + 1], CP[i * 6 + 2]] : null, cloudColor: () => cloudReal.uniforms.uCol.value,
    reapply() { if (lastArgs) apply(...lastArgs); },
    setThunderHandler(fn) { onThunder = fn; },
    isNight: () => state.time === "night",
  };
}
