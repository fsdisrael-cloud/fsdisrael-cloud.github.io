// Ubu game world: flight model, camera, targets, AI, weapons, effects, objectives.
import { createPost } from "./post.js?v=30";
import * as THREE from "three";
import { buildTerrain } from "./terrain.js?v=30";
import { createSky } from "./sky.js?v=30";
import { createPilot, createSeat, createChute, createAirstrip, STRIP, createPlayerJet, setCockpitMode, createEnemyJet, createAllyJet, createTank, createJeep, createAlienWalker, createAlienTurret, createAlienSpire, createHive, createShip, createWarship, createSub, createSamSite, createRocket, createHeli, createBomb, puffGeometry, initEnv, createCarrier, CARRIER, createBaseBuilding, createFlakGun, HARDPOINTS, setTargetStyle, glowSprite } from "./models.js?v=30";
import { JET_TYPES, FOE_TYPES, SEASONS, runLabel } from "./variety.js?v=30";
import { createRing, createBalloon, createPracticeTarget, createDrone } from "./entities.js?v=30";
import { toonMaterial, outlineMaterial, toonModel, PartBuilder, G, outlineUniforms } from "./toon.js?v=30";
import { POINTS, LABEL, LABEL1, mulberry32 } from "./missions.js?v=30";
import { setQuality, FX as FXQ } from "./tex.js?v=30";
import { style, patchTerrain, waveAt, createDreamShapes, onStyle, setLake } from "./surreal.js?v=30";

const V = () => new THREE.Vector3();
const tA = V(), tB = V(), tC = V(), tD = V(), tE = V();
const UP = new THREE.Vector3(0, 1, 0);
const HP = { tank: 10, sam: 10, ship: 24, jet: 8, drone: 3, target: 4, balloon: 1, flak: 8, base: 14 };
const GRAV = 22;

function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function fwdFrom(yaw, pitch, out) { const c = Math.cos(pitch); return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c); }
function segSphere(p0, p1, c, r) {
  // closest distance from segment p0-p1 to c <= r
  tA.subVectors(p1, p0); tB.subVectors(c, p0);
  const L2 = tA.lengthSq();
  let t = L2 > 0 ? tB.dot(tA) / L2 : 0; t = Math.max(0, Math.min(1, t));
  tC.copy(p0).addScaledVector(tA, t);
  return tC.distanceToSquared(c) <= r * r;
}

