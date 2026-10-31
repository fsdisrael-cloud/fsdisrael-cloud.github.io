// Ubu audio: looped music files (pre-rendered offline by tools/make_music.py, one style
// per scene/weather) + procedural WebAudio sound effects. Separate music / SFX toggles.
const TRACK_FOR = {
  menu: "menu", day: "day", dawn: "dawn", dusk: "dusk", night: "night",
  rain: "rain", fog: "fog", snow: "snow", storm: "storm",
};
export function trackFor(time, weather) {
  if (weather === "rain" || weather === "fog" || weather === "snow" || weather === "storm") return weather;
  return time;
}

export function createAudio() {
  let ctx = null, master, musicGain, sfxGain, noiseBuf = null;
  let musicOn = true, sfxOn = true;
  try {
    const s = JSON.parse(localStorage.getItem("jet-audio") || "{}");
    if (typeof s.music === "boolean") musicOn = s.music;
    if (typeof s.sfx === "boolean") sfxOn = s.sfx;
  } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem("jet-audio", JSON.stringify({ music: musicOn, sfx: sfxOn })); } catch { /* ignore */ } };
  const buffers = new Map();
  const loading = new Map();
  let current = null; // { name, src, gain }
  let wanted = null;
  let engine = null;
  let lastGun = 0;
  // iOS robustness: cap simultaneous one-shot voices, remember whether the app wants sound running
  let active = 0, sessionSet = false, wantRunning = false, lastEngineT = 0;
  const MAX_VOICES = 40;

  function ensure() {
    if (ctx && ctx.state !== "closed") return ctx;
    if (ctx && ctx.state === "closed") { ctx = null; current = null; engine = null; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    ctx.onstatechange = () => { if (ctx && ctx.state !== "running" && wantRunning && !document.hidden) kick(); };
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.55 : 0; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.9 : 0; sfxGain.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /** Try to get the context running again (works without a gesture after an iOS interruption ends). */
  function kick() {
    if (!ctx) return;
    if (ctx.state === "closed") { ensure(); tech = null; if (wanted) playTrack(wanted, wantedOpts); return; }
    if (ctx.state !== "running") { try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ } }
  }
  // resume on every touch / visibility change + a light watchdog while the page is visible
  for (const ev of ["touchstart", "touchend", "pointerdown", "click", "keydown"]) window.addEventListener(ev, () => { if (ctx) kick(); }, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ctx) kick(); });
  window.addEventListener("pageshow", () => { if (ctx) kick(); });
  window.addEventListener("focus", () => { if (ctx) kick(); });
  setInterval(() => {
    if (!ctx || document.hidden || !wantRunning) return;
    if (ctx.state !== "running") kick();
    // music source died (iOS can drop sources after an interruption): restart it
    if (wanted && wanted !== "techno" && ctx.state === "running" && (!current || current.dead)) { current = null; playTrack(wanted); }
  }, 1000);

  async function load(name) {
    if (buffers.has(name)) return buffers.get(name);
    if (loading.has(name)) return loading.get(name);
    const p = (async () => {
      const res = await fetch(`audio/${name}.mp3`);
      const ab = await res.arrayBuffer();
      const buf = await new Promise((ok, bad) => ctx.decodeAudioData(ab, ok, bad));
      buffers.set(name, buf);
      return buf;
    })();
    loading.set(name, p);
    try { return await p; } finally { loading.delete(name); }
  }

  // ---------- procedural techno: a new random fast track every run ----------
  let tech = null, wantedOpts = null;
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function stopTechno() {
    if (!tech) return;
    const t = tech; tech = null;
    clearInterval(t.timer);
    try { t.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.25); } catch { /* ignore */ }
    setTimeout(() => { try { t.bus.disconnect(); t.fb.disconnect(); t.delay.disconnect(); } catch { /* ignore */ } }, 1500);
  }
  function startTechno(o = {}) {
    stopTechno();
    const r = mulberry(((o.seed || 0) ^ ((Math.random() * 4294967295) >>> 0)) >>> 0);
    const alien = !!o.alien;
    const bpm = 138 + Math.floor(r() * 22);                       // 138 - 159 bpm
    const step = 60 / bpm / 4;
    const root = 31 + Math.floor(r() * 9);                        // low bass root
    const scales = alien ? [[0, 1, 4, 5, 7, 8, 11], [0, 2, 3, 6, 7, 8, 11], [0, 1, 3, 7, 8, 10, 12]] : [[0, 2, 3, 5, 7, 8, 10], [0, 1, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 9, 10]];
    const sc = scales[Math.floor(r() * scales.length)];
    const prog = [[0, 0, 5, 3], [0, 3, 5, 4], [0, 0, 3, 6], [0, 5, 3, 4]][Math.floor(r() * 4)]; // scale degrees per bar
    const deg = (d) => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const bassPat = Array.from({ length: 16 }, (_, i) => (i % 4 === 2 ? (r() < 0.9 ? 1 : 0) : i % 4 === 0 ? 0 : r() < 0.28 ? 1 : 0));
    const bassOct = r() < 0.3 ? 12 : 0;
    const arpPat = Array.from({ length: 16 }, () => (r() < 0.7 ? 1 + Math.floor(r() * 3) : 0)); // 0 = rest, else a chord tone index
    const arpDeg = [0, 2, 4, 7, 9, 11, 14];
    const leadWave = ["sawtooth", "square", "sawtooth"][Math.floor(r() * 3)];
    const hatSwing = r() < 0.5;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.gain.setTargetAtTime(0.78, ctx.currentTime, 0.4); bus.connect(musicGain);
    const duck = ctx.createGain(); duck.connect(bus);
    const delay = ctx.createDelay(1); delay.delayTime.value = step * 3; const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dwet = ctx.createGain(); dwet.gain.value = 0.35; delay.connect(fb); fb.connect(delay); delay.connect(dwet); dwet.connect(duck);
    let next = ctx.currentTime + 0.1, idx = 0;
    const noise = (t, dur, type, f, g0, q = 0.7) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain(); env(g, t, 0.002, g0, dur); src.connect(flt); flt.connect(g); g.connect(bus); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    };
    const kick = (t, g0 = 0.95) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(g, t, 0.003, g0, 0.32); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.36);
      duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.3, t); duck.gain.linearRampToValueAtTime(1, t + step * 3.2);
    };
    const bass = (t, m, len) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = mtof(m);
      f.type = "lowpass"; f.Q.value = 6; f.frequency.setValueAtTime(900 + r() * 500, t); f.frequency.exponentialRampToValueAtTime(140, t + len);
      env(g, t, 0.005, 0.36, len); o.connect(f); f.connect(g); g.connect(duck); o.start(t); o.stop(t + len + 0.03);
    };
    const lead = (t, m, len, vol) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = leadWave; o.frequency.value = mtof(m);
      o.detune.value = (r() - 0.5) * 14; f.type = "lowpass"; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + len); f.Q.value = 3;
      env(g, t, 0.004, vol, len); o.connect(f); f.connect(g); g.connect(duck); g.connect(delay); o.start(t); o.stop(t + len + 0.03);
    };
    const tick = () => {
      if (!ctx || tech == null) return;
      while (next < ctx.currentTime + 0.18) {
        const s = idx % 16, bar = Math.floor(idx / 16), ph = bar % 16, t = next;
        const breakdown = ph === 8 || ph === 9, riser = ph === 15;
        const bd = deg(prog[bar % 4]);
        if (!breakdown && s % 4 === 0) kick(t);
        if (!breakdown && ph >= 0 && (s === 4 || s === 12)) { noise(t, 0.16, "bandpass", 1700, 0.5, 1.2); noise(t + 0.012, 0.1, "bandpass", 2300, 0.3, 1.2); }
        if (ph >= 1 && (s % 4 === 2)) noise(t, 0.16, "highpass", 7500, 0.22);
        else if (ph >= 2 && s % 2 === 1 && !breakdown) noise(t + (hatSwing && s % 4 === 3 ? 0.012 : 0), 0.045, "highpass", 9000, 0.1 + r() * 0.08);
        if (ph >= 2 && !breakdown && bassPat[s]) bass(t, root + sc[0] + bd + bassOct, step * (s % 4 === 2 ? 1.7 : 0.9));
        if (ph >= 4 && arpPat[s] && !(ph === 15 && s > 8)) lead(t, root + 24 + bd + deg(arpDeg[(arpPat[s] * 2 + (s >> 2)) % arpDeg.length]), step * 1.5, breakdown ? 0.14 : 0.09);
        if (breakdown && s === 0) { for (const d of [0, 2, 4]) lead(t, root + 24 + deg(d + bd), step * 14, 0.07); }
        if (riser && s % 2 === 0) noise(t, step * 2, "highpass", 1500 + s * 380, 0.1 + s * 0.012);
        if (riser && s >= 12 && s % 1 === 0) kick(t, 0.5);
        if (ph === 0 && s === 0 && bar > 0) noise(t, 0.7, "highpass", 3500, 0.2);
        next += step; idx++;
      }
    };
    tech = { timer: setInterval(tick, 25), bus, fb, delay, bpm };
    tick();
  }

  async function playTrack(name, opts) {
    wanted = name; wantedOpts = opts || null;
    if (name !== "techno") stopTechno();
    if (!ctx) return;
    if (name === "techno") {
      if (current) { const old = current; old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); old.retired = true; setTimeout(() => { try { old.src.stop(); } catch { /* ignore */ } }, 2000); current = null; }
      startTechno(opts || {});
      return;
    }
    if (current && current.name === name) return;
    let buf;
    try { buf = await load(TRACK_FOR[name] || "day"); } catch (e) { console.warn("music load failed", e); return; }
    if (wanted !== name) return;
    const t = ctx.currentTime;
    if (current) {
      const old = current;
      old.gain.gain.setTargetAtTime(0, t, 0.4);
      old.retired = true;
      setTimeout(() => { try { old.src.stop(); } catch { /* ignore */ } }, 2500);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    const entry = { name, src, gain: g, dead: false };
    src.onended = () => { entry.dead = true; try { src.disconnect(); g.disconnect(); } catch { /* ignore */ } };
    g.gain.setTargetAtTime(1, t, 0.5);
    src.connect(g); g.connect(musicGain);
    src.start();
    current = entry;
  }

  function env(g, t, a, peak, dur) {
    peak = Math.max(0.0002, peak || 0); a = Math.max(0.001, a); dur = Math.max(a + 0.01, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noise({ dur = 0.3, peak = 0.5, type = "lowpass", f0 = 1000, f1 = null, q = 1, a = 0.005, rate = 1, dest = null, delay = 0, prio = 1 }) {
    if (!ctx || !sfxOn || ctx.state !== "running") return;
    if (active >= MAX_VOICES || (prio < 1 && active >= MAX_VOICES * 0.6)) return;
    try {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    const maxOff = Math.max(0, noiseBuf.duration - dur * rate - 0.05);
    src.start(t, Math.random() * Math.min(1.5, maxOff)); src.stop(t + dur + 0.05);
    active++;
    src.onended = () => { active--; try { src.disconnect(); f.disconnect(); g.disconnect(); } catch { /* ignore */ } };
    } catch (e) { /* never let audio break the game loop */ }
  }
  function tone({ f0 = 440, f1 = null, dur = 0.2, peak = 0.2, type = "sine", a = 0.005, delay = 0, prio = 1 }) {
    if (!ctx || !sfxOn || ctx.state !== "running") return;
    if (active >= MAX_VOICES || (prio < 1 && active >= MAX_VOICES * 0.6)) return;
    try {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
    active++;
    o.onended = () => { active--; try { o.disconnect(); g.disconnect(); } catch { /* ignore */ } };
    } catch (e) { /* never let audio break the game loop */ }
  }

  return {
    async unlock() {
      const c = ensure();
      if (!c) return;
      wantRunning = true;
      if (!sessionSet) { sessionSet = true; try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch { /* ignore */ } }
      if (c.state !== "running") {
        try { await c.resume(); } catch { /* ignore */ }
        // iOS: play a silent buffer inside the gesture
        try { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* ignore */ }
      }
      if (wanted && (wanted === "techno" ? !tech : (!current || current.name !== wanted))) playTrack(wanted, wantedOpts);
    },
    unlocked: () => !!ctx && ctx.state === "running",
    state: () => (ctx ? ctx.state : "none"),
    voices: () => active,
    techno: () => (tech ? { bpm: tech.bpm } : null),
    playTrack, preload(name) { if (ctx) load(TRACK_FOR[name] || name).catch(() => {}); },
    currentTrack: () => current?.name || null,
    setMusic(v) { musicOn = !!v; save(); if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? 0.55 : 0, ctx.currentTime, 0.1); },
    setSfx(v) { sfxOn = !!v; save(); if (sfxGain) sfxGain.gain.setTargetAtTime(sfxOn ? 0.9 : 0, ctx.currentTime, 0.05); },
    musicOn: () => musicOn, sfxOn: () => sfxOn,
    startEngine() {
      if (!ctx || engine) return;
      try {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 70;
      const of = ctx.createBiquadFilter(); of.type = "lowpass"; of.frequency.value = 300;
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(of); of.connect(g); n.connect(nf); nf.connect(g); g.connect(sfxGain);
      o.start(); n.start();
      engine = { o, of, n, nf, g };
      } catch { engine = null; }
    },
    updateEngine(throttle, cockpit) {
      if (!engine || !ctx) return;
      const t = ctx.currentTime;
      if (t - lastEngineT < 0.1) return; // 10 Hz is plenty; avoids piling up AudioParam events (WebKit)
      lastEngineT = t;
      try {
        const set = (p, v, tc) => { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, tc); };
        set(engine.o.frequency, 60 + throttle * 50, 0.2);
        set(engine.nf.frequency, 600 + throttle * 900, 0.2);
        set(engine.of.frequency, cockpit ? 220 : 360, 0.3);
        set(engine.g.gain, (cockpit ? 0.05 : 0.08) + throttle * 0.06, 0.2);
      } catch { /* ignore */ }
    },
    stopEngine() {
      if (!engine) return;
      const e = engine; engine = null;
      try { e.g.gain.cancelScheduledValues(ctx.currentTime); e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch { /* ignore */ }
      setTimeout(() => { try { e.o.stop(); e.n.stop(); e.g.disconnect(); } catch { /* ignore */ } }, 400);
    },
    gun() {
      if (!ctx) return; const now = ctx.currentTime; if (now - lastGun < 0.07) return; lastGun = now;
      noise({ dur: 0.07, peak: 0.35, type: "bandpass", f0: 1800, q: 0.8, prio: 0 });
      tone({ f0: 160, f1: 70, dur: 0.06, peak: 0.25, type: "square", prio: 0 });
    },
    rocket() { noise({ dur: 0.9, peak: 0.4, type: "bandpass", f0: 600, f1: 2600, q: 1.2, a: 0.02 }); tone({ f0: 320, f1: 900, dur: 0.5, peak: 0.08, type: "sawtooth" }); },
    bomb() { tone({ f0: 1400, f1: 380, dur: 1.2, peak: 0.07, type: "sine", a: 0.05 }); tone({ f0: 90, dur: 0.12, peak: 0.25, type: "triangle" }); },
    explosion(big = 1, dist = 0) {
      const v = Math.max(0.15, 1 - dist / 4000) * big;
      noise({ dur: 1.4 * big, peak: 0.8 * v, type: "lowpass", f0: 1600, f1: 120, a: 0.004 });
      tone({ f0: 110, f1: 32, dur: 0.9, peak: 0.6 * v, type: "sine" });
      noise({ dur: 0.25, peak: 0.4 * v, type: "highpass", f0: 2500, q: 0.5 });
    },
    hit() { const n = ctx ? ctx.currentTime : 0; if (n - (this._lh || 0) < 0.06) return; this._lh = n; tone({ f0: 900, f1: 300, dur: 0.12, peak: 0.12, type: "square", prio: 0 }); noise({ dur: 0.1, peak: 0.25, type: "highpass", f0: 3000, prio: 0 }); },
    hurt() { tone({ f0: 220, f1: 90, dur: 0.25, peak: 0.25, type: "sawtooth" }); noise({ dur: 0.2, peak: 0.35, type: "lowpass", f0: 900 }); },
    lock() { tone({ f0: 1320, dur: 0.07, peak: 0.08, type: "square" }); tone({ f0: 1760, dur: 0.07, peak: 0.08, type: "square", delay: 0.08 }); },
    warn() { tone({ f0: 980, dur: 0.12, peak: 0.12, type: "square" }); tone({ f0: 740, dur: 0.12, peak: 0.12, type: "square", delay: 0.14 }); },
    pullUp() { tone({ f0: 520, dur: 0.18, peak: 0.1, type: "triangle" }); },
    thunder() { noise({ dur: 3.2, peak: 0.7, type: "lowpass", f0: 400, f1: 60, a: 0.08, rate: 0.5 }); tone({ f0: 55, f1: 30, dur: 2.4, peak: 0.35, type: "sine", a: 0.1 }); },
    crash() {
      noise({ dur: 2.8, peak: 0.95, type: "lowpass", f0: 2200, f1: 70, a: 0.004, rate: 0.6 });
      noise({ dur: 0.45, peak: 0.55, type: "highpass", f0: 2500, a: 0.002 });
      tone({ f0: 75, f1: 26, dur: 2.0, peak: 0.55, type: "sine", a: 0.01 });
      tone({ f0: 140, f1: 40, dur: 0.6, peak: 0.25, type: "triangle", delay: 0.05 });
    },
    hiss() { noise({ dur: 1.1, peak: 0.32, type: "highpass", f0: 5000, f1: 2200, a: 0.02 }); tone({ f0: 340, f1: 170, dur: 0.22, peak: 0.07, type: "square" }); },
    /** subtle rack-reload tick (missile / bomb back in the rack) and empty-rack click; both respect the Effects toggle */
    reload(kind = "missile") { tone({ f0: kind === "bomb" ? 330 : 560, f1: kind === "bomb" ? 440 : 840, dur: 0.07, peak: 0.045, type: "triangle", prio: 0 }); tone({ f0: kind === "bomb" ? 660 : 1120, dur: 0.05, peak: 0.03, type: "sine", delay: 0.06, prio: 0 }); },
    empty() { tone({ f0: 180, f1: 120, dur: 0.06, peak: 0.07, type: "square", prio: 0 }); },
    cool() { tone({ f0: 880, f1: 1320, dur: 0.12, peak: 0.07, type: "sine" }); },
    whoosh() { noise({ dur: 1.4, peak: 0.25, type: "bandpass", f0: 400, f1: 1600, q: 0.8, a: 0.3 }); },
    respawn() { [0, 7, 12, 19].forEach((s, i) => tone({ f0: 659.25 * 2 ** (s / 12), dur: 0.25, peak: 0.09, type: "sine", delay: i * 0.07 })); noise({ dur: 0.6, peak: 0.15, type: "highpass", f0: 6000, a: 0.05 }); },
    /** Cockpit voice "Altitude, altitude, pull up, pull up" (pre-rendered with flite TTS -> audio/pullup.mp3). */
    voicePullUp() {
      if (!sfxOn) return;
      if (!ensure()) return;
      const buf = buffers.get("pullup");
      if (buf) {
        if (ctx.state !== "running") return;
        try {
          const src = ctx.createBufferSource(); src.buffer = buf;
          const g = ctx.createGain(); g.gain.value = 1.1;
          src.connect(g); g.connect(sfxGain); src.start();
          src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* ignore */ } };
        } catch { /* ignore */ }
        return;
      }
      if (this._vl) return; this._vl = true;
      load("pullup").then(() => { this._vl = false; }, () => {
        this._vl = false;
        if (!("speechSynthesis" in window)) return;
        try { const u = new SpeechSynthesisUtterance("Altitude, altitude, pull up, pull up"); u.rate = 1.1; u.pitch = 0.7; speechSynthesis.speak(u); } catch { /* ignore */ }
      });
    },
    preloadVoice() { if (ensure()) load("pullup").catch(() => {}); },
    click() { tone({ f0: 660, f1: 990, dur: 0.07, peak: 0.12, type: "sine" }); },
    win() { [0, 4, 7, 12, 16].forEach((s, i) => tone({ f0: 523.25 * 2 ** (s / 12), dur: 0.35, peak: 0.13, type: "triangle", delay: i * 0.11 })); },
    lose() { [7, 4, 0].forEach((s, i) => tone({ f0: 392 * 2 ** (s / 12), dur: 0.4, peak: 0.12, type: "triangle", delay: i * 0.16 })); },
  };
}
