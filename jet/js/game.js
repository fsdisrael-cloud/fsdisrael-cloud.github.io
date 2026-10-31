// Ubu game world: flight model, camera, targets, AI, weapons, effects, objectives.
import * as THREE from "three";
import { buildTerrain } from "./terrain.js?v=15";
import { createSky } from "./sky.js?v=15";
import { createPlayerJet, setCockpitMode, createEnemyJet, createAllyJet, createTank, createJeep, createAlienWalker, createAlienTurret, createAlienSpire, createHive, createShip, createSamSite, createRocket, createBomb, puffGeometry, initEnv, createCarrier, CARRIER, createBaseBuilding, createFlakGun, HARDPOINTS, setTargetStyle, glowSprite } from "./models.js?v=15";
import { JET_TYPES, FOE_TYPES, SEASONS, runLabel } from "./variety.js?v=15";
import { createRing, createBalloon, createPracticeTarget, createDrone } from "./entities.js?v=15";
import { toonMaterial, outlineMaterial, toonModel, PartBuilder, G, outlineUniforms } from "./toon.js?v=15";
import { POINTS, LABEL, LABEL1, mulberry32 } from "./missions.js?v=15";
import { setQuality } from "./tex.js?v=15";
import { style, patchTerrain, waveAt, createDreamShapes, onStyle } from "./surreal.js?v=15";

