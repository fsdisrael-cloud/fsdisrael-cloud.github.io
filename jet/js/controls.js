// Jet controls (no options).
// FLIGHT INPUT = phone tilt + on-screen HOTAS joystick, both live at once, summed and clamped to [-1, 1].
//  - Tilt: top of the phone toward the sky = nose up, toward the ground = nose down (fixed, no invert option).
//    Neutral is calibrated to how the phone is held at the first tap, and again after a screen rotation.
//    Works in portrait and landscape: gravity is rotated into the current screen frame.
//  - Joystick (bottom right, joystick ALONE): drag the stick. No weapons on it. No barrel roll.
//  - Weapons (bottom left, separate buttons): GUN (hold), MISSILE, BOMB. The gun also auto-fires on a target in the cone.
//  - HEAD-LOOK: swipe anywhere else (not on the stick / buttons) = only the pilot's view/camera turns, never the flight path.
//    Releasing eases the view back to forward.
//  - Desktop: arrows/WASD, space = guns, F = missile, B = bomb, shift = boost, V = camera.
const D2R = Math.PI / 180;

// ---- easy-to-adjust configuration ----
export const CONTROL_CFG = {
  stickDragUpIsNoseUp: true, // joystick: drag up = nose up (set false for real-aircraft "pull back = up" feel)
  stickRadiusPx: 56,         // drag distance for full deflection
  tiltRangePitchDeg: 22,     // degrees of tilt for full pitch input
  tiltRangeRollDeg: 26,      // degrees of tilt for full roll input
  tiltDeadZoneDeg: 3,
  tiltSmoothing: 14,         // higher = snappier
  stickReturn: 12,           // spring-back speed of the joystick
  lookYawPerScreen: 3.6,     // head-look: radians of view yaw for a swipe across the full screen width
  lookPitchPerScreen: 2.4,   // head-look: radians of view pitch for a swipe across the full screen height
  lookReturn: 3.2,           // head-look: how fast the view eases back to forward after release
};

