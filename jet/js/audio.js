// Ubu audio: looped music files (pre-rendered offline by tools/make_music.py, one style
// per scene/weather) + procedural WebAudio sound effects. Separate music / SFX toggles.
const TRACK_FOR = {
  menu: "m15/menu", day: "day", dawn: "dawn", dusk: "dusk", night: "night",
  rain: "rain", fog: "fog", snow: "snow", storm: "storm",
};
export function trackFor(time, weather) {
  if (weather === "rain" || weather === "fog" || weather === "snow" || weather === "storm") return weather;
  return time;
}

// build 15: original offline-rendered melodic techno / trance tracks (tools/make_techno15.py), one random per game
const GAME_TRACKS = ["afterburn", "vector", "redline", "skyline", "nightfall", "zenith"];

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
  // build 15: while the app is in the background / exited, ALL audio is held (context suspended); only release() lets it run again
  let held = false, techFile = null;
  const pickTrack = () => {
    let last = null; try { last = sessionStorage.getItem("jet-last-track"); } catch { /* ignore */ }
    const pool = GAME_TRACKS.filter((n) => n !== last);
    const n = pool[Math.floor(Math.random() * pool.length)];
    try { sessionStorage.setItem("jet-last-track", n); } catch { /* ignore */ }
    return n;
  };
  const MAX_VOICES = 40;

  function ensure() {
    if (ctx && ctx.state !== "closed") return ctx;
    if (ctx && ctx.state === "closed") { ctx = null; current = null; engine = null; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    ctx.onstatechange = () => {
      if (!ctx) return;
      if (held && ctx.state === "running") { try { ctx.suspend(); } catch { /* ignore */ } return; }
      if (ctx.state !== "running" && wantRunning && !document.hidden && !held) kick();
    };
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
    if (!ctx || held) return;
    if (ctx.state === "closed") { ensure(); tech = null; if (wanted) playTrack(wanted, { ...(wantedOpts || {}), again: true }); return; }
    if (ctx.state !== "running") { try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ } }
  }
  // resume on every touch / visibility change + a light watchdog while the page is visible
  for (const ev of ["touchstart", "touchend", "pointerdown", "click", "keydown"]) window.addEventListener(ev, () => { if (ctx) kick(); }, { capture: true, passive: true });
  // leaving the app (home button, app switch, lock, tab change, window blur, page exit): silence everything NOW
  // iOS: a silent looping <audio> element switches the page to the "playback" audio category (ringer switch no longer mutes WebAudio)
  let keep = null;
  const SILENT = "data:audio/wav;base64,UklGRmQfAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAfAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
  function keepAlive(on) {
    try {
      if (on) {
        if (!keep) { keep = new Audio(SILENT); keep.loop = true; keep.setAttribute("playsinline", ""); keep.volume = 0.01; }
        keep.muted = false; const r = keep.play(); if (r && r.catch) r.catch(() => {});
      } else if (keep) { keep.pause(); keep.muted = true; }
    } catch { /* ignore */ }
  }
  function hold() {
    held = true;
    keepAlive(false);
    for (const el of document.querySelectorAll("audio,video")) { try { el.pause(); el.muted = true; } catch { /* ignore */ } }
    if (!ctx) return;
    const c = ctx;
    try { master.gain.cancelScheduledValues(0); master.gain.setValueAtTime(0, c.currentTime); } catch { /* ignore */ }
    if (tech) { try { clearInterval(tech.timer); } catch { /* ignore */ } tech = null; }
    if (engine) { try { engine.o.stop(); engine.n.stop(); } catch { /* ignore */ } engine = null; }
    if (current) { try { current.src.stop(); } catch { /* ignore */ } current = null; }
    // suspend first (instant), then close the context for good; a fresh one is built on CONT / NEW (inside the tap)
    try { const r = c.suspend(); if (r && r.then) r.then(() => { try { return c.close(); } catch { /* ignore */ } }).catch(() => {}); } catch { /* ignore */ }
  }
  function release() {
    if (!held) return;
    held = false;
    for (const el of document.querySelectorAll("audio,video")) { try { el.muted = false; } catch { /* ignore */ } }
    if (!ctx) return;
    if (ctx.state === "closed" || ctx.state === "suspended") { if (ctx.state === "closed") { ensure(); if (wanted) playTrack(wanted, { ...(wantedOpts || {}), again: true }); } }
    else { try { master.gain.cancelScheduledValues(0); master.gain.setValueAtTime(0.9, ctx.currentTime); } catch { /* ignore */ } }
    kick();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) hold(); });
  document.addEventListener("webkitvisibilitychange", () => { if (document.hidden || document.webkitHidden) hold(); });
  window.addEventListener("pagehide", hold);
  window.addEventListener("freeze", hold);
  window.addEventListener("blur", hold);
  setInterval(() => {
    if (!ctx || held || document.hidden || !wantRunning) return;
    if (ctx.state !== "running") kick();
    // music source died (iOS can drop sources after an interruption): restart it
    if (wanted && !tech && ctx.state === "running" && (!current || current.dead)) { current = null; playTrack(wanted, { ...(wantedOpts || {}), again: true }); }
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
    stopTechno();
    if (!ctx) return;
    let file = TRACK_FOR[name] || "m15/menu";
    if (name === "techno") {
      if (!(opts && opts.again) || !techFile) techFile = pickTrack();
      file = "m15/" + techFile;
    }
    if (current && !current.dead && current.name === name && current.file === file) return;
    let buf;
    try { buf = await load(file); } catch (e) {
      console.warn("music load failed", e);
      if (name === "techno" && wanted === name && ctx) startTechno(opts || {});   // offline fallback: old synth
      return;
    }
    if (wanted !== name || held || !ctx) return;
    if (current && !current.dead && current.name === name && current.file === file) return;
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
    const entry = { name, file, src, gain: g, dead: false };
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
  const _gt = {}; const gate = (k, ms) => { const n = performance.now(); if (n - (_gt[k] || 0) < ms) return false; _gt[k] = n; return true; };
  function tone({ f0 = 440, f1 = null, dur = 0.2, peak = 0.2, type = "sine", a = 0.005, delay = 0, prio = 1 }) {
    if (!ctx || !sfxOn || ctx.state !== "running") return;
    if (active >= MAX_VOICES || (prio < 1 && active >= MAX_VOICES * 0.6)) return;
    try {
    const t = ctx.currentTime + delay; a = Math.max(a, 0.015); if (type === "square" || type === "sawtooth") type = "sine";
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
    active++;
    o.onended = () => { active--; try { o.disconnect(); g.disconnect(); } catch { /* ignore */ } };
    } catch (e) { /* never let audio break the game loop */ }
  }

  // ---- build 17: layered synthesized SFX (pre-rendered once into AudioBuffers; no samples to license) ----
  let SFX = null;
  function buildSfx() {
    const sr = ctx.sampleRate, rnd = Math.random, TAU = Math.PI * 2;
    const mk = (sec, fn) => { const b = ctx.createBuffer(1, Math.floor(sr * sec), sr); const d = b.getChannelData(0); fn(d, sr); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); const k = 0.95 / (pk || 1); for (let i = 0; i < d.length; i++) d[i] *= k; return b; };
    const boom = (sec, seed) => mk(sec, (d) => {
      let y = 0, y2 = 0, ph = 0, cr = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, n = rnd() * 2 - 1;
        const crack = n * Math.exp(-t / 0.012) * 1.1;
        const k = 0.22 * Math.exp(-t / 0.45) + 0.014; y += k * (n - y);
        const body = y * 5.5 * (1 - Math.exp(-t / 0.005)) * Math.exp(-t / (0.85 + seed * 0.3));
        y2 += 0.006 * (n - y2); const rum = y2 * 14 * Math.exp(-t / 1.7) * (1 - Math.exp(-t / 0.08));
        ph += TAU * (24 + 52 * Math.exp(-t / 0.9)) / sr; const sub = Math.sin(ph) * Math.exp(-t / 1.15) * (1 - Math.exp(-t / 0.004)) * 1.1;
        if (rnd() < (110 * Math.exp(-t / 1.3) + 6) / sr) cr = 0.55 + rnd() * 0.45; const crk = cr * (rnd() * 2 - 1) * 0.5; cr *= 0.9;
        const deb = (t > 0.35 && rnd() < 26 * Math.exp(-(t - 0.35) / 1.1) / sr) ? 0.5 : 0;
        d[i] = crack + body + rum + sub + crk * Math.min(1, t * 8) + deb * (rnd() * 2 - 1);
      }
    });
    const shot = (d, at, amp) => {
      const L = Math.floor(sr * 0.016); let ring = 0;
      for (let j = 0; j < L; j++) {
        const t = j / sr, n = rnd() * 2 - 1;
        const v = (n * Math.exp(-t / 0.0016) * 0.9 + Math.sin(TAU * (130 - 3000 * t) * t) * Math.exp(-t / 0.0045) * 0.9 + Math.sin(TAU * 720 * t) * Math.exp(-t / 0.004) * 0.35 + Math.sin(TAU * 1540 * t) * Math.exp(-t / 0.0025) * 0.2) * amp;
        d[(at + j) % d.length] += v;
      }
    };
    SFX = {
      boomA: boom(3.8, 0), boomB: boom(3.4, 1),
      gun: mk(0.5, (d) => {
        const per = Math.floor(sr / 50); let bed = 0;
        for (let p = 0; p * per < d.length; p++) shot(d, p * per, 0.8 + rnd() * 0.3);
        for (let i = 0; i < d.length; i++) { bed += 0.12 * ((rnd() * 2 - 1) - bed); d[i] += bed * 0.7; }
      }),
      rocket: mk(2.6, (d) => {
        let a = 0, b = 0, c = 0, m = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr, n = rnd() * 2 - 1;
          a += 0.09 * (n - a); b += 0.012 * (n - b); c += 0.5 * (n - c); m += 0.002 * (n - m);
          const env = (1 - Math.exp(-t / 0.05)) * Math.exp(-Math.max(0, t - 0.5) / 1.5);
          const crk = 0.75 + 0.5 * Math.abs(m) * 90;
          const roar = (a - b) * 3.6 * crk + b * 4.0;
          const hiss = (n - c) * 0.35;
          const ign = (t < 0.12 ? (n * 0.7 + Math.sin(TAU * 150 * t) * 1.0) * Math.exp(-t / 0.035) : 0);
          d[i] = roar * env + hiss * env * 0.8 + ign * 1.2;
        }
      }),
      bomb: mk(1.9, (d) => {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr, n = rnd() * 2 - 1;
          const f = 2100 * Math.exp(-t / 1.1) + 520 + 30 * Math.sin(t * 22); ph += TAU * f / sr;
          const wh = Math.sin(ph) * Math.min(1, t * 6) * (0.6 + 0.4 * t / 1.9) * 0.55 + n * 0.05 * t;
          const th = t < 0.2 ? (Math.sin(TAU * 85 * t) + n * 0.4) * Math.exp(-t / 0.05) * 1.2 : 0;
          d[i] = wh + th;
        }
      }),
      pass: mk(3.0, (d) => {
        let a = 0, b = 0, ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr, n = rnd() * 2 - 1; a += 0.14 * (n - a); b += 0.02 * (n - b);
          const bell = Math.exp(-Math.pow((t - 1.25) / 0.62, 2)), tail = t > 1.25 ? 1 : 0;
          ph += TAU * (780 + 520 * bell) / sr;
          const roar = ((a - b) * 4.0 + b * 3.0) * bell * (0.8 + 0.4 * Math.abs(Math.sin(t * 71)));
          d[i] = roar + Math.sin(ph) * 0.22 * bell + n * 0.12 * bell * bell - tail * 0;
        }
      }),
      hit: mk(0.14, (d) => { for (let i = 0; i < d.length; i++) { const t = i / sr, n = rnd() * 2 - 1; d[i] = n * Math.exp(-t / 0.004) * 0.8 + (Math.sin(TAU * 1850 * t) * 0.5 + Math.sin(TAU * 2740 * t) * 0.3 + Math.sin(TAU * 4100 * t) * 0.2) * Math.exp(-t / 0.03); } }),
    };
  }
  /** play a pre-rendered buffer: rate = pitch (end rate gives a doppler glide), lp = lowpass (Hz, optional glide), delay = seconds */
  function play(name, { gain = 0.8, rate = 1, rate2 = null, lp = 18000, lp2 = null, delay = 0, dur = null, prio = 1, loop = false } = {}) {
    if (!ctx || !sfxOn || ctx.state !== "running") return null;
    if (active >= MAX_VOICES || (prio < 1 && active >= MAX_VOICES * 0.6)) return null;
    try {
      if (!SFX) buildSfx();
      const t = ctx.currentTime + delay, b = SFX[name]; if (!b) return null;
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = loop;
      src.playbackRate.setValueAtTime(rate, t); if (rate2 != null) src.playbackRate.linearRampToValueAtTime(rate2, t + (dur || b.duration));
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(lp, t); if (lp2 != null) f.frequency.exponentialRampToValueAtTime(Math.max(200, lp2), t + (dur || b.duration));
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, t);
      src.connect(f); f.connect(g); g.connect(sfxGain);
      src.start(t); if (dur && !loop) src.stop(t + dur + 0.05);
      active++;
      src.onended = () => { active--; try { src.disconnect(); f.disconnect(); g.disconnect(); } catch { /* ignore */ } };
      return { src, g, f };
    } catch (e) { return null; }
  }
  function duck(depth = 0.45, rel = 0.5) {
    if (!ctx || !musicGain || !musicOn) return;
    try { const n = ctx.currentTime, base = 0.55; musicGain.gain.cancelScheduledValues(n); musicGain.gain.setTargetAtTime(base * depth, n, 0.015); musicGain.gain.setTargetAtTime(base, n + 0.25, rel * 0.5); } catch { /* ignore */ }
  }
  let gunV = null, gunT = 0, gunTimer = 0;
  function gunStop() {
    gunTimer = 0; const v = gunV; gunV = null; if (!v || !ctx) return;
    try { const n = ctx.currentTime; v.g.gain.cancelScheduledValues(n); v.g.gain.setTargetAtTime(0, n, 0.03); v.src.stop(n + 0.2); } catch { /* ignore */ }
  }

  return {
    hold, release, isHeld: () => held,
    async unlock() {
      if (held) return;
      const c = ensure();
      if (!c) return;
      keepAlive(true);
      wantRunning = true;
      if (!sessionSet) { sessionSet = true; try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch { /* ignore */ } }
      if (c.state !== "running") {
        try { await c.resume(); } catch { /* ignore */ }
        // iOS: play a silent buffer inside the gesture
        try { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* ignore */ }
      }
      if (!held && wanted && !tech && (!current || current.name !== wanted)) playTrack(wanted, { ...(wantedOpts || {}), again: true });
    },
    unlocked: () => !!ctx && ctx.state === "running",
    state: () => (ctx ? ctx.state : "none"),
    voices: () => active,
    techno: () => (tech ? { bpm: tech.bpm } : null),
    playTrack, preload(name) { if (ctx) load(TRACK_FOR[name] || name).catch(() => {}); },
    trackFile: () => techFile,
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
      // wind / airflow: rush that rises with speed, plus a low buffet that pulses with G-load
      const w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true; w.playbackRate.value = 0.83;
      const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 500; wf.Q.value = 0.45;
      const wg = ctx.createGain(); wg.gain.value = 0; w.connect(wf); wf.connect(wg); wg.connect(sfxGain);
      const b = ctx.createBufferSource(); b.buffer = noiseBuf; b.loop = true; b.playbackRate.value = 0.5;
      const bf = ctx.createBiquadFilter(); bf.type = "lowpass"; bf.frequency.value = 260;
      const bg = ctx.createGain(); bg.gain.value = 0; const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0;
      lfo.connect(lg); lg.connect(bg.gain); b.connect(bf); bf.connect(bg); bg.connect(sfxGain);
      w.start(); b.start(0, 0.7); lfo.start();
      engine = { o, of, n, nf, g, w, wf, wg, b, bg, lfo, lg };
      } catch { engine = null; }
    },
    updateEngine(throttle, cockpit, speed = 150, load = 0) {
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
        const sk = Math.max(0, Math.min(1, (speed - 100) / 260)), ld = Math.max(0, Math.min(1, load));
        set(engine.wf.frequency, 380 + sk * sk * 2400 + ld * 700, 0.15);
        set(engine.wg.gain, (cockpit ? 0.035 : 0.06) + sk * sk * 0.3 + ld * 0.12, 0.15);
        set(engine.bg.gain, 0.02 + sk * 0.05 + ld * 0.14, 0.15);
        set(engine.lg.gain, ld * 0.12 + sk * 0.02, 0.15);
        set(engine.lfo.frequency, 7 + sk * 6 + ld * 5, 0.2);
      } catch { /* ignore */ }
    },
    stopEngine() {
      if (!engine) return;
      const e = engine; engine = null;
      try { e.g.gain.cancelScheduledValues(ctx.currentTime); e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch { /* ignore */ }
      setTimeout(() => { try { e.o.stop(); e.n.stop(); e.w.stop(); e.b.stop(); e.lfo.stop(); e.g.disconnect(); e.wg.disconnect(); e.bg.disconnect(); } catch { /* ignore */ } }, 400);
    },
    gun() {
      if (!ctx || !sfxOn || ctx.state !== "running") return; const now = ctx.currentTime; gunT = now;
      if (!gunV) {
        gunV = play("gun", { gain: 0.0001, loop: true, prio: 2, lp: 9000 });
        if (gunV) { gunV.g.gain.setValueAtTime(0.0001, now); gunV.g.gain.linearRampToValueAtTime(0.62, now + 0.012); }
      }
      if (!gunTimer) { const chk = () => { if (!ctx || ctx.currentTime - gunT > 0.14) gunStop(); else gunTimer = setTimeout(chk, 50); }; gunTimer = setTimeout(chk, 90); }
    },
    rocket() { play("rocket", { gain: 0.75, rate: 1.08, rate2: 0.8, lp: 9000, lp2: 1800, dur: 2.6, prio: 2 }); tone({ f0: 90, f1: 55, dur: 0.35, peak: 0.3, type: "sine", a: 0.004 }); },
    /** enemy jet streaking past: doppler roar (pitch falls as it passes); gain by closeness */
    flyby(gain = 0.7) { play("pass", { gain, rate: 1.28, rate2: 0.72, lp: 14000, lp2: 3000, prio: 2 }); },
    bomb() { play("bomb", { gain: 0.6, rate: 1.0, rate2: 0.9, lp: 12000, lp2: 2500, prio: 2 }); },
    explosion(big = 1, dist = 0) {
      if (dist < 1800 && big >= 0.9) duck(big >= 1.5 ? 0.3 : 0.55, big >= 1.5 ? 1.2 : 0.7);
      const d = Math.max(0, dist), v = Math.max(0.12, 1 - d / 3500), lpf = Math.max(900, 17000 * Math.exp(-d / 1100));
      const rate = Math.max(0.62, 1.12 - 0.22 * Math.min(2.5, big));
      play(Math.random() < 0.5 ? "boomA" : "boomB", { gain: Math.min(1.0, (0.3 + 0.45 * Math.min(2, big)) * v * 1.4), rate: rate * (0.94 + Math.random() * 0.12), lp: lpf, lp2: lpf * 0.4, delay: Math.min(1.4, d / 2600), prio: 2 });
      if (big >= 1.2 && d < 2500) play(Math.random() < 0.5 ? "boomB" : "boomA", { gain: 0.5 * v, rate: rate * 0.7, lp: lpf * 0.6, delay: 0.05 + Math.min(1.4, d / 2600), prio: 2 });
    },
    hit() { if (!gate("hit", 140)) return; play("hit", { gain: 0.3, rate: 0.85 + Math.random() * 0.4, prio: 0 }); },
    hurt() { if (!gate("hurt", 450)) return; noise({ dur: 0.28, peak: 0.28, type: "lowpass", f0: 600, f1: 250, a: 0.012 }); tone({ f0: 120, f1: 70, dur: 0.22, peak: 0.12, a: 0.015 }); },
    lock() { if (!gate("lock", 900)) return; tone({ f0: 880, dur: 0.2, peak: 0.045, a: 0.03 }); },
    rwr(v = 0.05, f = 900) { tone({ f0: f, dur: 0.1, peak: Math.min(0.08, v * 0.5), a: 0.02, prio: 2 }); },
    warn() { if (!gate("warn", 2500)) return; tone({ f0: 660, dur: 0.3, peak: 0.05, a: 0.04 }); },
    pullUp() { if (!gate("pu", 2500)) return; tone({ f0: 520, dur: 0.25, peak: 0.045, a: 0.04 }); },
    thunder() { noise({ dur: 3.2, peak: 0.7, type: "lowpass", f0: 400, f1: 60, a: 0.08, rate: 0.5 }); tone({ f0: 55, f1: 30, dur: 2.4, peak: 0.35, type: "sine", a: 0.1 }); },
    crash() {
      duck(0.15, 2.2);
      play("boomA", { gain: 1.0, rate: 0.62, lp: 16000, lp2: 700, prio: 2 }); play("boomB", { gain: 0.9, rate: 0.85, delay: 0.12, prio: 2 });
      play("boomA", { gain: 0.8, rate: 0.75, delay: 0.45, lp: 5000, prio: 2 }); play("boomB", { gain: 0.6, rate: 0.7, delay: 0.9, lp: 3000, prio: 2 });
      tone({ f0: 70, f1: 24, dur: 2.2, peak: 0.5, type: "sine", a: 0.01 });
    },
    hiss() { noise({ dur: 0.9, peak: 0.2, type: "highpass", f0: 4500, f1: 2200, a: 0.03 }); },
    /** subtle rack-reload tick (missile / bomb back in the rack) and empty-rack click; both respect the Effects toggle */
    reload(kind = "missile") { if (!gate("rl", 600)) return; tone({ f0: kind === "bomb" ? 330 : 560, dur: 0.1, peak: 0.03, a: 0.02, prio: 0 }); },
    empty() { if (!gate("em", 700)) return; tone({ f0: 200, dur: 0.08, peak: 0.035, prio: 0 }); },
    cool() { if (!gate("cool", 2000)) return; tone({ f0: 760, f1: 980, dur: 0.18, peak: 0.04, a: 0.03 }); },
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
    click() { if (!gate("click", 90)) return; tone({ f0: 640, f1: 800, dur: 0.07, peak: 0.05, a: 0.015 }); },
    win() { [0, 4, 7, 12, 16].forEach((s, i) => tone({ f0: 523.25 * 2 ** (s / 12), dur: 0.35, peak: 0.13, type: "sine", delay: i * 0.11 })); },
    lose() { [7, 4, 0].forEach((s, i) => tone({ f0: 392 * 2 ** (s / 12), dur: 0.4, peak: 0.12, type: "sine", delay: i * 0.16 })); },
  };
}