const V = () => new THREE.Vector3();
const tA = V(), tB = V(), tC = V(), tD = V();
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
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 32000);
  const sky = createSky(scene, renderer);
  sky.setThunderHandler(() => audio.thunder());

  let terrain = null, L = null, rng = Math.random;
  let player = null, plane = null;
  const targets = [];
  const rings = [];
  let jetSpawner = null;
  let viewMode = "chase";
  let running = false, ended = false;
  let timeLeft = 180, elapsed = 0, score = 0;
  const progress = {};
  const stats = { shots: 0, hits: 0, rockets: 0, bombs: 0, kills: {}, rings: 0, damage: 0, crashes: 0, loops: 0 };
  let alienT = false, throttle = 0.35, combo = 0, lastKillT = -99, waveT = 0; const fires = [];
  let lastDamage = -10, shake = 0, lockTarget = null, lockTime = 0, lockCand = null;
  let alertMsg = null, alertTimer = 0, warnTimer = 0, pullUpTimer = 0, lastYaw = 0, orbitAccum = 0;
  let hardIdx = 0; const hpReload = [0, 0, 0, 0]; let ccip = null, muzzleFlip = 0, gunCool = 0, rocketRegen = 0, bombRegen = 0, rocketSide = 1;
  // weapon racks: 10 missiles + 10 bombs, one round is restored every N seconds; short delay between launches.
  const RACK = 10, ROCKET_REGEN = 2.6, BOMB_REGEN = 4.5, ROCKET_GAP = 0.28, BOMB_GAP = 0.45;
  let rocketCd = 0, bombCd = 0, emptyT = 0;
  // gun heat: fills in ~4 s of firing, overheats at 100%, must cool below 30% before firing again
  const HEAT_UP = 4, HEAT_DOWN = 2.5, HEAT_RESUME = 0.3;
  const MAX_BANK = 1.2; // rad: roll is limited (no barrel rolls)
  let endless = false;
  const allies = [];
  let half = 10000, center = new THREE.Vector3();
  // full 6-DOF attitude (quaternion), loop autopilot, crash + respawn, gun heat
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
  const fxMesh = new THREE.InstancedMesh(G.sphereLo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), FX);
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
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshToonMaterial({ color: 0xffc040, emissive: 0xff7a20, emissiveIntensity: 0.6, gradientMap: toonMaterial().gradientMap });
    const geo = new PartBuilder().add(G.sphere, 0xffffff).build();
    const g = toonModel(geo, { material: mat, outlineScale: 1.1 });
    g.visible = false; scene.add(g);
    explosions.push({ g, mat, t: 0, life: 1, size: 10, active: false });
  }
  const debris = [];
  {
    const parts = [[G.box, 0x6d7480], [G.sphereLo, 0x3b3f46], [G.box, 0x9aa3ad], [G.cone, 0xf2c94c]];
    for (let i = 0; i < 16; i++) {
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

  // ---------- effects ----------
  function puff(p, v, s0, s1, life, color, big) {
    if (puffs.length >= PUFFS) puffs.shift();
    puffs.push({ p: p.clone(), v: v ? v.clone() : V(), s0, s1, life, t: 0, color, big });
  }
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
    const e = explosions.find((x) => !x.active) || explosions[0];
    e.active = true; e.t = 0; e.life = 0.55 + big * 0.2; e.size = size * 0.8; e.g.visible = true; e.g.position.copy(p);
    const std = WS.kind === "std";
    // fireball (additive; hot white-yellow core cooling to orange-red). Alien worlds: energy colour instead.
    const nf = Math.round(8 + big * 6);
    for (let i = 0; i < nf; i++) {
      tA.set(rng() - 0.5, rng() * 0.8 - 0.05, rng() - 0.5).normalize().multiplyScalar(size * (0.5 + rng() * 2.2));
      fx(tB.copy(p).addScaledVector(tA, 0.1), tA, size * 0.55, size * (1.0 + rng() * 0.9), 0.45 + rng() * 0.6, std ? null : (rng() < 0.4 ? 0xffffff : WS.fx), -3, 1.8);
    }
    // embers / sparks: glowing orange streaks that fall (alien: bright electric arcs)
    const ns = Math.round(14 + big * 10);
    for (let i = 0; i < ns; i++) {
      tA.set(rng() - 0.5, rng() * 0.9, rng() - 0.5).normalize().multiplyScalar(size * (3 + rng() * 6));
      fx(p, tA, Math.max(0.45, size * 0.06), 0.1, 0.5 + rng() * 0.9, std ? (rng() < 0.5 ? 0xffb040 : 0xff6a20) : (rng() < 0.5 ? 0xffffff : WS.fx), GRAV * 0.6, 0.5);
    }
    fx(p, null, size * 2.4, size * 3.4, 0.12, std ? 0xb8a070 : WS.fx, 0, 0); // flash
    shock(p, size * (2.6 + big * 0.8));
    if (!std) { shock(p, size * (1.6 + big * 0.4)); for (let i = 0; i < 6; i++) { tA.set(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize().multiplyScalar(size * (6 + rng() * 6)); fx(p, tA, size * 0.12, 0.05, 0.25, 0xffffff, 0, 2); } }
    // smoke: dark billowing plume that climbs and lingers (std worlds only; alien energy bursts leave a faint haze)
    const sm = std ? 6 + big * 4 : 2;
    for (let i = 0; i < sm; i++) {
      tA.set(rng() - 0.5, 0.2 + rng() * 0.9, rng() - 0.5).multiplyScalar(size * 1.4);
      tA.y += size * (0.5 + big * 0.4);
      puff(tB.copy(p).add(tA.clone().multiplyScalar(0.25)), tA.multiplyScalar(0.55), size * 0.45, size * (1.0 + rng() * 0.8), std ? 3.4 + rng() * 3 : 1.6, std ? (rng() < 0.55 ? 0x26262a : rng() < 0.6 ? 0x4a4a50 : 0x7b6a58) : WS.fx, true);
    }
    if (big >= 1) spawnDebris(p, 4 + Math.round(big * 3), size * 3.2);
    const d = camera.position.distanceTo(p);
    audio.explosion(big, d);
    if (d < 1100) { shake = Math.max(shake, Math.min(2.2, (1 - d / 1100) * (0.8 + big * 0.7))); }
    if (d < 500 * (0.5 + big * 0.4)) events.onBoom?.(Math.min(1, (1 - d / 600) * (0.4 + big * 0.3)));
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
  function waterSpot(cx, cz, rMax) {
    for (let i = 0; i < 260; i++) {
      const a = rng() * Math.PI * 2, r = 300 + rng() * rMax;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x - center.x) > half - 400 || Math.abs(z - center.z) > half - 400) continue;
      let ok = true;
      for (const [dx, dz] of [[0, 0], [120, 0], [-120, 0], [0, 120], [0, -120]]) if (!terrain.isWater(x + dx, z + dz)) { ok = false; break; }
      if (ok) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  function addTarget(kind, obj, pos, extra = {}) {
    obj.position.copy(pos);
    scene.add(obj);
    const t = { kind, obj, pos: obj.position, vel: V(), hp: HP[kind] || 5, alive: true, radius: obj.userData.radius || 10, objective: progress[kind] != null, heading: rng() * Math.PI * 2, cool: 2 + rng() * 4, t: rng() * 10, ...extra };
    targets.push(t);
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
        const q = landSpot(zoneC.x, zoneC.z, 400, 4200, 20);
        if (!q) continue;
        let flat = true;
        for (const [dx, dz] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) if (Math.abs(groundAt(q.x + dx, q.z + dz) - q.y) > 9) { flat = false; break; }
        if (flat) c = q;
      }
      if (!c) continue;
      baseCenters.push(c);
      const n = Math.min(count - placed, 4 + Math.floor(rng() * 2));
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + rng() * 0.4, r = 26 + rng() * 22;
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
        const c = nearBase(80, 700) || landSpot(zoneC.x, zoneC.z, 300, 3200);
        if (!c) continue;
        const hd = rng() * Math.PI * 2;
        for (let j = 0; j < 3 && i < count; j++, i++) {
          const p = c.clone().add(new THREE.Vector3(Math.sin(hd) * j * 40, 0, Math.cos(hd) * j * 40));
          p.y = groundAt(p.x, p.z);
          const jp = rng() < 0.4;
          const t = addTarget("tank", alienT ? createAlienWalker(jp) : jp ? createJeep() : createTank(), p, { heading: hd });
          t.speed = jp ? 6 + rng() * 4 : 3 + rng() * 3; placed++;
        }
      }
      return placed;
    }
    if (kind === "flak" || kind === "sam") {
      for (let i = 0; i < count; i++) {
        const p = nearBase(50, 520) || landSpot(zoneC.x, zoneC.z, 500, 3800);
        if (!p) continue;
        addTarget(kind, alienT ? (kind === "flak" ? createAlienTurret() : createAlienSpire()) : kind === "flak" ? createFlakGun() : createSamSite(), p); placed++;
      }
      return placed;
    }
    return 0;
  }
  // aircraft carrier: a friendly landing deck on open water
  let pad = null, landingOpen = false, landing = null;
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

  function spawnJet(near) {
    const a = rng() * Math.PI * 2, r = 2600 + rng() * 1400;
    const p = new THREE.Vector3(near.x + Math.cos(a) * r, 0, near.z + Math.sin(a) * r);
    p.x = THREE.MathUtils.clamp(p.x, center.x - half + 800, center.x + half - 800);
    p.z = THREE.MathUtils.clamp(p.z, center.z - half + 800, center.z + half - 800);
    p.y = Math.max(groundAt(p.x, p.z) + 400, near.y + (rng() - 0.5) * 200);
    const t = addTarget("jet", createEnemyJet(L.run?.foe, FOE_TYPES[L.run?.foe]), p, { yaw: Math.atan2(-(near.x - p.x), -(near.z - p.z)), pitch: 0, bank: 0, speed: 150 + L.difficulty * 60, burst: 0, mcool: 6 + rng() * 5 });
    t.objective = progress.jet != null;
    return t;
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
      speedT = 215;
    } else {
      fwdFrom(player.yaw, 0, tD);
      goal = tB.copy(player.pos).addScaledVector(tD, 380).addScaledVector(tA.set(tD.z, 0, -tD.x), a.slot * 150);
      goal.y = player.pos.y + 10;
      dist = goal.distanceTo(a.pos);
      speedT = THREE.MathUtils.clamp(player.speed + (dist - 120) * 0.5, 130, 270);
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
    setQuality(opts.quality); for (const m of terrain.materials) patchTerrain(m);
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
    player = { pos: sp, vel: V(), q: new THREE.Quaternion(), yaw: 0, pitch: 0, bank: 0, inverted: false, speed: 190, hp: 100, rockets: RACK, bombs: RACK, boost: 0 };
    rocketCd = bombCd = 0; rocketRegen = bombRegen = 0; maneuver = null; crashing = null; invulnUntil = 0; heat = 0; overheated = false; lowAlt = false; voiceT = 0;
    landing = null; landingOpen = false; pad = null; baseCenters.length = 0;
    plane.visible = true;
    const zone = new THREE.Vector3(center.x, 0, center.z - 1800);

    // army bases first, then the units that defend them
    const g = level.ground;
    spawnBases(g.base || 0, zone);
    spawnGround("tank", g.tank || 0, zone);
    spawnGround("flak", g.flak || 0, zone);
    spawnGround("sam", g.sam || 0, zone);
    for (const o of level.objectives) {
      if (o.kind === "land" || o.kind === "jet") continue;
      const have = targets.filter((t) => t.kind === o.kind).length;
      if (have < o.need) { o.need = Math.max(1, have); o.label = o.label.replace(/\d+/, String(o.need)); }
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
    if (level.jets) {
      const need = progress.jet != null ? level.objectives.find((o) => o.kind === "jet").need : level.jets;
      const atOnce = Math.min(need, 2 + Math.round(level.difficulty * 3));
      jetSpawner = { remaining: need + 3, atOnce: atOnce + 1 };
    }
    spawnAllies(level.allies, sp);
    viewMode = "chase";
    setCockpitMode(plane, false);
    controls.setLookMode(viewMode);
    timeLeft = opts.seconds || 150; elapsed = 0; score = 0; ended = false;
    Object.assign(stats, { shots: 0, hits: 0, rockets: 0, bombs: 0, kills: {}, rings: 0, damage: 0, crashes: 0, loops: 0 });
    combo = 0; lastKillT = -99; waveT = 0; fires.length = 0; orbitAccum = 0; lastYaw = 0; lockTarget = null; lockCand = null; lockTime = 0;
    plane.position.copy(player.pos);
    updatePlaneTransform();
    snapCamera();
    events.onLoading?.("Ready", 1);
    return {};
  }

  function clearWorld() {
    for (const t of targets) scene.remove(t.obj);
    targets.length = 0;
    for (const a of allies) scene.remove(a.obj);
    allies.length = 0;
    for (const r of rings) scene.remove(r.obj);
    rings.length = 0;
    if (pad) { scene.remove(pad.obj); pad = null; }
    fxs.length = 0; for (const sh of shocks) { sh.active = false; sh.m.visible = false; }
    for (const k of Object.keys(progress)) delete progress[k];
    bullets.length = 0; puffs.length = 0; WC.state = "idle"; WC.obj = null; wcStandby(); hardIdx = 0;
    for (const p of [...rockets, ...missiles, ...bombs]) { p.active = false; p.o.visible = false; }
    for (const e of explosions) { e.active = false; e.g.visible = false; }
    for (const d of debris) { d.active = false; d.g.visible = false; }
    if (terrain) { scene.remove(terrain.detail, terrain.far); terrain.dispose(); terrain = null; }
  }

  // ---------- flight ----------
  function updatePlaneTransform() {
    plane.position.copy(player.pos);
    plane.quaternion.copy(player.q);
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
    maneuver = { kind: "roll", dir, phase: "level", t: 0, ang: 0 };
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
    let target = 120 + throttle * 200 + boost * 55 - Math.sin(player.pitch) * 60;   // throttle lever: 120 (slow) .. 320 (fast)
    if (maneuver && maneuver.kind === "loop") target = Math.max(target, 200);
    if (nearPad) target = Math.min(target, 150);
    player.speed += (target - player.speed) * dt * 1.4;
    player.speed = Math.max(95, player.speed);
    player.vel.set(0, 0, -1).applyQuaternion(player.q).multiplyScalar(player.speed);
    player.pos.addScaledVector(player.vel, dt);
    const g2 = groundAt(player.pos.x, player.pos.z);
    if (player.pos.y > g2 + 5000) player.pos.y = g2 + 5000; // soft ceiling
    const agl = player.pos.y - g2;
    // gentle terrain avoidance: easy and fun, never a surprise crash while skimming
    if (!maneuver && !nearPad && agl < 55 && player.vel.y < 0) rotBody(AX, (1 - agl / 55) * 2.2 * dt);
    // low-altitude warning (no auto-correction): < 120 m while descending, or anything below 60 m
    lowAlt = !maneuverSafe() && !nearPad && !landing && elapsed > invulnUntil && ((agl < 120 && player.vel.y < -2) || agl < 60);
    updatePlaneTransform();
    // ---- crash checks (ground / water / solid objects) ----
    if (pad && landingOpen && checkDeck()) return;
    if (agl < 2.5) { crash(player.pos.clone().setY(g2 + 2), terrain.isWater(player.pos.x, player.pos.z) ? "water" : "ground"); return; }
    if (elapsed > invulnUntil) {
      for (const t of targets) {
        if (t.alive && SOLID[t.kind] && t.pos.distanceTo(player.pos) < t.radius * 0.85 + 5) { crash(player.pos.clone(), t.kind); return; }
      }
    }
    // flame + nav lights + vapour
    const u = plane.userData;
    u.burn(1, boost);
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
    if (landing || crashing) return false;
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
      score += 500;
      progress.land = 1;
      events.toast?.("TRAPPED! +500");
      checkDone();
    }
  }

  // ---------- crash ----------
  function crash(p, what) {
    if (crashing || ended) return;
    crashing = { t: 0, p: p.clone(), what, booms: [0.18, 0.4, 0.7] };
    lowAlt = false; alertMsg = null; alertTimer = 0;
    stats.crashes++; stats.damage += 15;
    maneuver = null;
    plane.visible = false; muzzle.visible = false;
    explode(p, 36, 3);
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
    for (let i = 0; i < 14; i++) puff(tA.copy(p).add(tB.set((Math.random() - 0.5) * 30, Math.random() * 20, (Math.random() - 0.5) * 30)), tC.set((Math.random() - 0.5) * 6, 10 + Math.random() * 14, (Math.random() - 0.5) * 6), 8, 26 + Math.random() * 14, 3.5 + Math.random() * 2, i % 3 ? 0x3d3d42 : 0x6a6a70);
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
    player.speed = 150; player.hp = 100;
    player.vel.set(0, 0, -1).applyQuaternion(player.q).multiplyScalar(player.speed);
    plane.visible = true;
    updatePlaneTransform();
    invulnUntil = elapsed + 2.5;
    crashing = null;
    controls.resetLook();
    snapCamera();
    audio.respawn();
    events.onRespawn?.();
  }
  function updateCrash(dt) {
    crashing.t += dt;
    const c = crashing;
    while (c.booms.length && c.t > c.booms[0]) {
      c.booms.shift();
      explode(tA.copy(c.p).add(tB.set((Math.random() - 0.5) * 40, 6 + Math.random() * 18, (Math.random() - 0.5) * 40)), 16 + Math.random() * 10, 1);
    }
    if (Math.random() < dt * 8) puff(tA.copy(c.p).add(tB.set((Math.random() - 0.5) * 20, 4, (Math.random() - 0.5) * 20)), tC.set(0, 16, 0), 6, 22, 3, 0x45454a);
    if (c.t >= 2.1) respawn();
  }

  // ---------- camera ----------
  function snapCamera() { camQ.copy(player.q); updateCamera(0.016, true); }
  function updateCamera(dt, snap = false) {
    const look = controls.look;
    const portrait = innerHeight > innerWidth;
    if (crashing) {
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
      _q.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, "YXZ"));
      camera.quaternion.copy(plane.quaternion).multiply(_q);
      camQ.copy(player.q);
    } else {
      camera.near = 0.5;
      camera.fov = (portrait ? 80 : 58) + Math.max(0, player.speed - 190) * 0.08;
      const dist = portrait ? 38 : 27;
      // chase camera lives in the jet's own (smoothed) frame -> follows loops, rolls and inverted flight
      camQ.slerp(player.q, snap ? 1 : 1 - Math.exp(-dt * 4.5));
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
    }
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }

  function setView(m) {
    if (L?.lockView && m !== viewMode) { events.toast?.("Stay in the cockpit for this lesson!"); return; }
    viewMode = m;
    setCockpitMode(plane, m === "cockpit");
    controls.setLookMode(m);
    if (m === "chase" && progress.view != null && progress.view < 1) { progress.view = 1; events.toast?.("Outside view! ✓"); audio.lock(); }
    events.onView?.(m);
  }

  // ---------- damage / kills ----------
  function damagePlayer(n, msg) {
    if (ended || crashing || elapsed < invulnUntil) return;
    player.hp -= n; stats.damage += n; lastDamage = elapsed;
    shake = Math.max(shake, 0.5);
    audio.hurt(); haptics.pulse(); events.onHurt?.();
    if (msg) events.toast?.(msg);
    if (player.hp <= 0) { player.hp = 0; finish("down"); }
  }
  function damageTarget(t, n, by) {
    if (!t.alive) return;
    t.hp -= n;
    if (by === "ally" && t.hp > 0) { if (Math.random() < 0.2) puff(t.pos.clone().add(tA.set((Math.random() - 0.5) * t.radius, Math.random() * t.radius * 0.6, (Math.random() - 0.5) * t.radius)), null, 1, 4, 0.5, 0xffe08a); }
    if (by === "gun") { stats.hits++; if (Math.random() < 0.35) puff(t.pos.clone().add(tA.set((Math.random() - 0.5) * t.radius, Math.random() * t.radius * 0.6, (Math.random() - 0.5) * t.radius)), null, 1, 4, 0.5, 0xffe08a); }
    if (t.hp <= 0) kill(t, by === "ally");
  }
  function kill(t, byAlly = false) {
    t.alive = false;
    scene.remove(t.obj);
    const size = t.kind === "ship" ? 30 : t.kind === "jet" ? 16 : t.kind === "base" ? (t.sub === "fuel" ? 30 : 22) : 14;
    if (t.kind === "balloon") { audio.click(); for (let i = 0; i < 8; i++) puff(t.pos, tA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(40), 2, 5, 0.6, 0xffffff); }
    else {
      const big = t.kind === "ship" ? 2 : t.kind === "base" ? (t.sub === "fuel" ? 2.2 : 1.5) : t.kind === "jet" ? 1.3 : 1;
      explode(t.pos.clone().add(tA.set(0, t.kind === "ship" ? 6 : 3, 0)), size, big);
      if (t.kind === "base" && t.sub === "fuel") blast(t.pos, 70, 10);
      if (t.kind === "jet") { spawnDebris(t.pos, 5, 60, t.vel); for (let i = 0; i < 6; i++) puff(t.pos, tA.set((Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 30), 3, 12, 2.5, 0x3d3d42); }
    }
    if (!byAlly) stats.kills[t.kind] = (stats.kills[t.kind] || 0) + 1;
    if (!byAlly) { combo = (elapsed - lastKillT < 4.5) ? combo + 1 : 1; lastKillT = elapsed; }
    const pts = byAlly ? 0 : Math.round((POINTS[t.kind] || 50) * Math.min(4, 1 + (combo - 1) * 0.25));
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
    const lo = L.objectives.find((o) => o.kind === "land");
    if (lo && !(progress.land >= 1)) {
      if (!landingOpen) { landingOpen = true; setAlert("All clear! Land on the carrier", 4); events.toast?.("All clear - land on the carrier"); }
      return;
    }
    finish("complete");
  }
  function finish(reason) {
    if (ended) return;
    ended = true; running = false;
    const total = L.objectives.reduce((s, o) => s + o.need, 0);
    const got = L.objectives.reduce((s, o) => s + Math.min(o.need, progress[o.kind] || 0), 0);
    const frac = total ? got / total : 1;
    if (reason === "complete" && !endless) score += Math.round(timeLeft) * 5;
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
    let best = null, bestA = 0.22;
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
      dir.lerp(tC, 0.9).normalize();
    }
    dir.x += (Math.random() - 0.5) * 0.006; dir.y += (Math.random() - 0.5) * 0.006;
    const v = dir.multiplyScalar(950).add(player.vel);
    bullets.push({ p: origin, v, life: 1.6, enemy: false });
    stats.shots++;
    audio.gun();
    muzzle.visible = true; muzzle.position.set(0, -0.28 / 1.15, -8.6 / 1.15); muzzle.scale.setScalar(0.5 + Math.random() * 0.4);
  }
  function fireRocket() {
    if (rocketCd > 0) return;
    if (player.rockets <= 0) { if (emptyT <= 0) { emptyT = 0.5; audio.empty(); events.onEmpty?.("missile"); } return; }
    const r = rockets.find((x) => !x.active);
    if (!r) return;
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
    r.active = true; r.life = 8; r.target = lockTarget && lockTarget.alive ? lockTarget : null; r.trail = 0; r.arm = 0.28; r.hp = hi; r.result = null;
    r.p.copy(tA.set(hp[0], hp[1] - 0.2, hp[2]).applyMatrix4(plane.matrixWorld));
    const fw = fwdFrom(player.yaw, player.pitch, V());
    r.v.copy(fw).multiplyScalar(player.speed + 45);
    r.v.y -= 9; // drops off the rail, then the motor lights
    r.v.x += Math.sign(hp[0]) * 4 * Math.cos(player.yaw); r.v.z += -Math.sign(hp[0]) * 4 * Math.sin(player.yaw);
    r.o.visible = true;
    const mm = plane.userData.hardMissiles?.[hi]; if (mm) { mm.visible = false; hpReload[hi] = 2.4; }
    for (let k = 0; k < 4; k++) puff(r.p, tB.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), 1.2, 7 + k * 1.5, 1.8 + k * 0.3, 0xe8e8ea);
    fx(r.p, null, 5, 1, 0.16, WS.kind === "std" ? 0xffd890 : WS.fx, 0, 0);
    watchWeapon(r, "MSL " + (hi + 1));
    audio.rocket();
  }
  function dropBomb() {
    if (bombCd > 0) return;
    if (player.bombs <= 0) { if (emptyT <= 0) { emptyT = 0.5; audio.empty(); events.onEmpty?.("bomb"); } return; }
    const b = bombs.find((x) => !x.active);
    if (!b) return;
    bombCd = BOMB_GAP;
    player.bombs--; stats.bombs++;
    b.active = true; b.life = 30; b.result = null;
    b.p.copy(tA.set(0, -1.1, 0.6).applyMatrix4(plane.matrixWorld)); // released from the belly bay
    b.v.copy(player.vel).add(tB.set(0, -6, 0));
    // guided: lock the target under the nose (or the current ground lock)
    let bt = lockTarget && lockTarget.alive && lockTarget.kind !== "jet" ? lockTarget : null;
    if (!bt) {
      const fw = fwdFrom(player.yaw, player.pitch, V()); let bs = 0.9;
      for (const t of targets) {
        if (!t.alive || t.kind === "jet") continue;
        tB.subVectors(t.pos, player.pos); const d = tB.length(); if (d > 3800 || d < 60 || tB.y > 0) continue;
        const a = tB.normalize().angleTo(fw); if (a < bs) { bs = a; bt = t; }
      }
    }
    b.target = bt;
    b.o.visible = true;
    watchWeapon(b, "BOMB");
    audio.bomb();
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
    m.active = true; m.life = 9;
    m.p.copy(site.pos).add(tA.set(0, from === "jet" ? -1 : 7, 0));
    if (from === "jet") m.v.copy(site.vel).setLength(Math.max(260, site.speed + 90));
    else m.v.set(0, 140, 0);
    m.o.visible = true;
    audio.warn();
    setAlert("Missile! Turn hard!", 1.5);
  }
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
    if (d < 55 && !crashing && elapsed > invulnUntil) { damagePlayer(Math.round(7 * Math.max(0.5, L.hostile) * (1 - d / 80)) + 2, "Flak!"); shake = Math.max(shake, 0.8); }
  }

  // ---------- per-frame update ----------
  function update(dt) {
    if (!running) return;
    elapsed += dt;
    controls.update(dt);
    if (crashing) {
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
    if (!endless) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; finish("time"); return; } }
    if (controls.consumeView()) setView(viewMode === "cockpit" ? "chase" : "cockpit");
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
    const wantGun = (controls.gunHeld() || (autoGun && heat < 0.8)) && allowed.includes("gun");
    if (wantGun && !overheated) { fireGun(dt); heat = Math.min(1, heat + dt / HEAT_UP); }
    else heat = Math.max(0, heat - dt / HEAT_DOWN);
    if (!overheated && heat >= 1) { overheated = true; audio.hiss(); haptics.pulse?.(); events.onOverheat?.(true); }
    else if (overheated && heat < HEAT_RESUME) { overheated = false; audio.cool(); events.onOverheat?.(false); }
    rocketCd -= dt; bombCd -= dt; emptyT -= dt;
    if (controls.consumeRocket() && allowed.includes("rocket")) fireRocket();
    if (controls.consumeBomb() && allowed.includes("bomb")) dropBomb();
    // slow refill, one at a time, whenever below max (timer only runs while below max)
    if (player.rockets < RACK) { rocketRegen += dt; if (rocketRegen >= ROCKET_REGEN) { rocketRegen = 0; player.rockets++; audio.reload("missile"); } } else rocketRegen = 0;
    if (player.bombs < RACK) { bombRegen += dt; if (bombRegen >= BOMB_REGEN) { bombRegen = 0; player.bombs++; audio.reload("bomb"); } } else bombRegen = 0;
    if (elapsed - lastDamage > 4 && player.hp < 100) player.hp = Math.min(100, player.hp + dt * 2);

    // auto-fire the gun while an enemy sits in the gun cone
    autoGun = false;
    { const fw = fwdFrom(player.yaw, player.pitch, tD); for (const t of targets) { if (!t.alive) continue; tA.subVectors(t.pos, player.pos); const d = tA.length(); if (d > 1500 || d < 40) continue; if (tA.normalize().angleTo(fw) < 0.11) { autoGun = true; break; } } }
    // rocket lock (14 deg cone)
    const fwd = fwdFrom(player.yaw, player.pitch, tD);
    let cand = null, candA = 0.36;
    for (const t of targets) {
      if (!t.alive) continue;
      tA.subVectors(t.pos, player.pos);
      const d = tA.length();
      if (d > 4200 || d < 60) continue;
      const a = tA.normalize().angleTo(fwd) - (t.objective ? 0.04 : 0);
      if (a < candA) { candA = a; cand = t; }
    }
    if (cand && cand === lockCand) { lockTime += dt; if (lockTime > 0.18 && lockTarget !== cand) { lockTarget = cand; if (allowed.includes("rocket")) audio.lock(); } }
    else { lockCand = cand; lockTime = 0; if (lockTarget && (!lockTarget.alive || !cand)) lockTarget = null; }

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
    ccipRing.visible = !!ccip && ccip.distanceTo(player.pos) < 4500;
    if (ccipRing.visible) { ccipRing.position.copy(ccip).add(tA.set(0, 2, 0)); ccipRing.scale.setScalar(1 + 0.15 * Math.sin(elapsed * 6)); }

    if (lowAlt) {
      setAlert("PULL UP", 0.2);
      if ((warnTimer -= dt) < 0) { audio.pullUp(); warnTimer = 0.6; }
      if ((voiceT -= dt) <= 0) { audio.voicePullUp(); voiceT = 3; }
    } else voiceT = 0;
    if (alertTimer > 0) { alertTimer -= dt; if (alertTimer <= 0) alertMsg = null; }

    dream.update(dt, player.pos);
    audio.updateEngine(Math.min(1, (player.speed - 100) / 200), viewMode === "cockpit");
    updateCamera(dt);
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
    // burning wrecks: smoke columns and flames
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i]; f.t += dt; f.e -= dt;
      if (f.t > f.life) { fires.splice(i, 1); continue; }
      if (f.e <= 0) {
        f.e = 0.14 + f.t / f.life * 0.25;
        puff(tA.copy(f.pos).add(tB.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3)), tC.set((Math.random() - 0.5) * 2, 9 + Math.random() * 5, 0), 4 * f.big, 7, 2.4, f.t < f.life * 0.5 ? 0x1c1a18 : 0x4a4640);
        if (f.t < f.life * 0.45) puff(tA.copy(f.pos).add(tB.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2)), tC.set(0, 4, 0), 2.2 * f.big, 0.7, 0.4, 0xff8a2a);
      }
    }
    // endless reinforcement waves of enemy jets
    if (jetSpawner && !ended) {
      waveT += dt;
      const aliveJ = targets.filter((t) => t.kind === "jet" && t.alive).length;
      if (waveT > 14 && aliveJ < jetSpawner.atOnce + 2) { waveT = 0; spawnJet(player.pos); events.toast?.("Enemy wave incoming!"); }
    }
    // jet waves
    if (jetSpawner) {
      const alive = targets.filter((t) => t.kind === "jet" && t.alive).length;
      if (alive < jetSpawner.atOnce && jetSpawner.remaining > 0 && (progress.jet == null || progress.jet + alive < (L.objectives.find((o) => o.kind === "jet")?.need || 99))) {
        spawnJet(player.pos); jetSpawner.remaining--;
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
            if (t.cool <= 0) { t.cool = 3.4; flakShot(tA.copy(t.pos).add(tB.set(0, 4, 0)), 0.05); }
          }
          break;
        }
        case "ship": {
          const nx = t.pos.x + Math.sin(t.heading) * t.speed * dt, nz = t.pos.z + Math.cos(t.heading) * t.speed * dt;
          const ax = t.pos.x + Math.sin(t.heading) * 200, az = t.pos.z + Math.cos(t.heading) * 200;
          if (!terrain.isWater(ax, az)) t.heading += dt * 0.6;
          else { t.vel.set(nx - t.pos.x, 0, nz - t.pos.z).divideScalar(dt); t.pos.x = nx; t.pos.z = nz; }
          t.pos.y = 0.5 + Math.sin(t.t * 0.8) * 0.4 + waveAt(t.pos.x, t.pos.z);
          t.obj.rotation.set(Math.sin(t.t * 0.7) * 0.02, t.heading + Math.PI, Math.sin(t.t) * 0.03);
          if (rng() < dt * 2) puff(tA.copy(t.pos).add(tB.set(-Math.sin(t.heading) * 20, 1, -Math.cos(t.heading) * 20)), null, 3, 9, 1.8, 0xffffff);
          // anti-air tracers
          const d = t.pos.distanceTo(player.pos);
          if (hostile > 0 && d < 1500) { t.cool -= dt; if (t.cool <= 0) { t.cool = 0.12; if (Math.sin(t.t * 2) > 0.2) enemyShot(tA.copy(t.pos).add(tB.set(0, 10, 0)), 0.09 * (1.6 - hostile)); } }
          break;
        }
        case "sam": {
          const la = t.obj.userData.launcher;
          tA.subVectors(player.pos, t.pos);
          la.rotation.y = Math.atan2(-tA.x, -tA.z);
          const d = tA.length();
          if (hostile > 0 && d < 4200) {
            t.cool -= dt * hostile;
            if (t.cool <= 0 && airMissiles() < 3) { t.cool = 7 - L.difficulty * 3; launchSam(t); }
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
              t.burst--; t.cool = t.burst > 0 ? 0.22 : 2.4;
              flakShot(tA.copy(t.pos).add(tB.set(0, 5, 0)), 0.035 * (1.7 - hostile));
            }
          }
          break;
        }
        case "base": break;
        case "jet": updateJet(t, dt, hostile); break;
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

  function updateJet(t, dt, hostile) {
    tA.subVectors(player.pos, t.pos);
    const dist = tA.length();
    let goal = tB.copy(player.pos).addScaledVector(player.vel, Math.min(1.2, dist / 400));
    fwdFrom(t.yaw, t.pitch, tC);
    const inFront = tC.dot(tA) > 0;
    if (dist < 220 && inFront) { goal = tB.copy(t.pos).addScaledVector(tC, 300).add(tD.set(Math.cos(t.t) * 400, 120, Math.sin(t.t) * 400)); }
    const gx = goal.x - t.pos.x, gz = goal.z - t.pos.z, gy = goal.y - t.pos.y;
    const wantYaw = Math.atan2(-gx, -gz);
    const turn = 0.75 + L.difficulty * 0.35;
    const yr = THREE.MathUtils.clamp(wrapPi(wantYaw - t.yaw) * 1.4, -turn, turn);
    t.yaw += yr * dt;
    t.bank += (THREE.MathUtils.clamp(-yr / turn, -1, 1) * 1.05 - t.bank) * dt * 2.5;
    let wantPitch = THREE.MathUtils.clamp(Math.atan2(gy, Math.hypot(gx, gz)), -0.5, 0.5);
    const g = groundAt(t.pos.x, t.pos.z);
    if (t.pos.y - g < 160) wantPitch = 0.45;
    t.pitch += (wantPitch - t.pitch) * dt * 1.2;
    fwdFrom(t.yaw, t.pitch, t.vel).multiplyScalar(t.speed);
    t.pos.addScaledVector(t.vel, dt);
    t.obj.rotation.set(t.pitch, t.yaw, -t.bank, "YXZ");
    t.obj.userData.beacon.visible = Math.sin(t.t * 7) > 0;
    if (hostile > 0 && dist < 1100) {
      const ang = tC.angleTo(tA.normalize());
      t.cool -= dt;
      if (ang < 0.16 && t.cool <= 0) { t.burst = 6; t.cool = 2.2 - hostile; }
      if (hostile > 0.55 && dist > 700 && dist < 2600 && ang < 0.5 && (t.mcool -= dt) <= 0 && airMissiles() < 3) { t.mcool = 11 - hostile * 4 + Math.random() * 4; launchSam({ pos: t.pos, vel: t.vel, speed: t.speed }, "jet"); }
      if (t.burst > 0 && (t.bc = (t.bc || 0) - dt) <= 0) { t.burst--; t.bc = 0.09; enemyShot(tD.copy(t.pos).addScaledVector(tC, 6), 0.05 * (1.7 - hostile)); }
    }
  }
  function enemyShot(origin, spread) {
    const lead = origin.distanceTo(player.pos) / 800;
    tA.copy(player.pos).addScaledVector(player.vel, lead * 0.8).sub(origin).normalize();
    tA.x += (Math.random() - 0.5) * spread * 2; tA.y += (Math.random() - 0.5) * spread * 2; tA.z += (Math.random() - 0.5) * spread * 2;
    bullets.push({ p: origin.clone(), v: tA.normalize().multiplyScalar(800), life: 1.8, enemy: true });
  }

  // ---------- weapon camera (green circle under the radar) ----------
  // A small off-screen render of the latest missile / bomb, chasing it until it hits (explosion hold) or misses (fade out).
  const WC = { state: "idle", obj: null, label: "", t: 0, canvas: null, ctx: null, rt: null, buf: null, img: null, lastDraw: 0, lastP: V(), lastV: V(), camP: V(), cam: null, lut: null, dist: 0, flash: 0 };
  const WCS = 160;
  function attachWeaponCam(canvas) {
    WC.canvas = canvas; canvas.width = canvas.height = WCS; WC.ctx = canvas.getContext("2d");
    WC.cam = new THREE.PerspectiveCamera(62, 1, 0.5, 20000);
    WC.rt = new THREE.WebGLRenderTarget(WCS, WCS, { depthBuffer: true });
    WC.buf = new Uint8Array(WCS * WCS * 4); WC.img = WC.ctx.createImageData(WCS, WCS);
    WC.lut = new Uint8Array(256); for (let i = 0; i < 256; i++) WC.lut[i] = Math.min(255, Math.round(255 * Math.pow(Math.min(1, (i / 255) * 1.5), 0.45)));
    wcStandby();
  }
  function wcStandby() {
    const c = WC.ctx; if (!c) return;
    c.fillStyle = "#031006"; c.fillRect(0, 0, WCS, WCS);
    for (let y = 0; y < WCS; y += 3) { c.fillStyle = "rgba(60,255,110,0.05)"; c.fillRect(0, y, WCS, 1); }
    c.strokeStyle = "rgba(90,255,130,0.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(WCS / 2 - 14, WCS / 2); c.lineTo(WCS / 2 + 14, WCS / 2); c.moveTo(WCS / 2, WCS / 2 - 14); c.lineTo(WCS / 2, WCS / 2 + 14); c.stroke();
    c.fillStyle = "rgba(120,255,150,0.6)"; c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillText("WPN CAM", WCS / 2, WCS / 2 + 34); c.fillText("STANDBY", WCS / 2, WCS / 2 + 48);
    if (WC.canvas) { WC.canvas.style.opacity = 1; WC.canvas.dataset.live = "0"; }
  }
  function watchWeapon(obj, label) { WC.obj = obj; WC.label = label; WC.state = "follow"; WC.t = 0; WC.lastP.copy(obj.p); WC.lastV.copy(obj.v); WC.camP.copy(obj.p); }
  function updateWeaponCam(dt) {
    if (WC.state === "idle" || !WC.canvas) return;
    WC.t += dt;
    if (WC.state === "follow") {
      const o = WC.obj;
      if (o.active) { WC.lastP.copy(o.p); WC.lastV.copy(o.v); tA.copy(o.v).normalize(); WC.camP.copy(o.p).addScaledVector(tA, -15).add(tB.set(0, 3.2, 0)); WC.dist = o.target && o.target.alive ? o.target.pos.distanceTo(o.p) : 0; }
      else { WC.state = o.result === "hit" ? "boom" : "fade"; WC.t = 0; }
    } else if (WC.state === "boom") { if (WC.t > 1.6) { WC.state = "fade"; WC.t = 0; } }
    else if (WC.state === "fade") { if (WC.t > 0.9) { WC.state = "idle"; wcStandby(); } }
  }
  function renderWeaponCam() {
    if (WC.state === "idle" || !WC.canvas) return;
    const now = performance.now();
    if (now - WC.lastDraw < 66) return;
    WC.lastDraw = now;
    const cam = WC.cam;
    cam.position.copy(WC.camP);
    if (WC.state === "follow") cam.lookAt(tA.copy(WC.lastP).addScaledVector(tB.copy(WC.lastV).normalize(), 40));
    else cam.lookAt(WC.lastP);
    const rtPrev = renderer.getRenderTarget(), pr = outlineUniforms.uRes.value.clone();
    outlineUniforms.uRes.value.set(WCS * 2.2, WCS * 2.2);
    const wasMuz = muzzle.visible; muzzle.visible = false;
    renderer.setRenderTarget(WC.rt); renderer.render(scene, cam); renderer.readRenderTargetPixels(WC.rt, 0, 0, WCS, WCS, WC.buf);
    renderer.setRenderTarget(rtPrev); outlineUniforms.uRes.value.copy(pr); muzzle.visible = wasMuz;
    const b = WC.buf, d = WC.img.data, lut = WC.lut, night = L && L.time === "night" ? 1.6 : 1;
    for (let y = 0; y < WCS; y++) {
      const sy = WCS - 1 - y, sl = (y & 1) ? 0.82 : 1;
      for (let x = 0; x < WCS; x++) {
        const i = (sy * WCS + x) * 4, o = (y * WCS + x) * 4;
        const l = Math.min(255, (b[i] * 0.3 + b[i + 1] * 0.59 + b[i + 2] * 0.11) * night);
        const g = lut[l | 0] * sl, n = (Math.random() - 0.5) * 14;
        d[o] = g * 0.16 + n * 0.2; d[o + 1] = Math.min(255, g * 1.05 + n); d[o + 2] = g * 0.32 + n * 0.3; d[o + 3] = 255;
      }
    }
    const c = WC.ctx; c.putImageData(WC.img, 0, 0);
    c.strokeStyle = "rgba(150,255,170,0.85)"; c.lineWidth = 1.2; c.beginPath();
    for (const [x0, y0, x1, y1] of [[-24, 0, -10, 0], [10, 0, 24, 0], [0, -24, 0, -10], [0, 10, 0, 24]]) { c.moveTo(WCS / 2 + x0, WCS / 2 + y0); c.lineTo(WCS / 2 + x1, WCS / 2 + y1); }
    c.stroke();
    c.fillStyle = "rgba(160,255,180,0.95)"; c.font = "bold 11px monospace"; c.textAlign = "center";
    c.fillText(WC.label, WCS / 2, 20);
    c.fillStyle = WC.state === "boom" ? "rgba(255,200,120,1)" : "rgba(160,255,180,0.95)";
    c.fillText(WC.state === "follow" ? (WC.dist > 0 ? Math.round(WC.dist) + " M" : "TRACKING") : WC.state === "boom" ? "IMPACT" : "LOST", WCS / 2, WCS - 14);
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
          if (segSphere(p0, b.p, player.pos, 8)) { dead = true; damagePlayer(2 * Math.max(0.4, L.hostile)); audio.hit(); }
        } else {
          for (const t of targets) {
            if (t.alive && segSphere(p0, b.p, t.pos, t.radius * 1.3 + 2)) { damageTarget(t, 1, "gun"); audio.hit(); dead = true; break; }
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
      if (!r.active) continue;
      r.life -= dt;
      if (r.arm > 0) { r.arm -= dt; r.v.y -= 6 * dt; r.v.multiplyScalar(1 + dt * 1.2); }
      else if (r.target && r.target.alive) {
        tA.copy(r.target.pos).addScaledVector(r.target.vel, 0.3).sub(r.p).normalize();
        const sp = r.v.length();
        tB.copy(r.v).normalize().lerp(tA, Math.min(1, dt * 4)).normalize();
        r.v.copy(tB).multiplyScalar(Math.min(620, sp + dt * 260));
      } else r.v.multiplyScalar(1 + dt * 0.4);
      p0.copy(r.p);
      r.p.addScaledVector(r.v, dt);
      r.o.position.copy(r.p);
      r.o.lookAt(tA.copy(r.p).add(r.v));
      r.o.rotateY(Math.PI);
      if ((r.trail = (r.trail || 0) - dt) <= 0) {
        // own smoke trail per missile: hot motor flame + a thin white smoke line that thickens and drifts
        if (WS.kind === "std") {
          r.trail = 0.035;
          fx(r.p, null, 1.9, 0.5, 0.14, 0xffb050, 0, 0);
          puff(r.p, tB.set((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2), 0.45, 3.2, 2.9, 0xf2f2f4);
        } else { r.trail = 0.02; fx(r.p, null, 2.2, 0.4, 0.5, WS.fx, 0, 0); fx(r.p, tB.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), 0.9, 0.2, 0.35, 0xffffff, 0, 1); }
      }
      let hit = null;
      for (const t of targets) if (t.alive && segSphere(p0, r.p, t.pos, t.radius + 6)) { hit = t; break; }
      if (!hit) for (const a of allies) if (a.alive && segSphere(p0, r.p, a.pos, a.radius + 6)) { friendlyHit(a, 12, 250); r.life = Math.max(r.life, 0.01); r.p.copy(a.pos); hit = { fake: true }; break; }
      const gh = groundAt(r.p.x, r.p.z);
      if (hit || r.p.y < gh || r.life <= 0) {
        r.active = false; r.o.visible = false;
        r.result = r.life > 0 ? "hit" : "miss";
        if (hit && !hit.fake) { stats.hits++; damageTarget(hit, 12, "rocket"); }
        if (r.life > 0) { explode(r.p.clone(), 9, 0.6); blast(r.p, 30, 6); }
      }
    }
    for (const m of missiles) {
      if (!m.active) continue;
      m.life -= dt;
      tA.copy(player.pos).sub(m.p);
      const d = tA.length();
      tA.normalize();
      const sp = Math.min(270, m.v.length() + dt * 90);
      tB.copy(m.v).normalize().lerp(tA, Math.min(1, dt * 0.95)).normalize();
      m.v.copy(tB).multiplyScalar(sp);
      m.p.addScaledVector(m.v, dt);
      m.o.position.copy(m.p);
      m.o.lookAt(tC.copy(m.p).add(m.v)); m.o.rotateY(Math.PI);
      if ((m.trail = (m.trail || 0) - dt) <= 0) { m.trail = 0.03; puff(m.p, null, 1.5, 6, 1.6, 0xe6e0ff); fx(m.p, null, 1.6, 0.6, 0.35, 0xff4a2a, 0, 0); }
      if (d < 16) { m.active = false; m.o.visible = false; explode(m.p.clone(), 10, 0.8); damagePlayer(14 + 10 * L.hostile, "Ouch! Missile hit"); }
      else if (m.life <= 0 || m.p.y < groundAt(m.p.x, m.p.z)) { m.active = false; m.o.visible = false; puff(m.p, null, 4, 14, 1.5, 0x888888); }
      else if ((m.beep = (m.beep || 0) - dt) <= 0) { m.beep = d < 1200 ? 0.35 : 0.8; audio.warn(); }
    }
    for (const b of bombs) {
      if (!b.active) continue;
      b.v.y -= GRAV * dt;
      if (b.target && b.target.alive) {
        // guided: steer the fall so it lands on the locked target (limited fin authority)
        const h = Math.max(1, b.p.y - b.target.pos.y), vy = Math.max(0, -b.v.y);
        const tf = Math.max(0.4, (vy + Math.sqrt(vy * vy + 2 * GRAV * h)) / GRAV);
        tA.set((b.target.pos.x + b.target.vel.x * tf - b.p.x) / tf, 0, (b.target.pos.z + b.target.vel.z * tf - b.p.z) / tf);
        tB.set(tA.x - b.v.x, 0, tA.z - b.v.z);
        const mx = 55 * dt, l = tB.length(); if (l > mx) tB.multiplyScalar(mx / l);
        b.v.x += tB.x; b.v.z += tB.z;
      }
      if (b.glow.visible) b.core.scale.setScalar(1.1 + 0.4 * Math.sin(elapsed * 40 + b.p.x));
      b.p.addScaledVector(b.v, dt);
      b.o.position.copy(b.p);
      b.o.lookAt(tA.copy(b.p).add(b.v)); b.o.rotateY(Math.PI);
      const gh = groundAt(b.p.x, b.p.z);
      let near = false;
      for (const t of targets) if (t.alive && t.kind !== "jet" && t.pos.distanceTo(b.p) < t.radius + 8) { near = true; break; }
      if (WS.kind !== "std" && (b.trail = (b.trail || 0) - dt) <= 0) { b.trail = 0.03; fx(b.p, tB.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 1.6, 0.2, 0.3, WS.fx, 0, 1); }
      if (b.p.y <= gh + 1 || near) {
        b.active = false; b.o.visible = false; b.result = "hit";
        b.p.y = Math.max(b.p.y, gh + 1);
        explode(b.p.clone(), 20, 1.6);
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

  // ---------- HUD data ----------
  function hudState() {
    return {
      throttle, combo, player, targets, rings, progress, objectives: L?.objectives || [], timeLeft, score, viewMode,
      lockTarget, lockCand, lockTime, ccip, alert: alertMsg, camera, missiles, half, center, elapsed,
      fwd: player ? fwdFrom(player.yaw, player.pitch, V()) : null,
      heat, overheated, crashing: !!crashing, pad, baseCenters, landingOpen, landing: !!landing, autoGun, rack: RACK, rockets: player ? player.rockets : 0, bombs: player ? player.bombs : 0,
      rocketRefill: player && player.rockets < RACK ? rocketRegen / ROCKET_REGEN : 0, bombRefill: player && player.bombs < RACK ? bombRegen / BOMB_REGEN : 0, rocketCd: Math.max(0, rocketCd), bombCd: Math.max(0, bombCd), endless, allies, lowAlt, maneuver: maneuver ? maneuver.dir : 0,
    };
  }

  function render() {
    outlineUniforms.uRes.value.set(innerWidth, innerHeight);
    renderer.render(scene, camera);
    renderWeaponCam();
  }

  return {
    scene, camera, load, update, render, hudState, attachWeaponCam, runLabel,
    /** seconds > 0 = mission countdown; 0 / null = endless (timer counts up) */
    setThrottle(v) { throttle = Math.max(0, Math.min(1, v)); },
    getThrottle: () => throttle,
    setTime(sec) { endless = !sec; timeLeft = sec || 0; },
    setScore(v) { score = Math.max(0, v | 0); },
    start() { running = true; ended = false; controls.setEnabled(true); audio.startEngine(); },
    pause() { running = false; },
    resume() { if (!ended) running = true; },
    running: () => running,
    ended: () => ended,
    setView, view: () => viewMode,
    quit() { running = false; ended = true; controls.setEnabled(false); audio.stopEngine(); },
    level: () => L,
    debug: () => ({ lowAlt, player, maneuver, crashing, heat, overheated, stats, timeLeft, camUp: camera.up.clone(), camPos: camera.position.clone(), groundBelow: player ? groundAt(player.pos.x, player.pos.z) : 0 }),
    loop: (d) => startLoop(d),
    roll: (d) => startRoll(d),
    stats: () => stats,
    dbg: { warpNear: (kinds) => { const c = targets.filter((t) => t.alive && kinds.includes(t.kind)).sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos))[0]; if (!c) return false; player.pos.set(c.pos.x, c.pos.y + 340, c.pos.z + 700); player.q.setFromEuler(new THREE.Euler(-0.3, 0, 0, "YXZ")); return true; }, hurtAlly: () => { const a = allies.find((x) => x.alive); if (a) friendlyHit(a, 1, 250); return !!a; }, killNear: (n) => targets.filter((t) => t.alive).sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos)).slice(0, n).forEach((t) => kill(t)), hardState: () => ({ idx: hardIdx, rockets: player.rockets, live: rockets.filter((r) => r.active).map((r) => r.hp), wc: WC.state, world: L.run ? runLabel(L.run) : "" }), finish: (r) => finish(r), targets, allies, bullets, damageAlly: (a, n) => damageAlly(a, n), get player() { return player; }, get pad() { return pad; }, fxCount: () => fxs.length, openLanding() { landingOpen = true; }, explodeAt: (p, s, b) => explode(p, s, b), get landing() { return !!landing; }, get progress() { return progress; } },
  };
}
