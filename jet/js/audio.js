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
    if (ctx.state === "closed") { ensure(); if (wanted) playTrack(wanted); return; }
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
    if (wanted && ctx.state === "running" && (!current || current.dead)) { current = null; playTrack(wanted); }
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

  async function playTrack(name) {
    wanted = name;
    if (!ctx) return;
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
      if (wanted && (!current || current.name !== wanted)) playTrack(wanted);
    },
    unlocked: () => !!ctx && ctx.state === "running",
    state: () => (ctx ? ctx.state : "none"),
    voices: () => active,
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
