// Ubu HUD: round radar (top), target markers / lock / crosshair / bomb circle (2D overlay), DOM readouts.
import * as THREE from "three";
import { LABEL } from "./missions.js?v=5";

const COL = { jet: "#ff4d4d", tank: "#ffb02e", ship: "#4fc3ff", sam: "#c77dff", balloon: "#ff7eb9", drone: "#a67cff", target: "#ffd23f", ring: "#ffe14d" };
const v = new THREE.Vector3();

export function createHud() {
  const cv = document.getElementById("hud-canvas");
  const ctx = cv.getContext("2d");
  const radar = document.getElementById("radar");
  const rctx = radar.getContext("2d");
  const el = (id) => document.getElementById(id);
  const dom = { timer: el("hud-timer"), score: el("hud-score"), obj: el("hud-obj"), hp: el("hud-hp"), spd: el("hud-spd"), alt: el("hud-alt"), alert: el("alert"), gun: el("ammo-gun"), rocket: el("ammo-rocket"), bomb: el("ammo-bomb"), wr: el("wpn-rocket"), wb: el("wpn-bomb"), toasts: el("toasts"), flash: el("hit-flash"), pos: el("hud-pos"), heat: el("heat-fill"), wg: el("wpn-gun"), low: el("low-alt"), edge: el("low-edge"), altBox: el("alt-box") };
  let dpr = 1, W = 0, H = 0, domT = 0, radarT = 0, sweep = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const rs = radar.getBoundingClientRect().width || 112;
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
        circle(pr.x, pr.y, r, color, t.objective ? 3 : 2);
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
    radarT -= dt; sweep += dt * 2.2;
    if (radarT <= 0) { radarT = 1 / 20; drawRadar(s); }
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

  function drawRadar(s) {
    const S = radar.width, c = S / 2, R = c - 3 * dpr;
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, S, S);
    // body
    rctx.beginPath(); rctx.arc(c, c, R, 0, Math.PI * 2);
    const g = rctx.createRadialGradient(c, c * 0.8, R * 0.1, c, c, R);
    g.addColorStop(0, "#1f5a4a"); g.addColorStop(1, "#0d2a26");
    rctx.fillStyle = g; rctx.fill();
    rctx.lineWidth = 4 * dpr; rctx.strokeStyle = "#111"; rctx.stroke();
    rctx.strokeStyle = "rgba(140,255,200,0.25)"; rctx.lineWidth = 1.2 * dpr;
    for (const k of [0.33, 0.66]) { rctx.beginPath(); rctx.arc(c, c, R * k, 0, Math.PI * 2); rctx.stroke(); }
    // sweep
    rctx.save(); rctx.beginPath(); rctx.moveTo(c, c); rctx.arc(c, c, R, sweep, sweep + 0.6); rctx.closePath();
    rctx.fillStyle = "rgba(120,255,190,0.18)"; rctx.fill(); rctx.restore();
    const range = 6000, yaw = s.player.yaw;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const plot = (p, color, size, shape) => {
      const dx = p.x - s.player.pos.x, dz = p.z - s.player.pos.z;
      // rotate so heading points up
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      let px = rx / range, pz = rz / range;
      const l = Math.hypot(px, pz);
      if (l > 0.93) { px *= 0.93 / l; pz *= 0.93 / l; }
      const x = c + px * R, y = c + pz * R;
      rctx.beginPath();
      if (shape === "sq") rctx.rect(x - size, y - size, size * 2, size * 2); else rctx.arc(x, y, size, 0, Math.PI * 2);
      rctx.fillStyle = color; rctx.fill(); rctx.lineWidth = 1.5 * dpr; rctx.strokeStyle = "#000"; rctx.stroke();
    };
    for (const t of s.targets) if (t.alive) plot(t.pos, COL[t.kind] || "#fff", (t.objective ? 3.6 : 2.6) * dpr, t.kind === "jet" || t.kind === "drone" || t.kind === "balloon" ? "c" : "sq");
    for (const r of s.rings) if (!r.passed) plot(r.pos, r === s.rings.next ? COL.ring : "rgba(255,225,77,0.5)", 2.6 * dpr, "c");
    for (const m of s.missiles) if (m.active) plot(m.p, "#ff2222", 2.5 * dpr, "c");
    // boundary hint
    // player
    rctx.save(); rctx.translate(c, c);
    rctx.beginPath(); rctx.moveTo(0, -7 * dpr); rctx.lineTo(5 * dpr, 5 * dpr); rctx.lineTo(0, 2.5 * dpr); rctx.lineTo(-5 * dpr, 5 * dpr); rctx.closePath();
    rctx.fillStyle = "#fff"; rctx.fill(); rctx.lineWidth = 1.5 * dpr; rctx.strokeStyle = "#000"; rctx.stroke(); rctx.restore();
    // N marker
    const nx = c + (-sn) * 0 * R, ny = c;
    const ang = Math.atan2(-cs, sn); // north direction on scope
    rctx.font = `900 ${9 * dpr}px system-ui`; rctx.textAlign = "center"; rctx.textBaseline = "middle";
    rctx.fillStyle = "#bfffe0"; rctx.fillText("N", c + Math.cos(ang) * R * 0.82, c + Math.sin(ang) * R * 0.82);
    void nx; void ny;
  }

  function updateDom(s) {
    const t = Math.max(0, Math.ceil(s.timeLeft));
    dom.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    dom.timer.classList.toggle("urgent", t <= 20);
    dom.score.textContent = s.score;
    dom.obj.innerHTML = s.objectives.map((o) => {
      const got = Math.min(o.need, s.progress[o.kind] || 0);
      const done = got >= o.need;
      const label = (o.kind === "view" || o.kind === "orbit") ? o.label : o.label.replace(/ \d+ /, " ");
      return `<div>${done ? "✅" : "◻️"} ${label}${o.need > 1 ? ` <b>${got}/${o.need}</b>` : ""}</div>`;
    }).join("");
    const hp = Math.max(0, s.player.hp);
    dom.hp.style.width = hp + "%";
    dom.hp.style.background = hp > 60 ? "var(--mint)" : hp > 30 ? "var(--sun)" : "var(--red)";
    dom.spd.textContent = Math.round(s.player.speed * 3.6);
    dom.alt.textContent = Math.round(s.player.pos.y);
    dom.rocket.textContent = s.player.rockets; dom.bomb.textContent = s.player.bombs;
    dom.wr.classList.toggle("empty", s.player.rockets <= 0); dom.wb.classList.toggle("empty", s.player.bombs <= 0);
    if (dom.low) {
      const lo = !!s.lowAlt && !s.crashing;
      dom.low.classList.toggle("on", lo); dom.edge.classList.toggle("on", lo); dom.altBox?.classList.toggle("low", lo);
    }
    if (dom.heat) {
      const h = Math.max(0, Math.min(1, s.heat || 0));
      dom.heat.style.strokeDashoffset = String(100 - h * 100);
      dom.heat.style.stroke = s.overheated ? "#ff2a1a" : `hsl(${Math.round(52 - 50 * h)}, 100%, ${Math.round(55 - 8 * h)}%)`;
      dom.wg.classList.toggle("hot", !!s.overheated);
    }
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
