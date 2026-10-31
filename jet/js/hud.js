// Ubu HUD: round radar (top), target markers / lock / crosshair / bomb circle (2D overlay), DOM readouts.
import * as THREE from "three";
import { LABEL } from "./missions.js?v=17";

const ALLY = "#3dff8b";
const COL = { jet: "#ff3b3b", tank: "#ff5a48", flak: "#ff4636", sam: "#ff3a2a", base: "#ff6a58", ship: "#ff5a48", pad: "#3dff8b", ring: "#ffe14d" };
const v = new THREE.Vector3();

export function createHud() {
  const cv = document.getElementById("hud-canvas");
  const ctx = cv.getContext("2d");
  const radar = document.getElementById("radar");
  const rctx = radar.getContext("2d");
  const el = (id) => document.getElementById(id);
  const dom = { timer: el("hud-timer"), score: el("hud-score"), obj: el("hud-obj"), hp: el("hud-hp"), spd: el("hud-spd"), thr: el("thr-spd"), alt: el("hud-alt"), alert: el("alert"), toasts: el("toasts"), flash: el("hit-flash"), low: el("low-alt"), edge: el("low-edge"),
    tlabel: el("hud-time-label"), heat: el("hud-heat"), heatRow: document.querySelector(".statrow.heat"),
    bGun: document.querySelector(".w-gun"), bMsl: document.querySelector(".w-msl"), bBomb: document.querySelector(".w-bomb") };
  let dpr = 1, W = 0, H = 0, domT = 0, radarT = 0, sweep = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const rs = radar.getBoundingClientRect().width || 120;
    radar.width = radar.height = Math.round(rs * dpr);
  }

  function project(p, cam) {
    v.copy(p).project(cam);
    const behind = v.z > 1;
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind, on: !behind && v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 };
  }

  function circle(x, y, r, color, lw = 3) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = lw + 3; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
  }

  function draw(s, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!s.player) return;
    const cam = s.camera;
    // crosshair: point 500 m ahead of the nose
    v.copy(s.player.pos).addScaledVector(s.fwd, 500);
    const ch = project(v, cam);
    if (ch.on) {
      circle(ch.x, ch.y, 13, "#ffffff", 2.5);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ch.x, ch.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // targets
    const arrows = [];
    for (const t of s.targets) {
      if (!t.alive) continue;
      const d = t.pos.distanceTo(s.player.pos);
      const pr = project(t.pos, cam);
      const color = COL[t.kind] || "#fff";
      if (pr.on && d < 9000) {
        const r = Math.max(11, Math.min(40, 2200 / Math.max(d, 1) * (t.radius / 8)));
        brackets(pr.x, pr.y, r, color, t.objective ? 3.2 : 2.2);
        if (t === s.lockTarget) {
          ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(s.elapsed * 3);
          ctx.setLineDash([8, 6]); circle(0, 0, r + 9, "#ff3b3b", 3); ctx.restore(); ctx.setLineDash([]);
          label(pr.x, pr.y + r + 24, "LOCK", "#ff3b3b");
        } else if (t === s.lockCand && s.lockTime > 0) {
          circle(pr.x, pr.y, r + 9 - s.lockTime * 15, "rgba(255,80,80,0.8)", 2);
        }
        if (d < 2500 || t === s.lockTarget) label(pr.x, pr.y - r - 8, d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`, "#fff", 11);
      } else if (t.objective) arrows.push({ t, d, pr });
    }
    // friendly forces: small green diamond markers (never targetable)
    for (const a of s.allies || []) {
      if (!a.alive) continue;
      const d = a.pos.distanceTo(s.player.pos);
      if (d > 7000) continue;
      const pr = project(a.pos, cam);
      if (!pr.on) continue;
      const r = Math.max(10, Math.min(30, 1800 / Math.max(d, 1) * (a.radius / 8)));
      brackets(pr.x, pr.y, r, "#3dff8b", 2.2);
      if (d < 1800) label(pr.x, pr.y - r - 8, "FRIEND", ALLY, 10);
    }
    // carrier marker
    if (s.pad) {
      const d = s.pad.pos.distanceTo(s.player.pos), pr = project(s.pad.pos, cam);
      if (pr.on) { circle(pr.x, pr.y, s.landingOpen ? 20 : 12, COL.pad, s.landingOpen ? 3.5 : 2); label(pr.x, pr.y - (s.landingOpen ? 30 : 20), s.landingOpen ? "LAND" : "CARRIER", COL.pad, 12); }
      else if (s.landingOpen) arrows.push({ t: { kind: "pad", pos: s.pad.pos }, d, pr });
    }
    // rings
    if (s.rings.next) {
      const r = s.rings.next;
      const pr = project(r.pos, cam);
      if (pr.on) { circle(pr.x, pr.y, 16, COL.ring, 3); label(pr.x, pr.y - 26, "NEXT", COL.ring, 11); }
      else arrows.push({ t: { kind: "ring", pos: r.pos }, d: r.pos.distanceTo(s.player.pos), pr });
    }
    arrows.sort((a, b) => a.d - b.d);
    for (const a of arrows.slice(0, 3)) edgeArrow(a.t.pos, cam, COL[a.t.kind] || "#fff");
    // incoming missiles
    for (const m of s.missiles) if (m.active) { const pr = project(m.p, cam); if (pr.on) { circle(pr.x, pr.y, 10, "#ff2222", 3); label(pr.x, pr.y - 18, "MISSILE", "#ff4444", 11); } else edgeArrow(m.p, cam, "#ff2222", true); }
    // CCIP marker
    if (s.ccip) { const pr = project(s.ccip, cam); if (pr.on) { circle(pr.x, pr.y, 9, "#ff8a2a", 3); ctx.fillStyle = "#ff8a2a"; ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, 7); ctx.fill(); } }

    domT -= dt;
    if (domT <= 0) { domT = 0.12; updateDom(s); }
    radarT -= dt; sweep += dt * 2.6;
    if (radarT <= 0) { radarT = 1 / 20; drawRadar(s); }
  }

  // corner brackets (red = enemy, green = friendly)
  function brackets(x, y, r, color, w) {
    const k = r * 0.45;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [lw, st] of [[w + 2.2, "rgba(0,0,0,.65)"], [w, color]]) {
      ctx.lineWidth = lw; ctx.strokeStyle = st; ctx.beginPath();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.moveTo(x + sx * r, y + sy * (r - k)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - k), y + sy * r); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function label(x, y, text, color, size = 13) {
    ctx.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function edgeArrow(p, cam, color, warn = false) {
    // direction in camera space
    v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    let ang = Math.atan2(-v.y, v.x);
    if (v.z > 0 && Math.abs(v.x) < 1e-3) ang = Math.PI / 2;
    const cx = W / 2, cy = H / 2, rx = W / 2 - 46, ry = H / 2 - 56;
    const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.quadraticCurveTo(-2, 0, -8, 11); ctx.closePath();
    ctx.lineWidth = 3.5; ctx.strokeStyle = "#000"; ctx.lineJoin = "round"; ctx.stroke();
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
    if (warn) label(x, y + 24, "!", color, 16);
  }

  // ---------- round radar (top left) ----------
  // Rotates with the jet heading (up = where the nose points). Red triangles = enemy planes (pointing along their heading),
  // orange squares = ground targets, orange base icon = army base, green ship icon = carrier. Sweep line + fading trail.
  const RADAR_RANGE = 6500;
  // build 15: brushed-steel bezel with machined chamfer, specular arcs, bolts and dial ticks (pre-rendered once per size)
  let bezelCv = null, bezelS = 0;
  function bezelFor(S, Ro) {
    if (bezelCv && bezelS === S) return bezelCv;
    const cv2 = document.createElement("canvas"); cv2.width = cv2.height = S; bezelS = S; bezelCv = cv2;
    const b = cv2.getContext("2d"), c = S / 2;
    b.beginPath(); b.arc(c, c, Ro, 0, 7); b.fillStyle = "#1a1f26"; b.fill();
    b.save(); b.beginPath(); b.arc(c, c, Ro, 0, 7); b.clip();
    // brushed circular grain: many hairline arcs of varying grey
    let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 170; i++) {
      const r = Ro * (0.7 + rnd() * 0.3), l = 60 + rnd() * 90;
      b.strokeStyle = `rgba(${l},${l + 6},${l + 14},${0.22 + rnd() * 0.25})`; b.lineWidth = 0.6 + rnd() * 0.7;
      b.beginPath(); b.arc(c, c, r, rnd() * 6.28, rnd() * 6.28 + 2); b.stroke();
    }
    // anisotropic highlight (conic) top-left + lower-right
    const cg = b.createConicGradient ? b.createConicGradient(-2.4, c, c) : null;
    if (cg) { cg.addColorStop(0, "rgba(255,255,255,.55)"); cg.addColorStop(0.1, "rgba(255,255,255,0)"); cg.addColorStop(0.42, "rgba(0,0,0,.42)"); cg.addColorStop(0.55, "rgba(255,255,255,.28)"); cg.addColorStop(0.7, "rgba(0,0,0,.4)"); cg.addColorStop(1, "rgba(255,255,255,.55)"); b.fillStyle = cg; b.fillRect(0, 0, S, S); }
    b.restore();
    // chamfer rim + inner shadow lip
    b.lineWidth = Math.max(1, Ro * 0.03); b.strokeStyle = "rgba(255,255,255,.35)"; b.beginPath(); b.arc(c, c, Ro - b.lineWidth * 0.5, 0, 7); b.stroke();
    b.lineWidth = Math.max(1.5, Ro * 0.05); b.strokeStyle = "rgba(0,0,0,.65)"; b.beginPath(); b.arc(c, c, Ro * 0.9, 0, 7); b.stroke();
    // four hex bolts
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, x = c + Math.cos(a) * Ro * 0.93, y = c + Math.sin(a) * Ro * 0.93, r = Math.max(1.2, Ro * 0.03);
      b.beginPath(); b.arc(x, y, r, 0, 7); b.fillStyle = "#59616b"; b.fill(); b.lineWidth = 0.8; b.strokeStyle = "rgba(0,0,0,.8)"; b.stroke();
    }
    return cv2;
  }
  function drawRadar(s) {
    const S = radar.width, c = S / 2, R = c - 4 * dpr, u = dpr;
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, S, S);
    // bezel
    let g;
    rctx.drawImage(bezelFor(S, R + 3 * u), 0, 0);
    rctx.beginPath(); rctx.arc(c, c, R - 1 * u, 0, 7); rctx.fillStyle = "#06100d"; rctx.fill();
    // scope
    rctx.save(); rctx.beginPath(); rctx.arc(c, c, R - 4 * u, 0, 7); rctx.clip();
    g = rctx.createRadialGradient(c, c, R * 0.05, c, c, R);
    g.addColorStop(0, "#0e3a2c"); g.addColorStop(1, "#04140f");
    rctx.fillStyle = g; rctx.fillRect(0, 0, S, S);
    const yaw = s.player.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
    // range rings + cross
    rctx.strokeStyle = "rgba(120,255,190,0.28)"; rctx.lineWidth = 1.2 * u;
    for (const k of [0.33, 0.66, 0.97]) { rctx.beginPath(); rctx.arc(c, c, R * k, 0, 7); rctx.stroke(); }
    rctx.beginPath(); rctx.moveTo(c - R, c); rctx.lineTo(c + R, c); rctx.moveTo(c, c - R); rctx.lineTo(c, c + R); rctx.stroke();
    // compass ticks that turn with the heading
    const north = Math.atan2(-cs, sn);
    for (let i = 0; i < 36; i++) {
      const a = north + (i / 36) * Math.PI * 2, r1 = R * (i % 9 === 0 ? 0.84 : 0.91);
      rctx.beginPath(); rctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); rctx.lineTo(c + Math.cos(a) * R * 0.97, c + Math.sin(a) * R * 0.97);
      rctx.strokeStyle = i % 9 === 0 ? "rgba(190,255,225,0.85)" : "rgba(140,255,200,0.4)"; rctx.stroke();
    }
    rctx.font = `900 ${10 * u}px system-ui, sans-serif`; rctx.textAlign = "center"; rctx.textBaseline = "middle";
    rctx.fillStyle = "#d8fff0"; rctx.fillText("N", c + Math.cos(north) * R * 0.74, c + Math.sin(north) * R * 0.74);
    // sweep
    const sa = sweep % (Math.PI * 2);
    for (let i = 0; i < 14; i++) {
      rctx.beginPath(); rctx.moveTo(c, c); rctx.arc(c, c, R, sa - (i + 1) * 0.055, sa - i * 0.055); rctx.closePath();
      rctx.fillStyle = `rgba(110,255,180,${0.22 * (1 - i / 14)})`; rctx.fill();
    }
    rctx.beginPath(); rctx.moveTo(c, c); rctx.lineTo(c + Math.cos(sa) * R, c + Math.sin(sa) * R);
    rctx.strokeStyle = "rgba(170,255,210,0.95)"; rctx.lineWidth = 1.8 * u; rctx.stroke();
    const toScope = (p) => {
      const dx = p.x - s.player.pos.x, dz = p.z - s.player.pos.z;
      let px = (dx * cs - dz * sn) / RADAR_RANGE, pz = (dx * sn + dz * cs) / RADAR_RANGE;
      const l = Math.hypot(px, pz), edge = l > 0.92;
      if (edge) { px *= 0.92 / l; pz *= 0.92 / l; }
      return { x: c + px * R, y: c + pz * R, edge };
    };
    const outline = (w = 1.4) => { rctx.lineWidth = w * u; rctx.strokeStyle = "#000"; rctx.stroke(); };
    // carrier
    if (s.pad) {
      const q = toScope(s.pad.pos), pulse = s.landingOpen ? 0.5 + 0.5 * Math.sin(s.elapsed * 6) : 0;
      const fx_ = Math.sin(s.pad.heading), fz_ = Math.cos(s.pad.heading);
      const rx = fx_ * cs - fz_ * sn, rz = fx_ * sn + fz_ * cs; // carrier heading on the scope
      rctx.save(); rctx.translate(q.x, q.y); rctx.rotate(Math.atan2(rx, -rz));
      if (s.landingOpen) { rctx.beginPath(); rctx.arc(0, 0, (10 + 5 * pulse) * u, 0, 7); rctx.strokeStyle = `rgba(110,255,150,${0.9 - pulse * 0.5})`; rctx.lineWidth = 2 * u; rctx.stroke(); }
      rctx.beginPath(); rctx.moveTo(0, -9 * u); rctx.lineTo(4 * u, -3 * u); rctx.lineTo(4 * u, 8 * u); rctx.lineTo(-4 * u, 8 * u); rctx.lineTo(-4 * u, -3 * u); rctx.closePath();
      rctx.fillStyle = "#3dff8b"; rctx.fill(); outline(1.3);
      rctx.fillStyle = "#06331a"; rctx.fillRect(-1.2 * u, -2 * u, 2.4 * u, 8 * u);
      rctx.restore();
    }
    // base icons (while any building of the base is alive)
    for (const bc of s.baseCenters || []) {
      let alive = false;
      for (const t of s.targets) if (t.alive && t.kind === "base" && Math.abs(t.pos.x - bc.x) < 90 && Math.abs(t.pos.z - bc.z) < 90) { alive = true; break; }
      if (!alive) continue;
      const q = toScope(bc);
      rctx.beginPath(); const r = 7 * u;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5236; rctx[i ? "lineTo" : "moveTo"](q.x + Math.cos(a) * r, q.y + Math.sin(a) * r); }
      rctx.closePath(); rctx.strokeStyle = "#ff5a48"; rctx.lineWidth = 2 * u; rctx.stroke();
      rctx.beginPath(); rctx.moveTo(q.x - 3.4 * u, q.y + 2.4 * u); rctx.lineTo(q.x, q.y - 3.2 * u); rctx.lineTo(q.x + 3.4 * u, q.y + 2.4 * u); rctx.closePath(); rctx.fillStyle = "#ff5a48"; rctx.fill();
    }
    // ground targets: orange squares (flak / SAM slightly redder)
    for (const t of s.targets) {
      if (!t.alive || t.kind === "jet") continue;
      const q = toScope(t.pos), z = (t.kind === "base" ? 2.6 : 3.6) * u;
      rctx.beginPath(); rctx.rect(q.x - z, q.y - z, z * 2, z * 2);
      rctx.fillStyle = t.kind === "sam" || t.kind === "flak" ? "#ff3a2a" : "#ff5a48"; rctx.fill(); outline(1.2);
    }
    for (const m of s.missiles) if (m.active) { const q = toScope(m.p); rctx.beginPath(); rctx.arc(q.x, q.y, 2.4 * u, 0, 7); rctx.fillStyle = "#ffffff"; rctx.fill(); outline(1); }
    // enemy planes: red triangles pointing along their heading
    for (const t of s.targets) {
      if (!t.alive || t.kind !== "jet") continue;
      const q = toScope(t.pos);
      const hx = -Math.sin(t.yaw), hz = -Math.cos(t.yaw);
      const rx = hx * cs - hz * sn, rz = hx * sn + hz * cs;
      rctx.save(); rctx.translate(q.x, q.y); rctx.rotate(Math.atan2(rx, -rz));
      const z = 6 * u;
      rctx.beginPath(); rctx.moveTo(0, -z * 1.15); rctx.lineTo(z * 0.85, z * 0.8); rctx.lineTo(-z * 0.85, z * 0.8); rctx.closePath();
      rctx.fillStyle = "#ff2e2e"; rctx.fill(); outline(1.4); rctx.restore();
    }
    // FRIENDLY forces (green): jets = triangles pointing along their heading, ground forces = squares, ships = diamonds
    for (const a of s.allies || []) {
      if (!a.alive) continue;
      const q = toScope(a.pos);
      if (a.kind === "jet") {
        const hx = -Math.sin(a.yaw), hz = -Math.cos(a.yaw);
        const rx = hx * cs - hz * sn, rz = hx * sn + hz * cs;
        rctx.save(); rctx.translate(q.x, q.y); rctx.rotate(Math.atan2(rx, -rz));
        const z = 6 * u;
        rctx.beginPath(); rctx.moveTo(0, -z * 1.15); rctx.lineTo(z * 0.85, z * 0.8); rctx.lineTo(-z * 0.85, z * 0.8); rctx.closePath();
        rctx.fillStyle = ALLY; rctx.fill(); outline(1.4); rctx.restore();
      } else if (a.kind === "tank") {
        const z = 3.6 * u; rctx.beginPath(); rctx.rect(q.x - z, q.y - z, z * 2, z * 2); rctx.fillStyle = ALLY; rctx.fill(); outline(1.2);
      } else {
        const z = 5.6 * u; rctx.beginPath(); rctx.moveTo(q.x, q.y - z); rctx.lineTo(q.x + z, q.y); rctx.lineTo(q.x, q.y + z); rctx.lineTo(q.x - z, q.y); rctx.closePath(); rctx.fillStyle = ALLY; rctx.fill(); outline(1.3);
      }
    }
    rctx.restore();
    // own jet
    rctx.save(); rctx.translate(c, c);
    rctx.beginPath(); rctx.moveTo(0, -8 * u); rctx.lineTo(5.5 * u, 6 * u); rctx.lineTo(0, 3 * u); rctx.lineTo(-5.5 * u, 6 * u); rctx.closePath();
    rctx.fillStyle = "#ffffff"; rctx.fill(); outline(1.3); rctx.restore();
    // glass glare
    g = rctx.createLinearGradient(0, 0, S, S * 0.6);
    g.addColorStop(0, "rgba(255,255,255,0.20)"); g.addColorStop(0.5, "rgba(255,255,255,0)");
    rctx.beginPath(); rctx.arc(c, c, R - 4 * u, 0, 7); rctx.fillStyle = g; rctx.fill();
    // curved glass: dark edge vignette + soft sky reflection ellipse
    g = rctx.createRadialGradient(c, c, R * 0.62, c, c, R - 3 * u);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.5)");
    rctx.beginPath(); rctx.arc(c, c, R - 4 * u, 0, 7); rctx.fillStyle = g; rctx.fill();
    rctx.save(); rctx.beginPath(); rctx.arc(c, c, R - 5 * u, 0, 7); rctx.clip();
    rctx.translate(c - R * 0.22, c - R * 0.5); rctx.rotate(-0.5); rctx.scale(1, 0.38);
    g = rctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.62); g.addColorStop(0, "rgba(220,240,255,0.16)"); g.addColorStop(1, "rgba(220,240,255,0)");
    rctx.beginPath(); rctx.arc(0, 0, R * 0.62, 0, 7); rctx.fillStyle = g; rctx.fill(); rctx.restore();
  }

  function updateDom(s) {
    const t = s.endless ? Math.floor(s.elapsed || 0) : Math.max(0, Math.ceil(s.timeLeft));
    if (dom.tlabel) dom.tlabel.textContent = s.endless ? "ENDLESS" : "TIME LEFT";
    dom.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    dom.timer.classList.toggle("urgent", !s.endless && t <= 20);
    dom.score.textContent = s.score;
    dom.obj.innerHTML = s.objectives.map((o) => {
      const got = Math.min(o.need, s.progress[o.kind] || 0);
      const done = got >= o.need;
      const lab = o.label.replace(/ \d+ /, " ");
      return `<div class="${done ? "done" : ""}"><i class="chk"></i>${lab}${o.need > 1 ? ` <b>${got}/${o.need}</b>` : ""}</div>`;
    }).join("");
    const hp = Math.max(0, s.player.hp);
    dom.hp.style.width = hp + "%";
    dom.hp.style.background = hp > 60 ? "var(--mint)" : hp > 30 ? "var(--sun)" : "var(--red)";
    dom.spd.textContent = Math.round(s.player.speed * 3.6); if (dom.thr) dom.thr.textContent = dom.spd.textContent;
    dom.alt.textContent = Math.round(s.player.pos.y);
    // weapons: the same ring (arc = how much is ready) on all three buttons
    const rack = s.rack || 10;
    const ringSet = (b, p, cls, cnt) => {
      if (!b) return;
      b.style.setProperty("--p", String(Math.round(Math.max(0, Math.min(1, p)) * 100)));
      for (const k of ["empty", "low", "hot"]) b.classList.toggle(k, k === cls);
      const c = b.querySelector(".cnt"); if (c && c.textContent !== cnt) c.textContent = cnt;
    };
    const R_ = s.player.rockets, B_ = s.player.bombs;
    ringSet(dom.bMsl, (R_ + (s.rocketRefill || 0)) / rack, R_ <= 0 ? "empty" : R_ <= 3 ? "low" : "", `${R_}/${rack}`);
    ringSet(dom.bBomb, (B_ + (s.bombRefill || 0)) / rack, B_ <= 0 ? "empty" : B_ <= 3 ? "low" : "", `${B_}/${rack}`);
    const heat = Math.max(0, Math.min(1, s.heat || 0));
    ringSet(dom.bGun, 1 - heat, s.overheated ? "hot" : heat > 0.7 ? "low" : "", s.overheated ? "COOLING" : heat > 0.02 ? `${Math.round((1 - heat) * 100)}%` : "READY");
    if (dom.heat) { dom.heat.style.width = Math.round(heat * 100) + "%"; dom.heat.style.background = s.overheated ? "#ff3b3b" : heat > 0.7 ? "#ffb02e" : "#38e8ff"; }
    dom.heatRow?.classList.toggle("hot", !!s.overheated);
    const lo = !!s.lowAlt && !s.crashing;
    dom.low?.classList.toggle("on", lo); dom.edge?.classList.toggle("on", lo);
    if (s.alert) { dom.alert.textContent = s.alert; dom.alert.classList.remove("hidden"); } else dom.alert.classList.add("hidden");
  }

  function toast(msg, big = false) {
    const d = document.createElement("div");
    d.className = "toast" + (big ? " big" : "");
    d.textContent = msg;
    dom.toasts.appendChild(d);
    while (dom.toasts.children.length > 3) dom.toasts.firstChild.remove();
    setTimeout(() => d.remove(), big ? 2500 : 1700);
  }
  function hurtFlash() { dom.flash.style.opacity = "1"; setTimeout(() => { dom.flash.style.opacity = "0"; }, 160); }
  function clear() { dom.low?.classList.remove("on"); dom.edge?.classList.remove("on");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }

  resize();
  return { draw, resize, toast, hurtFlash, clear };
}
