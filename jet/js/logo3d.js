// Layered 3D logo: emblem plate (back), chrome letters + jet (middle, own specular sweep), embers (front).
// Tilt the phone (DeviceOrientation) and the layers parallax + the whole plate rotates a few degrees, like a depth wallpaper.
// Fallbacks: touch/mouse drag tilts it, and an idle float runs when nothing else moves it.
const V = "?v=23";
export function logo3dHTML(cls = "") {
  let em = "";
  for (let i = 0; i < 16; i++) {
    const r = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
    em += `<i style="--x:${r(8, 92)}%;--y:${r(55, 95)}%;--s:${r(2, 4.2)}px;--d:${r(2.6, 5.2)}s;--t:${r(0, 4)}s;--dx:${r(-14, 14)}px"></i>`;
  }
  return `<div class="logo3d ${cls}" role="img" aria-label="JET-X"><div class="l3-stage"><img class="l3-plate" src="img/logo7_plate.webp${V}" alt="" draggable="false"><img class="l3-letters" src="img/logo7_letters.webp${V}" alt="" draggable="false"><div class="l3-shine"></div><div class="l3-embers">${em}</div></div></div>`;
}
let started = false;
export function initLogo3d() {
  if (started) return; started = true;
  const root = document.documentElement;
  let tx = 0, ty = 0, cx = 0, cy = 0;      // target / current (-1..1)
  let gx = null, gy = null, base = null, gyroLive = false, dragLive = 0, lastGyro = 0;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const portraitAngle = () => { const o = (screen.orientation && screen.orientation.angle) || window.orientation || 0; return o; };
  window.addEventListener("deviceorientation", (e) => {
    if (e.beta == null || e.gamma == null) return;
    let b = e.beta, g = e.gamma; const ang = portraitAngle();
    // map device axes to screen axes for landscape
    let x = g, y = b;
    if (ang === 90) { x = b; y = -g; } else if (ang === -90 || ang === 270) { x = -b; y = g; } else if (ang === 180) { x = -g; y = -b; }
    if (!base) base = { x, y, b: y };
    // slowly re-centre so the "rest" pose is however the phone is held now
    base.x += (x - base.x) * 0.004; base.y += (y - base.y) * 0.004;
    gx = clamp((x - base.x) / 22); gy = clamp((y - base.y) / 22);
    lastGyro = performance.now(); gyroLive = true;
  });
  // no permission prompt here: device orientation only drives the logo if it is already available (iOS: after TILT was switched on)
  // drag fallback
  let down = false, sx = 0, sy = 0;
  window.addEventListener("pointerdown", (e) => { down = true; sx = e.clientX; sy = e.clientY; }, { passive: true });
  window.addEventListener("pointermove", (e) => { if (!down) return; dragLive = performance.now(); tx = clamp((e.clientX - sx) / 160); ty = clamp((e.clientY - sy) / 160); }, { passive: true });
  const up = () => { down = false; dragLive = performance.now(); tx = ty = 0; };
  window.addEventListener("pointerup", up, { passive: true }); window.addEventListener("pointercancel", up, { passive: true });
  const frame = (now) => {
    const t = now / 1000;
    const gyroOn = gyroLive && now - lastGyro < 1200 && now - dragLive > 1500;
    let wx, wy;
    if (gyroOn) { wx = gx; wy = gy; }
    else { wx = tx + Math.sin(t * 0.7) * 0.28 * (down ? 0 : 1); wy = ty + Math.cos(t * 0.53) * 0.2 * (down ? 0 : 1); }
    cx += (wx - cx) * 0.09; cy += (wy - cy) * 0.09;
    root.style.setProperty("--lx", cx.toFixed(4)); root.style.setProperty("--ly", cy.toFixed(4));
    const ph = (t % 5.6) / 5.6;              // idle sweep: band crosses the letters, then rests off-screen
    root.style.setProperty("--sw", (95 - Math.min(1, ph * 1.5) * 105 - cx * 28).toFixed(1));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