export function createGame({ renderer, audio, controls, haptics, events }) {
  const scene = new THREE.Scene();
  // b23: one pooled point light that flashes orange on every explosion (created at start so no shader recompile hitch mid-flight)
  const boomLight = new THREE.PointLight(0xff9a48, 0, 400, 2); boomLight.position.set(0, -500, 0); scene.add(boomLight);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 32000);
  const sky = createSky(scene, renderer);
  sky.setThunderHandler(() => audio.thunder());

  let terrain = null, L = null, rng = Math.random;
  let player = null, plane = null;
  const targets = [];
  const rings = [];
  let heliT = 22, jetSpawner = null, groundWave = { t: 6, n: 0 }, allDone = false;
  let viewMode = "chase";
  let running = false, ended = false;
  let timeLeft = 180, elapsed = 0, score = 0;
  const progress = {};
  const stats = { shots: 0, hits: 0, rockets: 0, bombs: 0, kills: {}, rings: 0, damage: 0, crashes: 0, loops: 0 };
  let alienT = false, throttle = 0.35, combo = 0, lastKillT = -99, waveT = 0; const fires = [];
  let lockBeepT = 0, serviceAt = 0, criticalUntil = 0, bossSpawned = false;
  let slowT = 0, lastDamage = -10, shake = 0, lockTarget = null, lockTime = 0, lockCand = null;
  let alertMsg = null, alertTimer = 0, warnTimer = 0, pullUpTimer = 0, lastYaw = 0, orbitAccum = 0;
  let hardIdx = 0; const hpReload = [0, 0, 0, 0]; let ccip = null, muzzleFlip = 0, gunCool = 0, rocketRegen = 0, bombRegen = 0, rocketSide = 1;
  // weapon racks: 10 missiles + 10 bombs, one round is restored every N seconds; short delay between launches.
  const RACK = 10, ROCKET_REGEN = 3.7, BOMB_REGEN = 6.3, ROCKET_GAP = 0.28, BOMB_GAP = 0.45;
  let rocketCd = 0, bombCd = 0, emptyT = 0;
  // gun heat: fills in ~4 s of firing, overheats at 100%, must cool below 30% before firing again
  const HEAT_UP = 4, HEAT_DOWN = 2.5, HEAT_RESUME = 0.3;
  let assist = true; try { assist = localStorage.getItem("jet-assist") !== "0"; } catch { /* ignore */ }
  let aP = 0, aR = 0, assistDanger = 0;
  const MAX_BANK = 1.2; // rad: roll is limited (no barrel rolls)
  let endless = false;
  const allies = [];
  let half = 10000, center = new THREE.Vector3();
  // full 6-DOF attitude (quaternion), loop autopilot, crash + respawn, gun heat
  let lives = 5; const LIVES_MAX = 5;
  let maneuver = null, crashing = null, invulnUntil = 0, lowAlt = false, voiceT = 0;
  let heat = 0, overheated = false;
  const camQ = new THREE.Quaternion();
  const _qa = new THREE.Quaternion(), _qL = new THREE.Quaternion(), _eu = new THREE.Euler(0, 0, 0, "YXZ");
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  const SOLID = { tank: 1, ship: 1, sam: 1, jet: 1, target: 1, drone: 1, flak: 1, base: 1 };
  const groundAt = (x, z) => terrain.heightAt(x, z) + waveAt(x, z);
  const dream = createDreamShapes(scene);
  onStyle((on) => { dream.setVisible(on); sky.reapply(); });

  // ---------- pools ----------
  const MAXB = 140;
  const tracerGeo = new THREE.CapsuleGeometry(0.35, 7, 2, 6).rotateX(Math.PI / 2);
  const pTracers = new THREE.InstancedMesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff06a }), MAXB);
  const eTracers = new THREE.InstancedMesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xff5040 }), MAXB);
  const aTracers = new THREE.InstancedMesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0x6aff9a }), MAXB);
  for (const m of [pTracers, eTracers, aTracers]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
  const bullets = []; // {p, v, life, enemy}

  const PUFFS = 760;
  const puffGeo = puffGeometry();
  // smoke: soft, translucent, lit puffs (no cartoon outline) - realistic smoke trails and explosion plumes
  const smokeGeo = puffGeo.clone();
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 3), 3), aAlp = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
  smokeGeo.setAttribute("aCol", aCol); smokeGeo.setAttribute("aA", aAlp);
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uLight: { value: 1 } },
    vertexShader: `attribute vec3 aCol; attribute float aA; varying vec3 vN; varying vec3 vC; varying float vA;
      void main(){ vN = normalize(mat3(modelViewMatrix) * normal); vC = aCol; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uLight; varying vec3 vN; varying vec3 vC; varying float vA;
      void main(){ vec3 n = normalize(vN); float edge = pow(clamp(abs(n.z), 0.0, 1.0), 0.7); float lit = 0.55 + 0.45 * clamp(dot(n, normalize(vec3(0.45, 0.8, 0.4))) * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(vC * lit * uLight, vA * edge); }`,
  });
  const puffMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, PUFFS);
  const puffOutline = new THREE.InstancedMesh(puffGeo, outlineMaterial(0x2a2a2a, 0.55), PUFFS);
  for (const m of [puffMesh, puffOutline]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
  puffOutline.visible = false; puffMesh.renderOrder = 4;
  const puffs = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(), _c = new THREE.Color();

  // additive glow particles (fire, sparks, prismatic trails) - cheap, one draw call
  const FX = 420;
  // b26: soft billboard glow sprites with a noisy edge (fireballs, sparks, flashes) instead of hard 3D discs
  const fxMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vC; varying vec2 vS;
      void main(){ vec4 ctr = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz); ctr.xy += position.xy * s * 1.45;
        vUv = position.xy; vC = instanceColor; vS = instanceMatrix[3].xz * 0.37;
        gl_Position = projectionMatrix * ctr; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vC; varying vec2 vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ float r = length(vUv); if (r > 1.0) discard;
        float n = vn(vUv * 2.6 + vS) * 0.6 + vn(vUv * 5.5 - vS) * 0.4;
        float edge = 1.0 - smoothstep(0.35 + n * 0.25, 1.0, r);
        float core = pow(1.0 - r, 2.2);
        float a = edge * (0.55 + 0.45 * n) + core * 0.9;
        gl_FragColor = vec4(vC * a, 1.0); }`,
  });
  const fxMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), fxMat, FX);
  fxMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FX * 3), 3);
  fxMesh.count = 0; fxMesh.frustumCulled = false; fxMesh.renderOrder = 6; scene.add(fxMesh);
  const fxs = [];
  const FIRE0 = new THREE.Color(0.6, 0.36, 0.1), FIRE1 = new THREE.Color(0.5, 0.07, 0.015);
  function fx(p, v, s0, s1, life, color, grav = 0, drag = 1.2) {
    if (fxs.length >= FX) fxs.shift();
    fxs.push({ p: p.clone(), v: v ? v.clone() : V(), s0, s1, life, t: 0, c: color == null ? null : new THREE.Color(color), g: grav, d: drag });
  }
  const prismHex = (t, off = 0) => _c.setHSL(((t * 0.18 + off) % 1 + 1) % 1, 0.9, 0.62).getHex();
  // chromatic shockwave rings (billboards, rainbow rim)
  const shocks = [];
  {
    const geo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uK: { value: 0 }, uHue: { value: 0 }, uCol: { value: new THREE.Color(1, 0.7, 0.4) }, uMix: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `varying vec2 vUv; uniform float uK, uHue, uMix; uniform vec3 uCol;
          vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
          void main(){ float r = length(vUv); float a = atan(vUv.y, vUv.x) / 6.2832;
            float ring = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.88, 1.0, r));
            vec3 c = mix(uCol, hsv(fract(a * 2.0 + uHue + r * 0.8)), uMix);
            float fade = (1.0 - uK); gl_FragColor = vec4(c * 1.4 * ring * fade * fade, ring * fade); }`,
      });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = 7; scene.add(m);
      shocks.push({ m, mat, t: 0, life: 0.7, size: 30, active: false });
    }
  }
  function shock(p, size) {
    const s = shocks.find((x) => !x.active) || shocks[0];
    s.active = true; s.t = 0; s.life = 0.55 + size * 0.004; s.size = size; s.m.visible = true; s.m.position.copy(p); s.mat.uniforms.uHue.value = Math.random();
    if (WS.kind === "std") { s.mat.uniforms.uCol.value.setRGB(1.0, 0.72, 0.42); s.mat.uniforms.uMix.value = 0; } else { s.mat.uniforms.uCol.value.setHex(WS.fx).multiplyScalar(1.4); s.mat.uniforms.uMix.value = 0.0; }
  }
  const explosions = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshToonMaterial({ color: 0xffc040, emissive: 0xff7a20, emissiveIntensity: 0.6, gradientMap: toonMaterial().gradientMap });
    const geo = new PartBuilder().add(G.sphere, 0xffffff).build();
    const g = toonModel(geo, { material: mat, outlineScale: 1.1 });
    g.visible = false; scene.add(g);
    explosions.push({ g, mat, t: 0, life: 1, size: 10, active: false });
  }
  const debris = [];
  {
    const parts = [[G.box, 0x6d7480], [G.sphereLo, 0x3b3f46], [G.box, 0x9aa3ad], [G.cone, 0xf2c94c]];
    for (let i = 0; i < 40; i++) {
      const [geo, col] = parts[i % parts.length];
      const g = toonModel(new PartBuilder().add(geo, col).build(), { outlineScale: 1.15 });
      g.visible = false; scene.add(g);
      debris.push({ g, p: V(), v: V(), spin: V(), life: 0, active: false });
    }
  }
  const rockets = [];
  // player missiles: realistic body + an energy-bolt glow that replaces it on alien worlds
  for (let i = 0; i < 12; i++) {
    const o = new THREE.Group(), model = createRocket(0xe6e9ec, 0x2b3036), glow = glowSprite(0xffffff, 9, 0.95);
    glow.visible = false; o.add(model, glow); o.visible = false; scene.add(o);
    rockets.push({ o, model, glow, active: false, p: V(), v: V() });
  }
  const missiles = [];
  for (let i = 0; i < 6; i++) { const o = createRocket(0xe9e4ff, 0xa040ff); o.visible = false; scene.add(o); missiles.push({ o, active: false, p: V(), v: V() }); }
  const bombs = [];
  for (let i = 0; i < 12; i++) {
    const o = new THREE.Group(), model = createBomb(), glow = glowSprite(0xffffff, 14, 0.95);
    const core = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false })); core.scale.setScalar(1.3);
    glow.visible = false; core.visible = false; o.add(model, glow, core); o.visible = false; scene.add(o);
    bombs.push({ o, model, glow, core, active: false, p: V(), v: V() });
  }
  // weapon style for this world: std = realistic missiles and bombs, laser / plasma = alien energy weapons
  const WS = { kind: "std", fx: 0xffffff };
  function applyWeaponStyle(planet) {
    WS.kind = planet?.weapon || "std"; WS.fx = planet?.fx || 0xffffff;
    pTracers.material.color.setHex(WS.kind === "std" ? 0xfff06a : WS.fx);
    for (const r of rockets) { r.model.visible = WS.kind === "std"; r.glow.visible = WS.kind !== "std"; r.glow.material.color.setHex(WS.fx); }
    for (const b of bombs) { b.model.visible = WS.kind === "std"; b.glow.visible = b.core.visible = WS.kind !== "std"; b.glow.material.color.setHex(WS.fx); b.core.material.color.setHex(0xffffff); }
    for (const e of explosions) { if (WS.kind === "std") { e.mat.color.setHex(0xffc040); e.mat.emissive.setHex(0xff7a20); } else { e.mat.color.setHex(WS.fx); e.mat.emissive.setHex(WS.fx); } }
  }
  const muzzle = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  muzzle.visible = false;
  // CCIP ground ring
  const ccipRing = new THREE.Mesh(new THREE.RingGeometry(14, 20, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ccipRing.visible = false; scene.add(ccipRing);
  const ccipLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }));
  ccipLine.frustumCulled = false; ccipLine.visible = false; scene.add(ccipLine);

  // ---------- effects ----------
  function puff(p, v, s0, s1, life, color, big) {
    if (puffs.length >= PUFFS) puffs.shift();
    puffs.push({ p: p.clone(), v: v ? v.clone() : V(), s0, s1, life, t: 0, color, big });
  }
  // ---------- ribbon trails: continuous soft tubes (camera-facing 3-vertex strips), never particles / beads ----------
  const RB_N = 90, rbPool = [[], []], rbLive = [], _rbA = new THREE.Vector3(), _rbB = new THREE.Vector3(), _rbS = new THREE.Vector3();
  function rbCreate(add) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RB_N * 9), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(RB_N * 12), 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < RB_N - 1; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b + 1, a, b + 1, b, a + 1, a + 2, b + 2, a + 1, b + 2, b + 1); }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !add });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
    return { mesh, geo, pts: [], add };
  }
  /** o: { life, w0, w1 (half width start/end, m), r,g,b, a (peak alpha), add, rise (smoke buoyancy), spread } */
  function rbStart(o) {
    const rb = rbPool[o.add ? 1 : 0].pop() || rbCreate(!!o.add);
    rb.o = o; rb.pts.length = 0; rb.emit = true; rb.mesh.visible = true; rbLive.push(rb);
    return rb;
  }
  function rbEmit(rb, p, k = 1) {
    if (!rb || !rb.emit) return;
    const last = rb.pts[0];
    if (last && k > 0 && last.k > 0 && last.p.distanceToSquared(p) < 0.16) return;
    const o = rb.o, sp = o.spread || 0;
    rb.pts.unshift({ p: p.clone(), t: 0, k, vx: (Math.random() - 0.5) * sp, vy: (o.rise || 0) * (0.5 + Math.random() * 0.5), vz: (Math.random() - 0.5) * sp });
    if (rb.pts.length > RB_N) rb.pts.length = RB_N;
  }
  function rbStop(rb) { if (rb) rb.emit = false; }
  function rbClear() { for (const rb of rbLive) { rb.mesh.visible = false; rb.pts.length = 0; rbPool[rb.add ? 1 : 0].push(rb); } rbLive.length = 0; }
  function rbUpdate(dt) {
    for (let li = rbLive.length - 1; li >= 0; li--) {
      const rb = rbLive[li], o = rb.o, pts = rb.pts;
      for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; q.t += dt; if (q.t >= o.life) pts.length = i; else { q.p.x += q.vx * dt; q.p.y += q.vy * dt; q.p.z += q.vz * dt; } }
      if (!rb.emit && pts.length < 2) { rb.mesh.visible = false; rbLive.splice(li, 1); rbPool[rb.add ? 1 : 0].push(rb); continue; }
      const n = pts.length; if (n < 2) { rb.geo.setDrawRange(0, 0); continue; }
      const pos = rb.geo.attributes.position.array, col = rb.geo.attributes.color.array, cp = camera.position;
      for (let i = 0; i < n; i++) {
        const q = pts[i], a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(n - 1, i + 1)].p;
        _rbA.subVectors(a, b); _rbB.subVectors(cp, q.p);
        _rbS.crossVectors(_rbA, _rbB);
        if (_rbS.lengthSq() < 1e-6) { _rbS.set(0, 1, 0).cross(_rbA); if (_rbS.lengthSq() < 1e-8) _rbS.set(1, 0, 0); }
        _rbS.normalize();
        const k = q.t / o.life, w = (o.w0 + (o.w1 - o.w0) * Math.sqrt(k)) * (i === 0 ? 0.6 : 1);
        const al = o.a * q.k * Math.pow(1 - k, o.fade || 1.4) * Math.min(1, q.t / 0.04 + (i === 0 ? 0 : 1) * 0.35);
        const j = i * 9, c = i * 12;
        pos[j] = q.p.x - _rbS.x * w; pos[j + 1] = q.p.y - _rbS.y * w; pos[j + 2] = q.p.z - _rbS.z * w;
        pos[j + 3] = q.p.x; pos[j + 4] = q.p.y; pos[j + 5] = q.p.z;
        pos[j + 6] = q.p.x + _rbS.x * w; pos[j + 7] = q.p.y + _rbS.y * w; pos[j + 8] = q.p.z + _rbS.z * w;
        col[c] = o.r; col[c + 1] = o.g; col[c + 2] = o.b; col[c + 3] = 0;
        col[c + 4] = o.r; col[c + 5] = o.g; col[c + 6] = o.b; col[c + 7] = al;
        col[c + 8] = o.r; col[c + 9] = o.g; col[c + 10] = o.b; col[c + 11] = 0;
      }
      rb.geo.attributes.position.needsUpdate = true; rb.geo.attributes.color.needsUpdate = true;
      rb.geo.setDrawRange(0, (n - 1) * 12);
    }
  }
  const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const SMOKE_RB = { life: 2.8, w0: 0.35, w1: 3.0, r: 0.8, g: 0.81, b: 0.84, a: 0.75, rise: 0.9, spread: 0.7, fade: 1.3 };
  const FLAME_RB = { life: 0.13, w0: 0.9, w1: 0.12, r: 1, g: 0.6, b: 0.2, a: 0.95, add: true, fade: 0.8 };
  const EMISS_RB = { life: 3.4, w0: 0.5, w1: 4.2, r: 0.78, g: 0.8, b: 0.84, a: 0.7, rise: 1.2, spread: 1.0, fade: 1.2 };
  const BOMB_RB = { life: 2.0, w0: 0.3, w1: 2.0, r: 0.85, g: 0.86, b: 0.88, a: 0.6, rise: 0.6, spread: 0.5, fade: 1.3 };
  const TIP_RB = { life: 1.1, w0: 0.22, w1: 1.2, r: 0.88, g: 0.92, b: 0.98, a: 0.7, fade: 1.2 };
  let wtRb = [null, null], wtOn = false, dbgG = 0, dbgCam = null;
  function spawnDebris(p, n, speed, inherit) {
    let k = 0;
    for (const d of debris) {
      if (k >= n) break;
      if (d.active) continue;
      k++;
      d.active = true; d.life = 2.2 + Math.random() * 1.2;
      d.p.copy(p).add(tA.set((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4));
      d.v.set((Math.random() - 0.5) * speed, speed * 0.3 + Math.random() * speed * 0.6, (Math.random() - 0.5) * speed);
      if (inherit) d.v.addScaledVector(inherit, 0.25);
      d.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      d.g.scale.setScalar(0.8 + Math.random() * 1.6);
      d.g.position.copy(d.p); d.g.visible = true;
    }
  }
  function explode(p, size = 12, big = 1) {
    size *= 1.3;   // b24: bigger blasts
    const e = explosions.find((x) => !x.active) || explosions[0];
    e.active = false; e.g.visible = false;
    const std = WS.kind === "std";
    // fireball (additive; hot white-yellow core cooling to orange-red). Alien worlds: energy colour instead.
    const nf = Math.round(12 + big * 9);
    for (let i = 0; i < nf; i++) {
      tA.set(rng() - 0.5, rng() * 0.8 - 0.05, rng() - 0.5).normalize().multiplyScalar(size * (0.5 + rng() * 2.2));
      fx(tB.copy(p).addScaledVector(tA, 0.1), tA, size * 0.55, size * (1.0 + rng() * 0.9), 0.45 + rng() * 0.6, std ? null : (rng() < 0.4 ? 0xffffff : WS.fx), -3, 1.8);
    }
    // embers / sparks: glowing orange streaks that fall (alien: bright electric arcs)
    const ns = Math.round(24 + big * 16);
    for (let i = 0; i < ns; i++) {
      tA.set(rng() - 0.5, rng() * 0.9, rng() - 0.5).normalize().multiplyScalar(size * (3 + rng() * 6));
      fx(p, tA, Math.max(0.45, size * 0.06), 0.1, 0.5 + rng() * 0.9, std ? (rng() < 0.5 ? 0xffb040 : 0xff6a20) : (rng() < 0.5 ? 0xffffff : WS.fx), GRAV * 0.6, 0.5);
    }
    fx(p, null, size * 2.4, size * 3.4, 0.12, std ? 0xb8a070 : WS.fx, 0, 0); // flash
    shock(p, size * (2.6 + big * 0.8));
    if (big >= 1) { shock(p, size * (4.2 + big * 1.2)); fx(p, null, size * 3.4, size * 5, 0.09, 0xfff2d0, 0, 0); }
    if (!std) { shock(p, size * (1.6 + big * 0.4)); for (let i = 0; i < 6; i++) { tA.set(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize().multiplyScalar(size * (6 + rng() * 6)); fx(p, tA, size * 0.12, 0.05, 0.25, 0xffffff, 0, 2); } }
    // smoke: dark billowing plume that climbs and lingers (std worlds only; alien energy bursts leave a faint haze)
    const sm = std ? 9 + big * 6 : 3;
    for (let i = 0; i < sm; i++) {
      tA.set(rng() - 0.5, 0.2 + rng() * 0.9, rng() - 0.5).multiplyScalar(size * 1.4);
      tA.y += size * (0.5 + big * 0.4);
      puff(tB.copy(p).add(tA.clone().multiplyScalar(0.25)), tA.multiplyScalar(0.55), size * 0.45, size * (1.0 + rng() * 0.8), std ? 3.4 + rng() * 3 : 1.6, std ? (rng() < 0.55 ? 0x26262a : rng() < 0.6 ? 0x4a4a50 : 0x7b6a58) : WS.fx, true);
    }
    if (big >= 1) spawnDebris(p, 8 + Math.round(big * 6), size * 3.6);
    const d = camera.position.distanceTo(p);
    audio.explosion(big, d);
    boomLight.position.copy(p); boomLight.position.y += size * 0.5; boomLight.distance = size * 22; boomLight.intensity = Math.max(boomLight.intensity, size * size * (14 + big * 8));
    // b24: no screen shake / flash / vibration for explosions that are not hitting the player
  }

  // ---------- player ----------
  function makePlayer(colorKey) {
    if (plane) scene.remove(plane);
    initEnv(renderer);
    plane = createPlayerJet(colorKey, JET_TYPES[colorKey] || null);
    plane.scale.setScalar(1.15);
    muzzle.scale.setScalar(0.5);
    plane.add(muzzle);
    scene.add(plane);
  }

  // ---------- spawning helpers ----------
  function landSpot(cx, cz, rMin, rMax, tries = 60) {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x - center.x) > half - 500 || Math.abs(z - center.z) > half - 500) continue;
      if (terrain.isWater(x, z)) continue;
      const h = groundAt(x, z);
      const sl = Math.abs(groundAt(x + 25, z) - h) + Math.abs(groundAt(x, z + 25) - h);
      if (sl > 14) continue;
      return new THREE.Vector3(x, h, z);
    }
    return null;
  }
  function waterSpot(cx, cz, rMax, ext = 120) {
    for (let i = 0; i < 300; i++) {
      const a = rng() * Math.PI * 2, r = 300 + rng() * rMax;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x - center.x) > half - 400 || Math.abs(z - center.z) > half - 400) continue;
      let ok = true;
      for (const [dx, dz] of [[0, 0], [ext, 0], [-ext, 0], [0, ext], [0, -ext]]) if (!terrain.isWater(x + dx, z + dz)) { ok = false; break; }
      if (ok) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  // silhouette glow: back-face shell expanded in SCREEN space (constant pixel width whatever the model scale); faint close up, strong far away
  let aimPos = null;   // where the bomb aim marker sits (snapped target or raw impact point)
  let bombLock = null;   // ground target the bomb aim marker is snapped to
  const GLOW_KINDS = new Set(["jet", "tank", "sam", "ship", "drone", "flak"]);
  const glowVp = { value: new THREE.Vector2(innerWidth, innerHeight) };
  function addGlow(t) {
    if (!GLOW_KINDS.has(t.kind)) return;
    const mat = new THREE.MeshBasicMaterial({ color: t.kind === "jet" || t.kind === "drone" ? 0xff3a2a : t.kind === "ship" ? 0xbd6aff : 0xff9a30, side: THREE.BackSide, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const u = { value: 1 }; mat.userData.px = u;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPx = u; sh.uniforms.uVp = glowVp;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uPx; uniform vec2 uVp;").replace("#include <project_vertex>", "#include <project_vertex>\n{ vec3 gn = normalize(normalMatrix * normal); vec2 go = (projectionMatrix * vec4(gn, 0.0)).xy; if (length(go) > 1e-4) gl_Position.xy += normalize(go) * uPx * 2.0 / uVp * gl_Position.w; }");
    };
    const ms = [];
    t.obj.traverse((m) => { if (m.isMesh && m.geometry && m.geometry.attributes.normal && !m.material.transparent) { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); ms.push([m.geometry.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z), m]); } });
    ms.sort((a, b) => b[0] - a[0]);
    for (const [, m] of ms.slice(0, 10)) { const c = new THREE.Mesh(m.geometry, mat); c.renderOrder = 2; c.frustumCulled = false; m.add(c); }
    t.glow = mat;
  }
  function updateGlows() {
    glowVp.value.set(innerWidth, innerHeight);
    for (const t of targets) {
      if (!t.glow) continue;
      const d = camera.position.distanceTo(t.pos), k = THREE.MathUtils.clamp((d - 250) / 2600, 0, 1);
      const air = t.kind === "jet" || t.kind === "boss" || t.kind === "bossweapon" || t.kind === "drone", gm = air ? 1.3 : 0.72;   // aircraft glow a bit more, ground units a bit less
      t.glow.opacity = (0.08 + 0.7 * k) * gm; t.glow.userData.px.value = (0.7 + 3.8 * k) * (air ? 1.15 : 0.8);
    }
  }
  function addTarget(kind, obj, pos, extra = {}) {
    obj.position.copy(pos);
    scene.add(obj);
    const gsc = { tank: 3.0, base: 2.2, flak: 2.7, sam: 2.7, ship: 2.3, jet: 2.0 }[kind] || 1;
    if (gsc !== 1) { obj.scale.multiplyScalar(gsc); obj.userData.radius = (obj.userData.radius || 10) * gsc; }
    const t = { kind, obj, pos: obj.position, vel: V(), hp: HP[kind] || 5, alive: true, radius: obj.userData.radius || 10, objective: progress[kind] != null, heading: rng() * Math.PI * 2, cool: 2 + rng() * 4, t: rng() * 10, ...extra };
    targets.push(t); addGlow(t);
    return t;
  }

  const baseCenters = [];
  function spawnBases(count, zoneC) {
    // army bases: compact clusters of buildings on flat ground
    const subs = ["hangar", "fuel", "radar", "bunker", "fuel", "bunker", "hangar", "radar"];
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 12) {
      let c = null;
      for (let k = 0; k < 40 && !c; k++) {
        const q = landSpot(zoneC.x, zoneC.z, 500, 5600, 20);
        if (!q) continue;
        let flat = true;
        for (const [dx, dz] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) if (Math.abs(groundAt(q.x + dx, q.z + dz) - q.y) > 9) { flat = false; break; }
        if (flat) c = q;
      }
      if (!c) continue;
      baseCenters.push(c);
      const n = Math.min(count - placed, 4 + Math.floor(rng() * 2));
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + rng() * 0.4, r = 55 + rng() * 55;
        const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
        p.y = groundAt(p.x, p.z) + 0.1;
        const sub = subs[(placed + j) % subs.length];
        const t = addTarget("base", alienT ? createHive(sub) : createBaseBuilding(sub), p, { sub });
        t.obj.rotation.y = rng() * Math.PI * 2; t.pos.y = p.y; placed++;
      }
    }
    return placed;
  }
  function nearBase(rMin, rMax) {
    if (baseCenters.length) { const c = baseCenters[Math.floor(rng() * baseCenters.length)]; const p = landSpot(c.x, c.z, rMin, rMax, 40); if (p) return p; }
    return null;
  }
  function spawnGround(kind, count, zoneC) {
    if (!count) return 0;
    let placed = 0;
    if (kind === "tank") {
      let i = 0, guard = 0;
      while (i < count && guard++ < 24) {
        const c = nearBase(120, 1100) || landSpot(zoneC.x, zoneC.z, 300, 4600);
        if (!c) continue;
        const hd = rng() * Math.PI * 2;
        for (let j = 0; j < 3 && i < count; j++, i++) {
          const p = c.clone().add(new THREE.Vector3(Math.sin(hd) * j * 70, 0, Math.cos(hd) * j * 70));
          p.y = groundAt(p.x, p.z);
          const jp = rng() < 0.4;
          const t = addTarget("tank", alienT ? createAlienWalker(jp) : jp ? createJeep() : createTank(), p, { heading: hd });
          t.speed = (jp ? 6 + rng() * 4 : 3 + rng() * 3) * (1 - 0.5 * ezv()); placed++;
        }
      }
      return placed;
    }
    if (kind === "flak" || kind === "sam") {
      for (let i = 0; i < count; i++) {
        const p = nearBase(90, 900) || landSpot(zoneC.x, zoneC.z, 500, 5200);
        if (!p) continue;
        addTarget(kind, alienT ? (kind === "flak" ? createAlienTurret() : createAlienSpire()) : kind === "flak" ? createFlakGun() : createSamSite(), p); placed++;
      }
      return placed;
    }
    return 0;
  }
  function spawnGroundAhead(wave) {
    const kinds = ["tank", "tank", "flak"]; if (wave >= 3) kinds.push("sam", "tank"); if (wave >= 6) kinds.push("sam", "flak");
    const kind = kinds[Math.floor(rng() * kinds.length)];
    for (let tries = 0; tries < 30; tries++) {
      const a = -player.yaw - Math.PI / 2 + (rng() - 0.5) * 1.9, r = 2300 + rng() * 1700;
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      if (Math.abs(x - center.x) > half - 600 || Math.abs(z - center.z) > half - 600 || terrain.isWater(x, z)) continue;
      const h = groundAt(x, z); if (Math.abs(groundAt(x + 25, z) - h) + Math.abs(groundAt(x, z + 25) - h) > 16) continue;
      const p = new THREE.Vector3(x, h, z);
      if (kind === "tank") {
        const hd = rng() * Math.PI * 2;
        for (let j = 0; j < 2; j++) { const q = p.clone().add(new THREE.Vector3(Math.sin(hd) * j * 40, 0, Math.cos(hd) * j * 40)); q.y = groundAt(q.x, q.z); const jp = rng() < 0.4; const t = addTarget("tank", alienT ? createAlienWalker(jp) : jp ? createJeep() : createTank(), q, { heading: hd }); t.speed = (jp ? 6 + rng() * 4 : 3 + rng() * 3) * (1 - 0.5 * ezv()); }
      } else addTarget(kind, alienT ? (kind === "flak" ? createAlienTurret() : createAlienSpire()) : kind === "flak" ? createFlakGun() : createSamSite(), p);
      return true;
    }
    return false;
  }
  // aircraft carrier: a friendly landing deck on open water
  let pad = null, landingOpen = false, landing = null;
  // b23: enemy warships (bow wake, mast, guns) and submarines that surface and dive. They count as kills but are never mission objectives.
  function spawnSea() {
    if (alienT) return;
    const n = (L && L.n) || 1;
    const ships = Math.min(5, 2 + (n >= 3 ? 1 : 0) + (n >= 6 ? 1 : 0) + (n >= 9 ? 1 : 0)), subs = Math.min(4, 1 + (n >= 4 ? 1 : 0) + (n >= 7 ? 1 : 0) + (n >= 10 ? 1 : 0));
    let placed = 0;
    const spot = () => waterSpot(center.x, center.z, half * 0.7) || waterSpot(center.x, center.z, half * 0.7, 55);   // open sea first, then lakes
    for (let i = 0; i < ships; i++) {
      const c = spot(); if (!c) break;
      c.y = groundAt(c.x, c.z) + 0.5; const t = addTarget("ship", createWarship(), c, { heading: rng() * Math.PI * 2, speed: 3 + rng() * 2, hp: 12, sea: "war" }); t.objective = false; placed++;
    }
    for (let i = 0; i < subs; i++) {
      const c = spot(); if (!c) break;
      c.y = groundAt(c.x, c.z) + 0.4; const t = addTarget("ship", createSub(), c, { heading: rng() * Math.PI * 2, speed: 2 + rng() * 1.5, hp: 6, sea: "sub", ph: rng() * 32 }); t.objective = false; placed++;
    }
    return placed;
  }
  function spawnCarrier(zoneC) {
    const offs = [[0, 0], [0, 110], [0, -110], [0, 190], [0, -190], [45, 0], [-45, 0], [45, 150], [-45, -150]];
    for (let k = 0; k < 500; k++) {
      const wide = k > 250;
      const a = rng() * Math.PI * 2, r = 600 + rng() * (wide ? half - 800 : 4200);
      const cx = (wide ? center.x : zoneC.x) + Math.cos(a) * r, cz = (wide ? center.z : zoneC.z) + Math.sin(a) * r;
      if (Math.abs(cx - center.x) > half - 900 || Math.abs(cz - center.z) > half - 900) continue;
      const hd = Math.floor(rng() * 8) * Math.PI / 4;
      const sx = Math.sin(hd), sz = Math.cos(hd);
      let ok = true;
      for (const [dx, dz] of offs) { // dz along heading, dx sideways
        const x = cx + sx * dz + sz * dx, z = cz + sz * dz - sx * dx;
        if (!terrain.isWater(x, z)) { ok = false; break; }
      }
      if (!ok) continue;
      const obj = createCarrier();
      obj.position.set(cx, 0.4, cz);
      obj.rotation.y = hd + Math.PI;
      scene.add(obj);
      pad = { obj, pos: obj.position, heading: hd, speed: 5, deckTop: CARRIER.deckY + 0.4, t: 0 };
      return true;
    }
    return false;
  }

  // b30: spawn in front of the player, 1.2-2.8 km, inside the view cone; chase = flying away (catchable, jinking left-right)
  function spawnJetAhead(near, chase) {
    const t = spawnJet(near), f = fwdFrom(player.yaw, 0, V()); f.y = 0; f.normalize();
    const a = (rng() - 0.5) * 0.6, d = chase ? 900 + rng() * 500 : 1200 + rng() * 1600, c = Math.cos(a), sn = Math.sin(a);
    const dir = V(f.x * c - f.z * sn, 0, f.x * sn + f.z * c);
    t.pos.set(near.x + dir.x * d, 0, near.z + dir.z * d); t.pos.y = Math.max(groundAt(t.pos.x, t.pos.z) + 300, near.y + (rng() - 0.5) * 120); t.holdY = t.pos.y;
    if (chase) { t.mode = "flee"; t.baseYaw = t.yaw = player.yaw; t.engageAt = 40 + rng() * 15; t.speed = THREE.MathUtils.clamp(player.speed * 0.8, 60, 140); t.jink = 1; }
    else { t.baseYaw = t.yaw = Math.atan2(dir.x, dir.z); }   // head-on toward the player
    return t;
  }
  function spawnJet(near) {
    const a = rng() * Math.PI * 2, r = 5800 + rng() * 500;
    const p = V(near.x + Math.cos(a) * r, 0, near.z + Math.sin(a) * r);
    // Do not clamp to the map edge: that collapses distant spawns onto the player.
    p.y = Math.max(groundAt(p.x, p.z) + 380, near.y + (rng() - 0.5) * 160);
    const mode = "head", baseYaw = Math.atan2(-(near.x - p.x), -(near.z - p.z));
    const t = addTarget("jet", createEnemyJet(L.run?.foe, FOE_TYPES[L.run?.foe]), p, { yaw: Math.atan2(-(near.x - p.x), -(near.z - p.z)), pitch: 0, bank: 0, speed: (112 + L.difficulty * 40) * (assist ? 0.84 + 0.16 * skill : 1) * (1 - 0.38 * ezv()), burst: 0, mcool: 6 + rng() * 5, flyby: rng() < 0.6, off: (rng() < 0.5 ? -1 : 1) * (55 + rng() * 90), fb: 0, ct: 0 });
    t.objective = progress.jet != null;
    t.mode = mode;
    if (mode === "flee" || mode === "cross" || mode === "head") {
      t.flyby = false; t.baseYaw = baseYaw; t.yaw = baseYaw; t.ph = rng() * 6.28; t.holdY = p.y; t.life = 0;
      t.engageAt = mode === "cross" ? 10 : mode === "head" ? 3 + rng() * 2 : 30 + rng() * 15;
      t.speed = mode === "head" ? 150 + rng() * 40 : mode === "cross" ? 135 * (1 - 0.4 * ezv()) : THREE.MathUtils.clamp(player.speed * (0.8 - 0.12 * ezv()), 40, 150);
    }
    return t;
  }
  // evasive jet: weaves gently, never shoots, speed stays below the player's so it can be caught; later it turns to fight
  // an enemy that sees your missile coming may break hard and / or pop flares (more often on higher levels)
  function jetThreat(t, dt) {
    t.breakT = Math.max(0, (t.breakT || 0) - dt); t.flareCd = Math.max(0, (t.flareCd || 0) - dt);
    for (const r of rockets) {
      if (!r.active || r.target !== t || r.seen) continue;
      const d = r.p.distanceTo(t.pos);
      if (d > 1100) continue;
      r.seen = true;
      if (d < 380) continue;   // too late to react
      const n = (L && L.n) || 1, pD = THREE.MathUtils.clamp(0.1 + 0.06 * (n - 1), 0.1, 0.62), pF = THREE.MathUtils.clamp(0.08 + 0.05 * (n - 1), 0.08, 0.5);
      if (Math.random() < pD) { t.breakT = 1.7 + Math.random() * 0.7; t.breakDir = Math.random() < 0.5 ? -1 : 1; t.pull = Math.random() < 0.5 ? -1 : 1; }
      if (t.flareCd <= 0 && Math.random() < pF) { t.flareCd = 3; enemyFlares(t, r); }
    }
  }
  function updateEvader(t, dt) {
    if (t.mode === "head") { if (!t.passed && tA.subVectors(player.pos, t.pos).dot(t.vel) < 0 && tA.length() > 120) { t.passed = true; t.life = 0; t.engageAt = 3 + Math.random() * 2; } if (!t.passed) { t.life = 0; } else t.life += 0; }
    jetThreat(t, dt);
    const dist = t.pos.distanceTo(player.pos);   // b30: was undefined (crashed every chase / flee jet)
    t.life += dt; dogfightCues(t, dist);
    if (t.mode === "flee") t.speed += (THREE.MathUtils.clamp(player.speed * (0.8 - 0.12 * ezv()), 40, 150) - t.speed) * Math.min(1, dt * 0.5);
    const edge = half - 1100;
    if (Math.abs(t.pos.x - center.x) > edge || Math.abs(t.pos.z - center.z) > edge) t.baseYaw = Math.atan2(-(center.x - t.pos.x), -(center.z - t.pos.z));
    const wantYaw = t.baseYaw + (t.mode === "flee" ? (t.jink ? Math.sin(t.t * 1.1 + t.ph) * 0.9 : Math.sin(t.t * 0.45 + t.ph) * 0.55) : Math.sin(t.t * 0.8 + t.ph) * 0.12);   // b30: chase target slaloms left-right
    let yr = THREE.MathUtils.clamp(wrapPi(wantYaw - t.yaw) * (t.jink ? 2.2 : 1.2), -(t.jink ? 1.1 : 0.6 - 0.3 * ezv()), t.jink ? 1.1 : 0.6 - 0.3 * ezv());
    if (t.breakT > 0) yr = t.breakDir * 2.2;
    t.yaw += yr * dt;
    t.bank += (THREE.MathUtils.clamp(-yr / 0.6, -1, 1) * 0.8 - t.bank) * dt * 2.5;
    let wantPitch = THREE.MathUtils.clamp((t.holdY - t.pos.y) * 0.004 + Math.sin(t.t * 0.7 + t.ph) * 0.07, -0.3, 0.3);
    if (t.breakT > 0) wantPitch = t.pull * 0.45;
    if (t.pos.y - groundAt(t.pos.x, t.pos.z) < 220) wantPitch = 0.4;
    t.pitch += (wantPitch - t.pitch) * dt * 1.2;
    const pf = fwdFrom(player.yaw, player.pitch, V()), onSix = pf.dot(tD.subVectors(t.pos, player.pos).normalize()) > 0.65 && pf.dot(fwdFrom(t.yaw, t.pitch, V())) > 0.3;
    if (onSix && dist < 1500) { const desired = THREE.MathUtils.clamp(player.speed * (dist > 600 ? 0.92 : 1.015), 105, 220); t.speed += (desired - t.speed) * Math.min(1, dt * 0.5); }
    fwdFrom(t.yaw, t.pitch, t.vel).multiplyScalar(t.speed);
    t.pos.addScaledVector(t.vel, dt);
    t.obj.rotation.set(t.pitch, t.yaw, -t.bank, "YXZ");
    t.obj.userData.beacon.visible = Math.sin(t.t * 7) > 0;
    t.obj.userData.burn?.(1, 0.5);
    if ((t.ct -= dt) <= 0 && tA.subVectors(player.pos, t.pos).length() < 5500) { t.ct = 0.08; tD.set(0, 0, 7.5).applyEuler(t.obj.rotation).add(t.pos); puff(tD, null, 2.4, 9, 1.5, 0xeef4ff); }
    if (t.life > t.engageAt) t.mode = "chase";
  }


  // ---------- friendly forces ----------
  // Allied jets, tanks and ships fight the enemy next to the player. They live in `allies` (NOT in `targets`), so no player
  // weapon (gun, missile, bomb blast, flak) can ever damage them: there is no friendly fire by construction.
  const ALLY_HP = { jet: 10, tank: 14, ship: 30 };
  function addAlly(kind, obj, pos, extra = {}) {
    obj.position.copy(pos);
    scene.add(obj);
    const a = { kind, obj, pos: obj.position, vel: V(), hp: ALLY_HP[kind], maxHp: ALLY_HP[kind], alive: true, radius: kind === "ship" ? 22 : kind === "tank" ? 9 : 7,
      yaw: 0, pitch: 0, bank: 0, speed: 190, cool: 1 + rng() * 2, t: rng() * 10, heading: rng() * Math.PI * 2, burst: 0, bc: 0, slot: 0, respawnAt: 0, ...extra };
    allies.push(a);
    return a;
  }
  function spawnAllies(spec, nearP) {
    const n = spec || {};
    for (let i = 0; i < (n.jet || 0); i++) {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1;
      const p = new THREE.Vector3(nearP.x + side * 150 * k, nearP.y + 10 * k, nearP.z - 260 - 80 * k);
      const a = addAlly("jet", createAllyJet(), p, { slot: side * k, speed: 195 });
      a.obj.rotation.set(0, 0, 0);
    }
    for (let i = 0, guard = 0; i < (n.tank || 0) && guard++ < 30;) {
      const c = landSpot(nearP.x, nearP.z - 500, 300, 2600, 30);
      if (!c) continue;
      const hd = Math.PI * (0.85 + rng() * 0.3); // roughly north, toward the enemy
      for (let j = 0; j < 2 && i < n.tank; j++, i++) {
        const q = c.clone().add(new THREE.Vector3(j * 36, 0, 0)); q.y = groundAt(q.x, q.z);
        addAlly("tank", createTank(true), q, { heading: hd, speed: 5 });
      }
    }
    for (let i = 0; i < (n.ship || 0); i++) {
      const c = waterSpot(center.x, center.z, half * 0.55);
      if (!c) break;
      c.y = 0.5;
      addAlly("ship", createShip(true), c, { heading: rng() * Math.PI * 2, speed: 4 });
    }
  }
  function nearestEnemy(pos, maxD, jetsOnly) {
    let best = null, bd = maxD;
    for (const t of targets) {
      if (!t.alive || (jetsOnly && t.kind !== "jet") || t.kind === "balloon") continue;
      const d = t.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function allyShoot(origin, tgt, spread, speed = 900, dmg = 0.8) {
    const lead = origin.distanceTo(tgt.pos) / speed;
    tA.copy(tgt.pos).addScaledVector(tgt.vel, lead).sub(origin).normalize();
    tA.x += (Math.random() - 0.5) * spread * 2; tA.y += (Math.random() - 0.5) * spread * 2; tA.z += (Math.random() - 0.5) * spread * 2;
    bullets.push({ p: origin.clone(), v: tA.normalize().multiplyScalar(speed), life: 2.8, enemy: false, ally: true, dmg });
  }
  // FRIENDLY FIRE: stray gun rounds, missiles and bomb splash hurt allies and cost points (never locked or aimed at)
  function friendlyHit(a, n, pen) {
    if (!a.alive) return;
    if (elapsed - (a.ffT ?? -9) > 0.4) {
      a.ffT = elapsed; const p = Math.min(score, pen);
      score -= p; combo = 0; lastKillT = -99;
      events.onPop?.(-pen, 0, "friendly"); audio.hit?.();
    }
    a.byPlayer = true; damageAlly(a, n);
  }
  function damageAlly(a, n) {
    if (!a.alive) return;
    a.hp -= n;
    if (a.hp <= 0) killAlly(a);
  }
  function killAlly(a) {
    if (a.byPlayer) { const p = Math.min(score, 400); score -= p; events.onPop?.(-400, 0, "friendly"); }
    a.alive = false; a.obj.visible = false;
    explode(a.pos.clone().add(tA.set(0, a.kind === "ship" ? 6 : 3, 0)), a.kind === "ship" ? 28 : 15, a.kind === "ship" ? 1.8 : 1.1);
    if (a.kind === "jet") { spawnDebris(a.pos, 4, 55, a.vel); a.respawnAt = elapsed + 14; }
    events.toast?.(a.kind === "jet" ? "Ally jet down - reinforcements in 14s" : a.kind === "tank" ? "Ally tank lost" : "Ally ship lost");
  }
  function updateAllies(dt) {
    const hostile = L.calm ? 0 : L.hostile;
    for (const a of allies) {
      if (!a.alive) {
        if (a.kind === "jet" && a.respawnAt && elapsed >= a.respawnAt) {
          const ang = rng() * Math.PI * 2;
          a.pos.set(player.pos.x + Math.cos(ang) * 2200, player.pos.y + 60, player.pos.z + Math.sin(ang) * 2200);
          a.pos.x = THREE.MathUtils.clamp(a.pos.x, center.x - half + 800, center.x + half - 800);
          a.pos.z = THREE.MathUtils.clamp(a.pos.z, center.z - half + 800, center.z + half - 800);
          a.pos.y = Math.max(a.pos.y, groundAt(a.pos.x, a.pos.z) + 400);
          a.yaw = Math.atan2(-(player.pos.x - a.pos.x), -(player.pos.z - a.pos.z)); a.pitch = 0; a.hp = a.maxHp; a.alive = true; a.respawnAt = 0; a.obj.visible = true;
          events.toast?.("Ally jet back in the fight");
        }
        continue;
      }
      a.t += dt;
      if (a.kind === "jet") updateAllyJet(a, dt);
      else if (a.kind === "tank") {
        const tgt = nearestEnemy(a.pos, 4200, false);
        let want = a.heading;
        if (tgt) {
          const dx = tgt.pos.x - a.pos.x, dz = tgt.pos.z - a.pos.z;
          want = Math.atan2(dx, dz);
          const d = Math.hypot(dx, dz);
          a.speed = d > 1100 ? 6 : 0;
          if (d < 1700 && (a.cool -= dt) <= 0) { a.cool = 1.1 + Math.random() * 0.6; allyShoot(tA.copy(a.pos).add(tB.set(0, 4, 0)).clone(), tgt, 0.012, 800, 2.6); }
        } else a.speed = 4;
        a.heading += THREE.MathUtils.clamp(wrapPi(want - a.heading), -0.6 * dt, 0.6 * dt);
        const nx = a.pos.x + Math.sin(a.heading) * a.speed * dt, nz = a.pos.z + Math.cos(a.heading) * a.speed * dt;
        if (terrain.isWater(nx, nz) || Math.abs(nx - center.x) > half - 400 || Math.abs(nz - center.z) > half - 400) a.heading += Math.PI * 0.5 * dt * 4;
        else { a.vel.set(nx - a.pos.x, 0, nz - a.pos.z).divideScalar(Math.max(dt, 1e-3)); a.pos.x = nx; a.pos.z = nz; }
        a.pos.y = groundAt(a.pos.x, a.pos.z);
        a.obj.rotation.y = a.heading + Math.PI;
      } else if (a.kind === "ship") {
        const nx = a.pos.x + Math.sin(a.heading) * a.speed * dt, nz = a.pos.z + Math.cos(a.heading) * a.speed * dt;
        const ax = a.pos.x + Math.sin(a.heading) * 200, az = a.pos.z + Math.cos(a.heading) * 200;
        if (!terrain.isWater(ax, az)) a.heading += dt * 0.6;
        else { a.vel.set(nx - a.pos.x, 0, nz - a.pos.z).divideScalar(Math.max(dt, 1e-3)); a.pos.x = nx; a.pos.z = nz; }
        a.pos.y = 0.5 + Math.sin(a.t * 0.8) * 0.4 + waveAt(a.pos.x, a.pos.z);
        a.obj.rotation.set(Math.sin(a.t * 0.7) * 0.02, a.heading + Math.PI, Math.sin(a.t) * 0.03);
        if (rng() < dt * 2) puff(tA.copy(a.pos).add(tB.set(-Math.sin(a.heading) * 20, 1, -Math.cos(a.heading) * 20)), null, 3, 9, 1.8, 0xffffff);
        const tgt = nearestEnemy(a.pos, 2600, false);
        if (tgt && (a.cool -= dt) <= 0) { a.cool = 0.5; allyShoot(tA.copy(a.pos).add(tB.set(0, 10, 0)).clone(), tgt, 0.02, 800, 1.6); }
      }
    }
    // enemy fire at allies (separate from the fire at the player): ground and air enemies shoot the nearest ally in range
    if (hostile > 0) {
      for (const t of targets) {
        if (!t.alive || !(t.kind === "jet" || t.kind === "tank" || t.kind === "flak")) continue;
        t.ac = (t.ac || (0.5 + rng() * 1.5)) - dt;
        if (t.ac > 0) continue;
        t.ac = 1.2 + rng() * 1.2;
        let best = null, bd = t.kind === "jet" ? 1100 : 1500;
        for (const a of allies) { if (!a.alive) continue; const d = a.pos.distanceTo(t.pos); if (d < bd) { bd = d; best = a; } }
        if (!best) continue;
        const lead = bd / 800;
        tA.copy(best.pos).addScaledVector(best.vel, lead).sub(t.pos).normalize();
        tA.x += (Math.random() - 0.5) * 0.08; tA.y += (Math.random() - 0.5) * 0.08; tA.z += (Math.random() - 0.5) * 0.08;
        bullets.push({ p: t.pos.clone().add(tB.set(0, 4, 0)), v: tA.normalize().multiplyScalar(800), life: 1.9, enemy: true, atAlly: true });
      }
    }
  }
  function updateAllyJet(a, dt) {
    const tgt = nearestEnemy(a.pos, 3600, true) || nearestEnemy(a.pos, 2800, false);
    let goal = tB, speedT = 195;
    fwdFrom(a.yaw, a.pitch, tC);
    let dist = 0;
    if (tgt) {
      tA.subVectors(tgt.pos, a.pos); dist = tA.length();
      goal = tB.copy(tgt.pos).addScaledVector(tgt.vel, Math.min(1.5, dist / 700));
      if (tgt.kind !== "jet") goal.y = Math.max(goal.y + 150, groundAt(tgt.pos.x, tgt.pos.z) + 190);
      if (dist < 260 && tC.dot(tA) > 0) goal = tB.copy(a.pos).addScaledVector(tC, 320).add(tD.set(Math.cos(a.t) * 380, 140, Math.sin(a.t) * 380));
      speedT = 150;
    } else {
      fwdFrom(player.yaw, 0, tD);
      goal = tB.copy(player.pos).addScaledVector(tD, 380).addScaledVector(tA.set(tD.z, 0, -tD.x), a.slot * 150);
      goal.y = player.pos.y + 10;
      dist = goal.distanceTo(a.pos);
      speedT = THREE.MathUtils.clamp(player.speed + (dist - 120) * 0.5, 85, 200);
    }
    const gx = goal.x - a.pos.x, gz = goal.z - a.pos.z, gy = goal.y - a.pos.y;
    if (Math.max(Math.abs(a.pos.x - center.x), Math.abs(a.pos.z - center.z)) > half - 600) { tA.set(center.x - a.pos.x, 0, center.z - a.pos.z); a.yaw += THREE.MathUtils.clamp(wrapPi(Math.atan2(-tA.x, -tA.z) - a.yaw), -0.9 * dt, 0.9 * dt); }
    else {
      const wantYaw = Math.atan2(-gx, -gz), turn = 1.0;
      const yr = THREE.MathUtils.clamp(wrapPi(wantYaw - a.yaw) * 1.5, -turn, turn);
      a.yaw += yr * dt;
      a.bank += (THREE.MathUtils.clamp(-yr / turn, -1, 1) * 1.05 - a.bank) * dt * 2.5;
    }
    let wantPitch = THREE.MathUtils.clamp(Math.atan2(gy, Math.hypot(gx, gz)), -0.5, 0.5);
    const g = groundAt(a.pos.x, a.pos.z);
    if (a.pos.y - g < 170) wantPitch = 0.5;
    a.pitch += (wantPitch - a.pitch) * dt * 1.4;
    a.speed += (speedT - a.speed) * dt * 0.8;
    fwdFrom(a.yaw, a.pitch, a.vel).multiplyScalar(a.speed);
    a.pos.addScaledVector(a.vel, dt);
    a.obj.rotation.set(a.pitch, a.yaw, -a.bank, "YXZ");
    a.obj.userData.beacon.visible = Math.sin(a.t * 7) > 0;
    a.obj.userData.burn?.(1, 0);
    // shoot the target in short bursts
    if (tgt && dist < 950) {
      fwdFrom(a.yaw, a.pitch, tC);
      const ang = tC.angleTo(tA.subVectors(tgt.pos, a.pos).normalize());
      a.cool -= dt;
      if (ang < 0.18 && a.cool <= 0) { a.burst = 7; a.cool = 1.4 + Math.random(); }
      if (a.burst > 0 && (a.bc -= dt) <= 0) { a.burst--; a.bc = 0.08; allyShoot(tD.copy(a.pos).addScaledVector(tC, 6).clone(), tgt, 0.03, 950, 0.9); }
    }
  }

  function buildRings(spec, start, yaw0) {
    const night = L.time === "night";
    let p = start.clone(), yaw = yaw0;
    const n = (L.objectives.find((o) => o.kind === "ring") || { need: 6 }).need + 2;
    const step = spec.tight ? 560 : 700;
    for (let i = 0; i < n; i++) {
      yaw += (rng() - 0.5) * (spec.tight ? 0.9 : 0.5);
      const toC = Math.atan2(-(center.x - p.x), -(center.z - p.z));
      if (Math.hypot(p.x - center.x, p.z - center.z) > half * 0.6) yaw += wrapPi(toC - yaw) * 0.5;
      const prev = p.clone();
      p = p.clone().add(new THREE.Vector3(-Math.sin(yaw) * step, 0, -Math.cos(yaw) * step));
      const g = groundAt(p.x, p.z);
      let alt = start.y + (spec.tight ? (i % 2 ? 1 : -1) * (60 + rng() * 90) : (rng() - 0.5) * 50);
      p.y = Math.max(g + 140, alt);
      const ring = createRing(night);
      const r = spec.size / 2;
      ring.scale.setScalar(r);
      ring.position.copy(p);
      const dir = p.clone().sub(prev).normalize();
      ring.lookAt(p.clone().add(dir));
      scene.add(ring);
      rings.push({ obj: ring, pos: ring.position, n: dir, r, passed: false, popT: 0 });
    }
  }

  // ---------- load a level ----------
  async function load(level, opts = {}) {
    L = level;
    rng = mulberry32(level.seed ^ 0x5eed);
    clearWorld();
    events.onLoading?.("Loading " + level.place.name + "…", 0.05);
    terrain = await buildTerrain(level.place.lat, level.place.lon, { quality: opts.quality, onProgress: (f) => events.onLoading?.(null, 0.05 + 0.75 * f) });
    events.onLoading?.("Deploying forces…", 0.85);
    scene.add(terrain.detail, terrain.far);
    half = terrain.half; center.copy(terrain.center);
    style.uCenter.value.set(center.x, center.z);
    setQuality(opts.quality); for (const m of terrain.materials) patchTerrain(m); setLake(terrain.lake);
    smokeMat.uniforms.uLight.value = level.time === "night" ? 0.3 : level.time === "dusk" || level.time === "dawn" ? 0.75 : 1;
    sky.apply(level.time, level.weather, { center, half, seed: (level.seed % 100000) + 1, terrain: terrain.materials, planet: level.run?.planet, season: level.run?.planetKey === "earth" ? SEASONS[level.run.season] : null });

    for (const o of level.objectives) progress[o.kind] = 0;
    setTargetStyle(level.run?.tgt || "army");
    alienT = !!level.run?.planetKey && level.run.planetKey !== "earth";
    applyWeaponStyle(level.run?.planet);
    makePlayer(level.run?.jet || "viper");

    // spawn: south of centre heading north
    const sp = new THREE.Vector3(center.x, 0, center.z + Math.min(4000, half * 0.45));
    let maxH = 0;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; for (const r of [0, 800, 1800]) maxH = Math.max(maxH, groundAt(sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r)); }
    sp.y = maxH + 420;
    player = { pos: sp, vel: V(), q: new THREE.Quaternion(), yaw: 0, pitch: 0, bank: 0, inverted: false, speed: 125, hp: 100, rockets: RACK, bombs: RACK, boost: 0, flares: 12 };
    rocketCd = bombCd = 0; rocketRegen = bombRegen = 0; maneuver = null; crashing = null; lives = LIVES_MAX; ejClean(); invulnUntil = 0; heat = 0; overheated = false; lowAlt = false; voiceT = 0;
    landing = null; landingOpen = false; pad = null; baseCenters.length = 0;
    plane.visible = true;
    const zone = new THREE.Vector3(center.x, 0, center.z - 1800);

    // army bases first, then the units that defend them
    const g = level.ground;
    spawnBases(g.base || 0, zone);
    spawnGround("tank", g.tank || 0, zone);
    spawnGround("flak", g.flak || 0, zone);
    spawnGround("sam", g.sam || 0, zone);
    try { spawnSea(); } catch (e) { console.warn(e); }
    for (const o of level.objectives) {
      if (o.kind === "land" || o.kind === "jet") continue;
      const have = targets.filter((t) => t.kind === o.kind).length;
      if (have < o.need) { o.need = Math.max(1, have); o.label = o.label.replace(/\d+/, String(o.need)); }
    }
    // Count exactly what successfully spawned, including sea targets; no impossible quotas.
    for (const kind of ["base", "tank", "flak", "sam", "ship"]) {
      const need = targets.filter(t => t.kind === kind && t.alive).length;
      const i = level.objectives.findIndex(o => o.kind === kind);
      if (i >= 0) level.objectives.splice(i, 1);
      if (need) { level.objectives.push({ kind, need, label: `Destroy ${need} ${kind} targets` }); progress[kind] = 0; }
      else delete progress[kind];
    }
    for (const t of targets) t.objective = progress[t.kind] != null;
    // carrier (only where there is open sea); otherwise drop the landing objective
    if (level.carrier && !spawnCarrier(zone)) {
      const i = level.objectives.findIndex((o) => o.kind === "land");
      if (i >= 0) level.objectives.splice(i, 1);
      delete progress.land;
    }
    // jets
    jetSpawner = null;
    {
      const need = progress.jet != null ? level.objectives.find((o) => o.kind === "jet").need : (level.jets || 2);
      const atOnce = Math.min(need + 2, 3 + Math.round(level.difficulty * 4));
      jetSpawner = { remaining: need, atOnce: 3 + Math.floor((level.n || 1) / 2), n: 0 };   // b30: min on screen grows per level
    }
    groundWave = { t: 32, n: 0 }; allDone = false; waveT = -14; heliT = 22;
    spawnAllies(level.allies, sp);
    if (strip) { scene.remove(strip.obj); strip = null; } ops = null; camCut = null; fuelV = 1; fuelWarn = 0;
    try { spawnStrip(sp); } catch (e) { console.warn(e); }
    viewMode = "chase";
    setCockpitMode(plane, false);
    controls.setLookMode(viewMode);
    timeLeft = opts.seconds || 150; elapsed = 0; score = 0; ended = false;
    Object.assign(stats, { shots: 0, hits: 0, rockets: 0, bombs: 0, kills: {}, rings: 0, damage: 0, crashes: 0, loops: 0 });
    criticalUntil = 0; bossSpawned = false; lastDamage = -10; serviceAt = 0; flareAt = -9;
    combo = 0; lastKillT = -99; waveT = -14; fires.length = 0; orbitAccum = 0; lastYaw = 0; lockTarget = null; lockCand = null; lockTime = 0;
    plane.position.copy(player.pos);
    updatePlaneTransform();
    if (strip && !opts.noTakeoff) parkAtStart(); else { gearAnim = gearWant = 0; plane.userData.setGear?.(0); }
    snapCamera();
    events.onLoading?.("Ready", 1);
    return {};
  }

  function clearWorld() {
    if (TS.on) { TS.on = false; tsClear(); }
    for (const t of targets) scene.remove(t.obj);
    targets.length = 0;
    for (const a of allies) scene.remove(a.obj);
    allies.length = 0;
    for (const r of rings) scene.remove(r.obj);
    rings.length = 0;
    if (pad) { scene.remove(pad.obj); pad = null; }
    if (strip) { scene.remove(strip.obj); strip = null; } ops = null; camCut = null;
    fxs.length = 0; for (const sh of shocks) { sh.active = false; sh.m.visible = false; }
    for (const k of Object.keys(progress)) delete progress[k];
    bullets.length = 0; puffs.length = 0; rbClear(); wtRb = [null, null]; wtOn = false; for (const f of flares) scene.remove(f.spr); flares.length = 0; WC.state = "idle"; WC.obj = null; wcStandby(); hardIdx = 0;
    for (const p of [...rockets, ...missiles, ...bombs]) { p.active = false; p.o.visible = false; }
    for (const e of explosions) { e.active = false; e.g.visible = false; }
    for (const d of debris) { d.active = false; d.g.visible = false; }
    if (terrain) { scene.remove(terrain.detail, terrain.far); terrain.dispose(); terrain = null; }
  }

  // ---------- flight ----------
  // b25: cheap soft ground shadow of the jet (no shadow maps: smooth on iPhone). Grows and fades with altitude, follows the jet's heading.
  let blobSh = null;
  function updateBlobShadow() {
    if (!blobSh) {
      const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
      x.translate(32, 32);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, "rgba(0,0,0,.85)"); g.addColorStop(0.45, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 30, 30, 0, 0, 7); x.fill();
      const tex = new THREE.CanvasTexture(c);
      blobSh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      blobSh.renderOrder = 2; blobSh.frustumCulled = false; scene.add(blobSh);
    }
    if (!plane || !player || crashing || viewMode === "cockpit") { blobSh.visible = false; return; }
    const gy = groundAt(player.pos.x, player.pos.z), alt = player.pos.y - gy;
    const k = THREE.MathUtils.clamp(1 - alt / 900, 0, 1);
    blobSh.visible = k > 0.02;
    blobSh.position.set(player.pos.x, gy + 0.6, player.pos.z); blobSh.rotation.y = player.yaw;
    blobSh.scale.set(34 + alt * 0.05, 1, 54 + alt * 0.07);
    blobSh.material.opacity = 0.5 * k * k;
  }
  function updatePlaneTransform() {
    plane.position.copy(player.pos);
    plane.quaternion.copy(player.q);
    { const lowK = THREE.MathUtils.clamp((0.4 - throttle) / 0.4, 0, 1); visLow += (lowK - visLow) * 0.06; if (visLow > 0.01 && !landing && !crashing) plane.quaternion.multiply(_qa.setFromAxisAngle(AX, 0.17 * visLow)); }
    updateBlobShadow();
  }
  const rotBody = (axis, ang) => { player.q.multiply(_qa.setFromAxisAngle(axis, ang)); };
  const rotWorld = (axis, ang) => { player.q.premultiply(_qa.setFromAxisAngle(axis, ang)); };
  /** Derive yaw / pitch / bank (for HUD, AI, weapons, camera) from the quaternion. No clamps anywhere. */
  function syncAngles() {
    player.q.normalize();
    const f = tA.set(0, 0, -1).applyQuaternion(player.q);
    player.pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
    if (Math.hypot(f.x, f.z) > 1e-4) player.yaw = Math.atan2(-f.x, -f.z);
    const up = tB.set(0, 1, 0).applyQuaternion(player.q), right = tC.set(1, 0, 0).applyQuaternion(player.q);
    player.bank = Math.atan2(-right.y, up.y); // 0 level, +right wing down, ±PI upside-down
    player.inverted = up.y < 0;
  }
  /** Wings level, nose on the horizon, same heading. */
  function levelQuat(out) { return out.setFromEuler(_eu.set(0, player.yaw, 0, "YXZ")); }

  const maneuverSafe = () => !!(maneuver && maneuver.kind === "roll" && player.pos.y - groundAt(player.pos.x, player.pos.z) > 120);
  function startRoll(dir) {
    if (maneuver || crashing) return;
    maneuver = { kind: "roll", dir, phase: "level", t: 0, ang: 0 }; controls.resetLook?.();
    audio.whoosh();
    events.toast?.(dir > 0 ? "Barrel roll right!" : "Barrel roll left!");
  }
  function startLoop(dir) {
    if (maneuver || crashing) return;
    const agl = player.pos.y - groundAt(player.pos.x, player.pos.z);
    if (dir < 0 && agl < 320) { events.toast?.("Climb higher for an outside loop!"); return; }
    if (dir > 0 && agl < 60) { events.toast?.("Too low! Climb a bit first"); return; }
    maneuver = { kind: "loop", dir, phase: "level", t: 0, ang: 0 };
    audio.whoosh();
    events.toast?.(dir > 0 ? "Inside loop!" : "Outside loop!");
  }
  function runManeuver(dt) {
    const m = maneuver;
    m.t += dt;
    if (m.phase === "level") {
      levelQuat(_qL);
      player.q.slerp(_qL, 1 - Math.exp(-dt * 6));
      if (player.q.angleTo(_qL) < 0.03 || m.t > 1.1) { player.q.copy(_qL); m.phase = "loop"; m.t = 0; }
    } else if (m.phase === "loop") {
      const TWO = Math.PI * 2, edge = 0.5;
      const env = Math.max(0.3, Math.min(1, m.ang / edge, (TWO - m.ang) / edge));
      const roll = m.kind === "roll";
      let d = (roll ? 3.4 : 1.55) * env * dt;
      if (m.ang + d >= TWO) { d = TWO - m.ang; m.phase = "exit"; m.t = 0; stats.loops++; score += roll ? 10 : 25; events.toast?.(roll ? "Roll done! +10" : "Loop done! +25"); }
      m.ang += d;
      if (roll) { player.q.multiply(_qa.setFromAxisAngle(tD.set(0, 0, -1), m.dir * d)); rotBody(AX, 0.12 * d); }
      else rotBody(AX, m.dir * d);
    } else {
      levelQuat(_qL);
      player.q.slerp(_qL, 1 - Math.exp(-dt * 5));
      if (m.t > 0.5) maneuver = null;
    }
  }

  // ---------- build 18: adaptive skill, recovery, wisps ----------
  let skill = 0.35; try { const v = parseFloat(localStorage.getItem("jet-skill")); if (v >= 0 && v <= 1) skill = v; } catch { /* ignore */ }
  const akv = () => (assist ? 1 - skill * 0.55 : 0);   // assist strength 1 (beginner) .. 0.45 (expert)
  const tierOf = () => (akv() > 0.82 ? "HIGH" : akv() > 0.62 ? "MEDIUM" : "LOW");
  function bumpSkill(d) {
    const t0 = tierOf(); skill = THREE.MathUtils.clamp(skill + d, 0, 1);
    try { localStorage.setItem("jet-skill", skill.toFixed(3)); } catch { /* ignore */ }
    if (assist && tierOf() !== t0) events.toast?.(`Flight assist: ${tierOf()}`);
  }
  let invT = 0, ndT = 0, recover = 0, gload = 0, tapTarget = null, tapT = 0, inCloud = 0, vaporT = 0, wispT = 0, accT = 0, accS = 0, accH = 0, prevQ = new THREE.Quaternion(), rescueAt = -9;
  let wisps = null;
  function updateWisps(dt) {
    if (!wisps) {
      const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.5, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; wisps = [];
      for (let i = 0; i < 34; i++) { const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false }); const sp = new THREE.Sprite(m); sp.visible = false; scene.add(sp); wisps.push({ sp, life: 0, max: 1, s: 100 }); }
    }
    const cc = sky.cloudColor();
    wispT -= dt;
    if (inCloud > 0.04 && wispT <= 0) {
      wispT = 0.9 / (10 + inCloud * 40);
      const w = wisps.find((q) => q.life <= 0);
      if (w) { fwdFrom(player.yaw, player.pitch, tD); w.sp.position.copy(camera.position).addScaledVector(tD, 120 + Math.random() * 520).add(tB.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 260)); w.max = w.life = 0.8 + Math.random() * 0.6; w.s = 90 + Math.random() * 140; w.sp.visible = true; w.sp.material.color.copy(cc); }
    }
    for (const w of wisps) { if (w.life <= 0) continue; w.life -= dt; if (w.life <= 0) { w.sp.visible = false; continue; } const k = w.life / w.max; w.sp.material.opacity = Math.sin(Math.PI * (1 - k)) * 0.55; w.sp.scale.setScalar(w.s * (1.4 - k * 0.5)); }
  }
  function lockNearest() {
    if (!player || crashing || ended) return false;
    let best = null, bd = 1e9;
    for (const t of targets) { if (!t.alive || t.submerged || t.kind === "ally") continue; const d = t.pos.distanceTo(player.pos); const k = d * (t.kind === "jet" ? 0.5 : 1); if (d < 5200 && k < bd) { bd = k; best = t; } }
    if (!best) return false;
    tapTarget = best; tapT = 5; lockTarget = null; lockCand = null; lockTime = 0; audio.seeker?.(false); events.toast?.("Target selected - align to lock"); return true;
  }

  // ---------- FLIGHT ASSIST (default on): damped curved input, soft pitch/bank limits, auto-level, terrain avoidance, gentle aim ----------
  const _qI = new THREE.Quaternion(), _vB = new THREE.Vector3(), _vA = new THREE.Vector3();
  // build 19: child-friendly factor. 1 = beginner (levels 1-3), eases gently to ~0.64 at level 10 and on toward 0 after that
  const ezv = () => { const n = (L && L.n) || 1; return n <= 10 ? 1 - Math.max(0, n - 3) * 0.0514 : Math.max(0, 0.64 - (n - 10) * 0.08); };
  let cpP = 0, cpPV = 0, cpB = 0, cpBV = 0;
  // ---------- AUTO-FOLLOW (TRACK): with a locked target ahead and the stick near centre / pointing toward it, the copilot flies the jet
  // after the target and keeps it in the reticle. A firm push the other way, or a quick flick, breaks it instantly (never fights the player).
  let centT = 0, trackOn = false, trackBlock = 0, prevRoll = 0, prevPitch = 0;
  const _trkSt = { pitch: 0, roll: 0, yaw: 0 };
  function trackStick(dt, st) {
    const raw = st, t = lockTarget;
    const dr = Math.abs(raw.roll - prevRoll), dp = Math.abs(raw.pitch - prevPitch); prevRoll = raw.roll; prevPitch = raw.pitch;
    const flick = Math.hypot(dr, dp) / Math.max(dt, 1e-3) > 7 && Math.max(Math.abs(raw.roll), Math.abs(raw.pitch)) > 0.5;
    trackBlock = Math.max(0, trackBlock - dt);
    if (!t || !t.alive || t.kind === "ally" || nearPad || landing || maneuver || crashing || assistDanger > 0.35) { trackOn = false; return st; }
    _vA.subVectors(t.pos, player.pos); const dist = _vA.length();
    if (dist < 90 || dist > 4200) { trackOn = false; return st; }
    const yawErr = -wrapPi(Math.atan2(-_vA.x, -_vA.z) - player.yaw),   // > 0: target is to the RIGHT
       pitErr = Math.atan2(_vA.y, Math.hypot(_vA.x, _vA.z)) - player.pitch;
    if (Math.abs(yawErr) > 1.25 || Math.abs(pitErr) > 0.9) { trackOn = false; return st; }
    // opposite deflection (stick pushed away from the target) beyond ~50 %, or a flick, hands control straight back
    const opp = (raw.roll * yawErr < 0 && Math.abs(raw.roll) > 0.5 && Math.abs(yawErr) > 0.04) || (raw.pitch * pitErr < 0 && Math.abs(raw.pitch) > 0.5 && Math.abs(pitErr) > 0.04);
    const magR = Math.max(Math.abs(raw.roll), Math.abs(raw.pitch));
    if (opp || flick || magR > 0.3) { if (trackOn) trackBlock = 0.8; trackOn = false; }   // b22: any real stick input = full manual authority
    centT = magR < 0.12 ? centT + dt : 0;
    if (!trackOn) {
      if (trackBlock <= 0 && !opp && !flick && centT > 1.5) trackOn = true;   // only after the stick has rested (and the nose has levelled) for 1.5 s
    }
    if (!trackOn) return st;
    // virtual stick: bank toward the target's heading, nose toward its elevation; blended with whatever the player adds in the same direction
    const k = Math.min(1, dist / 400);
    _trkSt.roll = THREE.MathUtils.clamp(yawErr * 2.1 * k + (raw.roll * yawErr > 0 ? raw.roll * 0.5 : 0), -0.9, 0.9);
    _trkSt.pitch = THREE.MathUtils.clamp(pitErr * 3.2, -0.7, 0.7);
    _trkSt.yaw = raw.yaw;
    return _trkSt;
  }
  let relT = 0, loopT = 0, holdT = 0, brkV = 0;
  // ---------- build 24: FULL-FREEDOM flight. Stick = proportional body rates (360 rolls, loops, steep dives), jet HOLDS attitude on release,
  // only a very slow drift toward level after ~2.4 s of a released stick, never while the stick is touched, never on a hard push.
  function assistFlight(dt, st) {
    const rawSt = st; trackOn = false; recover = 0;
    const ez = ezv(), ak = akv();
    const brk = (controls.brake && controls.brake()) ? 1 : 0;
    brkV += (brk - brkV) * (1 - Math.exp(-dt * 5));
    const cv = (v, e) => { const a = Math.max(0, (Math.abs(v) - 0.05) / 0.95); return Math.sign(v) * Math.pow(a, e); };
    const sp = Math.max(Math.abs(st.pitch), Math.abs(st.roll));
    aP = cv(st.pitch, 1.5); aR = cv(st.roll, 1.45);
    // terrain / ground avoidance: look 1 .. 4.7 s ahead, pull up smoothly and fade any nose-down input
    let danger = 0;
    if (!nearPad) {
      for (let k = 1; k <= 5; k++) {
        const t = k * 0.95, px = player.pos.x + player.vel.x * t, pz = player.pos.z + player.vel.z * t, py = player.pos.y + player.vel.y * t;
        const clear = py - groundAt(px, pz);
        danger = Math.max(danger, THREE.MathUtils.clamp((70 - clear) / 70, 0, 1) * (1 - (k - 1) * 0.1));
      }
      const agl0 = player.pos.y - groundAt(player.pos.x, player.pos.z);
      if (agl0 < 30) danger = Math.max(danger, 1);   // b29: only a real near-ground rescue; full dive allowed
      for (const t of targets) {
        if (!t.alive || !SOLID[t.kind] || t.kind === "jet") continue;
        _vA.subVectors(t.pos, player.pos); const dd = _vA.length(); if (dd > 900 || dd < 1) continue;
        const ah = _vA.dot(player.vel) / (dd * Math.max(1, player.speed)); if (ah < 0.55) continue;
        if (player.pos.y - t.pos.y > t.radius + 110) continue;
        const miss = dd * Math.sqrt(Math.max(0, 1 - ah * ah));
        if (miss < t.radius * 1.3 + 70) danger = Math.max(danger, (1 - dd / 900) * 1.3);
      }
    }
    assistDanger += (danger - assistDanger) * (1 - Math.exp(-dt * 8));
    if (assistDanger > 0.02 && assistDanger > 0.55) { setAlert("PULL UP", 0.3); if (elapsed - rescueAt > 2.5) { rescueAt = elapsed; audio.pullUp(); } }
    // ---- pitch: stick = nose RATE (expo). Hard pull = extra-fast break; airbrake tightens it further
    const uP = Math.max(0, Math.abs(st.pitch) - 0.05) / 0.95;
    const sm = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const maxPR = (1.9 - 0.3 * ez) * (1 + 0.12 * brkV) * (1 + 0.2 * sm(0.72, 1, uP));
    let pitchRate = Math.sign(st.pitch) * Math.pow(uP, 1.3) * maxPR;
    if (pitchRate < 0 && !player.inverted && assistDanger > 0.6) pitchRate *= Math.max(0, 1 - (assistDanger - 0.6) * 2.5);
    if (pitchRate > 0 && player.inverted && assistDanger > 0.1) pitchRate *= Math.max(0, 1 - assistDanger * 1.6);
    loopT = Math.abs(st.pitch) > 0.97 ? loopT + dt : 0;
    // ---- roll: stick = roll RATE; full stick = fast barrel roll. Gentle input stops at ~80 deg bank (a clean banked turn); a firm push rolls on through
    const uR = Math.max(0, Math.abs(st.roll) - 0.05) / 0.95;
    const maxRR = 5.6 - 1.0 * ez;
    let rr = Math.sign(st.roll) * Math.pow(uR, 1.3) * maxRR;
    const ab = Math.abs(player.bank);
    if (Math.abs(st.roll) < 0.9 && ab > 1.38 && ab < 1.85 && player.bank * rr > 0) rr *= Math.max(0, 1 - (ab - 1.38) / 0.18);
    // ---- hold, then only a very slow drift (clearly weaker than build 23)
    // b25 ARCADE: full authority while the stick is held (nothing fights you); the instant you let go the jet rolls wings-level
    // and eases the nose back to the horizon (short grace so a quick re-grab keeps your attitude). Works from any bank incl. inverted.
    holdT = sp < 0.07 ? holdT + dt : 0;
    const dK = THREE.MathUtils.clamp((holdT - 0.22) / 0.35, 0, 1);
    if (dK > 0 && assistDanger < 0.05 && !loopPull_) {
      const bk = player.bank;
      rr -= THREE.MathUtils.clamp(bk * 2.6, -2.4, 2.4) * dK;          // roll upright by the short way
      if (Math.abs(bk) < 1.9 && !controls.gyroActive?.()) pitchRate -= THREE.MathUtils.clamp(player.pitch * 1.9, -1.1, 1.1) * dK * Math.max(0, 1 - Math.abs(bk) / 1.9);
    }
    // ground rescue: roll upright first if inverted, then pull
    if (assistDanger > 0.02) {
      const upr = Math.max(0, Math.cos(player.bank));
      if (player.pitch < 0.7) pitchRate = Math.max(pitchRate, assistDanger * 1.6 * upr);
      if (assistDanger > 0.3 && player.inverted) rr += -Math.sign(player.bank || 1) * 3.2 * assistDanger;
    }
    // minimal tap-aim only (air taps); no passive steering of the nose
    let best = null, bl = _vB;
    if (tapT > 0 && tapTarget && tapTarget.alive && !nearPad) { _qI.copy(player.q).invert(); _vA.subVectors(tapTarget.pos, player.pos).applyQuaternion(_qI); best = tapTarget; bl.copy(_vA); }
    if (best && sp < 0.25) {
      const w = (1 - sp / 0.25) * (1 + 0.6 * ez) * (assistDanger > 0.1 ? 0 : 1);
      const ey = Math.atan2(bl.y, Math.hypot(bl.x, bl.z)), ex = Math.atan2(bl.x, -bl.z);
      if (!(ey < 0 && player.pitch < -0.45)) pitchRate += THREE.MathUtils.clamp(ey * 1.5, -0.5, 0.5) * w * 0.4;
      rotBody(AY, -THREE.MathUtils.clamp(ex * 1.2, -0.5, 0.5) * w * dt);
    }
    // b26 SOFT AIM ASSIST: the locked target gently pulls the nose / bank toward it, but never takes the stick (full manual authority always wins)
    if (lockTarget && lockTarget.alive && lockTarget.kind !== "ally" && !nearPad && assistDanger < 0.1 && !maneuver && !player.inverted) {
      _qI.copy(player.q).invert(); _vA.subVectors(lockTarget.pos, player.pos); const dd = _vA.length(); _vA.applyQuaternion(_qI);
      if (dd > 60 && dd < 4600 && _vA.z < 0) {
        const ex = Math.atan2(_vA.x, -_vA.z), ey = Math.atan2(_vA.y, Math.hypot(_vA.x, _vA.z));
        if (Math.abs(ex) < 1.0 && Math.abs(ey) < 0.75) {
          const w = Math.max(0, 0.95 - 1.6 * sp) * (0.55 + 0.45 * ez);   // b29: any real stick / tilt input = no pull
          pitchRate += THREE.MathUtils.clamp(ey * 2.2, -0.9, 0.9) * w;
          rr += THREE.MathUtils.clamp(ex * 1.4, -1, 1) * w * 1.1 * Math.max(0, 1 - Math.abs(player.bank) / 1.1);
          rotBody(AY, -THREE.MathUtils.clamp(ex * 1.8, -1, 1) * w * dt);
        }
      }
    }
    rotBody(AX, pitchRate * dt);
    player.q.multiply(_qa.setFromAxisAngle(tD.set(0, 0, -1), rr * dt));
    rotBody(AY, st.yaw * 0.6 * dt);
    rotWorld(AY, -Math.sin(player.bank) * (0.95 + 0.4 * (1 - ez)) * (1 + 0.2 * brkV) * Math.max(0, Math.cos(player.pitch)) * dt);
  }
  const loopPull_ = false;

  function flight(dt) {
    const st = controls.stick;
    const loopReq = controls.consumeLoop();
    if (loopReq === 2 || loopReq === -2) startRoll(loopReq / 2);
    else if (loopReq) startLoop(loopReq);
    syncAngles();
    let pull = st.pitch;
    if (maneuver) {
      runManeuver(dt);
      pull = maneuver && maneuver.kind === "loop" ? maneuver.dir : 0;
    } else {
      if (assist && !landing && !crashing) assistFlight(dt, st);
      else {
        aP = st.pitch; aR = st.roll;
      // rates, not angles: hold a tilt to keep rolling / pitching -> full 360 on every axis
        rotBody(AX, st.pitch * 1.7 * dt);                 // pitch (hold = natural loop in ~5 s)
        let rr = st.roll * 3.0;                           // roll rate
        // no barrel rolls: bank is capped at ~70 degrees (steering still turns fast; loops via pitch still work)
        if (!player.inverted && player.bank * rr > 0 && Math.abs(player.bank) > MAX_BANK) rr *= Math.max(0, 1 - (Math.abs(player.bank) - MAX_BANK) / 0.15);
        // very gentle wing-leveller only when hands-off and roughly upright; never blocks inversion
        if (Math.abs(st.roll) < 0.12 && Math.abs(player.bank) < 0.9 && Math.abs(player.pitch) < 1.0) rr -= player.bank * 0.8;
        player.q.multiply(_qa.setFromAxisAngle(tD.set(0, 0, -1), rr * dt));
        rotBody(AY, st.yaw * 0.6 * dt);                   // rudder (desktop Q/E)
        // coordinated turn: banking yaws the nose around world-up (this is the phone's yaw control)
        rotWorld(AY, -Math.sin(player.bank) * 1.05 * Math.max(0, Math.cos(player.pitch)) * dt);
      }
    }
    nearPad = pad && landingOpen && Math.hypot(player.pos.x - pad.pos.x, player.pos.z - pad.pos.z) < 520;
    // bounds: steer back toward the map centre around world-up
    const dx = player.pos.x - center.x, dz = player.pos.z - center.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > half && !maneuver) {
      const d = wrapPi(Math.atan2(dx, dz) - player.yaw);
      rotWorld(AY, Math.sign(d) * Math.min(Math.abs(d), 0.7 * dt));
      setAlert("Turn back!", 0.3);
    }
    syncAngles();
    // speed
    const boost = controls.boost() ? 1 : 0;
    let target = (52 + throttle * 190) * (assist ? 1 - 0.2 * ezv() : 1) + boost * 55 - Math.sin(player.pitch) * 55;   // throttle lever: 120 (slow) .. 320 (fast)
    target *= 1 - 0.5 * brkV; target -= 16 * Math.min(1, Math.max(Math.abs(aP), Math.abs(aR) * 0.5)) * (1 - boost);
    if (maneuver && maneuver.kind === "loop") target = Math.max(target, 140);
    if (nearPad) target = Math.min(target, 100);
    if (fuelV <= 0) target = Math.min(target, 64);
    player.speed += (target - player.speed) * dt * (1.4 + 2.2 * brkV);
    player.speed = Math.max(assist ? 52 - 14 * brkV : 62, player.speed);
    { const dq = Math.min(1, Math.abs(player.q.dot(prevQ))); const om = dt > 0 ? 2 * Math.acos(dq) / dt : 0; prevQ.copy(player.q); gload += (THREE.MathUtils.clamp(om / 1.25, 0, 1) - gload) * (1 - Math.exp(-dt * 6)); }
    player.vel.set(0, 0, -1).applyQuaternion(player.q).multiplyScalar(player.speed);
    player.pos.addScaledVector(player.vel, dt);
    const g2 = groundAt(player.pos.x, player.pos.z);
    if (player.pos.y > g2 + 5000) player.pos.y = g2 + 5000; // soft ceiling
    if (assist && !nearPad && !landing && !maneuver && player.pos.y < g2 + 18) player.pos.y = g2 + 18;   // assist: the ground is a soft floor, you cannot plough into it
    const agl = player.pos.y - g2;
    // gentle terrain avoidance: easy and fun, never a surprise crash while skimming
    if (!maneuver && !nearPad && agl < 25 && player.vel.y < 0) rotBody(AX, (1 - agl / 55) * 2.2 * Math.max(0, Math.cos(player.bank)) * dt);
    // low-altitude warning (no auto-correction): < 120 m while descending, or anything below 60 m
    lowAlt = !maneuverSafe() && !nearPad && !landing && elapsed > invulnUntil && ((agl < 120 && player.vel.y < -2) || agl < 60);
    updatePlaneTransform();
    // b26: fly low and aligned over the airstrip and the landing assist takes you down
    if (strip && !maneuver && !landing) {
      const ls = stripLocal(player.pos), dirA = Math.abs(wrapPi(player.yaw - strip.hd)), dirB = Math.abs(wrapPi(player.yaw - strip.hd - Math.PI));
      if (!landArm && (ls.y > 260 || Math.hypot(ls.x, ls.z) > 2800)) landArm = true;   // not right after lift-off
      if (landArm && Math.abs(ls.x) < 130 && Math.abs(ls.z) < STRIP.len / 2 + 500 && ls.y > 3 && ls.y < 150 && player.speed < 215 && Math.min(dirA, dirB) < 0.5) startLanding(false);
    }
    // ---- crash checks (ground / water / solid objects) ----
    if (pad && checkDeck()) return;
    if (agl < 2.5) { crash(player.pos.clone().setY(g2 + 2), terrain.isWater(player.pos.x, player.pos.z) ? "water" : "ground"); return; }
    if (elapsed > invulnUntil) {
      for (const t of targets) {
        if (t.alive && SOLID[t.kind] && t.pos.distanceTo(player.pos) < t.radius * 0.85 + 5) {
          if (assist && player.hp > 28) { damagePlayer(LIFE * 1.5, "Collision!", true); kill(t); player.pos.y += 25; shake = 3; continue; }
          crash(player.pos.clone(), t.kind); return;
        }
      }
    }
    // flame + nav lights + vapour
    const u = plane.userData;
    u.burn(0.3 + 0.85 * throttle + 0.15 * boost, boost);   // b26: flame length scales with throttle
    {   // b26 FUEL: burns faster with throttle + afterburner; empty = glide, never an instant loss
      fuelV = Math.max(0, fuelV - dt * (0.0015 + throttle * 0.0030 + boost * 0.0040) * (1 - 0.3 * ezv()));
      if (fuelV < 0.25 && fuelWarn < 1) { fuelWarn = 1; events.toast?.("LOW FUEL - AUTO LAND", "warn"); audio.warn?.(); }
      if (fuelV < 0.1 && fuelWarn < 2) { fuelWarn = 2; setAlert("FUEL CRITICAL - AUTO LAND", 4); audio.say?.("Fuel critical"); }
      if (fuelV <= 0 && fuelWarn < 3) { fuelWarn = 3; setAlert("FUEL EMPTY - GLIDING", 4); }
      if (fuelV > 0.3) fuelWarn = 0;
    }
    u.ctl?.({ pitch: aP, roll: aR, yaw: st.yaw, brake: Math.max(brkV, THREE.MathUtils.clamp((0.22 - throttle) / 0.15, 0, 1)), flap: THREE.MathUtils.clamp((95 - player.speed) / 40, 0, 1), burn: boost });
    trailT -= dt;
    if (trailT <= 0 && viewMode !== "cockpit") {
      trailT = 0.03;
      for (const s of [-1, 1]) fx(tA.set(s * 6.2, -0.15, 3.2).applyMatrix4(plane.matrixWorld), null, 0.55, 1.6, 0.7 + Math.min(0.5, Math.abs(pull)), prismHex(elapsed, s * 0.12), 0, 0);
    }
  }
  let trailT = 0, nearPad = false, autoGun = false;
  // carrier deck: lenient arrest zone above the flight deck
  function padLocal(p) {
    const th = pad.obj.rotation.y, c = Math.cos(th), sn = Math.sin(th);
    const wx = p.x - pad.pos.x, wz = p.z - pad.pos.z;
    return { x: wx * c - wz * sn, z: wx * sn + wz * c, y: p.y - (pad.pos.y + CARRIER.deckY) };
  }
  function checkDeck() {
    if (landing || crashing || ops) return false;
    const l = padLocal(player.pos);
    if (Math.abs(l.x) > (CARRIER.width / 2) + 6 || Math.abs(l.z) > (CARRIER.len / 2)) return false;
    if (l.y > 34 || l.y < -22) return false;
    if (l.y < 7) {
      if (player.pitch < -0.35 || l.y < -2) { crash(player.pos.clone(), "carrier"); return true; }
      landing = { t: 0, from: player.pos.clone(), l0: l, sp: player.speed };
      events.onLanding?.();
      return true;
    }
    return false;
  }
  function updateLanding(dt) {
    landing.t += dt;
    const k = Math.min(1, landing.t / 1.6), e = 1 - (1 - k) * (1 - k);
    const th = pad.obj.rotation.y, c = Math.cos(th), sn = Math.sin(th);
    const lz = landing.l0.z + ((CARRIER.len / 2) * 0.35 - landing.l0.z) * e * 0.6;
    const lx = landing.l0.x * (1 - e);
    player.pos.set(pad.pos.x + lx * c + lz * sn, pad.pos.y + CARRIER.deckY + 1.4 + (landing.l0.y - 1.4) * (1 - e), pad.pos.z - lx * sn + lz * c);
    player.q.slerp(_qa.setFromAxisAngle(AY, pad.heading + Math.PI), 0.08);
    player.speed = landing.sp * (1 - e);
    if (Math.random() < 0.7) { fx(tA.set(0, -0.8, 3).applyMatrix4(plane.matrixWorld), V().set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8), 0.5, 0.1, 0.5, 0xffc060, GRAV * 0.4, 0.5); }
    updatePlaneTransform();
    if (landing.t > 2.3) {
      const land = landing; landing = null; player.speed = 0; player.vel.set(0,0,0);
      ops = { carrier:true, mode:"reload", park:padLocal(player.pos), t:0, kf:0, ka:0, fuel0:fuelV, r0:player.rockets, b0:player.bombs, h0:player.hp, fl0:player.flares };
      gearSet(1); opsHud(); serviceAt = elapsed;
      score += 500;
      progress.land = 1;
      events.toast?.("TRAPPED! +500");
      checkDone();
    }
  }


  // ---------- b26 AIRFIELD: takeoff, landing, refuel/rearm, landing gear, orbit-cam cuts ----------
  const GEAR_H = 2.7;
  let strip = null, ops = null, camCut = null, gearWant = 0, gearAnim = 1, fuelWarn = 0;
  const camTmp = new THREE.PerspectiveCamera();
  function flightStrip() { return ops?.carrier && pad ? { pos:pad.pos, y:pad.pos.y + CARRIER.deckY, hd:pad.heading + Math.PI } : strip; }
  function flightLen() { return ops?.carrier ? CARRIER.len : STRIP.len; }
  function stripWorld(lx, ly, lz, out) { const d = flightStrip(), c = Math.cos(d.hd), sn = Math.sin(d.hd); return out.set(d.pos.x + lx * c + lz * sn, d.y + ly, d.pos.z - lx * sn + lz * c); }
  function stripLocal(p) { const d = flightStrip(), c = Math.cos(d.hd), sn = Math.sin(d.hd), wx = p.x - d.pos.x, wz = p.z - d.pos.z; return { x: wx * c - wz * sn, z: wx * sn + wz * c, y: p.y - d.y }; }
  function spawnStrip(sp) {
    const L2 = STRIP.len;
    let best = null;
    for (let k = 0; k < 90; k++) {
      const a = rng() * Math.PI * 2, r = 1100 + rng() * (k < 45 ? 2400 : 5200);
      const cx = sp.x + Math.cos(a) * r, cz = sp.z + Math.sin(a) * r;
      if (Math.abs(cx - center.x) > half - 2200 || Math.abs(cz - center.z) > half - 2200) continue;
      const hd = Math.floor(rng() * 16) * Math.PI / 8;
      const c = Math.cos(hd), sn = Math.sin(hd);
      let mn = 1e9, mx = -1e9, sum = 0, n = 0, water = false;
      for (let i = 0; i <= 12 && !water; i++) for (const lx of [-60, 0, 60]) {
        const lz = (i / 12 - 0.5) * (L2 + 100), x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c;
        if (terrain.isWater(x, z)) { water = true; break; }
        const h = groundAt(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); sum += h; n++;
      }
      if (water) continue;
      const score = mx - mn; if (!best || score < best.score) best = { cx, cz, hd, y: mx + 1.2, score };
      if (score < 6) break;
    }
    if (!best || best.score > 45) return false;
    const obj = createAirstrip();
    obj.position.set(best.cx, best.y, best.cz); obj.rotation.y = best.hd; scene.add(obj);
    strip = { obj, pos: obj.position, hd: best.hd, y: best.y, strobeT: 0 };
    return true;
  }
  let landArm = true;
  function parkAtStart() {
    ops = null; landArm = false;
    stripWorld(0, GEAR_H, STRIP.len / 2 - 90, player.pos);
    player.yaw = strip.hd; player.pitch = 0; player.bank = 0; player.q.setFromEuler(_eu.set(0, strip.hd, 0, "YXZ")); player.speed = 0; player.vel.set(0, 0, 0);
    syncAngles();
    gearAnim = 1; gearWant = 1; plane.userData.setGear?.(1);
    ops = { mode: "load", t: 0, kf: 0, ka: 0, kh: 1, fuel0: fuelV, r0: player.rockets, b0: player.bombs };
    camCut = { kind: "beauty", t: 0, dur: 1e9, dir: 1 };
    updatePlaneTransform(); snapCamera(); opsHud();
  }
  function opsHud() { events.onOps?.(ops ? { mode: ops.mode, kf: ops.kf, ka: ops.ka } : { mode: null }); }
  function takeoff() {
    if (!ops || ops.mode !== "ready") return false;
    landArm = false;
    ops = { carrier: !!ops.carrier, mode: "roll", t: 0, v: 0, pitch: 0, air: 0, vy: 0 };
    camCut = { kind: "lift", t: 0, dur: 1e9, dir: 1, hold: true };   // low chase on the runway, orbit cut at lift-off
    camCut = null;
    audio.startEngine?.(); events.toast?.("TAKEOFF", "good"); opsHud();
    return true;
  }
  function startLanding(auto) {
    if (ops && ["app", "final"].includes(ops.mode)) { ops = null; camCut = null; gearSet(0); landArm = false; setAlert("GO AROUND - CLIMB", 3); opsHud(); return true; }
    if ((!strip && !pad) || ops || crashing || landing || ended) return false;
    const carrier = !!pad && (!strip || pad.pos.distanceTo(player.pos) < strip.pos.distanceTo(player.pos));
    ops = { carrier }; const deck = flightStrip(), len = flightLen();
    const f = fwdFrom(player.yaw, 0, V()), dx = -Math.sin(deck.hd), dz = -Math.cos(deck.hd);
    const sgn = carrier ? 1 : f.x * dx + f.z * dz >= 0 ? 1 : -1;
    const zTouch = sgn * (len / 2 - (carrier ? len * 0.32 : 420)), approach = carrier ? 1800 : 2500;
    const T = stripWorld(0, GEAR_H, zTouch, V()), F = stripWorld(0, carrier ? 130 : 205, zTouch + sgn * approach, V());
    ops = { carrier, zTouch, approach, mode: "app", t: 0, T, F, sgn, ly: deck.hd + (sgn > 0 ? 0 : Math.PI), dir: new THREE.Vector3(dx * sgn, 0, dz * sgn), v: Math.max(110, player.speed), bk: 0 };
    maneuver = null; muzzle.visible = false; lowAlt = false; opsHud();
    events.toast?.(carrier ? "CARRIER APPROACH" : auto ? "AUTO LAND" : "LANDING ASSIST", "good"); audio.say?.("Auto land");
    return true;
  }
  function gearSet(want) { if (want === gearWant) return; gearWant = want; audio.gearMotor?.(1.25, want === 1); }
  function updateGear(dt) {
    if (!plane || !plane.userData.setGear) return;
    if (gearAnim === gearWant) return;
    gearAnim += Math.sign(gearWant - gearAnim) * dt / 1.25;
    if (Math.abs(gearWant - gearAnim) < dt / 1.25) gearAnim = gearWant;
    plane.userData.setGear(gearAnim);
  }
  function groundFx(dt, v, hard) {
    const sp = Math.min(1, v / 100);
    if (Math.random() < dt * (10 + 40 * sp)) for (const sd of [-1, 1]) {
      tA.set(sd * 1.85, -GEAR_H + 0.4, 1.3).applyMatrix4(plane.matrixWorld);
      puff(tA, tB.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 2.2 * (0.6 + sp), 9, 0.9, 0xcfcfcf);
      if (hard && Math.random() < 0.6) fx(tA, tB.set((Math.random() - 0.5) * 14, 3 + Math.random() * 8, (Math.random() - 0.5) * 14), 0.6, 0.35, 0.4, 0xffb050, GRAV * 0.6, 1);
    }
  }
  function updateOps(dt) {
    const o = ops, u = plane.userData, input = controls.stick, deck = flightStrip(), len = flightLen();
    if (o.carrier && (o.mode === "app" || o.mode === "final")) { stripWorld(0,GEAR_H,o.zTouch,o.T); stripWorld(0,130,o.zTouch + o.sgn * o.approach,o.F); o.ly = deck.hd; }
    if (o.carrier && ["load","reload","ready"].includes(o.mode)) { const l = o.park || {x:0,z:0}; stripWorld(l.x,GEAR_H,l.z,player.pos); player.yaw = deck.hd; player.q.setFromEuler(_eu.set(0,deck.hd,0,"YXZ")); player.speed = 0; player.vel.set(0,0,0); }
    o.t += dt;
    const ease = (x) => x * x * (3 - 2 * x), cl = (x) => Math.max(0, Math.min(1, x));
    const dirx = -Math.sin(deck.hd), dirz = -Math.cos(deck.hd);
    if (!o.carrier && ["reload","ready"].includes(o.mode)) { player.yaw += wrapPi(deck.hd-player.yaw) * Math.min(1,dt*0.85); player.q.setFromEuler(_eu.set(0,player.yaw,0,"YXZ")); }
    if (o.mode === "load" || o.mode === "reload") {
      const dur = o.mode === "load" ? 3.0 : 4.6;
      o.kf = ease(cl(o.t / (dur * 0.75))); o.ka = ease(cl((o.t - 0.5) / (dur * 0.75)));
      if (o.mode === "reload") {
        fuelV = o.fuel0 + (1 - o.fuel0) * o.kf; player.rockets = Math.round(o.r0 + (RACK - o.r0) * o.ka); player.bombs = Math.round(o.b0 + (RACK - o.b0) * o.ka);
        player.hp = Math.min(100, o.h0 + (100 - o.h0) * o.ka); player.flares = Math.round(o.fl0 + (12 - o.fl0) * o.ka);
        if (Math.random() < dt * 4) audio.reload?.(Math.random() < 0.5 ? "bomb" : "missile");
      }
      if (o.t >= dur) { serviceAt = elapsed; o.mode = "ready"; o.kf = o.ka = 1; fuelV = Math.max(fuelV, 1); events.toast?.("READY FOR TAKEOFF", "good"); audio.respawn?.(); }
      u.burn(0.08, 0); audio.updateEngine?.(0.08, false, 0, 0); audio.setBurner?.(false);
      opsHud();
    } else if (o.mode === "ready") {
      u.burn(0.1, 0); audio.updateEngine?.(0.12, false, 0, 0); opsHud();
    } else if (o.mode === "roll") {
      o.v += (o.carrier ? 95 : 15 + 11 * (1 - Math.min(1, o.v / 150))) * dt;
      const tp = o.v > 98 ? THREE.MathUtils.clamp((o.v - 98) * 0.0065 + input.pitch * 0.08, 0.02, 0.28) : 0; o.pitch += (tp - o.pitch) * Math.min(1, dt * 3);
      player.pos.x += dirx * o.v * dt; player.pos.z += dirz * o.v * dt;
      if (o.air === 0 && o.v > 128 && o.pitch > 0.12) { o.air = 0.001; o.vy = 5; camCut = { kind: "lift", t: 0, dur: 3.1, dir: 1 }; audio.whoosh?.(); shake = Math.max(shake, 0.5); }
      if (o.air > 0) { o.air += dt; o.vy += dt * 7; player.pos.y += o.vy * dt; if (o.air > 0.9) gearSet(0); }
      else { player.pos.y = deck.y + GEAR_H; groundFx(dt, o.v, false); shake = Math.max(shake, 0.12 + 0.2 * Math.min(1, o.v / 140)); }
      player.pos.x += Math.cos(deck.hd) * input.roll * dt * (o.air ? 9 : 2); player.pos.z -= Math.sin(deck.hd) * input.roll * dt * (o.air ? 9 : 2);
      if (o.air) { const ahead = groundAt(player.pos.x + dirx * o.v * 3, player.pos.z + dirz * o.v * 3); player.pos.y = Math.max(player.pos.y, ahead + 28); }
      player.yaw = deck.hd; player.q.setFromEuler(_eu.set(o.pitch, deck.hd + input.roll * 0.035, -input.roll * (o.air ? 0.14 : 0.025), "YXZ")); player.speed = o.v; player.vel.set(dirx * o.v, o.vy || 0, dirz * o.v);
      u.burn(1.15, 1); audio.updateEngine?.(1, false, o.v, 0.6); audio.setBurner?.(true);
      trailT -= dt; if (trailT <= 0) { trailT = 0.03; for (const s2 of [-0.9, 0.9]) { tA.set(s2, 0.0, 7).applyMatrix4(plane.matrixWorld); fx(tA, null, 1.6, 0.8, 0.5, 0xffb060, 0, 1); } }
      if (o.air > 2.6 || (o.air > 0 && player.pos.y - deck.y > 70)) {
        ops = null; syncAngles(); player.speed = Math.max(o.v, 140); throttle = Math.max(throttle, 0.6); invulnUntil = elapsed + 1.5; opsHud(); audio.setBurner?.(false);
      }
    } else if (o.mode === "app" || o.mode === "final") {
      const T = o.T, F = o.F;
      let tgt = o.mode === "app" ? F : T;
      const ddx = tgt.x - player.pos.x, ddz = tgt.z - player.pos.z, d2 = Math.hypot(ddx, ddz);
      let yd = Math.atan2(-ddx, -ddz) + input.roll * 0.075;
      const dT = Math.hypot(T.x - player.pos.x, T.z - player.pos.z);
      const runwayP = stripLocal(player.pos), runwayT = stripLocal(T), remaining = (runwayP.z - runwayT.z) * o.sgn;
      if (o.mode === "final") yd = o.ly + THREE.MathUtils.clamp(Math.atan2(runwayP.x * o.sgn, Math.max(220, remaining)), -0.32, 0.32) + input.roll * 0.055;
      const dy = wrapPi(yd - player.yaw), tr = o.mode === "app" ? 0.85 : 0.55;
      const step = THREE.MathUtils.clamp(dy, -tr * dt, tr * dt); player.yaw += step;
      o.bk += (THREE.MathUtils.clamp(-step / Math.max(dt, 1e-3) * 0.9, -0.8, 0.8) - o.bk) * Math.min(1, dt * 3);
      let vy, spd;
      if (o.mode === "app") { vy = THREE.MathUtils.clamp((F.y - player.pos.y) * 0.3, -26, 26); spd = 125 + (player.speed < 125 ? 0 : 0); if (d2 < 380 || (d2 < 3200 && Math.abs(wrapPi(player.yaw - o.ly)) < 0.45 && Math.abs(stripLocal(player.pos).x) < 160)) { o.mode = "final"; gearSet(1); } }
      else {
        const glideD = Math.max(0, remaining);
        const yDes = T.y + glideD * (glideD > 220 ? 0.065 : 0.065 * (glideD / 220) + 0.008 * (1 - glideD / 220));
        vy = THREE.MathUtils.clamp((yDes - player.pos.y) * 2.4, -22, 12);
        spd = 76 + 46 * Math.min(1, dT / 2200);
        spd += (throttle - 0.35) * 18;   // b30: pilot trims final speed a little with the throttle
        if (dT < 2500) gearSet(1);
      }
      vy += input.pitch * 3.5;
      // Sample the whole upcoming path, but taper clearance only over the actual runway.
      const local = stripLocal(player.pos), overRunway = Math.abs(local.x) < (o.carrier ? CARRIER.width / 2 - 4 : 38) && Math.abs(local.z) < len / 2 + 80;
      if (!overRunway) for (let k = 1; k <= 4; k++) {
        const ahead = groundAt(player.pos.x - Math.sin(player.yaw) * player.speed * k, player.pos.z - Math.cos(player.yaw) * player.speed * k);
        if (o.carrier && ahead < 1) continue;
        if (player.pos.y + vy * k < ahead + 65) vy = Math.max(vy, Math.min(45, (ahead + 65 - player.pos.y) / k));
      }
      player.speed += (spd - player.speed) * Math.min(1, dt * 1.4);
      const hv = player.speed * Math.cos(Math.asin(THREE.MathUtils.clamp(vy / Math.max(60, player.speed), -0.5, 0.5)));
      player.pos.x += -Math.sin(player.yaw) * hv * dt; player.pos.z += -Math.cos(player.yaw) * hv * dt; player.pos.y += vy * dt;
      const pit = Math.asin(THREE.MathUtils.clamp(vy / Math.max(60, player.speed), -0.5, 0.5)) + (o.mode === "final" && dT < 160 ? 0.1 * (1 - dT / 160) : 0);
      player.pitch = pit; player.bank = o.bk; player.q.setFromEuler(_eu.set(pit, player.yaw, -o.bk, "YXZ"));
      player.vel.set(-Math.sin(player.yaw) * hv, vy, -Math.cos(player.yaw) * hv);
      u.burn(0.2 + 0.2 * (player.speed / 140), 0); audio.updateEngine?.(0.3, false, player.speed, 0); audio.setBurner?.(false);
      if (o.mode === "final" && Math.abs(stripLocal(player.pos).x) < (o.carrier ? CARRIER.width / 2 - 3 : 26) && Math.abs(stripLocal(player.pos).z) < len / 2 && (player.pos.y <= T.y + 0.8 && remaining < 150) && gearAnim > 0.9) {   // TOUCHDOWN
        player.pos.y = deck.y + GEAR_H; o.mode = "rollout"; o.v = player.speed; o.t = 0; o.pitch = player.pitch; o.bk = player.bank;
        for (let i = 0; i < 24; i++) { tA.set((i & 1 ? 1 : -1) * 1.85, -GEAR_H + 0.3, 1.3).applyMatrix4(plane.matrixWorld); fx(tA, tB.set((Math.random() - 0.5) * 20, 4 + Math.random() * 14, (Math.random() - 0.5) * 20), 0.8, 0.5, 0.6, 0xffc060, GRAV * 0.6, 1); puff(tA, tB.set((Math.random() - 0.5) * 6, 1 + Math.random() * 3, (Math.random() - 0.5) * 6), 3, 16, 1.6, 0xd0d0d0); }
        audio.touchdown?.(); shake = Math.max(shake, 1.4);
        camCut = { kind: "touch", t: 0, dur: 3.4, dir: Math.random() < 0.5 ? 1 : -1 }; events.toast?.("TOUCHDOWN", "good");
      } else if (o.mode === "final" && (remaining < -len * 0.55 || Math.abs(runwayP.x) > 180 && remaining < 350)) {
        o.mode = "app"; o.t = 0; gearSet(0); setAlert("GO AROUND - ALIGN AGAIN", 3);
      } else if (o.t > 140) { ops = null; gearSet(0); setAlert("APPROACH CANCELLED - TRY AGAIN", 3); opsHud(); }
    } else if (o.mode === "rollout") {
      o.v = Math.max(0, o.v - dt * (o.carrier ? 55 + o.v * 0.7 : 11 + o.v * 0.4));
      const ddx = -Math.sin(player.yaw), ddz = -Math.cos(player.yaw);
      player.pos.x += ddx * o.v * dt; player.pos.z += ddz * o.v * dt; player.pos.y = deck.y + GEAR_H;
      o.pitch += (0 - o.pitch) * Math.min(1, dt * 3.5); o.bk += (0 - o.bk) * Math.min(1, dt * 3);
      player.pitch = o.pitch; player.q.setFromEuler(_eu.set(o.pitch, player.yaw, 0, "YXZ")); player.speed = o.v; player.vel.set(ddx * o.v, 0, ddz * o.v);
      groundFx(dt, o.v, o.t < 1.2); shake = Math.max(shake, Math.min(0.5, o.v / 160));
      u.burn(0.06, 0); audio.updateEngine?.(0.1, false, o.v, 0);
      if (o.v < 1.5) {
        player.speed = 0; player.vel.set(0, 0, 0);
        ops = { carrier: o.carrier, park: stripLocal(player.pos), mode: "reload", t: 0, kf: 0, ka: 0, fuel0: fuelV, r0: player.rockets, b0: player.bombs, h0: player.hp, fl0: player.flares };
        camCut = { kind: "beauty", t: 0, dur: 1e9, dir: 1 }; events.toast?.("REFUEL + REARM", "info"); opsHud();
      }
    }
    plane.position.copy(player.pos); plane.quaternion.copy(player.q);
    plane.userData.ctl?.({ pitch: 0, roll: 0, yaw: 0, brake: ops && ops.mode === "rollout" ? 1 : 0, flap: ops && (ops.mode === "app" || ops.mode === "final" || ops.mode === "rollout") ? 0.8 : 0, burn: 0 });
    updatePlaneTransform();
  }
  function camOverlay(dt) {
    const c = camCut; if (!c) return;
    c.t += dt;
    let w, az, r, el, fov;
    if (c.kind === "beauty") { w = Math.min(1, c.t / 0.5); w = w * w * (3 - 2 * w); az = Math.PI * 0.82 + c.t * 0.1; r = 24; el = 0.1; fov = 46; }
    else {
      const u2 = Math.min(1, c.t / c.dur), e = u2 * u2 * (3 - 2 * u2);
      const a = Math.min(1, c.t / 0.12), b = Math.min(1, Math.max(0, (c.dur - c.t) / 0.7));
      w = a * a * (3 - 2 * a) * b * b * (3 - 2 * b);
      az = c.dir * (c.kind === "lift" ? 1.0 + e * 2.3 : 0.35 + e * 2.7); r = (c.kind === "lift" ? 20 : 17) + e * 16; el = (c.kind === "lift" ? 0.04 : 0.07) + e * 0.2; fov = 54;
      if (c.t >= c.dur) { camCut = null; return; }
    }
    const ce = Math.cos(el), cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    const ox = Math.sin(az) * ce * r, oy = Math.sin(el) * r, oz = Math.cos(az) * ce * r;
    camTmp.position.set(plane.position.x + ox * cy + oz * sy, plane.position.y + oy, plane.position.z - ox * sy + oz * cy);
    const gy = Math.max(groundAt(camTmp.position.x, camTmp.position.z), strip ? strip.y : -1e9) + 2.2; if (camTmp.position.y < gy) camTmp.position.y = gy;
    camTmp.up.set(0, 1, 0); camTmp.lookAt(tC.copy(plane.position).add(tB.set(0, 1.4, 0)));
    camera.position.lerp(camTmp.position, w); camera.quaternion.slerp(camTmp.quaternion, w);
    camera.fov += (fov - camera.fov) * w; camera.updateProjectionMatrix();
  }

  // ---------- crash ----------

  // ---------- b26 EJECTION: before EVERY respawn the pilot ejects (movie style: camera revolves + zooms out, canopy blows, seat rockets, chute opens) ----------
  let fuelV = 1;
  let ejRig = null, ejCan = null;
  function ejBuild() {
    if (ejRig) return ejRig;
    const root = new THREE.Group(), seat = createSeat(), pilot = createPilot(), chute = createChute();
    pilot.position.set(0, 0.25, 0); seat.position.set(0, 0, 0.1); chute.position.set(0, 7.8, 0);
    root.add(seat, pilot, chute); root.scale.setScalar(2.2); root.visible = false; root.traverse((o) => { o.frustumCulled = false; });
    scene.add(root);
    ejRig = { root, seat, pilot, chute };
    return ejRig;
  }
  function ejClean() {
    if (ejRig) ejRig.root.visible = false;
    if (ejCan) { scene.remove(ejCan.m); ejCan = null; }
    if (plane) { const u = plane.userData; if (u.canopy) u.canopy.visible = viewMode !== "cockpit"; if (u.pilot) u.pilot.visible = viewMode !== "cockpit"; }
    events.onFade?.(false);
  }
  function ejInit(c, fireAt, chuteAt, endAt, shot) {
    lives = Math.max(0, lives - 1); c.last = lives <= 0;
    c.ej = { fireAt, chuteAt, st: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), chuteK: 0, land: false };
    c.cp = viewMode === "cockpit" ? 1.25 : 0;
    c.endAt = endAt; c.ang0 = Math.random() * 6.28; c.foc = c.p.clone(); c.camR = 30;
    setAlert(lives > 0 ? "EJECT! EJECT!" : "EJECT!", 2.4); audio.say?.("eject"); events.toast?.("EJECT!", "bad");
  }
  function startEject() {
    if (crashing || ended || landing) return;
    criticalUntil = 0; ops = null; camCut = null; opsHud();
    crashing = { t: 0, p: player.pos.clone(), what: "shot", booms: [], shot: true, boomed: false, pv: player.vel.clone().multiplyScalar(0.9), last: false };
    crashing.pv.y = Math.min(crashing.pv.y, 6);
    ejInit(crashing, 1.5, 2.4, 6.2, true);
    stats.crashes++; bumpSkill(-0.1);
    lowAlt = false; maneuver = null; muzzle.visible = false;
    plane.quaternion.copy(player.q); plane.position.copy(player.pos);
    for (const m of missiles) if (m.enemy) { m.active = false; m.o.visible = false; }
    events.onCrash?.("shot");
  }
  function ejUpdate(c, dt) {
    const e = c.ej, T = c.t;
    if (c.shot && !c.boomed) {   // the stricken jet: burning, rolling, nose dropping
      c.pv.y -= 30 * dt; c.pv.multiplyScalar(1 - 0.05 * dt);
      plane.position.addScaledVector(c.pv, dt); player.pos.copy(plane.position); player.vel.copy(c.pv);
      if (!(c.cp > 0 && T < c.cp)) { plane.rotateZ(dt * (2.2 + T * 1.4)); plane.rotateX(-dt * 0.45); }
      c.p.copy(plane.position);
      if (c.cp > 0 && T < c.cp) { /* still in the cockpit: no fireball in your face yet */ } else {
      tA.set(0, 0, 4).applyQuaternion(plane.quaternion).add(plane.position);
      fx(tA, tB.set((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6), 6 + Math.random() * 5, 0.5, 0xff8a2a, 0, 1);
      puff(tA, tC.set((Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4), 6, 22, 2.2, Math.random() < 0.5 ? 0x222226 : 0x45454a);
      if (Math.random() < dt * 9) explode(tA.copy(plane.position).add(tB.set((Math.random() - 0.5) * 8, 1, (Math.random() - 0.5) * 8)), 9, 0.8);
      }
      const gy = groundAt(plane.position.x, plane.position.z);
      if (plane.position.y < gy + 3 || T > 3.6) crash(plane.position.clone(), terrain.isWater?.(plane.position.x, plane.position.z) ? "water" : "ground");
    }
    if (e.st === 0 && T >= e.fireAt) {   // canopy blows, seat rockets out
      const rig = ejBuild(); rig.root.visible = true; rig.seat.visible = true; rig.chute.visible = false; rig.pilot.rotation.set(0, 0, 0);
      const base = c.shot ? plane.position : c.p;
      e.pos.copy(base).add(tA.set(0, 5, 0));
      e.vel.set((Math.random() - 0.5) * 6, 54, (Math.random() - 0.5) * 6); if (c.shot) e.vel.addScaledVector(c.pv, 0.6);
      rig.root.quaternion.copy(c.shot ? plane.quaternion : _qI.identity());
      const u = plane.userData;
      if (u && u.canopy && u.canopy.visible && c.shot) {   // the glass canopy flies off
        ejCan = { m: u.canopy.clone(), v: new THREE.Vector3(8, 26, 10).applyQuaternion(plane.quaternion).add(c.pv), sp: new THREE.Vector3(2.4, 1.1, 3.1) };
        u.canopy.updateWorldMatrix(true, false); ejCan.m.matrixAutoUpdate = true; u.canopy.matrixWorld.decompose(ejCan.m.position, ejCan.m.quaternion, ejCan.m.scale); scene.add(ejCan.m);
        u.canopy.visible = false; if (u.pilot) u.pilot.visible = false;
      }
      fx(e.pos, null, 70, 160, 0.14, 0xfff0c8, 0, 0); shock(e.pos, 60);
      for (let i = 0; i < 14; i++) puff(e.pos, tB.set((Math.random() - 0.5) * 40, Math.random() * 20, (Math.random() - 0.5) * 40), 4, 12, 1.4, 0xd8d8d8);
      audio.seatFire?.(); shake = Math.max(shake, 1.6); haptics.pulse?.();
      e.st = 1;
    }
    if (ejCan) {
      ejCan.v.y -= 26 * dt; ejCan.m.position.addScaledVector(ejCan.v, dt); ejCan.m.rotation.x += ejCan.sp.x * dt; ejCan.m.rotation.y += ejCan.sp.y * dt; ejCan.m.rotation.z += ejCan.sp.z * dt;
      if (ejCan.m.position.y < groundAt(ejCan.m.position.x, ejCan.m.position.z) || T > e.fireAt + 3) { scene.remove(ejCan.m); ejCan = null; }
    }
    if (e.st >= 1) {
      const rig = ejRig;
      if (e.st === 1) {
        e.vel.y -= 24 * dt; e.pos.addScaledVector(e.vel, dt);
        if (T < e.fireAt + 0.5) { tA.set(0, -1.4, 0.2).applyQuaternion(rig.root.quaternion).add(e.pos); fx(tA, tB.set(0, -30, 0), 7, 0.45, 0.25, 0xffc060, 0, 1); puff(tA, tC.set(0, -6, 0), 4, 14, 1.5, 0x9a9a9a); }
        rig.root.rotation.x += dt * 1.1; rig.root.rotation.z += dt * 0.6;
        if (T >= e.chuteAt) {   // seat falls away, chute deploys
          e.st = 2; rig.seat.visible = false; rig.chute.visible = true; e.chuteK = 0;
          rig.root.rotation.set(0, rig.root.rotation.y, 0);
          rig.pilot.rotation.set(0.0, 0, 0);
          events.onEjectChute?.(lives); audio.chuteOpen?.();
          for (let i = 0; i < 8; i++) puff(tA.copy(e.pos).add(tB.set(0, 8, 0)), tC.set((Math.random() - 0.5) * 10, Math.random() * 4, (Math.random() - 0.5) * 10), 2, 8, 1, 0xffffff);
        }
      } else {
        e.chuteK = Math.min(1, e.chuteK + dt / 0.85);
        const k = e.chuteK, sc = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 9) * 0.5 : 1;   // snap open with overshoot
        rig.chute.scale.set(Math.max(0.05, sc), Math.max(0.05, sc * (0.45 + 0.55 * k)), Math.max(0.05, sc));
        e.vel.y += (-7.5 - e.vel.y) * (1 - Math.exp(-dt * 1.9)); e.vel.x *= Math.exp(-dt * 0.9); e.vel.z *= Math.exp(-dt * 0.9); e.vel.x += 1.6 * dt; e.vel.z += 0.9 * dt;
        if (!e.land) {
          e.pos.addScaledVector(e.vel, dt);
          const gy = groundAt(e.pos.x, e.pos.z) + 1.8; if (e.pos.y <= gy) { e.pos.y = gy; e.land = true; e.vel.set(0, 0, 0); }
        } else rig.chute.scale.multiplyScalar(Math.max(0.7, 1 - dt * 0.8));
        rig.root.rotation.z = Math.sin(T * 1.7) * 0.12; rig.root.rotation.x = Math.cos(T * 1.3) * 0.07; rig.root.rotation.y += dt * 0.2;
      }
      rig.root.position.copy(e.pos);
      c.foc.lerp(e.pos, 1 - Math.exp(-dt * 2.2));
    } else c.foc.lerp(c.p, 1 - Math.exp(-dt * 3));
    if (c.endAt - T < 0.7 && !c.fading) { c.fading = true; events.onFade?.(true); }
  }
  function ejCamera(c, dt) {
    const T = c.t;
    camera.near = 0.5;
    const ang = c.ang0 + T * 0.62, rad = Math.min(170, 24 + T * 16 + T * T * 2.4), elev = Math.min(0.55, 0.12 + T * 0.07);
    c.camR += (rad - c.camR) * (1 - Math.exp(-dt * 3));
    const ce = Math.cos(elev);
    tA.set(c.foc.x + Math.sin(ang) * c.camR * ce, c.foc.y + Math.sin(elev) * c.camR + 4, c.foc.z + Math.cos(ang) * c.camR * ce);
    camera.position.lerp(tA, c.camInit ? 1 - Math.exp(-dt * 6) : 1); c.camInit = true;
    const gy = groundAt(camera.position.x, camera.position.z) + 5; if (camera.position.y < gy) camera.position.y = gy;
    camera.up.set(0, 1, 0); camera.fov = 54 + Math.min(10, T * 2.2); camera.lookAt(c.foc);
  }
  function crash(p, what) {
    if ((crashing && !(crashing.shot && !crashing.boomed)) || ended) return;
    if (crashing) { crashing.boomed = true; crashing.p.copy(p); crashing.what = what; crashing.booms = [0.12, 0.28, 0.46, 0.7, 0.95, 1.25].map((x) => crashing.t + x); }
    else { crashing = { t: 0, p: p.clone(), what, booms: [0.12, 0.28, 0.46, 0.7, 0.95, 1.25] }; ejInit(crashing, 0.35, 1.25, 5.0, false); }
    lowAlt = false; alertMsg = null; alertTimer = 0;
    stats.crashes++; stats.damage += 15; bumpSkill(-0.14);
    maneuver = null;
    plane.visible = false; muzzle.visible = false;
    explode(p, 48, 3.6); shake = 3.6; slowT = Math.max(slowT, 0.4); events.onBoom?.(1);
    shock(tA.copy(p).setY(p.y + 4), 220); shock(tA, 340); fx(p, null, 160, 240, 0.16, 0xfff0c8, 0, 0);
    for (let i = 0; i < 22; i++) { tB.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(60 + Math.random() * 160); fx(p, tB, 5 + Math.random() * 9, 1, 0.8 + Math.random() * 1.1, Math.random() < 0.5 ? 0xff8a2a : 0xffd070, GRAV * 0.5, 0.6); }
    // debris chunks
    for (const d of debris) {
      d.active = true; d.life = 2.6 + Math.random();
      d.p.copy(p).add(tA.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6));
      d.v.set((Math.random() - 0.5) * 120, 40 + Math.random() * 80, (Math.random() - 0.5) * 120).addScaledVector(player.vel, 0.25);
      d.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      d.g.scale.setScalar(1.2 + Math.random() * 2.2);
      d.g.position.copy(d.p); d.g.visible = true;
    }
    // a column of dark smoke + a white splash on water
    for (let i = 0; i < 30; i++) puff(tA.copy(p).add(tB.set((Math.random() - 0.5) * 40, Math.random() * 26, (Math.random() - 0.5) * 30)), tC.set((Math.random() - 0.5) * 6, 10 + Math.random() * 14, (Math.random() - 0.5) * 6), 8, 26 + Math.random() * 14, 3.5 + Math.random() * 2, i % 3 ? 0x3d3d42 : 0x6a6a70);
    if (what === "water") for (let i = 0; i < 10; i++) puff(p, tA.set((Math.random() - 0.5) * 50, 40 + Math.random() * 60, (Math.random() - 0.5) * 50), 4, 14, 1.6, 0xffffff);
    for (const m of missiles) { m.active = false; m.o.visible = false; }
    for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].enemy && !bullets[i].atAlly) bullets.splice(i, 1);
    lockTarget = null; lockCand = null; ccipRing.visible = false;
    audio.crash(); haptics.crash ? haptics.crash() : haptics.pulse();
    shake = 1.8;
    events.onCrash?.(what);
  }
  function respawn() {
    const p = crashing.p;
    const x = THREE.MathUtils.clamp(p.x, center.x - half + 1500, center.x + half - 1500);
    const z = THREE.MathUtils.clamp(p.z, center.z - half + 1500, center.z + half - 1500);
    let maxH = 0;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; for (const r of [0, 600, 1300]) maxH = Math.max(maxH, groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
    player.pos.set(x, maxH + 420, z);
    // keep heading, but face the map centre if we were near the edge
    let yaw = player.yaw;
    if (Math.max(Math.abs(p.x - center.x), Math.abs(p.z - center.z)) > half - 1600) yaw = Math.atan2(p.x - center.x, p.z - center.z);
    player.q.setFromEuler(_eu.set(0, yaw, 0, "YXZ"));
    syncAngles();
    player.speed = 115; player.hp = 100; ejClean(); ops = null; camCut = null; gearAnim = gearWant = 0; plane.userData.setGear?.(0); fuelV = Math.max(fuelV, 0.6);
    player.vel.set(0, 0, -1).applyQuaternion(player.q).multiplyScalar(player.speed);
    plane.visible = true;
    updatePlaneTransform();
    invulnUntil = elapsed + 2.5;
    crashing = null;
    controls.resetLook();
    snapCamera();
    audio.respawn();
    if (strip) parkAtStart();
    events.onRespawn?.();
  }
  function updateCrash(dt) {
    crashing.t += dt;
    const c = crashing;
    while (c.booms.length && c.t > c.booms[0]) {
      c.booms.shift();
      explode(tA.copy(c.p).add(tB.set((Math.random() - 0.5) * 60, 6 + Math.random() * 26, (Math.random() - 0.5) * 60)), 20 + Math.random() * 16, 1.4); shake = Math.max(shake, 1.8);
    }
    if (Math.random() < dt * 28) puff(tA.copy(c.p).add(tB.set((Math.random() - 0.5) * 22, 4, (Math.random() - 0.5) * 22)), tC.set((Math.random() - 0.5) * 4, 26 + Math.random() * 12, 0), 8, 34, 4, Math.random() < 0.5 ? 0x2a2a2e : 0x4a4a50);
    if (Math.random() < dt * 14) fx(tA.copy(c.p).add(tB.set((Math.random() - 0.5) * 16, 2, (Math.random() - 0.5) * 16)), tC.set(0, 14, 0), 9, 2, 0.5, 0xff8a2a, 0, 1);
    if (c.ej) ejUpdate(c, dt);
    if (c.t >= (c.endAt || 2.7)) { if (c.last) { crashing = null; finish("down"); } else respawn(); }
  }

  // ---------- camera ----------
  let camSurge = 0.35, visLow = 0;
  function snapCamera() { camQ.copy(player.q); updateCamera(0.016, true); }
  function updateCamera(dt, snap = false) {
    updateCameraBase(dt, snap);
    const activeOps = ops && ["roll", "app", "final", "rollout"].includes(ops.mode);
    if (camCut && !crashing && !activeOps && Math.abs(controls.look.yaw) + Math.abs(controls.look.pitch) < 0.08) camOverlay(dt);
    if (ops && viewMode !== "cockpit") {
      let rise = Math.max(0, groundAt(camera.position.x, camera.position.z) + 3 - camera.position.y);
      for (let k = 1; k < 12; k++) { const a = k / 12, x = player.pos.x + (camera.position.x - player.pos.x) * a, z = player.pos.z + (camera.position.z - player.pos.z) * a;
        rise = Math.max(rise, (groundAt(x, z) + 1.2 - player.pos.y - (camera.position.y - player.pos.y) * a) / a); }
      if (rise > 0) { camera.position.y += rise; camera.lookAt(player.pos); }
    }
  }
  function updateCameraBase(dt, snap = false) {
    const look = controls.look;
    const portrait = innerHeight > innerWidth;
    const cpre = !!(crashing && crashing.ej && crashing.cp > 0 && crashing.t < crashing.cp);   // b26: first-person eject: the hand pulls the handle, then the camera cuts out
    if (crashing && crashing.ej && !cpre) { if (crashing.cp > 0) { setCockpitMode(plane, false); crashing.cp = 0; } ejCamera(crashing, dt); }
    else if (crashing && !cpre) {
      // hold the camera, look at the fireball and drift back a little
      camera.near = 0.5;
      tA.subVectors(camera.position, crashing.p);
      if (tA.length() < 140) camera.position.addScaledVector(tA.normalize(), dt * 22);
      const gy = groundAt(camera.position.x, camera.position.z) + 4;
      if (camera.position.y < gy) camera.position.y = gy;
      camera.up.set(0, 1, 0);
      camera.lookAt(tC.copy(crashing.p).add(tB.set(0, 8, 0)));
    } else if (viewMode === "cockpit") {
      camera.near = 0.08;
      camera.fov = portrait ? 88 : 66;
      tA.copy(plane.userData.eye).applyMatrix4(plane.matrixWorld);
      camera.position.copy(tA);
      { const ek = cpre ? Math.min(1, crashing.t / (crashing.cp - 0.1)) : 0; _q.setFromEuler(new THREE.Euler(look.pitch - 0.5 * ek * ek * (3 - 2 * ek), look.yaw, 0, "YXZ")); }
      camera.quaternion.copy(plane.quaternion).multiply(_q);
      camQ.copy(player.q);
      plane.userData.hands?.update(dt, controls.stick, throttle, controls.gunHeld() ? 1 : 0, cpre ? Math.min(1, crashing.t / (crashing.cp - 0.1)) : 0);
    } else {
      camera.near = 0.5;
      camSurge += (throttle - camSurge) * (1 - Math.exp(-dt * 1.6));
      camera.fov = (portrait ? 80 : 60) + Math.max(0, player.speed - 140) * 0.1 + (camSurge - 0.35) * 9;
      const dist = (portrait ? 27 : 19) + (camSurge - 0.35) * 9;   // b26: arcade chase cam, closer; full throttle the jet surges ahead in frame, low throttle it drifts back
      // chase camera lives in the jet's own (smoothed) frame -> follows loops, rolls and inverted flight
      camQ.slerp(player.q, snap ? 1 : 1 - Math.exp(-dt * ((maneuver && maneuver.kind === "roll") || Math.abs(controls.stick.roll) > 0.35 ? 16 : (assist ? 3.6 : 4.5))));   // b29: rolls - chase cam stays locked behind the jet, no swing
      const el = 0.17 - look.pitch, az = look.yaw, ce = Math.cos(el); // look: +yaw = view turns left, +pitch = view tilts up
      tA.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce).multiplyScalar(dist).applyQuaternion(camQ);
      camera.position.copy(player.pos).add(tA);
      const gy = groundAt(camera.position.x, camera.position.z) + 4;
      if (camera.position.y < gy) camera.position.y = gy;
      const lookAhead = 14 * Math.max(0, 1 - Math.abs(look.yaw));
      tB.set(0, 0, -1).applyQuaternion(camQ);
      tC.copy(player.pos).addScaledVector(tB, lookAhead);
      camera.up.set(0, 1, 0).applyQuaternion(camQ);
      camera.lookAt(tC);
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 1.5;
      camera.position.y += (Math.random() - 0.5) * shake * 1.5;
      shake = Math.max(0, shake - dt * 1.8);
      camera.rotateZ((Math.random() - 0.5) * shake * 0.012);
    }
    if (boomLight.intensity > 0.5) boomLight.intensity *= Math.exp(-dt * 4.5); else if (boomLight.intensity) boomLight.intensity = 0;
    if (ops && ["roll", "app", "final", "rollout"].includes(ops.mode) && viewMode !== "cockpit") {
      let rise = 0;
      for (let k = 1; k < 10; k++) { const a = k / 10, x = player.pos.x + (camera.position.x - player.pos.x) * a, z = player.pos.z + (camera.position.z - player.pos.z) * a;
        const y = player.pos.y + (camera.position.y - player.pos.y) * a; rise = Math.max(rise, (groundAt(x, z) + 2 - y) / a); }
      if (rise > 0) { camera.position.y += rise; camera.lookAt(player.pos); }
    }
    if (dbgCam) dbgCam(camera);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }

  function setView(m) {
    if (L?.lockView && m !== viewMode) { events.toast?.("Stay in the cockpit for this lesson!"); return; }
    viewMode = m; try { localStorage.setItem("jet-view", m); } catch { /* ignore */ }
    setCockpitMode(plane, m === "cockpit");
    controls.setLookMode(m);
    if (m === "chase" && progress.view != null && progress.view < 1) { progress.view = 1; events.toast?.("Outside view! ✓"); audio.lock(); }
    events.onView?.(m);
  }

  // ---------- damage / kills ----------
  const LIFE = 100 / 7;   // b24: 7 lives shown as squares
  let lifeAcc = 0, lifePts = 150;
  function damagePlayer(n, msg, raw) {
    if (ended || crashing || elapsed < invulnUntil) return;
    if (ops) n *= 0.28; // airfield/carrier protection reduces, never eliminates, danger
    if (assist && !raw) n *= (0.8 * (1 - 0.45 * ezv())) * (1 + 0.12 * Math.max(0, ((L && L.n) || 1) - 3));
    if (n < 0.6) { lastDamage = elapsed; player.hp -= n; if (player.hp > 0 && player.hp <= 20 && !criticalUntil) criticalUntil = elapsed + 5; stats.damage += n; if (player.hp <= 0) { player.hp = 0; startEject("shot"); } return; }   // scratch damage: no hurt sound / flinch
    player.hp -= n; if (player.hp > 0 && player.hp <= 20 && !criticalUntil) criticalUntil = elapsed + 5; stats.damage += n; lastDamage = elapsed; bumpSkill(-0.004 * n); invulnUntil = Math.max(invulnUntil, elapsed + 0.35);
    shake = Math.max(shake, 0.5);
    audio.hurt(); haptics.hit?.(); events.onHurt?.(); audio.setHurt?.();
    if (msg) events.toast?.(msg);
    if (player.hp <= 0) { player.hp = 0; startEject("shot"); }
  }
  function damageTarget(t, n, by) {
    if (!t.alive) return;
    if (t.kind === "boss" && t.pods.some(p => p.alive)) { const pod = t.pods.find(p => p.alive); damageTarget(pod, n * 0.85, by); return; }
    t.hp -= n;
    if (by === "ally" && t.hp > 0) { if (Math.random() < 0.2) puff(t.pos.clone().add(tA.set((Math.random() - 0.5) * t.radius, Math.random() * t.radius * 0.6, (Math.random() - 0.5) * t.radius)), null, 1, 4, 0.5, 0xffe08a); }
    if (by === "gun") { stats.hits++; if (Math.random() < 0.35) puff(t.pos.clone().add(tA.set((Math.random() - 0.5) * t.radius, Math.random() * t.radius * 0.6, (Math.random() - 0.5) * t.radius)), null, 1, 4, 0.5, 0xffe08a); }
    if (by !== "ally") events.onHit?.(t.hp <= 0);
    if (t.kind === "jet" && t.hp > 0 && t.hp <= 2 && !t.heli && !t.doom && Math.random() < 0.55) { t.doom = 5 + Math.random() * 3; events.toast?.("ENEMY CRITICAL"); }
    if (t.hp <= 0) kill(t, by === "ally");
  }
  function kill(t, byAlly = false) {
    t.alive = false;
    scene.remove(t.obj);
    const size = t.kind === "boss" ? 75 : t.kind === "ship" ? 30 : t.kind === "jet" ? 16 : t.kind === "base" ? (t.sub === "fuel" ? 30 : 22) : 14;
    if (t.kind === "balloon") { audio.click(); for (let i = 0; i < 8; i++) puff(t.pos, tA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(40), 2, 5, 0.6, 0xffffff); }
    else {
      const big = t.kind === "boss" ? 3 : t.kind === "ship" ? 2 : t.kind === "base" ? (t.sub === "fuel" ? 2.2 : 1.5) : t.kind === "jet" ? 1.3 : 1;
      explode(t.pos.clone().add(tA.set(0, t.kind === "ship" ? 6 : 3, 0)), size, big);
      if (t.kind === "base" && t.sub === "fuel") blast(t.pos, 70, 10);
      if (t.kind === "jet") { slowT = Math.max(slowT, 0.2); spawnDebris(t.pos, 8, 70, t.vel); for (let i = 0; i < 6; i++) puff(t.pos, tA.set((Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 30), 3, 12, 2.5, 0x3d3d42); }
    }
    if (!byAlly) stats.kills[t.kind] = (stats.kills[t.kind] || 0) + 1;
    if (!byAlly) bumpSkill(t.kind === "jet" ? 0.05 : 0.03);
    if (tapTarget === t) { tapTarget = null; tapT = 0; }
    if (!byAlly) { combo = (elapsed - lastKillT < 4.5) ? combo + 1 : 1; lastKillT = elapsed; }
    const pts = byAlly ? 0 : Math.round((t.kind === "boss" ? 1500 : t.kind === "bossweapon" ? 180 : POINTS[t.kind] || 50) * Math.min(4, 1 + (combo - 1) * 0.25));
    score += pts;

    if (!byAlly) events.onPop?.(pts, combo, t.kind);
    if (t.kind !== "balloon" && t.kind !== "jet") fires.push({ pos: t.pos.clone(), t: 0, life: 16 + Math.random() * 12, e: 0, big: t.kind === "ship" || (t.kind === "base" && t.sub === "fuel") ? 2 : 1 });
    if (progress[t.kind] != null) {
      const o = L.objectives.find((x) => x.kind === t.kind);
      progress[t.kind] = Math.min(o.need, progress[t.kind] + 1);
      events.toast?.(byAlly ? `Ally got a ${(LABEL1[t.kind] || t.kind).toLowerCase()} ${progress[t.kind]}/${o.need}` : `${LABEL1[t.kind] || t.kind} ${progress[t.kind]}/${o.need}  +${pts}`);
    } else events.toast?.(byAlly ? `Ally got a ${(LABEL1[t.kind] || t.kind).toLowerCase()}` : `${LABEL1[t.kind] || t.kind}  +${pts}`);
    if (lockTarget === t) lockTarget = null;
    checkDone();
  }
  function checkDone() {
    if (ended) return;
    if (!L.objectives.every((o) => (progress[o.kind] || 0) >= o.need || o.kind === "land")) return;
    if (L.n % 5 === 0 && !bossSpawned) { bossSpawned = true; spawnBoss(); return; }
    score += 300;
    const lo = L.objectives.find((o) => o.kind === "land");
    if (lo && !(progress.land >= 1)) {
      if (!landingOpen) { landingOpen = true; setAlert("All clear! Land on the carrier", 4); events.toast?.("All clear - land on the carrier"); }
      return;
    }
    finish("complete");
  }
  function finish(reason) {
    if (ended) return;
    ended = true; running = false; audio.seeker?.(false); audio.rwrLock?.(false);
    const total = L.objectives.reduce((s, o) => s + o.need, 0);
    const got = L.objectives.reduce((s, o) => s + Math.min(o.need, progress[o.kind] || 0), 0);
    const frac = total ? got / total : 1;
    if (reason === "complete" && !endless) score += 150 + 50 * ((L && L.n) || 1);   // b24: survival bonus
    const stars = reason === "complete" ? (stats.damage < 30 ? 3 : 2) + (0) : frac >= 0.6 ? 2 : frac > 0 ? 1 : 0;
    controls.setEnabled(false);
    events.onEnd?.({ reason, score, stars: Math.min(3, stars), frac, stats: { ...stats }, progress: { ...progress }, timeLeft, elapsed, level: L });
  }

  // ---------- weapons ----------
  function fireGun(dt) {
    gunCool -= dt;
    if (gunCool > 0) return;
    gunCool = 1 / 12;
    muzzleFlip = 1 - muzzleFlip;
    const origin = tA.set(0, -0.28, -8.1).applyMatrix4(plane.matrixWorld).clone(); // the cannon sits in the nose
    const dir = fwdFrom(player.yaw, player.pitch, V());
    // aim assist (7 degree cone)
    let best = null, bestA = 0.065 + (assist ? 0.025 * ezv() : 0);
    for (const t of targets) {
      if (!t.alive) continue;
      tB.subVectors(t.pos, origin);
      const d = tB.length();
      if (d > 2600) continue;
      const a = tB.normalize().angleTo(dir);
      if (a < bestA) { bestA = a; best = t; }
    }
    if (best) {
      const tt = origin.distanceTo(best.pos) / 950;
      tC.copy(best.pos).addScaledVector(best.vel, tt).sub(origin).normalize();
      dir.lerp(tC, 0.42).normalize();
    }
    dir.x += (Math.random() - 0.5) * 0.006; dir.y += (Math.random() - 0.5) * 0.006;
    const v = dir.multiplyScalar(950).add(player.vel);
    bullets.push({ p: origin, v, life: 1.6, enemy: false });
    stats.shots++;
    audio.gun();
    muzzle.visible = true; muzzle.position.set(0, -0.28 / 1.15, -8.6 / 1.15); muzzle.scale.setScalar(0.5 + Math.random() * 0.4);
  }
  function fireRocket() {
    if (rocketCd > 0) return false;
    if (player.rockets <= 0) { if (emptyT <= 0) { emptyT = 0.5; audio.empty(); events.onEmpty?.("missile"); } return true; }
    const r = rockets.find((x) => !x.active);
    if (!r) return false;
    rocketCd = ROCKET_GAP;
    if (!(lockTarget && lockTarget.alive)) {
      let bt = null, ba = 0.5;
      const fw = fwdFrom(player.yaw, player.pitch, V());
      for (const t of targets) { if (!t.alive) continue; tB.subVectors(t.pos, player.pos); const d = tB.length(); if (d > 5200 || d < 80) continue; const a = tB.normalize().angleTo(fw) + (t.kind === "jet" ? -0.08 : 0); if (a < ba) { ba = a; bt = t; } }
      if (bt) lockTarget = bt;
    }
    player.rockets--; stats.rockets++;
    // four hardpoints across the wing: missiles leave one at a time in turn 1-2-3-4, never together
    const hi = hardIdx; hardIdx = (hardIdx + 1) % HARDPOINTS.length;
    const hp = HARDPOINTS[hi];
    r.active = true; r.life = 8; r.target = lockTarget && lockTarget.alive ? lockTarget : null; r.trail = 0; r.arm = 0.28; r.hp = hi; r.result = null; r.seen = false; r.lost = false;
    const aim = r.target ? fwdFrom(player.yaw, player.pitch, V()).angleTo(V().subVectors(r.target.pos, player.pos).normalize()) : 1;
    r.hitChance = THREE.MathUtils.clamp(0.8 - aim * 1.15 - Math.min(0.22, ((L.n || 1) - 1) * 0.018) - Math.max(0, (r.target?.speed || 100) - 130) * 0.001, 0.3, 0.8);
    r.seekerGood = Math.random() < r.hitChance; r.missAt = 180 + Math.random() * 220;
    r.p.copy(tA.set(hp[0], hp[1] - 0.2, hp[2]).applyMatrix4(plane.matrixWorld));
    const fw = fwdFrom(player.yaw, player.pitch, V());
    r.v.copy(fw).multiplyScalar(player.speed + 45);
    r.v.y -= 2; // drops off the rail, then the motor lights
    // Rail launch keeps the initial velocity aligned with the nose.
    r.o.visible = true;
    const mm = plane.userData.hardMissiles?.[hi]; if (mm) { mm.visible = false; hpReload[hi] = 2.4; }
    for (let k = 0; k < 4; k++) puff(r.p, tB.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), 1.2, 7 + k * 1.5, 1.8 + k * 0.3, 0xe8e8ea);
    fx(r.p, null, 5, 1, 0.16, WS.kind === "std" ? 0xffd890 : WS.fx, 0, 0);
    watchWeapon(r, "MSL " + (hi + 1));
    audio.rocket();
    return true;
  }
  // b23: ground-target selection. Nearest is automatic; the TGT rocker (or a tap on a target) picks another one without firing.
  let selTgt = null, tgtFlash = 0;
  const GROUND_NO = { boss:1, bossweapon:1, jet: 1, drone: 1, ally: 1, balloon: 1 };
  function groundList() {
    const l = [];
    for (const t of targets) { if (!t.alive || GROUND_NO[t.kind] || t.submerged) continue; const d = t.pos.distanceTo(player.pos); if (d > 5200 || d < 60) continue; l.push([d, t]); }
    l.sort((a, b) => a[0] - b[0]);
    return l.map((x) => x[1]);
  }
  const KIND_NAME = { heli: "CHOPPER", tank: "TANK", jeep: "TANK", flak: "FLAK", sam: "SAM", base: "BASE", jet: "JET", ship: "SHIP", sub: "SUB", drone: "DRONE" };
  const kindName = (t) => (t.heli ? "CHOPPER" : t.kind === "ship" && t.sea === "sub" ? "SUB" : KIND_NAME[t.kind] || String(t.kind).toUpperCase());
  function cycleTgt(dir) {
    if (!player || crashing || ops) return;
    // b26: the TGT lever steps through EVERY hostile in range (air, ground, sea), nearest first; the aim assist then follows the pick
    const l = targets.filter((t) => t.alive && !t.submerged && t.kind !== "ally" && t.kind !== "balloon" && t.pos.distanceTo(player.pos) < 5200).sort((a2, b2) => a2.pos.distanceToSquared(player.pos) - b2.pos.distanceToSquared(player.pos));
    if (!l.length) { events.toast?.("NO TARGETS IN RANGE", "warn"); audio.empty?.(); return; }
    let i = l.indexOf(lockTarget?.alive ? lockTarget : tapTarget?.alive ? tapTarget : selTgt);
    i = i < 0 ? (dir > 0 ? 0 : l.length - 1) : (i + (dir > 0 ? 1 : -1) + l.length) % l.length;
    const t = l[i];
    if (!GROUND_NO[t.kind]) selTgt = t; else { tapTarget = t; tapT = 6; }
    lockTarget = null; lockCand = null; lockTime = 0; audio.seeker?.(false); tgtFlash = 1.2;
    audio.tgtSwitch?.(); haptics.pulse?.();
    events.toast?.(`TGT ${kindName(t)} ${Math.round(t.pos.distanceTo(player.pos))} M`, t.kind === "jet" || t.kind === "heli" ? "bad" : "warn");
  }
  function tapSelect(x, y) {
    if (!player || crashing || !camera) return false;
    let best = null, bd = 110;
    for (const t of targets) {
      if (!t.alive || t.submerged) continue;
      tC.copy(t.pos).project(camera); if (tC.z > 1 || tC.z < -1) continue;
      const sx = (tC.x * 0.5 + 0.5) * innerWidth, sy = (0.5 - tC.y * 0.5) * innerHeight, d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return false;
    if (!GROUND_NO[best.kind]) { selTgt = best; tgtFlash = 1.2; }
    if (GROUND_NO[best.kind]) { tapTarget = best; tapT = 5; }   // aim assist only steers toward tapped air targets; ground picks only select
    lockTarget = null; lockCand = null; lockTime = 0; audio.seeker?.(false);
    events.toast?.(`${kindName(best)} selected`);
    return true;
  }
  function pickBombLock(cc) {
    if (selTgt && (!selTgt.alive || selTgt.submerged || bombs.some((b) => b.active && b.target === selTgt) || selTgt.pos.distanceTo(player.pos) > 5600)) selTgt = null;
    if (selTgt) return selTgt;
    const fw = fwdFrom(player.yaw, player.pitch, tD); let best = null, bs = 1e9;
    for (const t of targets) {
      if (!t.alive || GROUND_NO[t.kind] || t.submerged) continue;
      if (bombs.some((b) => b.active && b.target === t)) continue;   // already has a bomb on the way: move on to the next one
      tB.subVectors(t.pos, player.pos); const d = tB.length(); if (d > 6500 || d < 100) continue;
      const ang = tB.normalize().angleTo(fw); if (ang > 1.5) continue;
      const sc = d * (1 + ang * 0.6) * (t === bombLock ? 0.55 : 1);   // nearest ahead of the jet wins
      if (sc < bs) { bs = sc; best = t; }
    }
    return best;
  }
  function dropBomb() {
    if (bombCd > 0) return false;
    if (player.bombs <= 0) { if (emptyT <= 0) { emptyT = 0.5; audio.empty(); events.onEmpty?.("bomb"); } return true; }
    const b = bombs.find((x) => !x.active) || bombs.reduce((a, c) => (c.life < a.life ? c : a), bombs[0]);   // b26: never refuse a drop because the pool is busy
    bombCd = BOMB_GAP;
    player.bombs--; stats.bombs++;
    b.active = true; b.life = 30; b.result = null;
    b.p.copy(tA.set(0, -1.1, 0.6).applyMatrix4(plane.matrixWorld)); // released from the belly bay
    b.v.copy(player.vel).add(tB.set(0, -6, 0));
    // guided: lock the target under the nose (or the current ground lock)
    let bt = bombLock && bombLock.alive ? bombLock : lockTarget && lockTarget.alive && lockTarget.kind !== "jet" && lockTarget.kind !== "drone" ? lockTarget : null;
    bombLock = null;   // after the release the aim marker cycles on to the next nearest ground target
    if (!bt) {
      const fw = fwdFrom(player.yaw, player.pitch, V()); let bs = 1.4;
      for (const t of targets) {
        if (!t.alive || t.kind === "jet" || t.kind === "drone" || t.kind === "balloon" || t.submerged) continue;
        tB.subVectors(t.pos, player.pos); const d = tB.length(); if (d > 5600 || d < 60) continue;
        const a = tB.normalize().angleTo(fw); if (a < bs) { bs = a; bt = t; }
      }
    }
    b.target = bt;
    b.o.visible = true;
    watchWeapon(b, "BOMB");
    audio.bombRelease(); events.toast?.("BOMB AWAY"); b.o.scale.setScalar(1.35);
    for (let i = 0; i < 5; i++) puff(b.p, tB.set((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6), 1, 5, 1.2, 0xdadde2);
    fx(b.p, null, 6, 1, 0.18, 0xffe0a0, 0, 0);
    return true;
  }
  function blast(p, radius, dmg) {
    for (const a of allies) {
      if (!a.alive) continue;
      const d = a.pos.distanceTo(p) - a.radius;
      if (d < radius) friendlyHit(a, dmg * (d < radius * 0.4 ? 1 : 0.55), dmg > 20 ? 300 : 150);
    }
    for (const t of targets) {
      if (!t.alive) continue;
      const d = t.pos.distanceTo(p) - t.radius;
      if (d < radius) damageTarget(t, dmg * (d < radius * 0.4 ? 1 : 0.55), "blast");
    }
  }
  function launchSam(site, from) {
    const m = missiles.find((x) => !x.active);
    if (!m) return;
    m.active = true; m.life = ezv() >= 0.6 ? 16 : 9; m.decoy = null;
    m.p.copy(site.pos).add(tA.set(0, from === "jet" ? -1 : 7, 0));
    if (from === "jet") m.v.copy(site.vel).setLength(ezv() >= 0.6 ? 150 : Math.max(260, site.speed + 90));
    else m.v.set(0, ezv() >= 0.6 ? 90 : 140, 0);
    m.o.visible = true;
    audio.warn(); audio.say?.("MISSILE");
    for (let i = 0; i < 7; i++) puff(tA.copy(m.p), tB.set((Math.random() - 0.5) * 16, from === "jet" ? 0 : 3 + Math.random() * 9, (Math.random() - 0.5) * 16), from === "jet" ? 3 : 7, from === "jet" ? 10 : 22, 3.2, 0xe8e8ea);
    fx(m.p, null, from === "jet" ? 6 : 14, 1, 0.25, 0xffd890, 0, 0);
    setAlert("MISSILE! Break hard!", 1.8);
  }
  // ---------- automatic defensive flares: bright magnesium flares fan out in an angel-wing pattern and decoy incoming missiles ----------
  let flareAt = -9, flareRegen = 0;
  const flares = [], FLARE_MAX = 12;
  let flareTex = null;
  function flareSprite() {
    if (!flareTex) {
      const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.18, "rgba(255,248,215,1)"); g.addColorStop(0.42, "rgba(255,170,60,0.85)"); g.addColorStop(0.75, "rgba(255,110,20,0.25)"); g.addColorStop(1, "rgba(255,90,10,0)");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); flareTex = new THREE.CanvasTexture(c); flareTex.colorSpace = THREE.SRGBColorSpace;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, transparent: true, depthWrite: false, fog: false }));
    return sp;
  }
  const FLARE_SMOKE = { life: 3.2, w0: 0.5, w1: 3.2, r: 0.8, g: 0.81, b: 0.84, a: 0.8, rise: 0.4, spread: 0.3, fade: 1.2 };
  const FLARE_FIRE = { life: 0.4, w0: 1.1, w1: 0.15, r: 1, g: 0.62, b: 0.18, a: 0.95, fade: 0.9 };
  // decoy success per burst: ~95% on level 1, ~90% on level 10, easing down to ~60% on later levels
  const flareOk = () => Math.max(0.48, 0.82 - ((L.n || 1) - 1) * 0.025);
  function flareFan(pos, vel, fwd, pairs) {
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), fresh = [];
    for (const side of [-1, 1]) for (let k = 0; k < pairs; k++) {
      const spr = flareSprite(); scene.add(spr);
      const f = { p: pos.clone().addScaledVector(fwd, -7).addScaledVector(right, side * (1.3 + k * 0.5)).add(new THREE.Vector3(0, -0.8, 0)), v: vel.clone().multiplyScalar(0.98).addScaledVector(right, side * (9 + k * 7)), life: 4.2, max: 4.2, spr, rb: rbStart(FLARE_SMOKE), rf: rbStart(FLARE_FIRE) };
      f.v.y += 5 - k * 7.5;
      flares.push(f); fresh.push(f);
    }
    return fresh;
  }
  function deployFlares(m, manual) {
    flareAt = elapsed; player.flares = Math.max(0, player.flares - 1);
    const fresh = flareFan(player.pos, player.vel, fwdFrom(player.yaw, player.pitch, tD).clone(), 3);
    audio.flare(); events.toast?.("Flares!");
    const cand = m ? [m] : missiles.filter((x) => x.active && !x.decoy && x.p.distanceTo(player.pos) < 1700);
    for (const mm of cand) if (!mm.decoy && Math.random() < flareOk()) { let b = null, bd = 1e9; for (const f of fresh) { const d = f.p.distanceTo(mm.p); if (d < bd) { bd = d; b = f; } } mm.decoy = b; }
  }
  // enemy jets also pop flares: a fan behind the jet, and the incoming missile may chase one of them instead
  function enemyFlares(t, r) {
    fwdFrom(t.yaw, t.pitch, tD); const fresh = flareFan(t.pos, t.vel, tD.clone(), 2);
    if (r && Math.random() < 0.8) { const f = fresh[Math.floor(Math.random() * fresh.length)]; r.target = { kind: "flare", alive: true, pos: f.p, vel: f.v, radius: 4, flareRef: f, hp: 1 }; }
  }
  function updateFlares(dt) {
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i]; f.life -= dt;
      f.v.multiplyScalar(Math.exp(-0.3 * dt)); f.v.y -= 4 * dt; f.p.addScaledVector(f.v, dt);
      const k = Math.max(0, f.life / f.max);
      f.spr.position.copy(f.p); f.spr.scale.setScalar((6 + Math.random() * 2.5) * (0.35 + 0.65 * Math.min(1, k * 2.5)) * (1 + 1.2 * Math.max(0, 1 - (f.max - f.life) / 0.25))); f.spr.material.opacity = Math.min(1, k * 3);
      if (f.life > 0.2) { rbEmit(f.rb, f.p); rbEmit(f.rf, f.p); }
      if (f.life <= 0) { rbStop(f.rb); rbStop(f.rf); scene.remove(f.spr); f.spr.material.dispose?.(); flares.splice(i, 1); }
    }
    if (player.flares < FLARE_MAX) { flareRegen += dt; if (flareRegen > 6) { flareRegen = 0; player.flares++; } } else flareRegen = 0;
  }
  let rwrT = 0;
  function rwrUpdate(dt) {
    let dm = 1e9;
    for (const m of missiles) if (m.active && !m.decoy) dm = Math.min(dm, m.p.distanceTo(player.pos));
    let locking = false;
    for (const t of targets) if (t.alive && (t.kind === "jet" || t.kind === "sam") && (t.elk || 0) > 0.5) { locking = true; break; }
    audio.rwrLock?.(locking && dm > 1e8 && !crashing);   // steady growl while an enemy radar has you
    if (dm > 2600 || crashing) { rwrT = 0; return; }
    rwrT -= dt;
    if (rwrT <= 0) { const k = THREE.MathUtils.clamp(dm / 2600, 0, 1); rwrT = 0.06 + k * 0.62; audio.rwr?.(0.04 + (1 - k) * 0.09, 760 + (1 - k) * 900); }
  }
  const maxMsl = () => (ezv() >= 0.8 ? 1 : ezv() >= 0.6 ? 2 : 4);   // early levels: at most one enemy missile in flight
  const airMissiles = () => missiles.reduce((n, m) => n + (m.active ? 1 : 0), 0);
  // flak: shells that burst near the player (fuse set from range)
  function flakShot(origin, spread, burstsAt) {
    const dist = origin.distanceTo(player.pos);
    const speed = 560, lead = dist / speed;
    tA.copy(player.pos).addScaledVector(player.vel, lead).sub(origin);
    const d2 = tA.length();
    tA.normalize();
    tA.x += (Math.random() - 0.5) * spread; tA.y += (Math.random() - 0.5) * spread; tA.z += (Math.random() - 0.5) * spread;
    bullets.push({ p: origin.clone(), v: tA.normalize().multiplyScalar(speed), life: Math.max(0.3, d2 / speed), enemy: true, flak: true });
  }
  function flakBurst(p) {
    fx(p, null, 7, 16, 0.35, null, 0, 0); fx(p, null, 3, 9, 0.15, 0xfff0c0, 0, 0);
    for (let i = 0; i < 3; i++) puff(p, tA.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), 4, 16, 1.8, 0x25252b);
    const d = p.distanceTo(player.pos);
    audio.explosion(0.3, d);
    if (d < 55 && !crashing && elapsed > invulnUntil) { damagePlayer((Math.round(7 * Math.max(0.5, L.hostile) * (1 - d / 80)) + 2) * gunDmgK(), ezv() >= 0.6 ? null : "Flak!"); shake = Math.max(shake, 0.8); }
  }

  // ---------- per-frame update ----------
  const rk = { hit: 0, hitJet: 0, miss: 0 };
  let rockReq = 0, bombReq = 0, fightI = 0, calledAt = -99;
  function update(dt) {
    if (!running) return;
    const rdt = dt;
    if (slowT > 0) { slowT -= dt; dt *= 0.3; }
    dt *= wcSlow;
    elapsed += dt;
    if (L.baseHostile === undefined) L.baseHostile = L.hostile;
    L.hostile = L.baseHostile * Math.min(1, 0.2 + elapsed / 150 + L.difficulty * 0.55) * (1 - 0.75 * ezv());
    if (criticalUntil) {
      if (player.hp > 30 || crashing) criticalUntil = 0;
      else { setAlert(`CRITICAL - EJECT ${Math.max(0, Math.ceil(criticalUntil - elapsed))}`, 0.3); if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.warn?.(); if (elapsed >= criticalUntil) { criticalUntil = 0; startEject(); } }
    }
    if (!criticalUntil && !crashing && elapsed - lastDamage > 12) player.hp = Math.min(100, player.hp + dt * 0.22);
    checkDone(); if (ended) return;
    rwrUpdate(dt); updateGlows();
    controls.update(dt);
    if (crashing) {
      audio.seeker?.(false);
      // timer paused while the crash plays; level progress is kept
      controls.consumeLoop(); controls.consumeRocket(); controls.consumeBomb(); controls.consumeView();
      heat = Math.max(0, heat - dt / HEAT_DOWN);
      updateCrash(dt);
      updateTargets(dt); updateProjectiles(dt); updateEffects(dt);
      if (alertTimer > 0) { alertTimer -= dt; if (alertTimer <= 0) alertMsg = null; }
      dream.update(dt, player.pos);
      updateCamera(dt);
      sky.update(dt, camera.position, player.vel);
      return;
    }
    if (!endless) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; finish("complete"); return; } }
    if (controls.consumeView()) setView(viewMode === "cockpit" ? "chase" : "cockpit");
    updateGear(dt);
    if (ops) {
      controls.consumeLoop(); controls.consumeRocket(); controls.consumeBomb();
      updateOps(dt);
      if (ops && (ops.mode === "app" || ops.mode === "final" || ops.mode === "rollout" || ops.mode === "roll")) { updateTargets(dt); updateProjectiles(dt); }
      updateEffects(dt); updateCamera(dt); sky.update(dt, camera.position, player.vel);
      return;
    }
    if (landing) {
      controls.consumeLoop(); controls.consumeRocket(); controls.consumeBomb(); controls.consumeView();
      updateLanding(dt);
      updateTargets(dt); updateProjectiles(dt); updateEffects(dt);
      audio.updateEngine(0.15, false);
      updateCamera(dt); sky.update(dt, camera.position, player.vel);
      return;
    }
    flight(dt);
    if (crashing) { updateEffects(dt); updateCamera(dt); return; }

    const allowed = L.weapons;
    muzzle.visible = false;
    // machine gun: unlimited ammo, but it heats up (full in ~4 s) and cools (~2.5 s from full)
    const wantGun = controls.gunHeld() && allowed.includes("gun");   // b23: push-to-fire only
    if (wantGun && !overheated) { fireGun(dt); heat = Math.min(1, heat + dt / HEAT_UP); }
    else heat = Math.max(0, heat - dt / HEAT_DOWN);
    if (!overheated && heat >= 1) { overheated = true; audio.hiss(); events.onOverheat?.(true); }
    else if (overheated && heat < HEAT_RESUME) { overheated = false; audio.cool(); events.onOverheat?.(false); }
    rocketCd -= rdt; bombCd -= rdt; emptyT -= rdt; tgtFlash = Math.max(0, tgtFlash - dt);
    // b24: a missile / bomb request is remembered for 0.4 s, so a press during a cooldown or right after the other weapon is never lost
    if (controls.consumeRocket()) rockReq = 0.4; if (controls.consumeBomb()) bombReq = 1.0;
    rockReq -= rdt; bombReq -= rdt;
    if (rockReq > 0 && allowed.includes("rocket") && fireRocket()) rockReq = 0;
    if (bombReq > 0 && allowed.includes("bomb") && dropBomb()) bombReq = 0;
    if (controls.consumeFlare && controls.consumeFlare()) { if (player.flares > 0 && elapsed - flareAt > 0.45) deployFlares(null, true); else if (player.flares <= 0) { audio.empty(); events.toast?.("No flares left"); } }
    { const tg = controls.consumeTgt ? controls.consumeTgt() : 0; if (tg) cycleTgt(tg); }
    // slow refill, one at a time, whenever below max (timer only runs while below max)
    if (player.rockets < RACK) { rocketRegen += dt; if (rocketRegen >= ROCKET_REGEN * (0.55 + Math.min(1.3, Math.max(0, elapsed - serviceAt) / 100))) { rocketRegen = 0; player.rockets++; audio.reload("missile"); } } else rocketRegen = 0;
    if (player.bombs < RACK) { bombRegen += dt; if (bombRegen >= BOMB_REGEN * (0.55 + Math.min(1.3, Math.max(0, elapsed - serviceAt) / 100))) { bombRegen = 0; player.bombs++; audio.reload("bomb"); } } else bombRegen = 0;

    // auto-fire the gun while an enemy sits in the gun cone
    autoGun = false;
    { const fw = fwdFrom(player.yaw, player.pitch, tD); for (const t of targets) { if (!t.alive) continue; tA.subVectors(t.pos, player.pos); const d = tA.length(); if (d > 1500 || d < 40) continue; if (tA.normalize().angleTo(fw) < (assist ? 0.11 + 0.1 * akv() : 0.11)) { autoGun = true; break; } } }
    // rocket lock (14 deg cone)
    const fwd = fwdFrom(player.yaw, player.pitch, tD);
    let cand = null, candA = assist ? 0.26 : 0.22;
    for (const t of targets) {
      if (!t.alive || t.submerged) continue;
      tA.subVectors(t.pos, player.pos);
      const d = tA.length();
      if (d > 4200 || d < 60) continue;
      const a = tA.normalize().angleTo(fwd) - (t.objective ? 0.04 : 0);
      if (a < candA) { candA = a; cand = t; }
    }
    if (tapT > 0) { tapT -= dt; if (tapTarget?.alive) { const d = tA.subVectors(tapTarget.pos, player.pos); if (d.length() < 4200 && d.normalize().angleTo(fwd) < 0.3) cand = tapTarget; } else tapT = 0; }
    if (cand && cand === lockCand) { lockTime += dt; if (lockTime > 0.8 && lockTarget !== cand) { lockTarget = cand; if (allowed.includes("rocket")) { audio.lock(); } } }
    else { lockCand = cand; lockTime = 0; lockTarget = null; }

    const hardBreak = Math.abs(controls.stick.roll) > 0.86 || Math.abs(controls.stick.pitch) > 0.86;
    if (hardBreak) { lockTarget = lockCand = tapTarget = null; lockTime = tapT = 0; }
    lockBeepT -= dt;
    if (lockCand && !lockTarget && lockBeepT <= 0) { audio.acquire?.(); lockBeepT = 0.12; }
    audio.seeker?.(!!lockTarget && !hardBreak);

    // camera orbit objective
    if (progress.orbit != null && progress.orbit < 1 && viewMode === "chase") {
      orbitAccum += Math.abs(wrapPi(controls.look.yaw - lastYaw));
      if (orbitAccum > Math.PI * 1.8) { progress.orbit = 1; events.toast?.("Camera orbit! ✓"); audio.lock(); checkDone(); }
    }
    lastYaw = controls.look.yaw;
    if (progress.view === 1) checkDone();

    updateTargets(dt);
    updateProjectiles(dt);
    updateRings(dt);
    updateEffects(dt);

    // CCIP
    ccip = null;
    if (allowed.includes("bomb") && player.bombs > 0) {
      tA.copy(player.pos); tB.copy(player.vel).add(tC.set(0, -6, 0));
      for (let i = 0; i < 160; i++) {
        tB.y -= GRAV * 0.1; tA.addScaledVector(tB, 0.1);
        const gh = groundAt(tA.x, tA.z);
        if (tA.y <= gh) { tA.y = gh; ccip = tA.clone(); break; }
      }
    }
    // bomb auto-lock: the ground target closest to the impact point (or to the nose) gets the aim marker; bombs are guided onto it
    bombLock = (allowed.includes("bomb") && player.bombs > 0 && !crashing && !nearPad) ? pickBombLock(ccip) : null;
    const aimP = bombLock ? bombLock.pos : ccip; aimPos = aimP ? aimP.clone() : null;
    ccipRing.visible = !!aimP && aimP.distanceTo(player.pos) < 5600;
    if (ccipRing.visible) { ccipRing.position.copy(aimP).add(tA.set(0, bombLock ? bombLock.radius * 0.4 + 2 : 2, 0)).add(tA.set(0, 2, 0)); ccipRing.scale.setScalar(1 + 0.15 * Math.sin(elapsed * 6)); }
    ccipLine.visible = false;   // b24: the HUD draws ONE solid guidance line + lock circle
    if (false) { const a = ccipLine.geometry.attributes.position; a.setXYZ(0, player.pos.x, player.pos.y - 4, player.pos.z); a.setXYZ(1, ccipRing.position.x, ccipRing.position.y, ccipRing.position.z); a.needsUpdate = true; }

    if (player.speed < 72 && player.pos.y - groundAt(player.pos.x, player.pos.z) > 35) {
      setAlert("STALL - ADD THROTTLE", 0.3); if ((warnTimer -= dt) < 0) { audio.pullUp(); warnTimer = 0.8; }
    }
    if (lowAlt) {
      setAlert("PULL UP", 0.2);
      if ((warnTimer -= dt) < 0) { audio.pullUp(); warnTimer = 0.6; }
      if ((voiceT -= dt) <= 0) { audio.voicePullUp(); voiceT = 3; }
    } else voiceT = 0;
    if (alertTimer > 0) { alertTimer -= dt; if (alertTimer <= 0) alertMsg = null; }

    dream.update(dt, player.pos);
    audio.updateEngine(Math.min(1, 0.5 * throttle + 0.5 * Math.max(0, (player.speed - 90) / 230) + (controls.boost() ? 0.25 : 0)), viewMode === "cockpit", player.speed, gload);
    {   // b24: fight intensity drives the music; wingman callouts for new bandits
      let near = 1e9; _qI.copy(player.q).invert();
      for (const t of targets) {
        if (!t.alive || t.kind !== "jet") continue;
        const d = t.pos.distanceTo(player.pos); if (d < near) near = d;
        if (!t.called && d < 2300 && elapsed - calledAt > 7) {
          t.called = true; calledAt = elapsed;
          tA.subVectors(t.pos, player.pos).applyQuaternion(_qI);
          const hr = ((Math.round(Math.atan2(tA.x, -tA.z) / (Math.PI / 6)) + 12) % 12) || 12;
          const msg = hr === 6 ? "Bandit six o'clock!" : hr === 12 ? "Bandit twelve o'clock" : `Bandit ${hr} o'clock`;
          events.toast?.(msg); audio.say?.(msg);
        }
      }
      const inten = Math.max(THREE.MathUtils.clamp(1.25 - near / 2200, 0, 1), airMissiles() > 0 ? 0.9 : 0, elapsed - lastDamage < 2.5 ? 1 : 0, controls.gunHeld() ? 0.5 : 0);
      fightI += (inten - fightI) * (1 - Math.exp(-dt * 1.4));
      audio.setIntensity?.(fightI); audio.setBurner?.(controls.boost() ? 1 : 0);
    }
    updateCamera(dt);
    {
      const cd = sky.cloudDensityAt(camera.position); inCloud += (cd - inCloud) * (1 - Math.exp(-dt * 5));
      updateWisps(dt);
      accT += dt; if (accT > 15) { accT = 0; const ds = stats.shots + stats.rockets - accS; if (ds >= 20) { const acc = (stats.hits - accH) / ds; bumpSkill(THREE.MathUtils.clamp((acc - 0.22) * 0.12, -0.03, 0.04)); } accS = stats.shots + stats.rockets; accH = stats.hits; }
      // wingtip vapour: one continuous ribbon per wing tip, fades in with g-load / cloud
      {
        const u = plane && plane.userData, want = !!(u && !crashing && plane.visible && ((gload + dbgG > 0.45 && player.speed > 50) || inCloud > 0.1));
        const kk = want ? Math.min(1, Math.max(inCloud * 3, (gload + dbgG - 0.4) * 2.2)) : 0;
        const tips = u ? [u.navL, u.navR] : [];
        for (let ti = 0; ti < 2; ti++) {
          const n = tips[ti]; if (!n) continue;
          if (!wtRb[ti]) wtRb[ti] = rbStart(TIP_RB);
          n.getWorldPosition(tA);
          if (kk > 0.02 && !wtOn) rbEmit(wtRb[ti], tA, 0);   // break marker so a new streak never bridges to an old one
          if (kk > 0.02 || wtOn) rbEmit(wtRb[ti], tA, kk > 0.02 ? kk : 0);
        }
        wtOn = kk > 0.02;
      }
      updateFlares(dt);
      rbUpdate(dt);
    }
    sky.update(dt, camera.position, player.vel);
  }
  function setAlert(m, t) { alertMsg = m; alertTimer = Math.max(alertTimer, t); }

  function updateTargets(dt) {
    const hostile = L.calm ? 0 : L.hostile;
    if (pad) {
      pad.t += dt;
      const sx = Math.sin(pad.heading), sz = Math.cos(pad.heading);
      const ax = pad.pos.x + sx * 260, az = pad.pos.z + sz * 260;
      if (!terrain.isWater(ax, az) || Math.abs(ax - center.x) > half - 600 || Math.abs(az - center.z) > half - 600) { pad.heading += Math.PI; pad.obj.rotation.y = pad.heading + Math.PI; }
      pad.pos.x += Math.sin(pad.heading) * pad.speed * dt; pad.pos.z += Math.cos(pad.heading) * pad.speed * dt;
      pad.pos.y = 0.4 + Math.sin(pad.t * 0.7) * 0.25;
    }
    updateFires(dt);
    // endless reinforcement waves of enemy jets
    if (false && jetSpawner && !ended) {
      waveT += dt;
      const aliveJ = targets.filter((t) => t.kind === "jet" && t.alive).length;
      const esc = Math.min(6, Math.floor(elapsed / (48 + 60 * ezv())));
      if (waveT > Math.max(5, 9.5 - esc * 0.7) && aliveJ < jetSpawner.atOnce + 1 + esc) { waveT = 0; const nW = 1 + (esc >= 2 ? 1 : 0) + (esc >= 5 ? 1 : 0); for (let i = 0; i < nW; i++) spawnJet(player.pos); events.toast?.(esc >= 3 ? "Heavy enemy wave inbound!" : "Enemy wave incoming!"); }
      // ground reinforcements: new tanks / flak / SAMs arrive ahead of the player at long range, escalating all round
      if (!crashing && !landing) {
        groundWave.t -= dt;
        if (groundWave.t <= 0) {
          groundWave.n++; groundWave.t = Math.max(8, 18 - groundWave.n * 0.7);
          const gAlive = targets.filter((t) => t.alive && (t.kind === "tank" || t.kind === "flak" || t.kind === "sam")).length;
          if (gAlive < 18 - Math.round(10 * ezv())) {
            const cnt = Math.max(1, Math.round(Math.min(5, 1 + Math.floor(groundWave.n / 3)) * (1 - 0.5 * ezv())));
            for (let i = 0; i < cnt; i++) spawnGroundAhead(groundWave.n);
            events.toast?.("New ground targets ahead!");
          }
        }
      }
    }
    // b26: attack choppers arrive every ~30 s (one at a time early on, up to three later)
    if (false && jetSpawner && !ended && !crashing && !landing && !ops) {
      heliT -= dt;
      if (heliT <= 0) {
        heliT = 26 + Math.random() * 12;
        const aliveH = targets.filter((t) => t.heli && t.alive).length, esc2 = Math.min(2, Math.floor(elapsed / 90));
        if (aliveH < 1 + esc2) { spawnHeli(player.pos); events.toast?.("Enemy chopper inbound!", "warn"); }
      }
    }
    // jet waves
    if (jetSpawner) {
      const alive = targets.filter((t) => t.kind === "jet" && t.alive).length;
      if (alive < jetSpawner.atOnce && jetSpawner.remaining > 0) {
        const first = jetSpawner.n < jetSpawner.atOnce, k = jetSpawner.n++ % 3;
        // opening group: right ahead (one is a chase target); every replacement: random 360 deg bearing at the radar edge, flying in
        if (first) (k === 2 ? spawnHeli : spawnJetAhead)(player.pos, k === 1);
        else if (k === 2) { const h = spawnHeli(player.pos), a = rng() * Math.PI * 2, r = 5600 + rng() * 600; h.pos.set(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r); h.pos.y = h.hoverY = Math.max(groundAt(h.pos.x, h.pos.z) + 90, 60); h.yaw = Math.atan2(-(player.pos.x - h.pos.x), -(player.pos.z - h.pos.z)); }
        else spawnJet(player.pos);
        jetSpawner.remaining--;
      }
    }
    for (const t of targets) {
      if (!t.alive) continue;
      t.t += dt;
      switch (t.kind) {
        case "tank": {
          const nx = t.pos.x + Math.sin(t.heading) * t.speed * dt, nz = t.pos.z + Math.cos(t.heading) * t.speed * dt;
          if (terrain.isWater(nx, nz) || Math.abs(nx - center.x) > half - 400 || Math.abs(nz - center.z) > half - 400) t.heading += Math.PI * 0.6;
          else { t.vel.set(nx - t.pos.x, 0, nz - t.pos.z).divideScalar(dt); t.pos.x = nx; t.pos.z = nz; }
          t.pos.y = groundAt(t.pos.x, t.pos.z);
          t.obj.rotation.y = t.heading + Math.PI;
          if (rng() < dt * 0.3) puff(tA.copy(t.pos).add(tB.set(0, 2, 0)), tC.set(0, 4, 0), 2, 6, 1.4, 0xb9a986);
          if (hostile > 0 && t.pos.distanceTo(player.pos) < 2300) {
            t.cool -= dt * hostile;
            if (t.cool <= 0) { t.cool = 3.4 * fireK(); flakShot(tA.copy(t.pos).add(tB.set(0, 4, 0)), 0.05); }
          }
          break;
        }
        case "ship": {
          const nx = t.pos.x + Math.sin(t.heading) * t.speed * dt, nz = t.pos.z + Math.cos(t.heading) * t.speed * dt;
          const ax = t.pos.x + Math.sin(t.heading) * 90, az = t.pos.z + Math.cos(t.heading) * 90;
          if (!terrain.isWater(ax, az)) t.heading += dt * 0.9;
          else { t.vel.set(nx - t.pos.x, 0, nz - t.pos.z).divideScalar(dt); t.pos.x = nx; t.pos.z = nz; }
          t.pos.y = groundAt(t.pos.x, t.pos.z) + 0.5 + Math.sin(t.t * 0.8) * 0.4;
          t.obj.rotation.set(Math.sin(t.t * 0.7) * 0.02, t.heading + Math.PI, Math.sin(t.t) * 0.03);
          if (t.sea === "sub") {   // surface / dive cycle: dives (untargetable) for ~10 s, leaving a bubble trail
            const cyc = (t.t + t.ph) % 32, dep = cyc < 14 ? 0 : cyc < 18 ? (cyc - 14) / 4 : cyc < 26 ? 1 : 1 - (cyc - 26) / 6;
            const was = t.submerged; t.submerged = dep > 0.55; t.obj.visible = dep < 0.6;
            t.pos.y = groundAt(t.pos.x, t.pos.z) + 0.3 - dep * 4;
            const wk = t.obj.getObjectByName("wake"); if (wk) wk.visible = dep < 0.3;
            if (was !== t.submerged && (cyc < 14 || cyc > 14)) for (let i = 0; i < 6; i++) puff(tA.copy(t.pos).add(tB.set((rng() - 0.5) * 8, 1, (rng() - 0.5) * 14)), null, 2, 9, 1.6, 0xffffff);
            if (t.submerged && rng() < dt * 1.5) puff(tA.copy(t.pos).add(tB.set(0, 0.8, 0)), null, 1.5, 5, 1.4, 0xdff0ff);
            break;
          }
          if (rng() < dt * 2) puff(tA.copy(t.pos).add(tB.set(-Math.sin(t.heading) * 20, 1, -Math.cos(t.heading) * 20)), null, 3, 9, 1.8, 0xffffff);
          // anti-air tracers
          const d = t.pos.distanceTo(player.pos);
          if (hostile > 0 && d < 1500) { t.cool -= dt; if (t.cool <= 0) { t.cool = 0.12 * fireK() * 1.4; if (Math.sin(t.t * 2) > 0.2) enemyShot(tA.copy(t.pos).add(tB.set(0, 10, 0)), 0.09 * (1.6 - hostile)); } }
          break;
        }
        case "sam": {
          const la = t.obj.userData.launcher;
          tA.subVectors(player.pos, t.pos);
          la.rotation.y = Math.atan2(-tA.x, -tA.z);
          const d = tA.length();
          if (hostile > 0 && d < 4200) {
            t.cool -= dt * hostile;
            const lk = lockRamp(t, dt, gload < 0.6);   // b21: SAM needs a slow lock, any hard turn breaks it
            if (t.cool <= 0 && lk && airMissiles() < maxMsl()) { t.cool = (5.5 - L.difficulty * 2.2) * (1 + 0.9 * ezv()) * (ezv() >= 0.6 ? 1.3 : 1); launchSam(t); }
          }
          break;
        }
        case "flak": {
          tA.subVectors(player.pos, t.pos);
          const d = tA.length();
          const ud = t.obj.userData;
          if (ud.pivot) { ud.pivot.rotation.order = "YXZ"; ud.pivot.rotation.y = Math.atan2(-tA.x, -tA.z); ud.pivot.rotation.x = Math.atan2(tA.y, Math.hypot(tA.x, tA.z)); }
          if (hostile > 0 && d < 3000 && d > 150) {
            t.cool -= dt * hostile;
            if (t.cool <= 0) {
              if (!t.burst) t.burst = 4;
              t.burst--; t.cool = (t.burst > 0 ? 0.22 : 2.4) * fireK();
              flakShot(tA.copy(t.pos).add(tB.set(0, 5, 0)), 0.035 * (1.7 - hostile));
            }
          }
          break;
        }
        case "base": break;
        case "jet": updateJet(t, dt, hostile); break;
        case "boss": updateBoss(t, dt); break;
        case "balloon":
          t.pos.y = t.base + Math.sin(t.t * 0.9) * 6;
          t.obj.rotation.y += dt * 0.3;
          if (t.pos.distanceTo(player.pos) < t.radius + 12) kill(t);
          break;
        case "drone": {
          t.ang += dt * 22 / t.rad;
          const nx = t.c.x + Math.cos(t.ang) * t.rad, nz = t.c.z + Math.sin(t.ang) * t.rad;
          t.vel.set(nx - t.pos.x, 0, nz - t.pos.z).divideScalar(dt);
          t.pos.set(nx, t.c.y + Math.sin(t.t * 1.3) * 10, nz);
          t.obj.rotation.y = -t.ang;
          break;
        }
        case "target":
          t.obj.lookAt(player.pos.x, t.pos.y, player.pos.z);
          break;
      }
    }
    updateAllies(dt);
  }



  // b26: dogfight call-outs: who is on whose tail
  let cueT = 0; const _c1 = V(), _c2 = V(), _c3 = V();
  function dogfightCues(t, dist) {
    if (dist > 800 || crashing || landing || elapsed < cueT) return;
    fwdFrom(player.yaw, player.pitch, _c1); fwdFrom(t.yaw, t.pitch, _c2);
    _c3.subVectors(t.pos, player.pos).normalize();            // player -> enemy
    const pf = _c1.dot(_c3), ef = _c2.dot(_c3);               // pf>0: enemy ahead of me. ef<0: enemy heading toward me (it is facing me)
    if (pf < -0.55 && ef < -0.6 && dist < 650) { cueT = elapsed + 7; events.toast?.("BOGEY ON YOUR SIX - BREAK!", "bad"); audio.warn?.(); }
    else if (pf > 0.9 && ef > 0.6 && dist < 650) { cueT = elapsed + 9; events.toast?.("ON HIS TAIL - FIRE!", "good"); }
  }
  // ---------- b26: enemy attack choppers (count as air targets: lock, missiles, radar, AIR counter all work) ----------
  function spawnHeli(near) {
    const f = fwdFrom(player.yaw, 0, V()); f.y = 0; f.normalize(); const sd = V(-f.z, 0, f.x), sg = rng() < 0.5 ? -1 : 1;
    const p = near.clone().addScaledVector(f, 900 + rng() * 700).addScaledVector(sd, sg * (150 + rng() * 500));
    p.x = THREE.MathUtils.clamp(p.x, center.x - half + 700, center.x + half - 700); p.z = THREE.MathUtils.clamp(p.z, center.z - half + 700, center.z + half - 700);
    p.y = Math.max(groundAt(p.x, p.z) + 70 + rng() * 80, 30);
    const o = createHeli(false);
    const t = addTarget("jet", o, p, { yaw: Math.atan2(-(near.x - p.x), -(near.z - p.z)), pitch: 0, bank: 0, speed: 0, burst: 0, mcool: 99, flyby: false, heli: true, hoverY: p.y, ph: rng() * 6.28 });
    t.hp = 6; t.mode = "heli"; t.objective = progress.jet != null;
    o.scale.multiplyScalar(1.15 / 2.0 * 2.0);   // heli model is bigger than a jet unit
    t.radius = Math.max(t.radius, 14);
    return t;
  }
  function updateHeli(t, dt, hostile) {
    const ud = t.obj.userData;
    if (ud.rotor) ud.rotor.rotation.y += 38 * dt; if (ud.tail) ud.tail.rotation.x += 46 * dt;
    tA.subVectors(player.pos, t.pos); const dist = tA.length();
    const want = Math.atan2(-tA.x, -tA.z);
    const yr = THREE.MathUtils.clamp(wrapPi(want - t.yaw) * 1.4, -0.9, 0.9);
    t.yaw += yr * dt;
    // creep toward the player until ~450 m, then strafe around him; a hit or a missile makes it dive and bank away
    const desired = dist > 2200 ? 120 : dist > 520 ? 62 : dist < 300 ? -30 : 0;
    t.speed += (desired - t.speed) * Math.min(1, dt * 0.8);
    tD.set(-Math.sin(t.yaw), 0, -Math.cos(t.yaw));
    t.vel.copy(tD).multiplyScalar(t.speed);
    if (dist < 650) { tE.set(-tD.z, 0, tD.x); t.vel.addScaledVector(tE, Math.sin(t.t * 0.6 + t.ph) * 22); }
    t.pos.addScaledVector(t.vel, dt);
    const gh = groundAt(t.pos.x, t.pos.z);
    t.hoverY = Math.max(t.hoverY + (Math.sin(t.t * 0.3 + t.ph) * 0.8) * dt, gh + 45);
    t.pos.y += (t.hoverY - t.pos.y) * Math.min(1, dt * 1.5);
    t.pitch = THREE.MathUtils.clamp(-t.speed / 62 * 0.14, -0.2, 0.1); t.bank += (-yr * 0.25 - t.bank) * Math.min(1, dt * 2);
    t.obj.rotation.set(t.pitch, t.yaw, -t.bank, "YXZ");
    // cannon bursts when facing the player
    if (hostile > 0 && dist < 1300) {
      fwdFrom(t.yaw, t.pitch, tC); const ang = tC.angleTo(tA.normalize());
      t.cool -= dt;
      if (ang < 0.35 && t.cool <= 0) { t.burst = assist ? 3 : 5; t.cool = (3.2 - hostile) * fireK(); }
      if (t.burst > 0 && ((t.bc = (t.bc || 0) - dt) <= 0)) { t.bc = 0.1; t.burst--; tD.set(0, -1, -4.4).applyEuler(t.obj.rotation).add(t.pos); enemyShot(tD, 0.05 * (1.8 - hostile)); }
    }
  }
  // Heavy end-of-sector threat: four independently destructible rear-facing weapon pods.
  function spawnBoss() {
    const rank = Math.floor(L.n / 5), type = rank % 3, names = ["IRON MANTA", "NIGHT CITADEL", "HYDRA WING"];
    const obj = createEnemyJet("boss" + type, { shape:[1,4,3][type], wing:[0x272e38,0x282337,0x2b3432][type], hi:0x647080, lo:0x171c25, glow:0xff5930 });
    obj.scale.setScalar(8); obj.userData.radius = 48;
    const p = player.pos.clone().addScaledVector(fwdFrom(player.yaw,0,V()),650); p.y = Math.max(p.y + 60, groundAt(p.x,p.z)+250);
    const b = addTarget("boss",obj,p,{hp:36 + rank * 4,maxHp:36 + rank * 4,yaw:player.yaw,pitch:0,speed:145,clock:0,missileAt:3,pods:[],name:names[type],objective:true});
    progress.boss = 0; L.objectives.push({kind:"boss",need:1,label:`Destroy ${b.name}`});
    for (let i=0;i<4;i++) {
      const pod = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color:0x424b58,metalness:0.7,roughness:0.33}), metal = new THREE.Mesh(new THREE.CylinderGeometry(2.8,3.8,11,10).rotateX(Math.PI/2),mat); pod.add(metal);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(2.2,10,8),new THREE.MeshBasicMaterial({color:0xff5c21,toneMapped:false}));eye.position.z=6;pod.add(eye);pod.userData.radius=5;
      const t=addTarget("bossweapon",pod,p.clone(),{hp:14+rank*2,maxHp:14+rank*2,radius:5,owner:b,local:V((i%2?-1:1)*(i<2?35:18),i<2?0:8,20),cool:2+i,objective:false});b.pods.push(t);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.8,1.8,2100,8).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xff3520,transparent:true,opacity:0.55,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));beam.position.z=136.875;beam.scale.setScalar(1/8);beam.visible=false;obj.add(beam);b.beam=beam;
    setAlert("BOSS INBOUND - DESTROY WEAPON PODS",5);events.toast?.(b.name,"bad");audio.warn?.();
  }
  function updateBoss(b,dt) {
    jetThreat(b,dt); b.clock+=dt;
    const pf=fwdFrom(player.yaw,0,V()), ahead=b.pos.clone().sub(player.pos).dot(pf), desired=THREE.MathUtils.clamp(player.speed*(ahead>650?0.78:1.015),120,205);
    b.speed+=(desired-b.speed)*dt*0.4;
    const yd=player.yaw+Math.sin(b.clock*0.65)*0.23;b.yaw+=wrapPi(yd-b.yaw)*dt*0.35;
    b.pitch=Math.sin(b.clock*0.7)*0.065;if(b.pos.y<groundAt(b.pos.x,b.pos.z)+220)b.pitch=0.3;
    fwdFrom(b.yaw,b.pitch,b.vel).multiplyScalar(b.speed);b.pos.addScaledVector(b.vel,dt);b.obj.rotation.set(b.pitch,b.yaw,Math.sin(b.clock*0.65)*0.22,"YXZ");b.obj.updateMatrixWorld(true);b.obj.userData.burn?.(1,0.5);
    for(const p of b.pods)if(p.alive){p.pos.copy(p.local).applyEuler(b.obj.rotation).add(b.pos);p.obj.rotation.copy(b.obj.rotation);p.vel.copy(b.vel);p.cool-=dt;if(p.cool<=0){p.cool=4+Math.random()*2;enemyShot(p.pos,0.09);}}
    b.missileAt-=dt;if(b.missileAt<0&&b.pods.some(p=>p.alive)){b.missileAt=7;launchSam(b,"jet");if(Math.random()<0.5)enemyFlares(b,null);}
    const phase=b.clock%16.5,laser=phase>15;b.beam.visible=laser;
    if(phase>13&&phase<=15)setAlert("BOSS LASER CHARGING - BREAK AWAY",0.3);
    if(laser){const dir=fwdFrom(b.yaw,b.pitch,V()).negate(),rel=V().subVectors(player.pos,b.pos),along=rel.dot(dir);if(along>0&&along<2100&&rel.addScaledVector(dir,-along).length()<36)damagePlayer(24*dt,null,true);}
  }
  function updateJet(t, dt, hostile) {
    if (t.doom) {
      t.doom -= dt; t.pitch -= dt * 0.07; t.bank += dt * 0.9;
      fwdFrom(t.yaw, t.pitch, t.vel).multiplyScalar(t.speed); t.vel.y -= 18;
      t.pos.addScaledVector(t.vel, dt); t.obj.rotation.set(t.pitch, t.yaw, -t.bank, "YXZ");
      if (Math.random() < dt * 22) { puff(t.pos.clone(), V(0,12,0), 4, 15, 2.5, 0x28282c); fx(t.pos.clone(), V(0,6,0), 5, 1, 0.5, 0xff8228, 0, 1); }
      if (t.doom <= 0 || t.pos.y < groundAt(t.pos.x,t.pos.z) + 4) kill(t);
      return;
    }
    if (t.heli) { updateHeli(t, dt, hostile); return; }
    if (t.mode === "flee" || t.mode === "cross" || t.mode === "head") { updateEvader(t, dt); return; }
    jetThreat(t, dt);
    tA.subVectors(player.pos, t.pos);
    const dist = tA.length(); hostile *= assist ? 0.55 + 0.45 * skill : 1; dogfightCues(t, dist);
    let goal = tB.copy(player.pos).addScaledVector(player.vel, Math.min(0.5, dist / 900));   // b24: weaker lead = they chase you less well
    fwdFrom(t.yaw, t.pitch, tC);
    const inFront = tC.dot(tA) > 0;
    if (t.flyby) {
      // fly a close pass by the player's wing, then turn around for a dogfight
      tE.set(-player.vel.z, 0, player.vel.x).normalize();
      goal = tB.copy(player.pos).addScaledVector(player.vel, Math.min(1.4, dist / 350)).addScaledVector(tE, t.off); goal.y += (t.off > 0 ? 25 : -20);
      if (!inFront && dist < 500) t.flyby = false;
      const rel = tD.copy(t.vel).sub(player.vel), clos = rel.dot(tA) / Math.max(1, dist);
      if (t.fb === 0 && dist < 1500 && clos > 150 && dist / clos < 1.15) { t.fb = 1; audio.flyby(Math.min(1, 1.2 - dist / 1800)); }
      if (t.fb === 1 && dist < 130 && !t.cc) { t.cc = 1; events.toast?.("Close call!"); }
    } else if (dist < 220 && inFront) { goal = tB.copy(t.pos).addScaledVector(tC, 300).add(tD.set(Math.cos(t.t) * 400, 120, Math.sin(t.t) * 400)); }
    const gx = goal.x - t.pos.x, gz = goal.z - t.pos.z, gy = goal.y - t.pos.y;
    // b24: they jink left and right in a dogfight; you follow with small corrections
    t.jinkT = (t.jinkT || 0) - dt; if (t.jinkT <= 0) { t.jinkT = 0.8 + Math.random() * 1.5; t.jinkDir = Math.random() < 0.5 ? -1 : 1; t.jinkAmp = 0.25 + Math.random() * 0.4; }
    const jk = dist < 1100 ? 1 : 0.3;
    const wantYaw = Math.atan2(-gx, -gz) + t.jinkDir * t.jinkAmp * jk * (inFront ? 0.5 : 1);
    const turn = (0.58 + L.difficulty * 0.3) * (1 - 0.5 * ezv());   // beginners: the jets turn slower than the player can
    let yr = THREE.MathUtils.clamp(wrapPi(wantYaw - t.yaw) * 1.3, -turn, turn);
    if (t.breakT > 0) yr = t.breakDir * 2.2;
    t.yaw += yr * dt;
    t.bank += (THREE.MathUtils.clamp(-yr / turn, -1, 1) * 1.05 - t.bank) * dt * 2.5;
    let wantPitch = THREE.MathUtils.clamp(Math.atan2(gy, Math.hypot(gx, gz)), -0.5, 0.5);
    if (t.breakT > 0) wantPitch = t.pull * 0.45;
    const g = groundAt(t.pos.x, t.pos.z);
    if (t.pos.y - g < 160) wantPitch = 0.45;
    t.pitch += (wantPitch - t.pitch) * dt * 1.2;
    const pf = fwdFrom(player.yaw, player.pitch, V()), onSix = pf.dot(tD.subVectors(t.pos, player.pos).normalize()) > 0.65 && pf.dot(fwdFrom(t.yaw, t.pitch, V())) > 0.3;
    if (onSix && dist < 1500) { const desired = THREE.MathUtils.clamp(player.speed * (dist > 600 ? 0.92 : 1.015), 105, 220); t.speed += (desired - t.speed) * Math.min(1, dt * 0.5); }
    fwdFrom(t.yaw, t.pitch, t.vel).multiplyScalar(t.speed);
    t.pos.addScaledVector(t.vel, dt);
    t.obj.rotation.set(t.pitch, t.yaw, -t.bank, "YXZ");
    t.obj.userData.beacon.visible = Math.sin(t.t * 7) > 0;
    t.obj.userData.burn?.(1, 0.5);
    if ((t.ct -= dt) <= 0 && dist < 5500) { t.ct = 0.08; tD.set(0, 0, 7.5).applyEuler(t.obj.rotation).add(t.pos); puff(tD, null, 2.4, 9, 1.5, 0xeef4ff); }
    if (!t.flyby && hostile > 0 && dist < 1100) {
      const ang = tC.angleTo(tA.normalize());
      t.cool -= dt;
      if (ang < 0.16 && t.cool <= 0) { t.burst = assist ? 2 : 4; t.cool = (2.2 - hostile) * (assist ? 1.6 : 1) * fireK(); }
      const lkJ = lockRamp(t, dt, hostile > 0.1 && dist > 600 && dist < 2800 && ang < 0.45 && gload < 0.6);
      if (lkJ && (t.mcool -= dt) <= 0 && airMissiles() < maxMsl()) { t.mcool = (8 - hostile * 3 + Math.random() * 3) * (ezv() >= 0.6 ? 1.5 : 1); launchSam({ pos: t.pos, vel: t.vel, speed: t.speed }, "jet"); }
      if (t.burst > 0 && (t.bc = (t.bc || 0) - dt) <= 0) { t.burst--; t.bc = 0.09; enemyShot(tD.copy(t.pos).addScaledVector(tC, 6), 0.05 * (1.7 - hostile) * (assist ? 1.6 : 1)); }
    }
  }
  // b21: enemies fire far less: slower rates (x3 on levels 1-3, x2.4 at level 10, easing back to x1.3), fewer live shots at once
  // beginner levels: enemy guns / flak are basically harmless; missiles are the only real threat
  function gunDmgK() { return ezv() >= 0.6 ? 0.03 : 0.5; }
  // enemy missile lock: builds slowly while the player flies straight and level at them, decays 3x faster when he turns
  function lockRamp(t, dt, cond) { t.elk = cond ? (t.elk || 0) + dt : Math.max(0, (t.elk || 0) - dt * 3); return t.elk >= (1.8 + 2.2 * ezv()); }
  function fireK() { return 1.3 + 1.7 * ezv(); }
  function enemyShot(origin, spread) {
    { let live = 0; for (const b of bullets) if (b.enemy && !b.atAlly) live++; if (live >= (ezv() > 0.5 ? 5 : 9)) return; }
    const lead = origin.distanceTo(player.pos) / 800;
    tA.copy(player.pos).addScaledVector(player.vel, lead * 0.8).sub(origin).normalize();
    spread *= 1 + 6 * ezv();   // beginner levels: tracers fly mostly wide of the jet
    tA.x += (Math.random() - 0.5) * spread * 2; tA.y += (Math.random() - 0.5) * spread * 2; tA.z += (Math.random() - 0.5) * spread * 2;
    bullets.push({ p: origin.clone(), v: tA.normalize().multiplyScalar(800), life: 1.8, enemy: true });
  }

  // ---------- weapon camera (green circle under the radar) ----------
  // A small off-screen render of the latest missile / bomb, chasing it until it hits (explosion hold) or misses (fade out).
  const WC = { state: "idle", obj: null, label: "", t: 0, canvas: null, ctx: null, rt: null, buf: null, img: null, lastDraw: 0, lastP: V(), lastV: V(), camP: V(), cam: null, lut: null, dist: 0, flash: 0 };
  let WCS = 160;   // b21: resized to the on-screen size x device pixel ratio (sharp, no low-res render target)
  let wcSlow = 1;   // slow-mo factor for the last moments before a weapon hits
  function attachWeaponCam(canvas) {
    WC.canvas = canvas; canvas.width = canvas.height = WCS; WC.ctx = canvas.getContext("2d");
    WC.cam = new THREE.PerspectiveCamera(62, 1, 0.5, 20000);
    wcResize(true);
    WC.lut = new Uint8Array(256); for (let i = 0; i < 256; i++) WC.lut[i] = Math.min(255, Math.round(255 * Math.pow(Math.min(1, (i / 255) * 1.5), 0.45)));
    wcStandby();
  }
  function wcResize(force) {
    const css = WC.canvas.clientWidth || 120, want = Math.max(220, Math.min(440, Math.round(css * Math.min(3, window.devicePixelRatio || 1))));
    if (!force && want === WCS) return;
    WCS = want; WC.canvas.width = WC.canvas.height = WCS;
    if (WC.rt) WC.rt.dispose();
    WC.rt = new THREE.WebGLRenderTarget(WCS, WCS, { depthBuffer: true, samples: 4 });
    WC.buf = new Uint8Array(WCS * WCS * 4); WC.img = WC.ctx.createImageData(WCS, WCS); WC.b32 = new Uint32Array(WC.buf.buffer); WC.d32 = new Uint32Array(WC.img.data.buffer);
  }
  function wcStandby() {
    const c = WC.ctx; if (!c) return;
    c.fillStyle = "#031006"; c.fillRect(0, 0, WCS, WCS);
    for (let y = 0; y < WCS; y += 3) { c.fillStyle = "rgba(60,255,110,0.05)"; c.fillRect(0, y, WCS, 1); }
    c.strokeStyle = "rgba(90,255,130,0.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(WCS / 2 - 14, WCS / 2); c.lineTo(WCS / 2 + 14, WCS / 2); c.moveTo(WCS / 2, WCS / 2 - 14); c.lineTo(WCS / 2, WCS / 2 + 14); c.stroke();
    c.fillStyle = "rgba(120,255,150,0.6)"; c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillText("WPN CAM", WCS / 2, WCS / 2 + 34); c.fillText("STANDBY", WCS / 2, WCS / 2 + 48);
    if (WC.canvas) { WC.canvas.style.opacity = 1; WC.canvas.dataset.live = "0"; }
  }
  const wcQ = [];
  function wcNext() { while (wcQ.length) { const q = wcQ.shift(); if (q.obj.active || q.obj.result == null) { wcStart(q.obj, q.label); return true; } } return false; }
  function watchWeapon(obj, label) { if (WC.state === "follow" || WC.state === "boom") wcQ.push({ obj, label }); else wcStart(obj, label); }
  function wcStart(obj, label) { wcResize(false); WC.obj = obj; WC.label = label; WC.state = "follow"; WC.t = 0; WC.lastP.copy(obj.p); WC.lastV.copy(obj.v); WC.camP.copy(obj.p); }
  function previewTarget() {
    const ok = (t) => t && t.alive && !t.submerged && t.kind !== "ally" && t.kind !== "balloon" && t.pos.distanceTo(player.pos) < 5200;
    if (ok(lockTarget)) return lockTarget;
    if (ok(selTgt)) return selTgt;
    if (ok(bombLock)) return bombLock;
    return null;
  }
  function updateWeaponCam(dt) {
    // slow-mo for the last ~0.45 s (game time) before impact, and briefly into the explosion
    { let want = 1; if (WC.state === "follow" && WC.obj && WC.obj.active && WC.tgt && WC.tgt.alive) { const sp = Math.max(60, WC.obj.v.length()); if (WC.dist / sp < 0.45) want = 0.38; } else if (WC.state === "boom" && WC.t < 0.5) want = 0.45;
      wcSlow += (want - wcSlow) * Math.min(1, 6 * dt / Math.max(0.05, wcSlow)); }
    // b23: with nothing in flight, the round screen previews the locked / selected target (green render + label)
    if (WC.canvas && player && !crashing) {
      if (WC.state === "idle" || WC.state === "pre") {
        const pv = previewTarget();
        if (pv) { if (WC.state === "idle") { wcResize(false); WC.state = "pre"; WC.lastDraw = 0; } WC.tgt = pv; WC.dist = pv.pos.distanceTo(player.pos); }
        else if (WC.state === "pre") { WC.state = "idle"; wcStandby(); }
      }
    } else if (WC.state === "pre") { WC.state = "idle"; if (WC.canvas) wcStandby(); }
    if (WC.state === "idle" || WC.state === "pre" || !WC.canvas) return;
    WC.t += dt;
    if (WC.state === "follow") {
      const o = WC.obj;
      if (o.active) { WC.lastP.copy(o.p); WC.lastV.copy(o.v); tA.copy(o.v).normalize(); tC.crossVectors(tA, tB.set(0, 1, 0)).normalize(); WC.camP.copy(o.p).addScaledVector(tA, -16).addScaledVector(tC, 3.4).add(tB.set(0, 2.4, 0)); WC.dist = o.target && o.target.alive ? o.target.pos.distanceTo(o.p) : 0; WC.tgt = o.target && o.target.alive ? o.target : null; }
      else { WC.state = o.result === "hit" ? "boom" : "fade"; WC.t = 0; if (WC.state === "fade" && wcNext()) return; }
    } else if (WC.state === "boom") { if (WC.t > (wcQ.length ? 0.9 : 1.6)) { if (!wcNext()) { WC.state = "fade"; WC.t = 0; } } }
    else if (WC.state === "fade") { if (WC.t > 0.9) { if (!wcNext()) { WC.state = "idle"; wcStandby(); } } }
  }
  function renderWeaponCam() {
    if (WC.state === "idle" || !WC.canvas) return;
    const now = performance.now(), pre = WC.state === "pre";
    if (now - WC.lastDraw < (pre ? 90 : 33)) return;
    WC.lastDraw = now;
    const cam = WC.cam;
    cam.position.copy(WC.camP);
    let fov = 50;
    if (pre) {
      // slow orbit around the target so its shape is easy to recognise from far away
      const tg = WC.tgt, R = Math.max(8, tg.radius) * 2.7, a = elapsed * 0.7;
      WC.camP.set(tg.pos.x + Math.cos(a) * R, tg.pos.y + R * 0.42 + 1.5, tg.pos.z + Math.sin(a) * R); cam.position.copy(WC.camP);
      cam.lookAt(tg.pos.x, tg.pos.y + Math.max(2, tg.radius * 0.18), tg.pos.z);
      fov = 36;
    } else if (WC.state === "follow") {
      if (WC.tgt && WC.tgt.alive) {
        // look at the target and zoom so the tank / ship / jet stays recognisable as the weapon closes in
        cam.lookAt(WC.tgt.pos);
        const dd = Math.max(25, WC.tgt.pos.distanceTo(WC.camP));
        fov = THREE.MathUtils.clamp(2 * Math.atan((Math.max(7, WC.tgt.radius) * 1.45) / dd) * 57.3, 2.6, 34);   // narrow: target fills the view and zooms in as it closes
      } else cam.lookAt(tA.copy(WC.lastP).addScaledVector(tB.copy(WC.lastV).normalize(), 40));
    } else { cam.lookAt(WC.lastP); if (WC.state === "boom") fov = 72; }   // b22: wide view on impact so the fireball does not wash out the frame
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * 0.6; cam.updateProjectionMatrix(); }
    const rtPrev = renderer.getRenderTarget(), pr = outlineUniforms.uRes.value.clone();
    outlineUniforms.uRes.value.set(WCS * 2.2, WCS * 2.2);
    const wasMuz = muzzle.visible; muzzle.visible = false;
    const hid = []; for (const rb of rbLive) if (rb.add && rb.mesh.visible) { rb.mesh.visible = false; hid.push(rb); }   // the weapon's own additive flame must not white-out its camera
    renderer.setRenderTarget(WC.rt); renderer.render(scene, cam); renderer.readRenderTargetPixels(WC.rt, 0, 0, WCS, WCS, WC.buf);
    renderer.setRenderTarget(rtPrev); outlineUniforms.uRes.value.copy(pr); muzzle.visible = wasMuz;
    for (const rb of hid) rb.mesh.visible = true;
    {
      // green-tinted scene; the target itself stays full colour, brighter and high-contrast inside a focus circle (plus brackets drawn below)
      const bf = WC.buf, dt8 = WC.img.data, n = WCS; let fx = -1, fy = -1, fr = 0;
      if ((WC.state === "follow" || pre) && WC.tgt && WC.tgt.alive) {
        tC.copy(WC.tgt.pos).project(cam);
        if (tC.z < 1 && tC.z > -1) { fx = (tC.x * 0.5 + 0.5) * n; fy = (0.5 - tC.y * 0.5) * n; const dd = Math.max(5, WC.tgt.pos.distanceTo(WC.camP)); fr = Math.max(n * 0.1, (Math.max(5, WC.tgt.radius) * 1.15 / dd) * (n / 2) / Math.tan(cam.fov * Math.PI / 360)); fr = Math.min(fr, n * 0.46); }
      }
      WC.fx = fx; WC.fy = fy; WC.fr = fr;
      const night = (L && L.time === "night" ? 1.5 : 1) * (WC.state === "boom" ? 0.55 : 1), kt = pre ? 1 : 0.42;   // b23: light green cast (pre-fire preview = full green)
      for (let y = 0; y < n; y++) {
        const sy = n - 1 - y;
        for (let x = 0; x < n; x++) {
          const i4 = (sy * n + x) * 4, o4 = (y * n + x) * 4;
          const r = bf[i4], g = bf[i4 + 1], bl = bf[i4 + 2], l = Math.min(255, (r * 0.3 + g * 0.59 + bl * 0.11) * night);
          let m = 0;
          if (fr > 0 && !pre) { const dx = x - fx, dy = y - fy, dr = Math.sqrt(dx * dx + dy * dy); m = dr < fr ? 1 : dr < fr * 1.35 ? 1 - (dr - fr) / (fr * 0.35) : 0; }
          const tr = l * 0.2, tg = Math.min(255, l * 0.95 + 14), tb = l * 0.3;   // phosphor green
          const k = 1.18, cr = Math.min(255, (r * night - 110) * k + 120), cg = Math.min(255, (g * night - 110) * k + 120), cb = Math.min(255, (bl * night - 110) * k + 120);   // contrast boost on the target
          const nr = Math.min(255, (r * night - 12) * 1.08 + 10), ng = Math.min(255, (g * night - 12) * 1.08 + 10), nb = Math.min(255, (bl * night - 12) * 1.08 + 10);
          const pr2 = tr * kt + nr * (1 - kt), pg2 = tg * kt + ng * (1 - kt), pb2 = tb * kt + nb * (1 - kt);
          dt8[o4] = pr2 + (cr - pr2) * m; dt8[o4 + 1] = pg2 + (cg - pg2) * m; dt8[o4 + 2] = pb2 + (cb - pb2) * m; dt8[o4 + 3] = 255;
        }
      }
    }
    const c = WC.ctx; c.putImageData(WC.img, 0, 0);
    const K = WCS / 160;
    if (WC.fr > 0) {   // target brackets
      const x0 = WC.fx - WC.fr * 1.1, x1 = WC.fx + WC.fr * 1.1, y0 = WC.fy - WC.fr * 1.1, y1 = WC.fy + WC.fr * 1.1, q = WC.fr * 0.35;
      c.strokeStyle = "rgba(255,230,120,0.95)"; c.lineWidth = 2 * K; c.beginPath();
      for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { c.moveTo(px + sx * q, py); c.lineTo(px, py); c.lineTo(px, py + sy * q); }
      c.stroke();
    }
    c.strokeStyle = "rgba(150,255,170,0.8)"; c.lineWidth = 1.2 * K; c.beginPath();
    for (const [x0, y0, x1, y1] of [[-30, 0, -20, 0], [20, 0, 30, 0], [0, -30, 0, -20], [0, 20, 0, 30]]) { c.moveTo(WCS / 2 + x0 * K, WCS / 2 + y0 * K); c.lineTo(WCS / 2 + x1 * K, WCS / 2 + y1 * K); }
    c.stroke();
    c.shadowColor = "rgba(0,0,0,.9)"; c.shadowBlur = 3 * K;
    c.fillStyle = "rgba(160,255,180,0.95)"; c.font = "bold " + Math.round(11 * K) + "px monospace"; c.textAlign = "center";
    c.fillText(pre ? (lockTarget === WC.tgt ? "LOCKED" : "TARGET") : WC.label, WCS / 2, 20 * K);
    if ((WC.state === "follow" || pre) && WC.tgt && WC.tgt.alive) { const nm = kindName(WC.tgt); c.fillStyle = "rgba(255,230,120,1)"; c.fillText(nm, WCS / 2, 33 * K); }
    c.fillStyle = WC.state === "boom" ? "rgba(255,200,120,1)" : "rgba(160,255,180,0.95)";
    c.fillText(pre ? (WC.dist > 1000 ? (WC.dist / 1000).toFixed(1) + " KM" : Math.round(WC.dist) + " M") : WC.state === "follow" ? (WC.dist > 0 ? Math.round(WC.dist) + " M" : "TRACKING") : WC.state === "boom" ? "IMPACT" : "LOST", WCS / 2, WCS - 14 * K);
    c.shadowBlur = 0;
    WC.canvas.dataset.live = "1";
    WC.canvas.style.opacity = WC.state === "fade" ? Math.max(0, 1 - WC.t / 0.9).toFixed(2) : 1;
  }

  function updateProjectiles(dt) {
    updateWeaponCam(dt);
    let pc = 0, ec = 0, ac = 0;
    const p0 = V();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      p0.copy(b.p);
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        if (b.flak) {
          if (b.p.distanceTo(player.pos) < 26) dead = true;
        } else if (b.atAlly) {
          for (const a of allies) if (a.alive && segSphere(p0, b.p, a.pos, a.radius * 1.2 + 2)) { damageAlly(a, 1.1); dead = true; break; }
        } else if (b.ally) {
          for (const t of targets) if (t.alive && segSphere(p0, b.p, t.pos, t.radius * 1.3 + 2)) { damageTarget(t, b.dmg || 0.8, "ally"); dead = true; break; }
          if (!dead && b.p.y < groundAt(b.p.x, b.p.z)) dead = true;
        } else if (b.enemy) {
          if (segSphere(p0, b.p, player.pos, assist ? 5.5 : 8)) { dead = true; damagePlayer(1.6 * Math.max(0.4, L.hostile) * gunDmgK()); audio.hitFar?.(); }
        } else {
          for (const t of targets) {
            if (t.alive && !t.submerged && segSphere(p0, b.p, t.pos, t.radius * 1.3 + 2)) { damageTarget(t, 1, "gun"); audio.hit(); dead = true; break; }
          }
          if (!dead) for (const a of allies) if (a.alive && segSphere(p0, b.p, a.pos, a.radius * 1.2 + 2)) { friendlyHit(a, 0.8, 60); dead = true; break; }
          if (!dead) {
            const gh = groundAt(b.p.x, b.p.z);
            if (b.p.y < gh) { dead = true; if (Math.random() < 0.3) puff(b.p.setY(gh + 1), tA.set(0, 6, 0), 1.5, 5, 0.7, terrain.isWater(b.p.x, b.p.z) ? 0xffffff : 0xc8b48a); }
          }
        }
      }
      if (dead) { if (b.flak) flakBurst(b.p); bullets.splice(i, 1); continue; }
      const mesh = b.ally ? aTracers : b.enemy ? eTracers : pTracers;
      const idx = b.ally ? ac++ : b.enemy ? ec++ : pc++;
      if (idx < MAXB) {
        _m.lookAt(tA.copy(b.p).add(b.v), b.p, UP);
        _m.setPosition(b.p);
        mesh.setMatrixAt(idx, _m);
      }
    }
    pTracers.count = Math.min(MAXB, pc); eTracers.count = Math.min(MAXB, ec); aTracers.count = Math.min(MAXB, ac);
    pTracers.instanceMatrix.needsUpdate = true; eTracers.instanceMatrix.needsUpdate = true; aTracers.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 4; i++) if (hpReload[i] > 0 && (hpReload[i] -= dt) <= 0) { const mm = plane?.userData.hardMissiles?.[i]; if (mm) mm.visible = player.rockets > 0; }
    for (const r of rockets) {
      if (!r.active) { if (r.rb) { rbStop(r.rb); rbStop(r.rf); r.rb = r.rf = null; } continue; }
      r.life -= dt;
      if (r.arm > 0) { r.arm -= dt; r.v.y -= 6 * dt; r.v.multiplyScalar(1 + dt * 1.2); }
      else if (r.target && r.target.alive && !(r.target.flareRef && r.target.flareRef.life <= 0)) {
        const tg = r.target, sp = r.v.length();
        tA.copy(tg.pos).addScaledVector(tg.vel, 0.22).sub(r.p);
        const dist = tA.length(); tA.normalize();
        if (!r.seekerGood && !tg.flareRef && dist < r.missAt) { r.target = null; r.lost = true; r.v.addScaledVector(V(-tA.z, 0.35, tA.x), 95); }
        tB.copy(r.v).normalize();
        // aspect seen by the seeker: 1 = tail-on (hot exhaust, easy), 0 = head-on (poor lock, wide miss)
        let tail = 0.9;
        if (tg.kind === "jet" || tg.flareRef) { const tv = tg.vel.length(); if (tv > 5) tail = THREE.MathUtils.clamp(0.5 + 0.5 * tg.vel.dot(tA) / tv, 0, 1); }
        const aLat = (200 + 350 * ezv()) * (0.4 + 0.6 * tail) * (tg.kind === "jet" && tg.breakT > 0 ? 0.5 : 1);   // lateral acceleration limit (m/s^2)
        const maxTurn = Math.min(3.2, aLat / Math.max(120, sp));
        const cone = 0.55 + 0.6 * tail;
        const ang = tB.angleTo(tA);
        if (ang > cone && dist > 70) { r.target = null; r.lost = true; }
        else if (ang > 1e-4) tB.lerp(tA, Math.min(1, maxTurn * dt / ang)).normalize();
        r.v.copy(tB).multiplyScalar(Math.min(570, sp + dt * 260));
      } else r.v.multiplyScalar(1 + dt * 0.4);
      p0.copy(r.p);
      r.p.addScaledVector(r.v, dt);
      r.o.position.copy(r.p);
      r.o.lookAt(tA.copy(r.p).add(r.v));
      r.o.rotateY(Math.PI);
      if (!r.rb) {
        if (WS.kind === "std") { r.rb = rbStart(SMOKE_RB); r.rf = rbStart(FLAME_RB); }
        else { const c = hexRGB(WS.fx); r.rb = rbStart({ life: 0.7, w0: 0.7, w1: 0.2, r: c[0], g: c[1], b: c[2], a: 0.9, add: true, fade: 1 }); r.rf = null; }
      }
      rbEmit(r.rb, r.p); if (r.rf) rbEmit(r.rf, r.p);
      if (WS.kind === "std") r.o.rotateZ(Math.sin(elapsed * 23 + r.p.x) * 0.25);
      if (false) {
        // (old particle trail, replaced by ribbons) own smoke trail per missile: hot motor flame + a thin white smoke line that thickens and drifts
        if (WS.kind === "std") {
          r.trail = 0.035;
          fx(r.p, null, 2.4 + Math.random() * 0.8, 0.6, 0.12, 0xffa040, 0, 0); fx(r.p, null, 1.1, 0.3, 0.1, 0xfff0c0, 0, 0);
          puff(r.p, tB.set((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6), 0.4, 3.0, 3.6, 0xe6e6ea);
          puff(r.p, tB.set((Math.random() - 0.5) * 3, 0.9, (Math.random() - 0.5) * 3), 0.7, 4.4, 4.2, 0xc9ccd2);
          r.o.rotateZ(Math.sin(elapsed * 23 + r.p.x) * 0.25);
        } else { r.trail = 0.02; fx(r.p, null, 2.2, 0.4, 0.5, WS.fx, 0, 0); fx(r.p, tB.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), 0.9, 0.2, 0.35, 0xffffff, 0, 1); }
      }
      if (r.target && r.target.flareRef && r.p.distanceTo(r.target.pos) < 28) { r.active = false; r.o.visible = false; r.result = "miss"; r.target.flareRef.life = Math.min(r.target.flareRef.life, 0.25); explode(r.p.clone(), 5, 0.3); events.toast?.("Decoyed by flares"); continue; }
      let hit = null;
      for (const t of targets) if (t.alive && !t.submerged && segSphere(p0, r.p, t.pos, t.radius + 6)) { hit = t; break; }
      if (!hit) for (const a of allies) if (a.alive && segSphere(p0, r.p, a.pos, a.radius + 6)) { friendlyHit(a, 12, 250); r.life = Math.max(r.life, 0.01); r.p.copy(a.pos); hit = { fake: true }; break; }
      const gh = groundAt(r.p.x, r.p.z);
      if (hit || r.p.y < gh || r.life <= 0) {
        r.active = false; r.o.visible = false;
        r.result = r.life > 0 ? "hit" : "miss";
        rk[r.result === "hit" && hit && hit.kind === "jet" ? "hitJet" : r.result]++;
        if (hit && !hit.fake) { stats.hits++; damageTarget(hit, 12, "rocket"); }
        if (r.life > 0) { explode(r.p.clone(), 9, 0.6); blast(r.p, 30, 6); }
      }
    }
    for (const m of missiles) {
      if (!m.active) { if (m.rb) { rbStop(m.rb); rbStop(m.rf); m.rb = m.rf = null; } continue; }
      m.life -= dt;
      if (assist && !m.decoy && elapsed - flareAt > 1.3 && player.flares > 0 && m.p.distanceTo(player.pos) < 420 && !crashing) deployFlares(m);
      if (m.decoy && m.decoy.life <= 0) { m.active = false; m.o.visible = false; explode(m.p.clone(), 6, 0.4); continue; }
      tA.copy(m.decoy ? m.decoy.p : player.pos).sub(m.p);
      const d = tA.length();
      tA.normalize();
      const kidM = ezv() >= 0.6, sp = Math.min(kidM ? 245 : 320, m.v.length() + dt * (kidM ? 40 : 90));
      { const nn = (L && L.n) || 1, mt = Math.min(1.7, (0.62 + 0.07 * nn) * (kidM ? 0.8 : 1)) * (m.decoy ? 2.6 : 1);
        tB.copy(m.v).normalize(); const ang = tB.angleTo(tA); if (ang > 1e-4) tB.lerp(tA, Math.min(1, mt * dt / ang)).normalize(); }

      m.v.copy(tB).multiplyScalar(sp);
      m.p.addScaledVector(m.v, dt);
      m.o.position.copy(m.p);
      m.o.lookAt(tC.copy(m.p).add(m.v)); m.o.rotateY(Math.PI);
      if (!m.rb) { m.rb = rbStart(EMISS_RB); m.rf = rbStart(FLAME_RB); }
      rbEmit(m.rb, m.p); rbEmit(m.rf, m.p);
      if (false) { m.trail = 0.04; puff(m.p, tB.set((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2), 1.0, 7, 3.6, 0xe4e4e8); puff(m.p, null, 1.8, 11, 5.2, 0xb8bcc4); fx(m.p, null, 3.2, 0.8, 0.12, 0xff7a30, 0, 0); fx(m.p, null, 1.5, 0.4, 0.1, 0xfff0c0, 0, 0); m.o.rotateZ(Math.sin(elapsed * 17) * 0.3); }
      if (d < 30 && m.decoy) { m.active = false; m.o.visible = false; explode(m.p.clone(), 8, 0.5); }
      else if (d < 16) { m.active = false; m.o.visible = false; explode(m.p.clone(), 10, 0.8); { const nn = (L && L.n) || 1; damagePlayer(LIFE * (nn <= 4 ? 1 : nn <= 8 ? 1.5 : 2), "Missile hit!", true); } }
      else if (m.life <= 0 || m.p.y < groundAt(m.p.x, m.p.z)) { m.active = false; m.o.visible = false; puff(m.p, null, 4, 14, 1.5, 0x888888); }
    }
    for (const b of bombs) {
      if (!b.active) { if (b.rb) { rbStop(b.rb); b.rb = null; } continue; }
      b.v.y -= GRAV * dt;
      if (b.target && b.target.alive) {
        // guided: steer the fall so it lands on the locked target (limited fin authority)
        const h = Math.max(1, b.p.y - b.target.pos.y), vy = Math.max(0, -b.v.y);
        const tf = Math.max(0.4, (vy + Math.sqrt(vy * vy + 2 * GRAV * h)) / GRAV);
        tA.set((b.target.pos.x + b.target.vel.x * tf - b.p.x) / tf, 0, (b.target.pos.z + b.target.vel.z * tf - b.p.z) / tf);
        tB.set(tA.x - b.v.x, 0, tA.z - b.v.z);
        const mx = 150 * dt, l = tB.length(); if (l > mx) tB.multiplyScalar(mx / l);
        b.v.x += tB.x; b.v.z += tB.z;
      }
      if (b.glow.visible) b.core.scale.setScalar(1.1 + 0.4 * Math.sin(elapsed * 40 + b.p.x));
      if (!b.rb) b.rb = rbStart(BOMB_RB);
      rbEmit(b.rb, b.p);
      if (false) { b.trail = 0.05; puff(b.p, tB.set((Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2), 0.6, 3.6, 3.2, 0xdadde2); fx(b.p, null, 1.6, 0.4, 0.14, 0xff9a40, 0, 0); }
      b.p.addScaledVector(b.v, dt);
      b.o.position.copy(b.p);
      b.o.lookAt(tA.copy(b.p).add(b.v)); b.o.rotateY(Math.PI);
      const gh = groundAt(b.p.x, b.p.z);
      let near = false;
      for (const t of targets) if (t.alive && !t.submerged && t.kind !== "jet" && t.pos.distanceTo(b.p) < t.radius + 8) { near = true; break; }
      if (WS.kind !== "std" && (b.trail = (b.trail || 0) - dt) <= 0) { b.trail = 0.03; fx(b.p, tB.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 1.6, 0.2, 0.3, WS.fx, 0, 1); }
      if (b.p.y <= gh + 1 || near) {
        b.active = false; b.o.visible = false; b.result = "hit";
        b.p.y = Math.max(b.p.y, gh + 1);
        explode(b.p.clone(), 28, 1.8); shock(b.p.clone(), 120);
        for (let i = 0; i < 10; i++) puff(b.p, tA.set((Math.random() - 0.5) * 60, 8 + Math.random() * 25, (Math.random() - 0.5) * 60), 6, 22, 2.2, 0x6a6258);
        const water = terrain.isWater(b.p.x, b.p.z);
        for (let i = 0; i < 6; i++) puff(b.p, tA.set((Math.random() - 0.5) * 20, 30 + Math.random() * 30, (Math.random() - 0.5) * 20), 4, 12, 1.4, water ? 0xffffff : 0x9a8a6a);
        const before = stats.kills ? Object.values(stats.kills).reduce((a, c) => a + c, 0) : 0;
        blast(b.p, 60, 50);
        const after = Object.values(stats.kills).reduce((a, c) => a + c, 0);
        if (after > before) stats.hits++;
      }
    }
  }

  function updateRings(dt) {
    let next = null, nd = Infinity;
    for (const r of rings) {
      if (r.passed) {
        if (r.popT < 1) { r.popT += dt * 3; r.obj.scale.setScalar(r.r * (1 + r.popT * 0.6)); if (r.popT >= 1) r.obj.visible = false; }
        continue;
      }
      tA.subVectors(player.pos, r.pos);
      const along = tA.dot(r.n);
      const prevAlong = tB.subVectors(tC.copy(player.pos).addScaledVector(player.vel, -dt), r.pos).dot(r.n);
      if (prevAlong < 0 && along >= 0) {
        const radial = tA.addScaledVector(r.n, -along).length();
        if (radial < r.r * 1.15) {
          r.passed = true; stats.rings++;
          audio.lock();
          if (progress.ring != null) {
            const o = L.objectives.find((x) => x.kind === "ring");
            progress.ring = Math.min(o.need, progress.ring + 1);
            score += POINTS.ring;
            events.toast?.(`Ring ${progress.ring}/${o.need}  +${POINTS.ring}`);
            checkDone();
          }
          continue;
        }
      }
      const d = r.pos.distanceTo(player.pos);
      if (d < nd) { nd = d; next = r; }
      r.obj.rotation.z += dt * 0.5;
    }
    rings.next = next;
    // if a ring was missed far behind, move it ahead so the course can always be finished
    if (progress.ring != null && next && nd > 6000) {
      next.pos.copy(player.pos).addScaledVector(fwdFrom(player.yaw, 0, tA), 900);
      next.pos.y = Math.max(groundAt(next.pos.x, next.pos.z) + 150, player.pos.y);
      next.n.copy(fwdFrom(player.yaw, 0, tA));
      next.obj.lookAt(tB.copy(next.pos).add(next.n));
    }
  }

  function updateEffects(dt) {
    let n = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.t += dt;
      if (p.t >= p.life) { puffs.splice(i, 1); continue; }
    }
    for (const p of puffs) {
      const k = p.t / p.life;
      p.p.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 0.8);
      const s = (p.s0 + (p.s1 - p.s0) * Math.sqrt(k)) * (k > 0.75 ? (1 - k) / 0.25 : 1) * Math.min(1, Math.max(0.12, (p.p.distanceTo(camera.position) - 8) / 40));
      _m.compose(p.p, _q.identity(), _s.set(s, s, s));
      puffMesh.setMatrixAt(n, _m);
      _c.setHex(p.color); aCol.setXYZ(n, _c.r, _c.g, _c.b);
      aAlp.setX(n, (p.big ? 0.85 : 0.7) * Math.pow(1 - k, 1.25) * Math.min(1, p.t / 0.07));
      n++;
    }
    puffMesh.count = puffOutline.count = n;
    puffMesh.instanceMatrix.needsUpdate = puffOutline.instanceMatrix.needsUpdate = true;
    aCol.needsUpdate = aAlp.needsUpdate = true;
    for (const d of debris) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { d.active = false; d.g.visible = false; continue; }
      d.v.y -= GRAV * dt;
      d.p.addScaledVector(d.v, dt);
      const gh = groundAt(d.p.x, d.p.z);
      if (d.p.y < gh + 1) { d.p.y = gh + 1; d.v.multiplyScalar(0.45); d.v.y = Math.abs(d.v.y) * 0.5; d.spin.multiplyScalar(0.6); }
      d.g.position.copy(d.p);
      d.g.rotation.x += d.spin.x * dt; d.g.rotation.y += d.spin.y * dt; d.g.rotation.z += d.spin.z * dt;
      if (Math.random() < dt * 14) puff(d.p, null, 1.2, 4, 0.9, 0x55555a);
    }
    { // additive glow particles
      let m = 0;
      for (let i = fxs.length - 1; i >= 0; i--) {
        const f = fxs[i];
        f.t += dt;
        if (f.t >= f.life) { fxs.splice(i, 1); continue; }
      }
      for (const f of fxs) {
        const k = f.t / f.life;
        f.v.y -= f.g * dt; f.v.multiplyScalar(Math.max(0, 1 - f.d * dt));
        f.p.addScaledVector(f.v, dt);
        const nearK = Math.min(1, Math.max(0, (f.p.distanceTo(camera.position) - 16) / 60)); // keep particles that pass the lens from becoming huge blobs
        const sz = (f.s0 + (f.s1 - f.s0) * k) * (0.15 + 0.85 * nearK);
        _m.compose(f.p, _q.identity(), _s.set(sz, sz, sz));
        fxMesh.setMatrixAt(m, _m);
        const fade = Math.pow(1 - k, 1.4);
        if (f.c) _c.copy(f.c); else _c.copy(FIRE0).lerp(FIRE1, Math.min(1, k * 1.4));
        fxMesh.setColorAt(m, _c.multiplyScalar(fade * nearK));
        m++;
      }
      fxMesh.count = m; fxMesh.instanceMatrix.needsUpdate = true; if (fxMesh.instanceColor) fxMesh.instanceColor.needsUpdate = true;
      for (const sh of shocks) {
        if (!sh.active) continue;
        sh.t += dt;
        const k = sh.t / sh.life;
        if (k >= 1) { sh.active = false; sh.m.visible = false; continue; }
        sh.mat.uniforms.uK.value = k;
        sh.m.scale.setScalar(sh.size * (0.15 + 0.85 * (1 - (1 - k) * (1 - k))));
        sh.m.quaternion.copy(camera.quaternion);
      }
    }
    for (const e of explosions) {
      if (!e.active) continue;
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) { e.active = false; e.g.visible = false; continue; }
      const s = e.size * (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) * 0.9);
      e.g.scale.setScalar(Math.max(0.01, s));
      e.mat.color.setHex(k < 0.3 ? 0xfff1a0 : k < 0.6 ? 0xffa030 : 0xff6020);
      e.mat.emissive.setHex(k < 0.4 ? 0xff9a30 : 0xa03010);
    }
  }

  // burning wrecks: smoke columns and flames
  function updateFires(dt) {
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i]; f.t += dt; f.e -= dt;
      if (f.t > f.life) { fires.splice(i, 1); continue; }
      if (f.e <= 0) {
        f.e = 0.1 + f.t / f.life * 0.25;
        puff(tA.copy(f.pos).add(tB.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3)), tC.set((Math.random() - 0.5) * 2, 9 + Math.random() * 5, 0), 4 * f.big, 7, 2.4, f.t < f.life * 0.5 ? 0x1c1a18 : 0x4a4640);
        if (f.t < f.life * 0.6) { for (let q = 0; q < 2; q++) fx(tA.copy(f.pos).add(tB.set((Math.random() - 0.5) * 3 * f.big, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 3 * f.big)), tC.set((Math.random() - 0.5) * 2, 5 + Math.random() * 5, (Math.random() - 0.5) * 2), 2.4 * f.big, 0.6, 0.45 + Math.random() * 0.3, null, -2, 0.5); }
      }
    }
  }

  function countTargets() {
    const c = { air: 0, gnd: 0, sea: 0 };
    for (const t of targets) { if (!t.alive) continue; if (t.kind === "jet") c.air++; else if (t.kind === "ship") c.sea++; else if (t.kind === "tank" || t.kind === "base" || t.kind === "flak" || t.kind === "sam") c.gnd++; }
    return c;
  }
  // ---------- HUD data ----------
  function hudState() {
    return {
      throttle, combo, recover, gload, tier: tierOf(), player, targets, rings, progress, objectives: L?.objectives || [], timeLeft, score, viewMode,
      landingGuide: ops && ["app","final"].includes(ops.mode) ? {x:stripLocal(player.pos).x,dy:player.pos.y-ops.T.y-Math.max(0,(stripLocal(player.pos).z-stripLocal(ops.T).z)*ops.sgn)*.065,carrier:!!ops.carrier} : null,
      critical: criticalUntil ? Math.max(0, criticalUntil - elapsed) : 0,
      lockTarget, lockCand, lockTime, track: trackOn, counts: countTargets(), lives, livesMax: LIVES_MAX, ops: ops ? ops.mode : null, opsK: ops ? { kf: ops.kf || 0, ka: ops.ka || 0 } : null, hasStrip: !!(strip || pad), hull: player ? Math.max(0, player.hp) : 100, fuel: fuelV,  ccip, bombAim: aimPos, bombLocked: !!bombLock, bombKind: bombLock ? bombLock.kind : (selTgt ? selTgt.kind : ""), bombName: bombLock ? kindName(bombLock) : "", bombDist: bombLock ? bombLock.pos.distanceTo(player.pos) : 0, bombSel: !!selTgt, tgtFlash, alert: alertMsg, camera, missiles, half, center, elapsed,
      fwd: player ? fwdFrom(player.yaw, player.pitch, V()) : null,
      heat, overheated, crashing: !!crashing, pad, baseCenters, landingOpen, landing: !!landing, autoGun, rack: RACK, rockets: player ? player.rockets : 0, bombs: player ? player.bombs : 0,
      rocketRefill: player && player.rockets < RACK ? rocketRegen / ROCKET_REGEN : 0, bombRefill: player && player.bombs < RACK ? bombRegen / BOMB_REGEN : 0, rocketCd: Math.max(0, rocketCd), bombCd: Math.max(0, bombCd), endless, allies, lowAlt, maneuver: maneuver ? maneuver.dir : 0,
    };
  }


  // ================= b26: cinematic title show (slow-mo live battle around the hero jet) =================
  const TS = { on: false, t: 0, F: V(), R: 460, hy: 0, A: [], M: [], built: false, hiddenT: [], nextShot: 1.2, nextBlast: 0.6, cam: V(), look: V(), ang: 0, hp: V(), hq: new THREE.Quaternion(), rb: [null, null], shotIdx: 0, fov0: 60 };
  const TSLOW = 0.26;
  const _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _fw = V();
  function tsFrameQ(yaw, bank, pitch, out) { return out.setFromEuler(_eu.set(pitch, yaw, bank, "YXZ")); }
  function tsClear() {
    for (const a of TS.A) scene.remove(a.obj);
    TS.A.length = 0;
    for (const m of TS.M) { scene.remove(m.o); rbStop(m.rb); rbStop(m.rf); }
    TS.M.length = 0;
    for (const r of TS.rb) rbStop(r); TS.rb = [null, null];
    TS.built = false;
  }
  function tsAdd(kind, obj, o = {}) { const a = { kind, obj, alive: true, hide: 0, pos: obj.position, vel: V(), fall: false, ...o }; obj.userData.__a = a; scene.add(obj); TS.A.push(a); return a; }
  function tsBuild() {
    tsClear();
    if (!terrain || !plane) return;
    // 1) a coast: land next to sea, flat land for the tanks
    let best = null, bs = -1e9;
    for (let i = 0; i < 300; i++) {
      const x = center.x + (rng() - 0.5) * half * 1.2, z = center.z + (rng() - 0.5) * half * 1.2;
      if (terrain.isWater(x, z) || Math.abs(x - center.x) > half - 1800 || Math.abs(z - center.z) > half - 1800) continue;
      let w = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (terrain.isWater(x + Math.cos(a) * 950, z + Math.sin(a) * 950)) w++; }
      const h = groundAt(x, z), sl = Math.abs(groundAt(x + 60, z) - h) + Math.abs(groundAt(x, z + 60) - h);
      const sc = (w >= 2 && w <= 5 ? 8 : w > 0 ? 3 : 0) - sl * 0.25 - Math.max(0, h - 300) * 0.02 + rng();
      if (sc > bs) { bs = sc; best = new THREE.Vector3(x, h, z); }
    }
    TS.F.copy(best || center); TS.F.y = groundAt(TS.F.x, TS.F.z);
    const F = TS.F;
    const foe = L.run?.foe;
    // 2) ground battle: tanks (enemy + a few allies), flak
    let n = 0;
    for (let i = 0; i < 9; i++) {
      const c = landSpot(F.x, F.z, 60, 520, 40); if (!c) continue;
      const ally = i % 4 === 3;
      const o = createTank(ally); o.position.copy(c); o.rotation.y = rng() * 6.28; o.scale.multiplyScalar(1.5);
      tsAdd("tank", o, { ally, home: c.clone(), rev: 0 }); n++;
    }
    // sea: warships
    for (let i = 0; i < 2; i++) {
      const c = waterSpot(F.x, F.z, 1500); if (!c) break;
      c.y = groundAt(c.x, c.z) + 0.5;
      const o = createWarship(); o.position.copy(c); o.rotation.y = rng() * 6.28; o.scale.multiplyScalar(1.5);
      tsAdd("ship", o, { home: c.clone(), hdg: o.rotation.y });
    }
    // 3) air: wingman, enemy choppers, enemy jets (formation offsets in the hero frame: x right, y up, z back)
    tsAdd("ally", createAllyJet(), { off: new THREE.Vector3(42, 3, 34), ph: 0.5 });
    tsAdd("ally", createAllyJet(), { off: new THREE.Vector3(-70, 8, 60), ph: 2.2 });
    const hs = [[-110, -30, -210, false], [80, -42, -300, false], [-230, -20, -130, false], [190, -10, -160, true]];
    hs.forEach(([x, y, z, al], i) => tsAdd("heli", createHeli(al), { ally: al, off: new THREE.Vector3(x, y, z), ph: i * 1.7 }));
    for (let i = 0; i < 2; i++) tsAdd("jet", createEnemyJet(foe, FOE_TYPES[foe]), { off: new THREE.Vector3(i ? 150 : -140, 40 + i * 30, -460 - i * 120), ph: i * 3.1 });
    for (const a of TS.A) { a.hp0 = 1; if (a.kind === "jet" || a.kind === "ally") a.obj.userData.burn?.(1.2, 0.4); }
    // hero
    TS.ang = rng() * 6.28; TS.t = 0; TS.nextShot = 1.5; TS.nextBlast = 0.5; TS.shotIdx = 0;
    TS.rb = [null, null];
    TS.built = true;
  }
  function tsHeroPose(t) {
    const F = TS.F, ang = TS.ang + t * (0.074);
    const x = F.x + Math.cos(ang) * TS.R, z = F.z + Math.sin(ang) * TS.R;
    let gy = -1e9; for (const [dx, dz] of [[0, 0], [250, 0], [-250, 0], [0, 250], [0, -250]]) gy = Math.max(gy, groundAt(x + dx, z + dz));
    const y = Math.max(gy + 150, F.y + 200) + Math.sin(t * 0.33) * 14;
    const yaw = Math.atan2(Math.sin(ang), -Math.cos(ang)) + Math.PI; // tangent of a counter-clockwise circle (heading is -z at yaw 0)
    return { x, y, z, yaw: -(ang + Math.PI / 2) + Math.PI + Math.PI };
  }
  function tsRel(off, out) { return out.copy(off).applyQuaternion(TS.hq).add(TS.hp); }
  function tsLaunch(from, target, speed = 230) {
    const m = TS.M.find((x) => !x.on) || (() => { const o = createRocket(0xe6e9ec, 0x2b3036); o.scale.setScalar(2.6); o.visible = false; scene.add(o); const q = { o, on: false, p: V(), v: V(), tg: null, t: 0, rb: null, rf: null }; TS.M.push(q); return q; })();
    m.on = true; m.o.visible = true; m.p.copy(from); m.tg = target; m.t = 0; m.sp = speed;
    tA.subVectors(target.position, from).normalize();
    m.v.copy(tA).multiplyScalar(speed * 0.6); m.v.y += speed * 0.35; m.v.x += (Math.random() - 0.5) * speed * 0.35; m.v.z += (Math.random() - 0.5) * speed * 0.35;
    m.rb = rbStart(SMOKE_RB); m.rf = rbStart(FLAME_RB);
    fx(from, null, 5, 9, 0.5, 0xffd890, 0, 0); puff(from, null, 3, 10, 2.2, 0xcfcfcf);
    // Title launch is visual only; menu music remains audible.
    return m;
  }
  function tsHit(a, p) {
    if (!a.alive) return;
    if (a.kind === "heli" || a.kind === "jet") {
      explode(p, a.kind === "jet" ? 16 : 20, 1);
      a.fall = true; a.fallT = 0; a.vel.copy(tsFwd(a)).multiplyScalar(a.kind === "jet" ? 55 : 22); a.vel.y = 4; a.spin = (Math.random() - 0.5) * 3.2; a.alive = false;
      a.rbf = rbStart(EMISS_RB);
    } else if (a.kind === "tank") {
      explode(p, 15, 1); a.alive = false; a.rev = 28; fires.push({ pos: a.pos.clone(), t: 0, life: 40, e: 0, big: 1.4 });
      a.obj.traverse((m) => { if (m.isMesh && m.material && m.material.color && !m.userData.__d) { m.userData.__d = 1; m.material = m.material.clone(); m.material.color.multiplyScalar(0.18); } });
    } else if (a.kind === "ship") {
      explode(p, 24, 1.5); fires.push({ pos: p.clone(), t: 0, life: 30, e: 0, big: 2 });
    }
  }
  const tsFwd = (a) => _fw.set(0, 0, -1).applyQuaternion(a.obj.quaternion).clone();
  function tsUpdate(dtr) {
    const dt = dtr * TSLOW;
    TS.t += dt;
    const t = TS.t, hp = tsHeroPose(t);
    // hero: banked orbit, nose a touch up, twin afterburners
    const ang = TS.ang + t * 0.074;
    const yaw = Math.PI - ang;
    TS.hp.set(hp.x, hp.y, hp.z);
    tsFrameQ(yaw, -0.32 + Math.sin(t * 0.5) * 0.06, 0.07, TS.hq);
    plane.position.copy(TS.hp); plane.quaternion.copy(TS.hq); plane.scale.setScalar(1.15); plane.visible = true; plane.userData.setGear?.(0);
    plane.userData.burn?.(1.5 + Math.sin(t * 9) * 0.07, 1.0);
    if (blobSh) blobSh.visible = false;
    // afterburner light streaks
    for (let i = 0; i < 2; i++) {
      if (!TS.rb[i]) TS.rb[i] = rbStart({ life: 0.5, w0: 0.5, w1: 0.05, r: 1, g: 0.55, b: 0.2, a: 0.9, add: true, fade: 0.9 });
      rbEmit(TS.rb[i], tA.set((i ? 1 : -1) * 0.9 * 1.15, 0, 8.2 * 1.15).applyQuaternion(TS.hq).add(TS.hp));
    }
    // formation actors
    for (const a of TS.A) {
      const o = a.obj;
      if (a.kind === "ally" || a.kind === "heli" || a.kind === "jet") {
        if (a.fall) {
          a.fallT += dt; a.vel.y -= GRAV * 1.3 * dt; a.pos.addScaledVector(a.vel, dt);
          o.rotation.z += a.spin * dt; o.rotation.x -= 0.5 * dt;
          rbEmit(a.rbf, o.position);
          if (Math.random() < dt * 40) fx(o.position, null, 6, 2, 0.5, 0xff8a30, 0, 1);
          if (a.kind === "heli") o.userData.rotor.rotation.y += 9 * dtr;
          const gh = groundAt(a.pos.x, a.pos.z);
          if (a.pos.y < gh + 4 || a.fallT > 7) { explode(tA.set(a.pos.x, Math.max(gh, a.pos.y), a.pos.z), 22, 1.5); fires.push({ pos: tA.clone(), t: 0, life: 26, e: 0, big: 1.4 }); o.visible = false; a.fall = false; a.hide = 7 + Math.random() * 3; rbStop(a.rbf); }
          continue;
        }
        if (!a.alive) {
          a.hide -= dt;
          if (a.hide <= 0) { a.alive = true; o.visible = true; o.rotation.set(0, 0, 0); a.ph += 2; }
          else continue;
        }
        const w = a.ph + t * (a.kind === "jet" ? 0.5 : 0.9);
        const off = tB.copy(a.off); off.x += Math.sin(w) * (a.kind === "jet" ? 90 : 26); off.y += Math.sin(w * 1.3) * 10; off.z += Math.cos(w * 0.7) * (a.kind === "jet" ? 60 : 18);
        tsRel(off, o.position);
        const wob = Math.cos(w) * (a.kind === "jet" ? 0.6 : 0.16);
        tsFrameQ(yaw + (a.kind === "jet" ? Math.cos(w) * 0.25 : a.kind === "heli" ? 0.5 + Math.sin(w) * 0.4 : 0), -0.3 + wob * -1, a.kind === "heli" ? -0.06 : 0.05, o.quaternion);
        if (a.kind === "heli") { o.userData.rotor.rotation.y += 11 * dtr; o.userData.tail.rotation.x += 14 * dtr; }
        else o.userData.burn?.(1.1 + Math.sin(t * 8 + a.ph) * 0.06, 0.4);
      } else if (a.kind === "tank") {
        if (!a.alive && a.rev > 0) { a.rev -= dt; if (a.rev <= 0) { a.alive = true; a.obj.traverse((m) => { if (m.userData.__d) { m.userData.__d = 0; m.material.color.multiplyScalar(1 / 0.18); } }); } }
      } else if (a.kind === "ship") {
        a.pos.x += Math.sin(a.hdg) * 3 * dt; a.pos.z += Math.cos(a.hdg) * 3 * dt; o.rotation.y = a.hdg + Math.PI;
      }
    }
    // missile salvos
    TS.nextShot -= dt;
    if (TS.nextShot <= 0) {
      TS.nextShot = 1.1 + Math.random() * 1.1;
      const foes = TS.A.filter((a) => a.alive && !a.fall && !a.ally && (a.kind === "heli" || a.kind === "jet" || a.kind === "tank" || a.kind === "ship"));
      const shooters = TS.A.filter((a) => a.alive && !a.fall && (a.kind === "ally" || (a.kind === "heli" && a.ally) || (a.kind === "tank" && a.ally)));
      const tgt = foes[Math.floor(Math.random() * foes.length)];
      const heroShot = TS.shotIdx++ % 2 === 0;
      if (tgt) {
        if (heroShot) { const side = TS.shotIdx % 4 < 2 ? 1 : -1; tsLaunch(tA.set(side * 4.2, -1.2, -1).applyQuaternion(TS.hq).add(TS.hp), tgt.obj, 250); }
        else if (shooters.length) { const s = shooters[Math.floor(Math.random() * shooters.length)]; tsLaunch(tB.copy(s.obj.position).add(tA.set(0, 4, 0)), tgt.obj, 220); }
      }
      // an enemy chopper fires back at the ground
      if (Math.random() < 0.55) {
        const eh = TS.A.filter((a) => a.kind === "heli" && !a.ally && a.alive && !a.fall)[0], gt = TS.A.filter((a) => a.kind === "tank" && a.alive && a.ally)[0];
        if (eh && gt) tsLaunch(tB.copy(eh.obj.position), gt.obj, 190);
      }
    }
    // missiles in flight
    for (const m of TS.M) {
      if (!m.on) continue;
      m.t += dt;
      const tg = m.tg, d = tA.subVectors(tg.position, m.p), dist = d.length();
      const want = d.normalize().multiplyScalar(m.sp), k = Math.min(1, dt * 2.6);
      m.v.lerp(want, k); m.v.setLength(m.sp * Math.min(1, 0.4 + m.t * 0.9));
      m.p.addScaledVector(m.v, dt);
      m.o.position.copy(m.p); m.o.quaternion.setFromUnitVectors(tB.set(0, 0, -1), tC.copy(m.v).normalize());
      rbEmit(m.rb, m.p); rbEmit(m.rf, m.p);
      if (dist < 16 + m.sp * dt || m.t > 9) {
        m.on = false; m.o.visible = false; rbStop(m.rb); rbStop(m.rf);
        const a = tg.userData.__a; if (a && a.alive) tsHit(a, tg.position); else explode(m.p, 10, 0.5);
      }
    }
    // constant ground fighting: shells and rocket hits around the tank cluster
    TS.nextBlast -= dt;
    if (TS.nextBlast <= 0) {
      TS.nextBlast = 0.5 + Math.random() * 0.8;
      const tk = TS.A.filter((a) => a.kind === "tank"), a = tk[Math.floor(Math.random() * tk.length)];
      if (a) { tA.copy(a.home).add(tB.set((Math.random() - 0.5) * 140, 0, (Math.random() - 0.5) * 140)); tA.y = groundAt(tA.x, tA.z) + 2; explode(tA, 7 + Math.random() * 9, Math.random() < 0.4 ? 1 : 0); }
    }
    updateFires(dt); updateEffects(dt); rbUpdate(dt);
    if (boomLight.intensity > 0.5) boomLight.intensity *= Math.exp(-dt * 4.5); else if (boomLight.intensity) boomLight.intensity = 0;
    sky.update(dt, camera.position, tA.set(0, 0, 0));
    // ---- cinematic camera: slow drift between three shots around the hero ----
    const SH = [[158, 15, 38, 1], [-150, 11, 36, 1], [58, 8, 34, 1], [-40, 6, 32, 1]];
    const per = 26, sI = Math.floor(t / per) % SH.length, f = (t / per) % 1, sm = f < 0.82 ? 0 : (f - 0.82) / 0.18, e = sm * sm * (3 - 2 * sm);
    const A0 = SH[sI], A1 = SH[(sI + 1) % SH.length];
    const az = (A0[0] + (A1[0] - A0[0]) * e + Math.sin(t * 0.35) * 10) * Math.PI / 180, el = (A0[1] + (A1[1] - A0[1]) * e + Math.sin(t * 0.21) * 3) * Math.PI / 180;
    let dist = A0[2] + (A1[2] - A0[2]) * e; const asp = innerWidth / innerHeight; if (asp < 1) dist *= 1.0 + (1 - asp) * 0.8;
    tA.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(dist).applyQuaternion(TS.hq).add(TS.hp);
    TS.cam.lerp(tA, TS.camInit ? Math.min(1, dtr * 2.4) : 1); TS.camInit = true;
    camera.position.copy(TS.cam);
    tB.set(0, -3, -10).applyQuaternion(TS.hq).add(TS.hp);
    TS.look.lerp(tB, Math.min(1, dtr * 3));
    camera.up.set(0, 1, 0); camera.lookAt(TS.look); camera.fov = 52; camera.aspect = innerWidth / innerHeight;
    camera.setViewOffset(innerWidth, innerHeight, 0, -innerHeight * (innerWidth > innerHeight ? 0.13 : 0.1), innerWidth, innerHeight); camera.updateProjectionMatrix();
    camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + 8);
  }
  function titleOn() {
    if (TS.on) return;
    TS.on = true; TS.camInit = false;
    for (const t of targets) { t.obj.visible = false; }
    for (const a of allies) a.obj.visible = false;
    if (pad) pad.obj.visible = false;
    tsBuild();
  }
  function titleOff() {
    if (!TS.on) return;
    TS.on = false; tsClear();
    for (const t of targets) { if (t.alive) t.obj.visible = true; }
    for (const a of allies) a.obj.visible = true;
    if (pad) pad.obj.visible = true;
    camera.fov = 60; camera.clearViewOffset(); camera.updateProjectionMatrix();
    if (player && plane) { plane.scale.setScalar(1.15); updatePlaneTransform(); snapCamera(); }
    for (const e of explosions) { e.active = false; e.g.visible = false; }
    fxs.length = 0; puffs.length = 0; rbClear(); boomLight.intensity = 0;
  }
  function titleFrame(dtr) {
    if (!TS.on) titleOn();
    if (!TS.built) { render(); return; }
    tsUpdate(Math.min(dtr, 0.05));
    render();
  }

  let post = null, postTried = false; const _hz = new THREE.Vector3(), _pp = new THREE.Vector3();
  function render() {
    outlineUniforms.uRes.value.set(innerWidth, innerHeight);
    if (!postTried) { postTried = true; try { post = /[?&]nopost/.test(location.search) ? null : createPost(renderer, { hi: FXQ.hi }); } catch (e) { post = null; } }
    if (post) {
      const p = { time: elapsed, sunDir: FXQ.sunDir.value, bloom: 0.32, vig: 0.5, thr: 1.0 };
      const sp = player ? player.speed : 150;
      p.blur = player ? THREE.MathUtils.clamp((sp - 150) / 110, 0, 1) * 0.55 + (controls.boost() ? 0.15 : 0) : 0;
      if (player && plane && viewMode === "chase" && !crashing) {
        post.project(tA.set(0, 0, 9).applyMatrix4(plane.matrixWorld), camera, _hz);
        if (_hz.z < 1) p.haze = { x: _hz.x, y: _hz.y, z: 0.5 + (controls.boost() ? 0.7 : 0) };
      }
      if (inCloud > 0.02) { p.white = Math.min(0.88, inCloud * 1.15); p.whiteCol = sky.cloudColor(); }
      p.hurt = player ? Math.max(0, 1 - (elapsed - lastDamage) / 0.45) * 0.5 : 0;
      p.nv = !!window.__nv && viewMode === "cockpit" && !crashing;
      if (renderer.toneMapping === THREE.NoToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
      post.render(scene, camera, p);
    } else renderer.render(scene, camera);
    renderWeaponCam();
  }

  return {
    scene, camera, load, update, render, hudState, titleFrame, titleOff, advance(sec) { const n = Math.round(sec / 0.04); for (let i = 0; i < n; i++) update(0.04); }, titleAdvance(sec) { if (!TS.on) titleOn(); const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) tsUpdate(0.05); }, attachWeaponCam, runLabel,
    /** seconds > 0 = mission countdown; 0 / null = endless (timer counts up) */
    weather: () => (sky.state ? sky.state().weather : "clear"), cloudIn: () => inCloud,
    lockNearest, tapSelect, cycleTgt, killCount: () => Object.values(stats.kills).reduce((a, c) => a + c, 0), skillInfo: () => ({ skill, tier: tierOf() }),
    setThrottle(v) { throttle = Math.max(0, Math.min(1, v)); },
    getThrottle: () => throttle,
    snapshot() {
      if (!player || crashing) return null;
      const nj = targets.filter((t) => t.kind !== "jet");
      return { p: [player.pos.x, player.pos.y, player.pos.z], q: [player.q.x, player.q.y, player.q.z, player.q.w], sp: player.speed, hp: player.hp, rk: player.rockets, bb: player.bombs, thr: throttle,
        dead: nj.map((t, i) => (t.alive ? -1 : i)).filter((i) => i >= 0), prog: { ...progress }, score, combo, lives, flares:player.flares, fuel:fuelV };
    },
    restoreSnap(sn) {
      if (!sn || !player) return;
      const nj = targets.filter((t) => t.kind !== "jet");
      for (const i of sn.dead || []) { const t = nj[i]; if (t && t.alive) { t.alive = false; t.hp = 0; scene.remove(t.obj); } }
      Object.assign(progress, sn.prog || {});
      lives = Math.max(1, Math.min(5, sn.lives ?? lives)); player.flares = sn.flares ?? 12; fuelV = sn.fuel ?? 1;
      if (jetSpawner) { const quota = L.objectives.find(o => o.kind === "jet")?.need || 0; jetSpawner.remaining = Math.max(0, quota - (progress.jet || 0)); }
      ops = null; camCut = null; gearAnim = gearWant = 0; plane.userData.setGear?.(0);
      player.pos.set(...sn.p); player.q.set(...sn.q); player.q.normalize(); player.speed = sn.sp || 150; player.hp = sn.hp ?? 100; player.rockets = sn.rk ?? player.rockets; player.bombs = sn.bb ?? player.bombs;
      throttle = sn.thr ?? throttle; syncAngles(); player.vel.set(0, 0, -1).applyQuaternion(player.q).multiplyScalar(player.speed); updatePlaneTransform(); invulnUntil = elapsed + 3; snapCamera();
    },
    takeoff, autoLand: () => startLanding(true), opsMode: () => (ops ? ops.mode : null), fuel: () => fuelV, setFuel: (v) => { fuelV = v; },
    setTime(sec) { endless = !sec; timeLeft = sec || 0; },
    setAssist(v) { assist = !!v; aP = aR = 0; try { localStorage.setItem("jet-assist", assist ? "1" : "0"); } catch { /* ignore */ } },
    assistOn() { return assist; },
    setScore(v) { score = Math.max(0, v | 0); },
    start() { running = true; ended = false; controls.setEnabled(true); audio.startEngine(); },
    pause() { running = false; },
    resume() { if (!ended) running = true; },
    running: () => running,
    ended: () => ended,
    setView, view: () => viewMode,
    quit() { audio.seeker?.(false); audio.rwrLock?.(false); running = false; ended = true; controls.setEnabled(false); audio.stopEngine(); },
    level: () => L,
    debug: () => ({ lowAlt, player, maneuver, crashing, heat, overheated, stats, timeLeft, camUp: camera.up.clone(), camPos: camera.position.clone(), groundBelow: player ? groundAt(player.pos.x, player.pos.z) : 0 }),
    loop: (d) => startLoop(d),
    roll: (d) => startRoll(d),
    eject() { if (criticalUntil > elapsed) startEject(); },
    ejectNow() { if (running && !crashing && !ops && player && player.pos.y - groundAt(player.pos.x, player.pos.z) > 15) startEject(); },   // b30: seat handles, any time in the air
    stats: () => stats,
    dbg: { liveTargets: () => targets, hitTarget: (t,n,by="gun") => damageTarget(t,n,by), hurtPlayer: (n) => damagePlayer(n, "Test impact", true), facility: () => ({ carrier:!!ops?.carrier, mode:ops?.mode, runway:strip?.pos.toArray(), pad:pad?.pos.toArray() }), skipOps: () => { ops = null; camCut = null; gearAnim = gearWant = 0; plane.userData.setGear?.(0); player.speed = 150; player.pos.y = groundAt(player.pos.x, player.pos.z) + 320; opsHud(); snapCamera(); }, eject: () => startEject(), lives: () => lives, crashT: () => (crashing ? +crashing.t.toFixed(2) : null), setLives: (n) => { lives = n; }, flares: () => flares.map((f) => ({ p: f.p.toArray().map(Math.round), life: +f.life.toFixed(2), sc: f.spr.scale.x, op: f.spr.material.opacity, vis: f.spr.visible })), cam: () => camera.position.toArray().map(Math.round), spawnJet: () => spawnJet(player.pos), rk, setLevelN: (n) => { if (L) L.n = n; }, lockClear: () => { lockTarget = null; }, sky, wsp: () => { const c = waterSpot(center.x, center.z, half * 0.6); return [half, center.x, center.z, terrain.isWater(center.x, center.z), c && [c.x, c.z]]; }, tg: () => targets.map((t) => ({ kind: t.kind, sea: t.sea, alive: t.alive })), selTgt: () => selTgt && selTgt.kind, wcState: () => WC.state, fire: () => fireRocket(), flareN: () => flares.length, spawnMissile: () => { const m = missiles.find((x) => !x.active); if (!m) return false; m.active = true; m.life = 12; m.decoy = null; m.p.copy(player.pos).addScaledVector(fwdFrom(player.yaw, 0, V()), -900); m.p.y += 30; m.v.copy(player.vel).setLength(260); m.o.visible = true; return true; }, missilesLive: () => missiles.filter((x) => x.active).length, setG: (v) => { dbgG = v; }, setCam: (f) => { dbgCam = f; }, rockets: () => rockets.filter((r) => r.active).map((r) => ({ p: r.p.clone(), v: r.v.clone() })), tips: () => { const u = plane.userData; return [u.navL, u.navR].map((n) => n.getWorldPosition(new THREE.Vector3())); }, plane: () => plane, fl: () => ({ t: elapsed, pitch: player.pitch, bank: player.bank, speed: player.speed, y: player.pos.y, agl: player.pos.y - groundAt(player.pos.x, player.pos.z), hp: player.hp, yaw: player.yaw, crashing }), jets: () => targets.filter((t) => t.kind === "jet" && t.alive).map((t) => { const f = fwdFrom(player.yaw, 0, V()); const d = tA.subVectors(t.pos, player.pos); return { mode: t.mode, dist: Math.round(d.length()), ahead: Math.round(d.dot(f)), side: Math.round(d.x * f.z - d.z * f.x), sp: Math.round(t.speed) }; }), warpAt: (t, d) => { player.pos.set(t.pos.x, t.pos.y + d * 0.12 + 20, t.pos.z + d); player.q.setFromEuler(new THREE.Euler(-0.1, 0, 0, "YXZ")); return true; }, inCloud: () => inCloud, agl: () => player.pos.y - groundAt(player.pos.x, player.pos.z), warpNear: (kinds) => { const c = targets.filter((t) => t.alive && kinds.includes(t.kind)).sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos))[0]; if (!c) return false; player.pos.set(c.pos.x, c.pos.y + 340, c.pos.z + 700); player.q.setFromEuler(new THREE.Euler(-0.3, 0, 0, "YXZ")); return true; }, hurtAlly: () => { const a = allies.find((x) => x.alive); if (a) friendlyHit(a, 1, 250); return !!a; }, killNear: (n) => targets.filter((t) => t.alive).sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos)).slice(0, n).forEach((t) => kill(t)), hardState: () => ({ idx: hardIdx, rockets: player.rockets, live: rockets.filter((r) => r.active).map((r) => r.hp), wc: WC.state, world: L.run ? runLabel(L.run) : "" }), finish: (r) => finish(r), targets, allies, bullets, damageAlly: (a, n) => damageAlly(a, n), get player() { return player; }, get pad() { return pad; }, fxCount: () => fxs.length, openLanding() { landingOpen = true; }, explodeAt: (p, s, b) => explode(p, s, b), get landing() { return !!landing; }, get progress() { return progress; } },
  };
}
