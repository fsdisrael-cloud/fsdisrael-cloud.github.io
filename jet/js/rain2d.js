// b23: rain on the glass. Cockpit view = beads that cling to the canopy and get blown back; chase view = streaks rushing toward the camera.
export function createRain2D(canvas) {
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1, drops = [], streaks = [], spawnT = 0, level = 0;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); w = canvas.width = Math.round(innerWidth * dpr * 0.6); h = canvas.height = Math.round(innerHeight * dpr * 0.6); }
  resize(); window.addEventListener("resize", resize);
  function update(dt, rain, view, speed) {
    const want = rain > 0 ? Math.min(1, rain) : 0;
    level += (want - level) * Math.min(1, dt * 1.5);
    canvas.style.opacity = level > 0.02 ? "1" : "0";
    if (level < 0.02 && !drops.length && !streaks.length) return;
    ctx.clearRect(0, 0, w, h);
    const sp = Math.min(1.6, (speed || 150) / 200);
    if (view === "cockpit") {
      spawnT -= dt * (14 + 30 * level);
      while (spawnT <= 0 && drops.length < 90) { spawnT += 1; drops.push({ x: Math.random() * w, y: Math.random() * h, r: (2 + Math.random() * 5) * dpr * 0.6, life: 2.5 + Math.random() * 4, vy: 0, t: 0 }); }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.t += dt;
        if (d.t > d.life) { drops.splice(i, 1); continue; }
        if (d.r > 4.2 * dpr * 0.6) d.vy += dt * 30 * sp; d.y -= (d.vy * 0.4 - sp * 18) * dt * 0.0 + (sp * 26 * (d.r / (6 * dpr))) * dt; d.x += Math.sin(d.t * 3 + d.life) * dt * 3;
        const a = Math.min(1, d.t * 3, (d.life - d.t) * 1.2) * level;
        if (d.y < -10 || d.y > h + 10) { drops.splice(i, 1); continue; }
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = "rgba(210,230,255,0.35)"; ctx.lineWidth = Math.max(1, d.r * 0.55); ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 1, d.y + d.r * 3.2 * sp); ctx.stroke();   // tail
        const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
        g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.45, "rgba(170,200,230,0.28)"); g.addColorStop(1, "rgba(30,50,80,0.45)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.85, d.r, 0, 0, 7); ctx.fill();
      }
      streaks.length = 0;
    } else {
      const n = Math.round(70 * level);
      while (streaks.length < n) streaks.push({ a: Math.random() * 6.283, r: 0.05 + Math.random() * 0.5, v: 0.5 + Math.random() });
      ctx.lineWidth = Math.max(1, dpr * 0.8); ctx.strokeStyle = "rgba(225,238,255,0.5)";
      const cx = w / 2, cy = h * 0.45, R = Math.hypot(w, h) * 0.6;
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i]; const r0 = s.r; s.r += dt * (0.9 + 1.6 * sp) * s.v * (0.4 + s.r * 2.2);
        if (s.r > 1.1 || i >= n) { if (i >= n) { streaks.splice(i, 1); continue; } s.r = 0.04 + Math.random() * 0.1; s.a = Math.random() * 6.283; continue; }
        ctx.globalAlpha = Math.min(1, s.r * 3) * 0.6 * level;
        const c = Math.cos(s.a), sn = Math.sin(s.a);
        ctx.beginPath(); ctx.moveTo(cx + c * r0 * R * 0.9, cy + sn * r0 * R * 0.9); ctx.lineTo(cx + c * s.r * R, cy + sn * s.r * R); ctx.stroke();
      }
      drops.length = 0;
    }
    ctx.globalAlpha = 1;
  }
  return { update };
}
