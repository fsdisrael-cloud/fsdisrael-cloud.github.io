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
  stickDragUpIsNoseUp: true,  // build 19 default: push the stick UP = nose UP (climb). INVERT PITCH toggle (settings) = real aircraft style
  stickRadiusPx: 56,         // drag distance for full deflection
  tiltRangePitchDeg: 22,     // degrees of tilt for full pitch input
  tiltRangeRollDeg: 26,      // degrees of tilt for full roll input
  tiltDeadZoneDeg: 5,
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
  let gyroOn = false, gotGyroEvent = false, tiltPref = false, permOk = false; try { tiltPref = localStorage.getItem("jet-tilt-v2") === "1"; } catch { /* ignore */ }
  let invertLook = false; try { invertLook = localStorage.getItem("jet-look-invert") === "1"; } catch {}
  let invertPitch = false; try { invertPitch = localStorage.getItem("jet-invert-v3") === "1"; } catch { /* ignore */ }
  let rawPitch = 0, rawRoll = 0, smPitch = 0, smRoll = 0;
  let zeroPitch = 35, zeroRoll = 0, wantCal = true, calAt = 0;
  let tgtEdge = 0, mslHeld = false, bombHeld = false, gunHeld = false, rocketEdge = false, bombEdge = false, viewEdge = false, boostKey = false, flareEdge = false, brakeHeld = false, brakeKey = false;
  // b24 one-finger mode: double-tap the stick = missile, triple-tap = bomb (short taps with almost no deflection, so they never move the jet)
  let tapN = 0, tapLast = 0, tapTO = 0, rollEdge = 0, flickDir = 0, flickAt = -1000;
  const joy = { x: 0, y: 0, active: false, id: null, sx: 0, sy: 0 };
  const lk = { active: false, id: null, x: 0, y: 0 };
  let lookMode = "chase";
  let joyEl = null, gripEl = null, shadowEl = null;
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
    if (k === "x" || k === "e") flareEdge = true;
    if (k === "z" || k === "control") brakeKey = true;
    if (k.startsWith("arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === " ") gunHeld = false;
    if (k === "shift") boostKey = false;
    if (k === "z" || k === "control") brakeKey = false;
  });
  window.addEventListener("blur", () => { keys.clear(); gunHeld = false; });

  // ---------- on-screen HOTAS stick ----------
  const SVG = `
<svg class="stick-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="tb-base" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#4a525e"/><stop offset=".7" stop-color="#1c2128"/><stop offset="1" stop-color="#0b0d11"/></radialGradient>
    <radialGradient id="tb-boot" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="#3a414b"/><stop offset=".65" stop-color="#171b21"/><stop offset="1" stop-color="#0a0c0f"/></radialGradient>
    <radialGradient id="tb-grip" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="#75808f"/><stop offset=".55" stop-color="#363e48"/><stop offset="1" stop-color="#0d0f13"/></radialGradient>
    <radialGradient id="tb-hat" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#7d8896"/><stop offset="1" stop-color="#232a32"/></radialGradient>
  </defs>
  <circle cx="100" cy="100" r="97" fill="url(#tb-base)" stroke="#05070a" stroke-width="3"/>
  <circle cx="100" cy="100" r="92" fill="none" stroke="#6b7684" stroke-width="1.5" opacity=".7"/>
  <circle cx="188.0" cy="100.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="176.2" cy="144.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="144.0" cy="176.2" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="100.0" cy="188.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="56.0" cy="176.2" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="23.8" cy="144.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="12.0" cy="100.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="23.8" cy="56.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="56.0" cy="23.8" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="100.0" cy="12.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="144.0" cy="23.8" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/><circle cx="176.2" cy="56.0" r="2.6" fill="#9aa5b3" stroke="#0a0c10" stroke-width=".8"/>
  <path d="M100 4 l7 12 h-14Z" fill="#e8892a" stroke="#05070a" stroke-width="1"/>
  <circle cx="100" cy="100" r="74" fill="none" stroke="#2c333c" stroke-width="3"/>
  <circle cx="100" cy="100" r="66" fill="url(#tb-boot)" stroke="#05070a" stroke-width="2.5"/>
  <circle cx="100" cy="100" r="57" fill="none" stroke="#3d4551" stroke-width="2" opacity=".8"/>
  <circle cx="100" cy="100" r="49" fill="none" stroke="#3d4551" stroke-width="2" opacity=".6"/>
  <g class="stick-shadow"><ellipse cx="106" cy="114" rx="36" ry="46" fill="#000" opacity=".45"/></g>
  <g class="stick-grip" transform="rotate(-8 100 100)">
    <path d="M100 52 Q132 52 135 90 Q137 124 124 142 Q112 152 98 152 Q82 150 74 132 Q64 104 70 80 Q76 52 100 52Z" fill="url(#tb-grip)" stroke="#040507" stroke-width="2.5"/>
    <path d="M78 76 Q82 58 100 57" stroke="#aab6c4" stroke-width="2.2" fill="none" opacity=".45" stroke-linecap="round"/>
    <path d="M131 96 q9 8 0 16 M130 118 q9 8 -1 15" stroke="#05060a" stroke-width="2.4" fill="none" opacity=".85"/>
    <path d="M73 112 q-7 8 0 17" stroke="#05060a" stroke-width="2.2" fill="none" opacity=".7"/>
    <circle cx="98" cy="82" r="17" fill="#0b0e12" stroke="#030405" stroke-width="2"/>
    <circle cx="98" cy="82" r="12.5" fill="url(#tb-hat)" stroke="#59636f" stroke-width="1"/>
    <path d="M98 71 v22 M87 82 h22" stroke="#07090c" stroke-width="3.6"/>
    <circle cx="98" cy="82" r="4.6" fill="#3b4450" stroke="#06070a" stroke-width="1"/>
    <path d="M98 69 l3 3.5 h-6Z M98 95 l3 -3.5 h-6Z M85 82 l3.5 -3 v6Z M111 82 l-3.5 -3 v6Z" fill="#9aa6b4" opacity=".65"/>
    <circle cx="121" cy="104" r="7.5" fill="#0b0e12" stroke="#030405" stroke-width="1.6"/><circle cx="121" cy="104" r="4.4" fill="#2d343d"/>
    <circle cx="79" cy="98" r="9" fill="#14100f" stroke="#030405" stroke-width="1.8"/><circle cx="79" cy="98" r="5.8" fill="#c8322a" stroke="#4a0f0b" stroke-width="1"/><circle cx="77" cy="96" r="1.6" fill="#ff9a8f" opacity=".75"/>
    <rect x="86" y="120" width="30" height="10" rx="4" fill="#0d1014" stroke="#030405" stroke-width="1.5"/><rect x="90" y="122.5" width="10" height="5" rx="2" fill="#4a5360"/>
    <path d="M82 60 Q100 54 120 60" stroke="#d63b2f" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
  </g>
</svg>`;

  // build 23: pointer (mouse) + touch events by identifier, so several fingers never interfere with each other
  function bindTP(el, h) {
    el.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") return; try { el.setPointerCapture(e.pointerId); } catch {} h.down(e, "p" + e.pointerId, e.clientX, e.clientY); e.preventDefault(); e.stopPropagation(); });
    el.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; h.move?.(e, "p" + e.pointerId, e.clientX, e.clientY); });
    for (const t of ["pointerup", "pointercancel"]) el.addEventListener(t, (e) => { if (e.pointerType === "touch") return; h.up?.(e, "p" + e.pointerId, t); });
    el.addEventListener("lostpointercapture", (e) => { if (e.pointerType === "touch") return; h.up?.(e, "p" + e.pointerId, "pointercancel"); });
    el.addEventListener("touchstart", (e) => { for (const t of e.changedTouches) h.down(e, "t" + t.identifier, t.clientX, t.clientY); if (e.cancelable) e.preventDefault(); e.stopPropagation(); }, { passive: false });
    el.addEventListener("touchmove", (e) => { for (const t of e.changedTouches) h.move?.(e, "t" + t.identifier, t.clientX, t.clientY); if (e.cancelable) e.preventDefault(); }, { passive: false });
    for (const n of ["touchend", "touchcancel"]) el.addEventListener(n, (e) => { for (const t of e.changedTouches) h.up?.(e, "t" + t.identifier, n); if (e.cancelable) e.preventDefault(); }, { passive: false });
  }
  const say = (name) => { try { window.dispatchEvent(new CustomEvent("jet-ctl", { detail: name })); } catch { /* ignore */ } };
  /** Builds the joystick UI inside `root` (the stick only: no weapon buttons on it). */
  function mountStick(root) {
    root.innerHTML = `<div class="stick-persp"><div class="stick-3d">${SVG}</div></div>`;
    joyEl = root; gripEl = root.querySelector(".stick-grip"); shadowEl = root.querySelector(".stick-shadow");

    // build 23: touches are tracked by identifier (touch events) so the stick thumb and any weapon thumb work at the same time
    bindTP(root, {
      down(e, id, x, y) {
        if (!enabled || joy.active) return;
        joy.active = true; joy.id = id; joy.sx = x; joy.sy = y; joy.t0 = e.timeStamp || performance.now(); joy.maxd = 0; joy.side = 0;
        say("stick");
      },
      move(e, id, x, y) {
        if (!joy.active || id !== joy.id) return;
        let dx = (x - joy.sx) / C.stickRadiusPx, dy = (y - joy.sy) / C.stickRadiusPx;
        const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        const dist = Math.hypot(x - joy.sx, y - joy.sy), over = dist - C.stickRadiusPx * 1.6;
        if (over > 0) { const k = over / dist; joy.sx += (x - joy.sx) * k; joy.sy += (y - joy.sy) * k; }
        if (Math.abs(dx) > 0.72 && Math.abs(dy) < 0.45) joy.side = Math.sign(dx);
        joy.x = dx; joy.y = dy; joy.maxd = Math.max(joy.maxd || 0, m);
      },
      up(e, id, eventType) {
        if (!(joy.active && id === joy.id)) return;
        joy.active = false; joy.id = null;
        const now = e.timeStamp || performance.now();   // input time, not handler time: robust when a frame is slow
        if (eventType === "pointercancel" || eventType === "touchcancel") { clearTimeout(tapTO); tapN = 0; joy.x = joy.y = 0; return; }
        if (joy.maxd > 0.5) { clearTimeout(tapTO); tapN = 0; }
        if (enabled && joy.side && now - joy.t0 < 250) {
          if (joy.side === flickDir && now - flickAt < 480) { rollEdge = joy.side * 2; flickAt = -1000; say("roll"); }
          else { flickDir = joy.side; flickAt = now; }
        }
        if (enabled && now - (joy.t0 || 0) < 230 && (joy.maxd || 0) < 0.32) {
          if (now - tapLast > 340) tapN = 0;
          tapLast = now; tapN++;
          clearTimeout(tapTO);
          if (tapN >= 2) { tapN = 0; bombEdge = true; say("bomb"); joy.x = joy.y = 0; }
          else if (tapN === 1) { tapTO = setTimeout(() => { tapN = 0; if (enabled) { rocketEdge = true; say("missile"); } }, 300); }
        } else tapN = 0;
      },
    });
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** b24: flare + airbrake buttons just above the stick */
  function bindAux(root) {
    if (!root) return;
    const press = (b, on) => b.classList.toggle("pressed", on);
    const bF = root.querySelector('[data-w="flare"]'), bB = root.querySelector('[data-w="brake"]');
    let idB = null;
    bF && bindTP(bF, { down(e, id) { if (enabled) flareEdge = true; press(bF, true); say("flare"); }, up(e, id) { press(bF, false); } });
    bB && bindTP(bB, { down(e, id) { idB = id; brakeHeld = true; press(bB, true); say("brake"); }, up(e, id) { if (id === idB) { idB = null; brakeHeld = false; press(bB, false); } } });
    for (const b of [bF, bB]) b && b.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Weapon buttons (bottom left): `root` holds .wbtn[data-w=gun|missile|bomb]. Gun = hold (push-to-fire), missile / bomb = tap. Each button tracks its own touch. */
  function bindWeapons(root) {
    const press = (b, on) => b.classList.toggle("pressed", on);
    const bGun = root.querySelector('[data-w="gun"]'), bMsl = root.querySelector('[data-w="missile"]'), bBomb = root.querySelector('[data-w="bomb"]');
    const own = { gun: null, msl: null, bomb: null, up: null, dn: null };
    bindTP(bGun, { down(e, id) { own.gun = id; gunHeld = true; press(bGun, true); say("gun"); }, up(e, id) { if (id === own.gun) { own.gun = null; gunHeld = false; press(bGun, false); } } });
    bindTP(bMsl, { down(e, id) { own.msl = id; if (enabled) { rocketEdge = true; mslHeld = true; } press(bMsl, true); say("missile"); }, up(e, id) { if (id === own.msl) { own.msl = null; mslHeld = false; press(bMsl, false); } } });
    bindTP(bBomb, { down(e, id) { own.bomb = id; bombEdge = true; bombHeld = true; press(bBomb, true); say("bomb"); }, up(e, id) { if (id === own.bomb) { own.bomb = null; bombHeld = false; press(bBomb, false); } } });
    const bUp = root.querySelector('[data-w="tgt-up"]'), bDn = root.querySelector('[data-w="tgt-dn"]');
    if (bUp) bindTP(bUp, { down(e, id) { tgtEdge = -1; press(bUp, true); say("tgt"); }, up(e, id) { press(bUp, false); } });
    if (bDn) bindTP(bDn, { down(e, id) { tgtEdge = 1; press(bDn, true); say("tgt"); }, up(e, id) { press(bDn, false); } });
    for (const b of [bGun, bMsl, bBomb, bUp, bDn]) b && b.addEventListener("contextmenu", (e) => e.preventDefault());
    // b26 BOMB-BUTTON FIX: (1) a touch that lands just OUTSIDE a button's art (fat thumbs, rotated layouts) still counts: hit-test every touch against
    // slightly inflated button rectangles; (2) held flags are cleared when the page loses focus / a touch is cancelled, so nothing sticks or goes dead.
    const fat = [[bBomb, () => { bombEdge = true; bombHeld = true; setTimeout(() => { bombHeld = false; }, 120); press(bBomb, true); setTimeout(() => press(bBomb, false), 140); say("bomb"); }],
                 [bMsl, () => { if (enabled) rocketEdge = true; press(bMsl, true); setTimeout(() => press(bMsl, false), 140); say("missile"); }]];
    window.addEventListener("touchstart", (e) => {
      if (!enabled) return;
      for (const t of e.changedTouches) for (const [b, fn] of fat) {
        if (!b || e.target?.closest?.("button, #thr, #stick, #aux")) continue;
        const r = b.getBoundingClientRect(); if (!r.width) continue;
        if (t.clientX >= r.left - 12 && t.clientX <= r.right + 12 && t.clientY >= r.top - 12 && t.clientY <= r.bottom + 12) fn();
      }
    }, { capture: true, passive: true });
    const clearHeld = () => { gunHeld = bombHeld = mslHeld = brakeHeld = false; own.gun = own.msl = own.bomb = null; for (const b of [bGun, bMsl, bBomb]) b && press(b, false); };
    window.addEventListener("blur", clearHeld); document.addEventListener("visibilitychange", () => { if (document.hidden) clearHeld(); });
    window.addEventListener("touchcancel", (e) => { if (e.touches.length === 0) clearHeld(); });
    window.addEventListener("touchend", (e) => { if (e.touches.length === 0) { gunHeld = bombHeld = mslHeld = false; own.gun = own.msl = own.bomb = null; for (const b of [bGun, bMsl, bBomb]) b && press(b, false); } }, { capture: true });
  }

  /** HEAD-LOOK: a swipe on the bare game surface turns only the view (look.yaw: + = look left, look.pitch: + = look up). A short tap selects a target. */
  function bindLookSurface(el) {
    bindTP(el, {
      down(e, id, x, y) {
        if (!enabled || e.target !== el || lk.active) return;
        lk.active = true; lk.id = id; lk.x = x; lk.y = y; lk.t0 = performance.now(); lk.moved = 0; lk.sx = x; lk.sy = y;
      },
      move(e, id, x, y) {
        if (!lk.active || id !== lk.id) return;
        const dx = x - lk.x, dy = y - lk.y; lk.x = x; lk.y = y; lk.moved = (lk.moved || 0) + Math.hypot(dx, dy);
        const tnow = performance.now(); lk.v = (lk.v || 0) * 0.6 + 0.4 * Math.hypot(dx / innerWidth, dy / innerHeight) / Math.max(0.008, (tnow - (lk.t || tnow - 16)) / 1000); lk.t = tnow;
        const cock = lookMode === "cockpit", my = cock ? 2.4 : 3.1, mp = cock ? 1.1 : 0.95;
        look.yaw = Math.max(-my, Math.min(my, look.yaw - dx / innerWidth * C.lookYawPerScreen));
        look.pitch = Math.max(-mp, Math.min(mp, look.pitch + dy / innerHeight * C.lookPitchPerScreen * (invertLook ? -1 : 1)));
      },
      up(e, id, type) {
        if (!lk.active || id !== lk.id) return;
        if (!/cancel/.test(type || "") && (lk.moved || 0) < 12 && performance.now() - (lk.t0 || 0) < 420) window.dispatchEvent(new CustomEvent("jet-tap", { detail: { x: lk.sx, y: lk.sy } }));
        lk.active = false; lk.id = null; lk.rel = Math.min(1.6, (lk.v || 0) * 0.35); lk.v = 0; lk.t = 0;
      },
    });
  }

  function paintStick() {
    if (!gripEl) return;
    const pv = stick.pitch, rl = stick.roll;
    // pulled back (pitch > 0, nose up) = grip moves DOWN toward the pilot; right roll = grip moves right and leans right.
    // Driven by the final combined input (thumb + tilt + keys) every frame. SVG attribute transforms work on every browser (iOS included).
    const pd = invertPitch ? -1 : 1;   // real-jet style: default pull toward the pilot (grip DOWN) = nose up
    const gx = rl * 26, gy = pv * 26 * pd, lean = -8 + rl * 16 + pv * 3;
    gripEl.setAttribute("transform", `translate(${gx.toFixed(1)} ${gy.toFixed(1)}) rotate(${lean.toFixed(1)} 100 100) scale(${(1 + Math.abs(pv) * 0.05 + Math.abs(rl) * 0.03).toFixed(3)})`);
    // the shadow lags the grip and slides away from it (grip rises toward the viewer when deflected)
    if (shadowEl) shadowEl.setAttribute("transform", `translate(${(rl * 15 + Math.abs(rl) * 3).toFixed(1)} ${(pv * 15 * pd + Math.abs(pv) * 3 + Math.abs(rl) * 2).toFixed(1)})`);
  }

  function update(dt) {
    // tilt: smoothing + dead zone, relative to the calibrated neutral
    const ks = 1 - Math.exp(-dt * C.tiltSmoothing);
    smPitch += (rawPitch - smPitch) * ks; smRoll += (rawRoll - smRoll) * ks;
    let tp = 0, tr = 0;
    if (gyroOn && gotGyroEvent && tiltPref) {
      let dp = smPitch - zeroPitch, dr = smRoll - zeroRoll;
      const dz = C.tiltDeadZoneDeg;
      dp = Math.abs(dp) < dz ? 0 : dp - Math.sign(dp) * dz;
      dr = Math.abs(dr) < dz ? 0 : dr - Math.sign(dr) * dz;
      tp = -dp / C.tiltRangePitchDeg * (invertPitch ? -1 : 1);   // top of phone up (pitch angle falls) = nose up (flipped by INVERT)
      tr = dr / C.tiltRangeRollDeg;
    }
    // joystick (spring back when released)
    if (!joy.active) { const k = Math.exp(-dt * C.stickReturn); joy.x *= k; joy.y *= k; }
    const jp = (invertPitch ? -joy.y : joy.y), jr = joy.x;
    let kp = 0, kr = 0;
    const kd = invertPitch ? 1 : -1;
    if (keys.has("w") || keys.has("arrowup")) kp += kd;
    if (keys.has("s") || keys.has("arrowdown")) kp -= kd;
    if (keys.has("a") || keys.has("arrowleft")) kr -= 1;
    if (keys.has("d") || keys.has("arrowright")) kr += 1;
    const p = Math.max(-1, Math.min(1, tp + jp + kp)), r = Math.max(-1, Math.min(1, tr + jr + kr));
    const k = 1 - Math.exp(-dt * 34);
    stick.pitch += (p - stick.pitch) * k;
    stick.roll += (r - stick.roll) * k;
    // head-look eases back to forward when released
    if (!lk.active) { const far = Math.min(1.5, Math.hypot(look.yaw, look.pitch) / 1.2); const kk = Math.exp(-dt * C.lookReturn * (0.7 + far + (lk.rel || 0))); look.yaw *= kk; look.pitch *= kk; if (Math.abs(look.yaw) < 1e-3) look.yaw = 0; if (Math.abs(look.pitch) < 1e-3) look.pitch = 0; }
    paintStick();
  }

  return {
    stick, look, update, mountStick, bindWeapons, bindAux, bindLookSurface, bindLoops() {},
    setEnabled(v) { enabled = v; if (!v) { gunHeld = false; brakeHeld = false; joy.active = false; lk.active = false; joy.x = joy.y = 0; } },
    setLookMode(m) { lookMode = m; }, resetLook() { look.yaw = 0; look.pitch = 0; },
    gunHeld: () => gunHeld,
    consumeRocket() { const v = rocketEdge || mslHeld; rocketEdge = false; return v; },
    consumeBomb() { const v = bombEdge || bombHeld; bombEdge = false; return v; },
    consumeLoop() { const n = rollEdge; rollEdge = 0; return n; },
    consumeFlare() { const v = flareEdge; flareEdge = false; return v; },
    brake: () => brakeHeld || brakeKey,
    consumeTgt() { const v = tgtEdge; tgtEdge = 0; return v; },
    consumeView() { const v = viewEdge; viewEdge = false; return v; },
    requestView() { viewEdge = true; },
    boost: () => boostKey,
    gyroActive: () => gyroOn && gotGyroEvent && tiltPref,
    tiltOn: () => tiltPref && (permOk || typeof window.DeviceOrientationEvent?.requestPermission !== "function"),
    setTilt(v) { tiltPref = !!v; wantCal = true; try { localStorage.setItem("jet-tilt-v2", tiltPref ? "1" : "0"); } catch { /* ignore */ } },
    /** Game start: never prompts. Platforms without a permission API (Android, desktop) just switch the sensor on if TILT is on. */
    startTiltIfAllowed() { if (tiltPref && typeof window.DeviceOrientationEvent?.requestPermission !== "function") { gyroOn = true; wantCal = true; } else if (permOk) wantCal = true; },
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
        permOk = true; gyroOn = true; wantCal = true;
        return true;
      } catch { return false; }
    },
    calibrate() { wantCal = true; },
    invertLookOn: () => invertLook,
    setInvertLook(v) { invertLook = !!v; try { localStorage.setItem("jet-look-invert", invertLook ? "1" : "0"); } catch {} },
    invertOn: () => invertPitch,
    setInvert(v) { invertPitch = !!v; try { localStorage.setItem("jet-invert-v3", invertPitch ? "1" : "0"); } catch { /* ignore */ } },
    _joy(x, y) { if (x == null) { joy.active = false; return; } joy.active = true; joy.x = x; joy.y = y; },
    // test hooks
    _setTilt(p, r) { gyroOn = true; gotGyroEvent = true; rawPitch = smPitch = zeroPitch + p; rawRoll = smRoll = zeroRoll + r; },
  };
}
