// Ubu controls.
// - Gyro (DeviceOrientation) steers pitch/roll. Works in landscape AND portrait: the
//   gravity vector is computed in device space from beta/gamma, then rotated into the
//   current screen frame, so there is no gimbal flip when the phone is held upright.
// - Right-side thumb drag moves the camera (head look in cockpit, orbit outside).
// - NO on-screen joystick. Keyboard + mouse fallback for desktop.
const D2R = Math.PI / 180;

export function createControls() {
  const stick = { pitch: 0, roll: 0, yaw: 0 };
  const look = { yaw: 0, pitch: 0 };
  const lookTarget = { yaw: 0, pitch: 0 };
  const keys = new Set();
  const cfg = { invert: false, sens: 1 };
  let gyroOn = false, gotGyroEvent = false;
  let gyroPitch = 0, gyroRoll = 0;
  let zeroPitch = 35, zeroRoll = 0, wantCal = true;
  let gunHeld = false, rocketEdge = false, bombEdge = false, viewEdge = false, boostKey = false, loopEdge = 0;
  let lastLookTouch = -10;
  const lookPointers = new Map();
  let lookMode = "chase";
  let enabled = false;

  try {
    const c = JSON.parse(localStorage.getItem("ubu-controls-v2") || "{}");
    if (typeof c.invert === "boolean") cfg.invert = c.invert;
    if (typeof c.sens === "number") cfg.sens = c.sens;
  } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem("ubu-controls-v2", JSON.stringify(cfg)); } catch { /* ignore */ } };

  function screenAngle() {
    if (typeof window.orientation === "number") return window.orientation; // iOS
    const a = screen.orientation?.angle;
    return typeof a === "number" ? a : 0;
  }

  function readAngles(e) {
    const b = (e.beta || 0) * D2R, g = (e.gamma || 0) * D2R;
    // world-up expressed in device coordinates
    const dx = -Math.sin(g) * Math.cos(b), dy = Math.sin(b), dz = Math.cos(g) * Math.cos(b);
    const th = screenAngle() * D2R;
    const ux = dx * Math.cos(th) - dy * Math.sin(th);
    const uy = dx * Math.sin(th) + dy * Math.cos(th);
    const uz = dz;
    const pitch = Math.atan2(uz, uy) / D2R; // 0 = upright facing you, 90 = flat face-up
    const roll = Math.atan2(-ux, Math.hypot(uy, uz)) / D2R; // + = turned clockwise (bank right)
    return { pitch, roll };
  }

  window.addEventListener("deviceorientation", (e) => {
    if (e.beta == null && e.gamma == null) return;
    gotGyroEvent = true;
    const a = readAngles(e);
    if (wantCal) { zeroPitch = a.pitch; zeroRoll = a.roll; wantCal = false; }
    gyroPitch = a.pitch; gyroRoll = a.roll;
  });
  window.addEventListener("orientationchange", () => { wantCal = true; });
  screen.orientation?.addEventListener?.("change", () => { wantCal = true; });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (!enabled) return;
    if (k === " ") { gunHeld = true; e.preventDefault(); }
    if (k === "f" || k === "r") rocketEdge = true;
    if (k === "b" || k === "g") bombEdge = true;
    if (k === "v" || k === "c") viewEdge = true;
    if (k === "shift") boostKey = true;
    if (k === "l") loopEdge = 1;  // inside loop (nose up, over the top)
    if (k === "k") loopEdge = -1; // outside loop (nose down, under)
    if (k === "j") loopEdge = -2; // barrel roll left
    if (k === ";" || k === "o") loopEdge = 2; // barrel roll right
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === " ") gunHeld = false;
    if (k === "shift") boostKey = false;
  });
  window.addEventListener("blur", () => { keys.clear(); gunHeld = false; });

  // Right-thumb camera drag on the game surface
  function bindLookSurface(el) {
    el.addEventListener("pointerdown", (e) => {
      if (!enabled) return;
      if (e.clientX < window.innerWidth * 0.42) return;
      lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    el.addEventListener("pointermove", (e) => {
      const p = lookPointers.get(e.pointerId);
      if (!p) return;
      const s = 1 / Math.min(window.innerWidth, window.innerHeight);
      lookTarget.yaw -= (e.clientX - p.x) * s * 3.2;
      lookTarget.pitch -= (e.clientY - p.y) * s * 2.4;
      const yawLim = lookMode === "cockpit" ? 2.6 : Math.PI;
      if (lookMode === "cockpit") lookTarget.yaw = Math.max(-yawLim, Math.min(yawLim, lookTarget.yaw));
      lookTarget.pitch = Math.max(lookMode === "cockpit" ? -0.9 : -0.6, Math.min(lookMode === "cockpit" ? 1.2 : 1.2, lookTarget.pitch));
      p.x = e.clientX; p.y = e.clientY;
      lastLookTouch = performance.now() / 1000;
    });
    const end = (e) => { if (lookPointers.delete(e.pointerId)) lastLookTouch = performance.now() / 1000; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  }

  function bindWeapons(gun, rocket, bomb) {
    const down = (fn) => (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); ev.currentTarget.classList.add("pressed"); };
    const up = (ev) => { ev.currentTarget.classList.remove("pressed"); };
    gun.addEventListener("pointerdown", down(() => { gunHeld = true; }));
    const gunUp = (ev) => { gunHeld = false; up(ev); };
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => gun.addEventListener(t, gunUp));
    rocket.addEventListener("pointerdown", down(() => { rocketEdge = true; }));
    bomb.addEventListener("pointerdown", down(() => { bombEdge = true; }));
    for (const b of [rocket, bomb]) ["pointerup", "pointercancel", "pointerleave"].forEach((t) => b.addEventListener(t, up));
    for (const b of [gun, rocket, bomb]) b.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function bindLoops(inside, outside, rollL, rollR) {
    for (const [b, d] of [[inside, 1], [outside, -1], [rollL, -2], [rollR, 2]]) {
      if (!b) continue;
      b.addEventListener("pointerdown", (ev) => { ev.preventDefault(); ev.stopPropagation(); if (enabled) loopEdge = d; b.classList.add("pressed"); });
      for (const t of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(t, () => b.classList.remove("pressed"));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  function update(dt) {
    let p = 0, r = 0;
    if (gyroOn && gotGyroEvent) {
      let dp = gyroPitch - zeroPitch, dr = gyroRoll - zeroRoll;
      const dz = 2.5;
      dp = Math.abs(dp) < dz ? 0 : dp - Math.sign(dp) * dz;
      dr = Math.abs(dr) < dz ? 0 : dr - Math.sign(dr) * dz;
      p = -dp / (24 / cfg.sens); // reversed: pull phone up = nose up
      r = dr / (28 / cfg.sens);
    }
    if (keys.has("w") || keys.has("arrowup")) p -= 1;
    if (keys.has("s") || keys.has("arrowdown")) p += 1;
    if (keys.has("a") || keys.has("arrowleft")) r -= 1;
    if (keys.has("d") || keys.has("arrowright")) r += 1;
    // rudder (desktop): Q / E. On the phone yaw comes from banking (coordinated turn), see game.js.
    let y = 0;
    if (keys.has("q")) y += 1;
    if (keys.has("e")) y -= 1;
    stick.yaw += (y - stick.yaw) * (1 - Math.exp(-dt * 8));
    if (cfg.invert) p = -p;
    p = Math.max(-1, Math.min(1, p)); r = Math.max(-1, Math.min(1, r));
    const k = 1 - Math.exp(-dt * 10);
    stick.pitch += (p - stick.pitch) * k;
    stick.roll += (r - stick.roll) * k;
    const now = performance.now() / 1000;
    if (lookPointers.size === 0 && now - lastLookTouch > (lookMode === "cockpit" ? 1.6 : 2.6)) {
      const kk = Math.min(1, dt * 1.6);
      lookTarget.yaw -= lookTarget.yaw * kk; lookTarget.pitch -= lookTarget.pitch * kk;
    }
    const kl = 1 - Math.exp(-dt * 12);
    look.yaw += (lookTarget.yaw - look.yaw) * kl;
    look.pitch += (lookTarget.pitch - look.pitch) * kl;
  }

  return {
    stick, look, cfg, update, bindLookSurface, bindWeapons, bindLoops,
    setEnabled(v) { enabled = v; if (!v) { gunHeld = false; lookPointers.clear(); } },
    setLookMode(m) { lookMode = m; lookTarget.yaw = 0; lookTarget.pitch = 0; },
    resetLook() { lookTarget.yaw = 0; lookTarget.pitch = 0; },
    gunHeld: () => gunHeld,
    consumeRocket() { const v = rocketEdge; rocketEdge = false; return v; },
    consumeBomb() { const v = bombEdge; bombEdge = false; return v; },
    consumeLoop() { const v = loopEdge; loopEdge = 0; return v; },
    consumeView() { const v = viewEdge; viewEdge = false; return v; },
    boost: () => boostKey,
    gyroActive: () => gyroOn && gotGyroEvent,
    gyroOn: () => gyroOn,
    needsPermission: () => typeof window.DeviceOrientationEvent?.requestPermission === "function",
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
    setInvert(v) { cfg.invert = !!v; save(); },
    setSens(v) { cfg.sens = v; save(); },
  };
}