export function createControls() {
  const C = CONTROL_CFG;
  const stick = { pitch: 0, roll: 0, yaw: 0 };
  const look = { yaw: 0, pitch: 0 };
  const keys = new Set();
  let gyroOn = false, gotGyroEvent = false;
  let rawPitch = 0, rawRoll = 0, smPitch = 0, smRoll = 0;
  let zeroPitch = 35, zeroRoll = 0, wantCal = true, calAt = 0;
  let mslHeld = false, bombHeld = false, gunHeld = false, rocketEdge = false, bombEdge = false, viewEdge = false, boostKey = false;
  const joy = { x: 0, y: 0, active: false, id: null, sx: 0, sy: 0 };
  const lk = { active: false, id: null, x: 0, y: 0 };
  let lookMode = "chase";
  let joyEl = null, gripEl = null;
  let enabled = false;

  function screenAngle() {
    if (typeof window.orientation === "number") return window.orientation; // iOS
    const a = screen.orientation?.angle;
    return typeof a === "number" ? a : 0;
  }
  function readAngles(e) {
    const b = (e.beta || 0) * D2R, g = (e.gamma || 0) * D2R;
    // world-up in device coordinates, then rotated into the current screen frame
    const dx = -Math.sin(g) * Math.cos(b), dy = Math.sin(b), dz = Math.cos(g) * Math.cos(b);
    const th = screenAngle() * D2R;
    const ux = dx * Math.cos(th) - dy * Math.sin(th);
    const uy = dx * Math.sin(th) + dy * Math.cos(th);
    const pitch = Math.atan2(dz, uy) / D2R;            // decreases when the top of the phone rises
    const roll = Math.atan2(-ux, Math.hypot(uy, dz)) / D2R; // + = turned clockwise (bank right)
    return { pitch, roll };
  }
  window.addEventListener("deviceorientation", (e) => {
    if (e.beta == null && e.gamma == null) return;
    gotGyroEvent = true;
    const a = readAngles(e);
    if (calAt && performance.now() > calAt) { calAt = 0; wantCal = true; }
    if (wantCal) { zeroPitch = a.pitch; zeroRoll = a.roll; rawPitch = a.pitch; rawRoll = a.roll; smPitch = a.pitch; smRoll = a.roll; wantCal = false; }
    rawPitch = a.pitch; rawRoll = a.roll;
  });
  const recalSoon = () => { calAt = performance.now() + 450; };
  window.addEventListener("orientationchange", recalSoon);
  screen.orientation?.addEventListener?.("change", recalSoon);

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (!enabled) return;
    if (k === " ") { gunHeld = true; e.preventDefault(); }
    if (k === "f" || k === "r") rocketEdge = true;
    if (k === "b" || k === "g") bombEdge = true;
    if (k === "v" || k === "c") viewEdge = true;
    if (k === "shift") boostKey = true;
    if (k.startsWith("arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === " ") gunHeld = false;
    if (k === "shift") boostKey = false;
  });
  window.addEventListener("blur", () => { keys.clear(); gunHeld = false; });

  // ---------- on-screen HOTAS stick ----------
  const SVG = `
<svg class="stick-svg" viewBox="0 0 260 270" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="sg-metal" x1="0" x2="1"><stop offset="0" stop-color="#2a3038"/><stop offset=".35" stop-color="#8d98a6"/><stop offset=".55" stop-color="#d7dee6"/><stop offset=".8" stop-color="#5c6672"/><stop offset="1" stop-color="#20252c"/></linearGradient>
    <linearGradient id="sg-grip" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#0d1015"/><stop offset=".3" stop-color="#2b323c"/><stop offset=".5" stop-color="#4a5564"/><stop offset=".75" stop-color="#252b33"/><stop offset="1" stop-color="#0b0d11"/></linearGradient>
    <linearGradient id="sg-boot" x1="0" x2="1"><stop offset="0" stop-color="#0c0e12"/><stop offset=".4" stop-color="#2a2f37"/><stop offset=".6" stop-color="#3a414c"/><stop offset="1" stop-color="#0a0b0e"/></linearGradient>
    <radialGradient id="sg-ring" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#cfd7e0"/><stop offset=".6" stop-color="#6b7684"/><stop offset="1" stop-color="#242a31"/></radialGradient>
    <radialGradient id="sg-plate" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#1d2229" stop-opacity=".9"/><stop offset="1" stop-color="#0a0c10" stop-opacity=".85"/></radialGradient>
  </defs>
  <g transform="translate(30 0)">
  <ellipse class="sg-base-plate" cx="100" cy="226" rx="92" ry="28" fill="url(#sg-plate)" stroke="#6b7684" stroke-width="2"/>
  <ellipse cx="100" cy="226" rx="80" ry="22" fill="none" stroke="#2f3640" stroke-width="2"/>
  <ellipse cx="100" cy="222" rx="46" ry="13" fill="url(#sg-ring)" stroke="#11151a" stroke-width="2"/>
  <g class="stick-arm">
    <path d="M62 222 Q64 188 84 168 L116 168 Q136 188 138 222 Q100 236 62 222Z" fill="url(#sg-boot)" stroke="#07080a" stroke-width="2"/>
    <path d="M68 212 Q100 224 132 212 M71 200 Q100 211 129 200 M76 188 Q100 197 124 188" stroke="#4b5360" stroke-width="2" fill="none" opacity=".8"/>
    <rect x="90" y="120" width="20" height="56" rx="6" fill="url(#sg-metal)" stroke="#0a0c0f" stroke-width="2"/>
    <g class="stick-grip" transform="translate(100 0) scale(1.4 1) translate(-100 0)">
      <path d="M62 128 Q58 70 76 34 Q86 10 104 10 Q126 12 130 40 Q142 82 138 128 Q132 140 100 142 Q68 140 62 128Z" fill="url(#sg-grip)" stroke="#05060a" stroke-width="2.5"/>
      <path d="M76 38 Q82 24 98 20" stroke="#aab6c4" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>
      <path d="M68 122 Q64 82 78 52" stroke="#7d8896" stroke-width="2" fill="none" opacity=".4"/>
      <path d="M70 112 Q100 122 132 112" stroke="#d63b2f" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M72 96 Q100 104 130 96 M73 84 Q100 91 129 84" stroke="#0a0c10" stroke-width="2" fill="none" opacity=".7"/>
      <ellipse cx="100" cy="26" rx="20" ry="9" fill="#1a1f26" stroke="#07080a" stroke-width="2"/>
      <circle cx="100" cy="25" r="7" fill="url(#sg-ring)" stroke="#07080a" stroke-width="1.5"/>
      <path d="M100 17 v-3 M100 33 v3 M92 25 h-3 M108 25 h3" stroke="#aab6c4" stroke-width="1.5"/>
    </g>
  </g>
  </g>
</svg>`;

  /** Builds the joystick UI inside `root` (the stick only: no weapon buttons on it). */
  function mountStick(root) {
    root.innerHTML = `<div class="stick-persp"><div class="stick-3d">${SVG}</div></div>`;
    joyEl = root; gripEl = root.querySelector(".stick-3d");

    root.addEventListener("pointerdown", (e) => {
      if (!enabled || joy.active) return;
      joy.active = true; joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY;
      try { root.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault(); e.stopPropagation();
    });
    root.addEventListener("pointermove", (e) => {
      if (!joy.active || e.pointerId !== joy.id) return;
      let dx = (e.clientX - joy.sx) / C.stickRadiusPx, dy = (e.clientY - joy.sy) / C.stickRadiusPx;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      // the stick follows the thumb: if the thumb drifts past the radius, drag the anchor along
      const over = Math.hypot(e.clientX - joy.sx, e.clientY - joy.sy) - C.stickRadiusPx * 1.6;
      if (over > 0) { const k = over / Math.hypot(e.clientX - joy.sx, e.clientY - joy.sy); joy.sx += (e.clientX - joy.sx) * k; joy.sy += (e.clientY - joy.sy) * k; }
      joy.x = dx; joy.y = dy;
      e.preventDefault();
    });
    const end = (e) => { if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) root.addEventListener(t, end);
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Weapon buttons (bottom left): `root` holds .wbtn[data-w=gun|missile|bomb]. Gun = hold, missile / bomb = tap. */
  function bindWeapons(root) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    const press = (b, on) => b.classList.toggle("pressed", on);
    const bGun = root.querySelector('[data-w="gun"]'), bMsl = root.querySelector('[data-w="missile"]'), bBomb = root.querySelector('[data-w="bomb"]');
    bGun.addEventListener("pointerdown", (e) => { stop(e); gunHeld = true; press(bGun, true); try { bGun.setPointerCapture(e.pointerId); } catch {} });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) bGun.addEventListener(t, () => { gunHeld = false; press(bGun, false); });
    bMsl.addEventListener("pointerdown", (e) => { stop(e); if (enabled) { rocketEdge = true; mslHeld = true; } press(bMsl, true); });
    bBomb.addEventListener("pointerdown", (e) => { stop(e); if (enabled) { bombEdge = true; bombHeld = true; } press(bBomb, true); });
    for (const b of [bMsl, bBomb]) for (const t of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(t, () => { press(b, false); if (b === bMsl) mslHeld = false; else bombHeld = false; });
    for (const b of [bGun, bMsl, bBomb]) b.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** HEAD-LOOK: a swipe on the bare game surface turns only the view (look.yaw: + = look left, look.pitch: + = look up). */
  function bindLookSurface(el) {
    el.addEventListener("pointerdown", (e) => {
      if (!enabled || e.target !== el || lk.active) return;
      lk.active = true; lk.id = e.pointerId; lk.x = e.clientX; lk.y = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener("pointermove", (e) => {
      if (!lk.active || e.pointerId !== lk.id) return;
      const dx = e.clientX - lk.x, dy = e.clientY - lk.y; lk.x = e.clientX; lk.y = e.clientY;
      const cock = lookMode === "cockpit", my = cock ? 2.4 : 3.1, mp = cock ? 1.1 : 0.95;
      look.yaw = Math.max(-my, Math.min(my, look.yaw - dx / innerWidth * C.lookYawPerScreen));
      look.pitch = Math.max(-mp, Math.min(mp, look.pitch - dy / innerHeight * C.lookPitchPerScreen));
      e.preventDefault();
    });
    const end = (e) => { if (lk.active && e.pointerId === lk.id) { lk.active = false; lk.id = null; } };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, end);
  }

  function paintStick() {
    if (!gripEl) return;
    const pv = stick.pitch, rl = stick.roll;
    gripEl.style.transform = `rotateX(${(-pv * 22).toFixed(1)}deg) rotateZ(${(rl * 20).toFixed(1)}deg) translateY(${(-pv * 3).toFixed(1)}px)`;
  }

  function update(dt) {
    // tilt: smoothing + dead zone, relative to the calibrated neutral
    const ks = 1 - Math.exp(-dt * C.tiltSmoothing);
    smPitch += (rawPitch - smPitch) * ks; smRoll += (rawRoll - smRoll) * ks;
    let tp = 0, tr = 0;
    if (gyroOn && gotGyroEvent) {
      let dp = smPitch - zeroPitch, dr = smRoll - zeroRoll;
      const dz = C.tiltDeadZoneDeg;
      dp = Math.abs(dp) < dz ? 0 : dp - Math.sign(dp) * dz;
      dr = Math.abs(dr) < dz ? 0 : dr - Math.sign(dr) * dz;
      tp = -dp / C.tiltRangePitchDeg;   // top of phone up (pitch angle falls) = nose up
      tr = dr / C.tiltRangeRollDeg;
    }
    // joystick (spring back when released)
    if (!joy.active) { const k = Math.exp(-dt * C.stickReturn); joy.x *= k; joy.y *= k; }
    const jp = (C.stickDragUpIsNoseUp ? -joy.y : joy.y), jr = joy.x;
    let kp = 0, kr = 0;
    if (keys.has("w") || keys.has("arrowup")) kp += 1;
    if (keys.has("s") || keys.has("arrowdown")) kp -= 1;
    if (keys.has("a") || keys.has("arrowleft")) kr -= 1;
    if (keys.has("d") || keys.has("arrowright")) kr += 1;
    const p = Math.max(-1, Math.min(1, tp + jp + kp)), r = Math.max(-1, Math.min(1, tr + jr + kr));
    const k = 1 - Math.exp(-dt * 16);
    stick.pitch += (p - stick.pitch) * k;
    stick.roll += (r - stick.roll) * k;
    // head-look eases back to forward when released
    if (!lk.active) { const kk = Math.exp(-dt * C.lookReturn); look.yaw *= kk; look.pitch *= kk; if (Math.abs(look.yaw) < 1e-3) look.yaw = 0; if (Math.abs(look.pitch) < 1e-3) look.pitch = 0; }
    paintStick();
  }

  return {
    stick, look, update, mountStick, bindWeapons, bindLookSurface, bindLoops() {},
    setEnabled(v) { enabled = v; if (!v) { gunHeld = false; joy.active = false; lk.active = false; joy.x = joy.y = 0; } },
    setLookMode(m) { lookMode = m; }, resetLook() { look.yaw = 0; look.pitch = 0; },
    gunHeld: () => gunHeld,
    consumeRocket() { const v = rocketEdge || mslHeld; rocketEdge = false; return v; },
    consumeBomb() { const v = bombEdge || bombHeld; bombEdge = false; return v; },
    consumeLoop() { return 0; },
    consumeView() { const v = viewEdge; viewEdge = false; return v; },
    requestView() { viewEdge = true; },
    boost: () => boostKey,
    gyroActive: () => gyroOn && gotGyroEvent,
    gyroOn: () => gyroOn,
    needsPermission: () => typeof window.DeviceOrientationEvent?.requestPermission === "function",
    /** Call from the single first tap (iOS needs the user gesture). */
    async requestGyro() {
      try {
        const Doe = window.DeviceOrientationEvent;
        if (Doe && typeof Doe.requestPermission === "function") {
          const res = await Doe.requestPermission();
          if (res !== "granted") return false;
        }
        gyroOn = true; wantCal = true;
        return true;
      } catch { return false; }
    },
    calibrate() { wantCal = true; },
    // test hooks
    _setTilt(p, r) { gyroOn = true; gotGyroEvent = true; rawPitch = smPitch = zeroPitch + p; rawRoll = smRoll = zeroRoll + r; },
  };
}
