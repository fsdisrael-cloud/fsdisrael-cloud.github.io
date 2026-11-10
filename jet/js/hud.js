// Ubu HUD: round radar (top), target markers / lock / crosshair / bomb circle (2D overlay), DOM readouts.
import * as THREE from "three";
import { LABEL } from "./missions.js?v=43";
import { tr } from "./i18n.js?v=43";

const ALLY = "#3dff8b";
const COL = { boss:"#ff3b3b", bossweapon:"#ff8a40", jet: "#ff3b3b", tank: "#ff9c35", flak: "#ff9c35", sam: "#ff9c35", base: "#ff9c35", ship: "#bd6aff", pad: "#3dff8b", ring: "#ffe14d" };
const v = new THREE.Vector3();

export function createHud() {
  const cv = document.getElementById("hud-canvas");
  const ctx = cv.getContext("2d");
  const radar = document.getElementById("radar");
  const rctx = radar.getContext("2d");
  const el = (id) => document.getElementById(id);
  const $n = (id) => document.getElementById(id);
  const dom = { timer: el("hud-timer"), score: el("hud-score"), obj: el("hud-obj"), hp: el("hud-lives"), spd: el("hud-spd"), thr: el("thr-spd"), alt: el("hud-alt"), fl: el("hud-fl"), trk: el("hud-track"), alert: el("alert"), toasts: el("toasts"), flash: el("hit-flash"), low: el("low-alt"), edge: el("low-edge"),
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


  // ===== b26: helmet-mounted display (F-35 HMDS / JHMCS style): green symbology, amber cues, pitch ladder, tapes, designator boxes =====
  const HG = "#4dff91", HA = "#ffb52e", HK = "rgba(0,12,4,0.8)";
  const _hv = new THREE.Vector3(), _hr = new THREE.Vector3(), _hu = new THREE.Vector3(), _hd = new THREE.Vector3();
  let hmdK = 0;
  function hline(x1, y1, x2, y2, col, lw = 1.6) {
    ctx.lineWidth = lw + 2; ctx.strokeStyle = HK; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function htext(t, x, y, col = HG, size = 12, al = "center") {
    ctx.font = `700 ${size}px "Share Tech Mono", "Courier New", monospace`; ctx.textAlign = al; ctx.textBaseline = "middle";
    ctx.lineWidth = 3; ctx.strokeStyle = HK; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y);
  }
  function hbracket(x, y, r, col, lw = 1.8) {
    const c = r * 0.45; ctx.lineWidth = lw + 2; ctx.strokeStyle = HK;
    for (const pass of [0, 1]) {
      if (pass) { ctx.lineWidth = lw; ctx.strokeStyle = col; }
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(x + sx * r, y + sy * (r - c)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - c), y + sy * r); }
      ctx.stroke();
    }
  }
  function drawHMD(s) {
    const P = s.player, cam = s.camera; if (!P || s.crashing) return;
    hmdK = Math.min(1, hmdK + 0.04);
    ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * hmdK; ctx.lineCap = "round";
    const cx = W / 2, cy = H / 2, sc = Math.min(W, H) / 390;
    // world-fixed frame: heading vector (level), right vector
    _hd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    _hr.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const hp = (deg, side = 0) => { const a = deg * Math.PI / 180; _hv.copy(P.pos).addScaledVector(_hd, Math.cos(a) * 1000).addScaledVector(_hu.set(0, 1, 0), Math.sin(a) * 1000).addScaledVector(_hr, side); return project(_hv, cam); };
    // pitch ladder + horizon (rungs every 5 deg, numbered every 10)
    const pitchDeg = P.pitch * 180 / Math.PI;
    for (let d = -40; d <= 40; d += 5) {
      if (Math.abs(d - pitchDeg) > 22 || (d % 10 !== 0)) continue;   // b35: lighter ladder (10-deg rungs only)
      const a = hp(d, -90), b = hp(d, 90), m = hp(d, 0);
      if (a.behind || b.behind || m.behind) continue;
      if (d === 0) { hline(a.x - 20 * sc, a.y, a.x + (b.x - a.x) * 0.38, a.y + (b.y - a.y) * 0.38, HG, 1.8); hline(a.x + (b.x - a.x) * 0.62, a.y + (b.y - a.y) * 0.62, b.x + 20 * sc, b.y, HG, 1.8); continue; }
      if (d % 10 !== 0) {   // 5-degree short rungs
        const L = 0.2; hline(m.x + (a.x - m.x) * L, m.y + (a.y - m.y) * L, m.x + (a.x - m.x) * 0.1, m.y + (a.y - m.y) * 0.1, HG, 1.2);
        hline(m.x + (b.x - m.x) * L, m.y + (b.y - m.y) * L, m.x + (b.x - m.x) * 0.1, m.y + (b.y - m.y) * 0.1, HG, 1.2); continue;
      }
      const tick = (d > 0 ? 1 : -1) * 7 * sc;
      for (const e of [a, b]) {
        const inner = { x: m.x + (e.x - m.x) * 0.3, y: m.y + (e.y - m.y) * 0.3 };
        if (d < 0) { // dashed negative rungs
          for (let q = 0; q < 3; q++) { const f0 = 0.3 + q * 0.23, f1 = f0 + 0.13; hline(m.x + (e.x - m.x) * f0, m.y + (e.y - m.y) * f0, m.x + (e.x - m.x) * f1, m.y + (e.y - m.y) * f1, HG, 1.6); }
        } else hline(inner.x, inner.y, m.x + (e.x - m.x) * 0.96, m.y + (e.y - m.y) * 0.96, HG, 1.6);
        hline(m.x + (e.x - m.x) * 0.96, m.y + (e.y - m.y) * 0.96, m.x + (e.x - m.x) * 0.96, m.y + (e.y - m.y) * 0.96 + tick, HG, 1.6);
      }
      htext(String(Math.abs(d)), a.x - 14 * sc, a.y + (d > 0 ? 4 : -4), HG, 10 * sc);
      htext(String(Math.abs(d)), b.x + 14 * sc, b.y + (d > 0 ? 4 : -4), HG, 10 * sc);
    }
    // heading tape (top) with cardinal letters
    const hdg = (((-P.yaw * 180 / Math.PI) % 360) + 360) % 360, ty = 26 * sc, tw = Math.min(W * 0.34, 300 * sc);
    hline(cx - tw / 2, ty + 10 * sc, cx + tw / 2, ty + 10 * sc, HG, 1.2);
    for (let d = Math.floor((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
      const x = cx + (d - hdg) / 30 * tw / 2, dd = ((d % 360) + 360) % 360, major = dd % 10 === 0;
      hline(x, ty + 10 * sc, x, ty + (major ? 3 : 6) * sc, HG, 1.2);
      if (dd % 30 === 0) htext(dd === 0 ? "N" : dd === 90 ? "E" : dd === 180 ? "S" : dd === 270 ? "W" : String(dd / 10).padStart(2, "0"), x, ty - 4 * sc, HG, 10 * sc);
    }
    ctx.strokeStyle = HG; hline(cx, ty + 12 * sc, cx - 5 * sc, ty + 19 * sc, HG, 1.6); hline(cx, ty + 12 * sc, cx + 5 * sc, ty + 19 * sc, HG, 1.6);
    htext(String(Math.round(hdg) % 360).padStart(3, "0"), cx, ty + 30 * sc, HG, 13 * sc);
    // airspeed (left) & altitude (right) scrolling tapes, with boxes
    const kmh = P.speed * 3.6, alt = P.pos.y, yL = cy, xL = W > H ? W * 0.31 : Math.max(36, W * 0.2), xR = W - xL;
    const tape = (x, val, step, side, label) => {
      const hh = 70 * sc;
      for (let k = -4; k <= 4; k++) {
        const v0 = Math.round(val / step) * step + k * step, y = yL - (v0 - val) / step * 17 * sc;
        if (Math.abs(y - yL) > hh) continue;
        hline(x, y, x + side * 7 * sc, y, HG, 1.3);
        if (k % 2 === 0 && Math.abs(y - yL) > 12 * sc) htext(String(Math.max(0, Math.round(v0))), x + side * 30 * sc, y, HG, 10 * sc);
      }
      hline(x, yL - hh, x, yL + hh, HG, 1.2);
      ctx.lineWidth = 1.6; ctx.strokeStyle = HG; ctx.fillStyle = "rgba(0,18,6,0.55)"; ctx.beginPath(); ctx.rect(side > 0 ? x + 5 * sc : x - 50 * sc, yL - 9 * sc, 45 * sc, 18 * sc); ctx.fill(); ctx.stroke();
      htext(String(Math.max(0, Math.round(val))), side > 0 ? x + 27 * sc : x - 28 * sc, yL, HG, 13 * sc);
      htext(label, x + side * 24 * sc, yL - hh - 9 * sc, HG, 9 * sc);
    };
    tape(xL, kmh, 50, -1, "KM/H"); tape(xR, alt, 25, 1, "ALT M");
    // flight-path marker (velocity vector) and boresight
    _hv.copy(P.pos).addScaledVector(P.vel && P.vel.lengthSq() > 1 ? _hu.copy(P.vel).normalize() : s.fwd, 600);
    const fp = project(_hv, cam);
    if (fp.on) {
      ctx.lineWidth = 1.8; ctx.strokeStyle = HK; for (const pass of [0, 1]) { ctx.lineWidth = pass ? 1.6 : 3.6; ctx.strokeStyle = pass ? HG : HK; ctx.beginPath(); ctx.arc(fp.x, fp.y, 6 * sc, 0, 7); ctx.moveTo(fp.x - 6 * sc, fp.y); ctx.lineTo(fp.x - 16 * sc, fp.y); ctx.moveTo(fp.x + 6 * sc, fp.y); ctx.lineTo(fp.x + 16 * sc, fp.y); ctx.moveTo(fp.x, fp.y - 6 * sc); ctx.lineTo(fp.x, fp.y - 12 * sc); ctx.stroke(); }
    }
    _hv.copy(P.pos).addScaledVector(s.fwd, 600); const bs = project(_hv, cam);
    if (bs.on) { hline(bs.x - 5 * sc, bs.y, bs.x + 5 * sc, bs.y, HG, 1.4); hline(bs.x, bs.y - 5 * sc, bs.x, bs.y + 5 * sc, HG, 1.4); }
    // live target boxes: enemies in brackets with range, locked target in amber with designator diamond + closure
    let nb = 0;
    for (const t of s.targets) {
      if (!t.alive || t.kind === "ally") continue;
      const d = t.pos.distanceTo(P.pos); if (d > 6000) continue;
      const pr = project(t.pos, cam); if (!pr.on) continue;
      const lk = t === s.lockTarget, r = Math.max(9, Math.min(34, 2600 / (d + 60))) * sc;
      if (!lk && ++nb > 8) continue;
      hbracket(pr.x, pr.y, r, lk ? HA : HG, lk ? 2.2 : 1.5);
      if (lk) {
        const cl = s.lockTime > 0 ? Math.round(P.speed * 3.6) : 0;
        hline(pr.x, pr.y - r - 6 * sc, pr.x + 6 * sc, pr.y - r, HA, 1.6); hline(pr.x, pr.y - r - 6 * sc, pr.x - 6 * sc, pr.y - r, HA, 1.6);
        htext((d / 1000).toFixed(1) + " KM", pr.x, pr.y + r + 10 * sc, HA, 11 * sc);
        htext("TD", pr.x, pr.y - r - 14 * sc, HA, 10 * sc);
      } else if (d < 3000) htext((d / 1000).toFixed(1), pr.x, pr.y + r + 8 * sc, HG, 9 * sc);
    }
    // status block (bottom): weapons, fuel, G, mode - amber when there is something to warn about
    const fuelK = Math.max(0, Math.min(1, s.fuel ?? 1)), lowF = fuelK < 0.2;
    ctx.restore();
  }
  function paintNV(on) {
    const c = document.getElementById("nv-cv");
    if (!c) return;
    if (!on) { c.style.display = "none"; return; }
    c.style.display = "block";
    const w = Math.max(2, c.clientWidth || innerWidth), h = Math.max(2, c.clientHeight || innerHeight);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext("2d");
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(70, 255, 130, 0.26)";
    g.fillRect(0, 0, w, h);
    const y = h * 0.5, band = g.createLinearGradient(0, y - h * 0.045, 0, y + h * 0.045);
    band.addColorStop(0, "rgba(180,255,200,0)");
    band.addColorStop(0.5, "rgba(220,255,230,0.7)");
    band.addColorStop(1, "rgba(180,255,200,0)");
    g.fillStyle = band; g.fillRect(0, y - h * 0.045, w, h * 0.09);
    const vig = g.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.2, w * 0.5, h * 0.48, Math.max(w, h) * 0.68);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,30,12,0.34)");
    g.fillStyle = vig; g.fillRect(0, 0, w, h);
  }
  let nvOn = false;
  function setNV(on) { on = false; nvOn = on;   /* b36: NVG removed (black screen on iPhone) */ window.__nv = on; document.body.classList.toggle("nv", on); }
  addEventListener("keydown", (e) => { if ((e.key === "n" || e.key === "N") && document.body.classList.contains("cockpit")) setNV(!nvOn); });
  document.getElementById("nv-btn")?.addEventListener("click", () => setNV(!nvOn));

  function draw(s, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const eb = el("btn-eject"); if (eb) { eb.classList.toggle("hidden", !(s.critical > 0)); if (s.critical > 0) el("eject-count").textContent = Math.ceil(s.critical); }
    const cockpitView = s.viewMode === "cockpit";
    if (cockpitView !== document.body.classList.contains("cockpit")) { document.body.classList.toggle("cockpit", cockpitView); if (!cockpitView) { hmdK = 0; } }
    paintNV(!!s.night && document.body.classList.contains("in-game"));
    if (!s.player) return;
    const cam = s.camera;
    if (cockpitView) { try { drawHMD(s); } catch (e) { /* never break the frame */ } }
    // crosshair: point 500 m ahead of the nose
    v.copy(s.player.pos).addScaledVector(s.fwd, 500);
    const ch = project(v, cam);
    if (ch.on && !cockpitView) {
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
        const air = t.kind === "jet" || t.kind === "boss" || t.kind === "bossweapon";
        if ((t === s.lockCand || t === s.lockTarget) && s.lockTime > 0) {
          const k = Math.min(1, s.lockTime / 1), R = 72 - k * 54;
          const col = k >= 1 ? "#b6ff9a" : "#ffe14a";
          ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = k >= 1 ? 2.8 : 1.8; ctx.strokeRect(pr.x - R, pr.y - R, R * 2, R * 2); ctx.restore();
          label(pr.x, pr.y - R - 8, k >= 1 ? "LOCKED" : "LOCK", col, 10);
        }
        if (t === s.lockTarget) {
          const R = Math.max(16, Math.min(46, 2600 / Math.max(d, 1) * (t.radius / 8) + 10)), pu = 1 + 0.06 * Math.sin(s.elapsed * 8);
          const lc = air ? "#ff3b3b" : t.kind === "ship" ? "#bd6aff" : "#ff9c35";   // b30: lock = red air / purple sea / orange ground
          if (air) diamond(pr.x, pr.y, R * pu * 1.15, lc); else brackets(pr.x, pr.y, R * pu * 1.15, lc, 1.1);
          label(pr.x, pr.y + R * pu + 15, `${air ? "AIR" : t.kind === "ship" ? "SEA" : "GND"} ${d < 1000 ? Math.round(d) + "m" : (d / 1000).toFixed(1) + "km"}`, "rgba(255,225,200,0.9)", 11);
        } else {
          // tiny subtle tick above the model (never covers it): chevron for air, dot for ground
          const ty = pr.y - Math.max(12, Math.min(30, 1800 / Math.max(d, 1) * (t.radius / 8) + 8));
          ctx.save(); ctx.fillStyle = air ? "rgba(255,70,60,0.22)" : "rgba(255,160,70,0.2)"; ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1; ctx.beginPath();
          if (air) { ctx.moveTo(pr.x - 4.5, ty - 4); ctx.lineTo(pr.x + 4.5, ty - 4); ctx.lineTo(pr.x, ty + 3); ctx.closePath(); } else ctx.rect(pr.x - 2.5, ty - 2.5, 5, 5);
          ctx.stroke(); ctx.fill(); ctx.restore();
        }
      } else if (t.kind === "jet") arrows.push({ t, d: d * 0.6, dist: d, pr });
      else if (t.objective) arrows.push({ t, d, pr });
    }
    // A soft lead/pursuit cue rewards aiming ahead instead of magnetically snapping shots.
    const pursuit = s.lockTarget || s.lockCand;
    if (pursuit?.kind === "jet" && pursuit.alive) {
      v.copy(pursuit.pos).addScaledVector(pursuit.vel, Math.min(1.2, pursuit.pos.distanceTo(s.player.pos) / 650));
      const lead = project(v, cam), target = project(pursuit.pos, cam);
      if (lead.on && target.on) { ctx.save(); ctx.strokeStyle = "rgba(125,230,220,.65)"; ctx.lineWidth = 1; ctx.setLineDash([3,5]); ctx.beginPath(); ctx.moveTo(target.x,target.y); ctx.lineTo(lead.x,lead.y); ctx.stroke(); ctx.setLineDash([]); circle(lead.x, lead.y, 6, "#8fe7d7", 1.3); ctx.restore(); }
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
    arrows.slice(0, 3).forEach((a, i) => { if (a.t.alive === false || a.t.hp <= 0) return; edgeArrow(a.t.pos, cam, a.t.kind === "jet" ? "#ff2a2a" : (COL[a.t.kind] || "#fff"), false, null, i === 0 ? 1.8 : 1.25); });
    /* b21: horizon cue line removed (read as stray streaks across the sky) */
    const boss=s.targets.find(t=>t.alive&&t.kind==="boss");
    if(boss){const pods=boss.pods.filter(t=>t.alive).length,hp=(boss.hp+boss.pods.reduce((n,t)=>n+(t.alive?t.hp:0),0))/(boss.maxHp+boss.pods.reduce((n,t)=>n+t.maxHp,0));ctx.save();ctx.fillStyle="rgba(8,12,20,.8)";ctx.fillRect(W*.2,Math.max(H*.18,112),W*.6,30);ctx.fillStyle="#ff593e";ctx.fillRect(W*.2+3,Math.max(H*.18,112)+22,(W*.6-6)*Math.max(0,hp),5);label(W*.5,Math.max(H*.18,112)+14,`${boss.name}  |  ${pods} WEAPONS`,"#ffb28f",11);ctx.restore();}
    if(s.landingGuide){const g=s.landingGuide,cx=W*.5,cy=H*.43;ctx.save();ctx.strokeStyle="rgba(220,245,240,.6)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-42,cy);ctx.lineTo(cx+42,cy);ctx.moveTo(cx,cy-32);ctx.lineTo(cx,cy+32);ctx.stroke();const ex=Math.max(-32,Math.min(32,-g.x*.5)),ey=Math.max(-24,Math.min(24,g.dy*.6));ctx.strokeStyle="#ffb34b";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx+ex,cy-25);ctx.lineTo(cx+ex,cy+25);ctx.moveTo(cx-32,cy+ey);ctx.lineTo(cx+32,cy+ey);ctx.stroke();label(cx,cy+48,g.carrier?"CARRIER APPROACH":"RUNWAY APPROACH","#ffce8b",10);ctx.restore();}
    // incoming missiles
    for (const m of s.missiles) if (m.active) { const pr = project(m.p, cam); if (pr.on) { /* b37: no ring - the missile itself is drawn */ } else edgeArrow(m.p, cam, "#ff2222", true); }
    // CCIP marker
    if (s.ccip) { const pr = project(s.ccip, cam); if (pr.on) { circle(pr.x, pr.y, 9, "#ff8a2a", 3); ctx.fillStyle = "#ff8a2a"; ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, 7); ctx.fill(); } }
    // b21: bomb aim: line from the impact point to the snapped ground target + a bright cross on the target
    if (s.bombAim) {
      const pa = project(s.bombAim, cam), pc = s.ccip ? project(s.ccip, cam) : null;
      if (!pa.on) edgeArrow(s.bombAim, cam, s.bombKind === "ship" ? "#bd6aff" : "#ff9c35", false, null, 1);
      if (pa.on) {
        const bc = s.bombKind === "ship" ? "#bd6aff" : "#ff9c35"; ctx.save(); ctx.strokeStyle = bc; ctx.fillStyle = bc;   // b30: sea = purple, ground = orange ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 3;
        // b23: always a clear line from the aim point (or the jet) to the selected ground target
        { const fx = pc && pc.on ? pc.x : W / 2, fy = pc && pc.on ? pc.y : H * 0.62;
          ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(pa.x, pa.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
        if (s.tgtFlash > 0) { ctx.lineWidth = 3; ctx.globalAlpha = Math.min(1, s.tgtFlash); ctx.beginPath(); ctx.arc(pa.x, pa.y, 24 + (1.2 - s.tgtFlash) * 40, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
        if (s.bombName) { ctx.font = "700 12px 'Black Ops One', Fredoka, sans-serif"; ctx.textAlign = "left"; ctx.fillText(`TGT ${s.bombName} ${s.bombDist > 1000 ? (s.bombDist / 1000).toFixed(1) + " km" : Math.round(s.bombDist) + " m"}`, pa.x + 22, pa.y - 14); }
        const r = s.bombLocked ? 15 : 10; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pa.x - r, pa.y - r); ctx.lineTo(pa.x + r, pa.y + r); ctx.moveTo(pa.x + r, pa.y - r); ctx.lineTo(pa.x - r, pa.y + r); ctx.stroke();
        ctx.beginPath(); ctx.arc(pa.x, pa.y, r + 5, 0, 7); ctx.lineWidth = s.bombLocked ? 3 : 2; ctx.stroke(); if (s.bombLocked) { ctx.beginPath(); ctx.arc(pa.x, pa.y, r + 12, 0, 7); ctx.lineWidth = 1.5; ctx.stroke(); } ctx.restore();
      }
    }

    domT -= dt;
    if (domT <= 0) { domT = 0.12; updateDom(s); }
    radarT -= dt; sweep += dt * 2.6;
    if (radarT <= 0) { radarT = 1 / 20; drawRadar(s); }
  }

  // corner brackets (red = enemy, green = friendly)
  function brackets(x, y, r, color, w) {
    r *= 1.2; w = Math.min(w || 1.2, 1.2); const k = r * 0.32;   // b30: subtle corners OUTSIDE the silhouette, never covering it
    ctx.save(); ctx.globalAlpha = 0.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [lw, st] of [[w + 1.6, "rgba(0,0,0,.18)"], [w, color]]) {
      ctx.lineWidth = lw; ctx.strokeStyle = st; ctx.beginPath();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.moveTo(x + sx * r, y + sy * (r - k)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - k), y + sy * r); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function diamond(x, y, R, color) {
    // b30: air targets: 4 thin diamond tips only (open centre), drawn outside the jet's shape
    const r = R * 1.25, k = r * 0.3; ctx.save(); ctx.globalAlpha = 0.6; ctx.lineCap = "round"; ctx.lineWidth = 1.1; ctx.strokeStyle = color; ctx.beginPath();
    for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const px = x + ax * r * (ax ? 0.85 : 1), py = y + ay * r; const tx = ay ? 1 : 0, ty = ax ? 1 : 0; ctx.moveTo(px - tx * k - ax * k * 0.6, py - ty * k - ay * k * 0.6); ctx.lineTo(px, py); ctx.lineTo(px + tx * k - ax * k * 0.6, py + ty * k - ay * k * 0.6); }
    ctx.stroke(); ctx.restore();
  }
  // artificial horizon cue: a faint line through the world horizon, rolling with the camera; flashes when auto-leveling
  const _h = new THREE.Vector3();
  function horizon(s, cam) {
    const pp = s.player.pos, f = s.fwd; const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl;
    const pts = [];
    for (let k = -7; k <= 7; k++) { const a = k * 0.13, c = Math.cos(a), sn = Math.sin(a); _h.set(pp.x + (fx * c - fz * sn) * 30000, pp.y, pp.z + (fx * sn + fz * c) * 30000); pts.push(project(_h, cam)); }
    const al = 0.32 + 0.5 * Math.min(1, (s.recover || 0) * 2);
    ctx.save(); ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath(); let on = false;
      for (let i = 0; i < pts.length; i++) { const k = i - 7; if (k * side < 1 || pts[i].behind) { on = false; continue; } if (!on) { ctx.moveTo(pts[i].x, pts[i].y); on = true; } else ctx.lineTo(pts[i].x, pts[i].y); }
      ctx.lineWidth = 4.5; ctx.strokeStyle = `rgba(0,0,0,${al * 0.5})`; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(190,255,220,${al})`; ctx.stroke();
    }
    ctx.restore();
    if ((s.recover || 0) > 0.25) label(W / 2, H * 0.3, "LEVELING", "#9dffc4", 15);
  }

  function label(x, y, text, color, size = 13) {
    ctx.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function edgeArrow(p, cam, color, warn = false, text = null, sc = 1) {
    // direction in camera space
    v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    let ang = Math.atan2(-v.y, v.x);
    if (v.z > 0 && Math.abs(v.x) < 1e-3) ang = Math.PI / 2;
    const cx = W / 2, cy = H / 2, rx = W / 2 - 118, ry = H / 2 - 132;
    const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry;
    ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc * 0.85, sc * 0.85);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.quadraticCurveTo(-2, 0, -8, 11); ctx.closePath();
    ctx.lineWidth = 3.5; ctx.strokeStyle = "#000"; ctx.lineJoin = "round"; ctx.stroke();
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
    if (warn) label(x, y + 24, "!", color, 16);
    if (text) label(x - Math.cos(ang) * 34, y - Math.sin(ang) * 26 + 4, text, "rgba(255,225,200,0.9)", 11);
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
      rctx.closePath(); rctx.strokeStyle = "#ff9c35"; rctx.lineWidth = 2 * u; rctx.stroke();
      rctx.beginPath(); rctx.moveTo(q.x - 3.4 * u, q.y + 2.4 * u); rctx.lineTo(q.x, q.y - 3.2 * u); rctx.lineTo(q.x + 3.4 * u, q.y + 2.4 * u); rctx.closePath(); rctx.fillStyle = "#ff9c35"; rctx.fill();
    }
    // ground targets: orange squares (flak / SAM slightly redder)
    for (const t of s.targets) {
      if (!t.alive || ["jet","boss","bossweapon"].includes(t.kind)) continue;
      const q = toScope(t.pos), z = (t.kind === "base" ? 2.6 : 3.6) * u;
      rctx.beginPath(); rctx.rect(q.x - z, q.y - z, z * 2, z * 2);
      rctx.fillStyle = t.kind === "ship" ? "#bd6aff" : "#ff9c35"; rctx.fill(); outline(1.2);
    }
    /* b38: runways / carrier deck = short green lines along their heading */
    for (const r of (s.runways || [])) { const L = 420, dx = -Math.sin(r.hd) * L, dz = -Math.cos(r.hd) * L, qa = toScope({ x: r.x - dx, y: 0, z: r.z - dz }), qb = toScope({ x: r.x + dx, y: 0, z: r.z + dz }); rctx.save(); rctx.lineCap = "round"; rctx.strokeStyle = "#062b14"; rctx.lineWidth = 5.5 * u; rctx.beginPath(); rctx.moveTo(qa.x, qa.y); rctx.lineTo(qb.x, qb.y); rctx.stroke(); rctx.strokeStyle = "#c9b48a"; rctx.lineWidth = 3 * u; rctx.stroke(); rctx.restore(); }
    // b30: incoming enemy missiles = small yellow dot + thin yellow trail
    for (const m of s.missiles) if (m.active) { const q = toScope(m.p), v = m.v || m.vel; if (v) { const tq = toScope({ x: m.p.x - v.x * 2.2, y: m.p.y, z: m.p.z - v.z * 2.2 }); rctx.beginPath(); rctx.moveTo(tq.x, tq.y); rctx.lineTo(q.x, q.y); rctx.strokeStyle = "rgba(255,225,77,.85)"; rctx.lineWidth = 1.1 * u; rctx.stroke(); } rctx.beginPath(); rctx.arc(q.x, q.y, 2.4 * u, 0, 7); rctx.fillStyle = "#ffe14d"; rctx.fill(); }
    const gCol = { bomb: "#ff9a1f", bombs: "#ff6a1a", missile: "#d8e6ff", shield: "#4db4ff", health: "#ff4040", fuel: "#3dff6a" };
    for (const g of s.gifts || []) { const q = toScope(g); rctx.beginPath(); rctx.arc(q.x, q.y, 2.1 * u, 0, 7); rctx.fillStyle = gCol[g.kind] || "#fff2c4"; rctx.fill(); }
    // enemy planes: red triangles pointing along their heading
    for (const t of s.targets) {
      if (!t.alive || !["jet","boss","bossweapon"].includes(t.kind)) continue;
      const q = toScope(t.pos);
      const hx = -Math.sin(t.yaw), hz = -Math.cos(t.yaw);
      const rx = hx * cs - hz * sn, rz = hx * sn + hz * cs;
      rctx.save(); rctx.translate(q.x, q.y); rctx.rotate(Math.atan2(rx, -rz));
      const z = 8.4 * u;
      rctx.beginPath(); rctx.moveTo(0, -z * 1.15); rctx.lineTo(z * 0.85, z * 0.8); rctx.lineTo(-z * 0.85, z * 0.8); rctx.closePath();
      rctx.fillStyle = "#ff2e2e"; rctx.fill(); outline(2); rctx.strokeStyle = "rgba(255,255,255,0.9)"; rctx.lineWidth = 1.2 * u; rctx.stroke();
      rctx.beginPath(); rctx.arc(0, 0, z * (1.3 + 0.35 * Math.sin(s.elapsed * 6)), 0, 7); rctx.strokeStyle = "rgba(255,60,60,0.55)"; rctx.stroke(); rctx.restore();
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
    {   // b24: target counter = what is still alive in the air / on the ground / at sea, plus mission progress
      const pg = s.progress || {}, needOf = (k) => (s.objectives.find((o) => o.kind === k) || {}).need || 0;
      const airN = needOf("jet"), seaN = needOf("ship"), gndN = ["tank", "base", "flak", "sam"].reduce((a, k) => a + needOf(k), 0);
      const airG = Math.min(airN, pg.jet || 0), seaG = Math.min(seaN, pg.ship || 0), gndG = ["tank", "base", "flak", "sam"].reduce((a, k) => a + Math.min(needOf(k), pg[k] || 0), 0);
      const need = s.objectives.reduce((a, o) => a + (o.kind === "land" ? 0 : o.need), 0), got = s.objectives.reduce((a, o) => a + (o.kind === "land" ? 0 : Math.min(o.need, pg[o.kind] || 0)), 0);
      const html = `<div class="tally"><span class="air">AIR<b>${airG}/${airN}</b></span><span class="gnd">GND<b>${gndG}/${gndN}</b></span><span class="sea">SEA<b>${seaG}/${seaN}</b></span></div><div class="tally"><span>MISSION<b>${got}/${need}</b></span></div>`;
      if (html !== dom._tally) { dom._tally = html; dom.obj.innerHTML = html; }
    }
    { const hp = Math.round(Math.max(0, Math.min(100, s.hull ?? 100))), bar = el("hud-hull"); if (bar) { bar.style.width = hp + "%"; bar.classList.toggle("critical", hp < 30); bar.parentElement.setAttribute("aria-valuenow", hp); el("hud-hull-value").textContent = hp + "%"; } }
    {   // b24: 7 life squares
      const lv = Math.max(0, Math.min(s.livesMax || 5, s.lives ?? 5)), sq = dom.hp.children; dom.hp.style.setProperty("--hull", String(Math.round(Math.max(0, Math.min(100, s.hull ?? 100)))) + "%");
      for (let i = 0; i < sq.length; i++) sq[i].classList.toggle("off", i >= lv);
      dom.hp.classList.toggle("low", lv <= 2);
    }
    {   // b26: fuel dial (EMPTY..FULL), ops panel (loading / takeoff), auto-land button
      const fv = Math.max(0, Math.min(1, s.fuel ?? 1)), nd = $n("fuel-needle"), fd = $n("fuel-dial");
      if (nd) nd.style.transform = `rotate(${(-120 + fv * 240).toFixed(1)}deg)`;
      if (fd) fd.classList.toggle("low", fv < 0.22);
      const op = $n("ops-panel"), mode = s.ops;
      if (op) {
        const show = mode === "load" || mode === "reload" || mode === "ready";
        op.classList.toggle("hidden", !show);
        if (show) {
          $n("ops-title").textContent = tr(mode === "ready" ? "AIRCRAFT READY" : mode === "load" ? "LOADING AMMO + FUEL" : "REFUELING + REARMING");
          const k = s.opsK || { kf: 1, ka: 1 };
          $n("ops-fuel").style.width = (k.kf * 100).toFixed(0) + "%"; $n("ops-ammo").style.width = (k.ka * 100).toFixed(0) + "%";
          $n("btn-takeoff").classList.toggle("hidden", mode !== "ready");
        }
      }
      if (s.night && !s._nvA && !window.__nvAuto) { window.__nvAuto = 1; setNV(true); } if (!s.night) window.__nvAuto = 0; document.body.classList.toggle("night", !!s.night);
      { const sx = $n("btn-six"); if (sx) sx.classList.toggle("warn", !!s.six); }
      const al = $n("btn-autoland");
      if (al) { const approach = mode === "app" || mode === "final", can = s.hasStrip && (approach || !mode) && !s.crashing && !s.landing; al.classList.toggle("hidden", !can); al.classList.toggle("urgent", approach || can && fv < 0.25); al.textContent = approach ? "GO AROUND" : "▼ AUTO LAND"; }
      const mb = $n("btn-moab"), sb = $n("btn-shield");
      if (mb) { const n = s.moabs ?? 0; mb.classList.toggle("empty", n <= 0); const c = mb.querySelector(".cnt"); if (c) c.textContent = String(n); }
      if (sb) { sb.classList.toggle("on", (s.shieldT || 0) > 0); const c = sb.querySelector(".cnt"); if (c) c.textContent = (s.shieldT || 0) > 0 ? s.shieldT.toFixed(1) : String(s.shields ?? 0); }
    }
    dom.spd.textContent = Math.round(s.player.speed * 3.6); if (dom.thr) dom.thr.textContent = dom.spd.textContent;
    dom.alt.textContent = Math.round(s.player.pos.y); if (dom.fl) dom.fl.textContent = s.player.flares ?? 0; if (dom.trk) dom.trk.classList.toggle("on", !!s.track);
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

  // b26: short, transparent, colour-coded messages (green = good, amber = warning, red = danger, blue-grey = info); max 2 on screen, ~1.3 s
  function toast(msg, kind) {
    let k = typeof kind === "string" ? kind : "";
    if (!k) k = /eject|crash|destroy|shot down|lost|damage|hit!|collision|flak|critical|no lives|empty/i.test(msg) ? "bad" : /warn|low|fuel|ammo|incoming|lock|missile!|danger|overheat|pull up/i.test(msg) ? "warn" : /\+|got|complete|clear|life|safe|back|good|ready|refuel|landed|kill|splash|target/i.test(msg) ? "good" : "info";
    const d = document.createElement("div");
    d.className = "toast t-" + k;
    d.textContent = tr(String(msg)).toUpperCase();
    dom.toasts.appendChild(d);
    while (dom.toasts.children.length > 2) dom.toasts.firstChild.remove();
    setTimeout(() => d.remove(), k === "bad" ? 1800 : 1250);
  }
  function hurtFlash() { dom.flash.style.opacity = "1"; setTimeout(() => { dom.flash.style.opacity = "0"; }, 160); }
  function clear() { dom.low?.classList.remove("on"); dom.edge?.classList.remove("on");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }

  resize();
  return { draw, resize, toast, hurtFlash, clear };
}
