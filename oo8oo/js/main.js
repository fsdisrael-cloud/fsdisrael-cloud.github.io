// Ubu – app shell: opening screen (OO8OO), style dial, pre-flight, settings, loop, results, ending.
import * as THREE from "three";
import { createGame } from "./game.js?v=5";
import { createHud } from "./hud.js?v=5";
import { createControls } from "./controls.js?v=5";
import { createAudio, trackFor } from "./audio.js?v=5";
import { createHaptics } from "./haptics.js?v=5";
import { createMenuJet } from "./menu.js?v=5";
import { JET_COLORS } from "./models.js?v=5";
import { TIMES, WEATHERS } from "./sky.js?v=5";
import { style, setSurreal, tickStyle, onStyle } from "./surreal.js?v=5";
import { CRAFTS, updateUnlocks, isFlyable, unlockLabel } from "./crafts.js?v=5";
import {
  PLACES, LABEL, buildLevel, freshPosition, nextPosition, formatPosition, overallLine, slotIndex,
  loadProgress, saveProgress, LEVELS_PER_CHAPTER, CHAPTERS_PER_BOOK, BOOKS_PER_SERIES, TOTAL_SERIES, THEME_LABEL,
} from "./missions.js?v=5";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const settings = Object.assign({ name: "", quality: "high", minutes: 3, place: "auto", time: "auto", weather: "auto", color: "sky", craft: "jet", haptics: true }, store.get("ubu-settings", {}));
const saveSettings = () => store.set("ubu-settings", settings);

// ---------- core ----------
const canvas = $("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
let pixelRatio = 1;
function applyQuality() {
  pixelRatio = settings.quality === "low" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
}
applyQuality();
const audio = createAudio();
const controls = createControls();
const haptics = createHaptics();
haptics.setOn(settings.haptics);
const hud = createHud();
const game = createGame({
  renderer, audio, controls, haptics,
  events: {
    toast: (m) => hud.toast(m),
    onHurt: () => hud.hurtFlash(),
    onEnd: (r) => onMissionEnd(r),
    onView: (m) => updateViewBtn(m),
    onCrash: () => { flashOn("crash-flash"); $("crash").classList.remove("hidden"); },
    onRespawn: () => { $("crash").classList.add("hidden"); flashOn("sky-flash"); hud.toast("Back in the sky!"); },
    onLoading: (t) => { $("loading-text").textContent = t; },
  },
});
controls.bindLookSurface(document.body);
controls.bindWeapons($("wpn-gun"), $("wpn-rocket"), $("wpn-bomb"));
controls.bindLoops($("btn-loop-in"), $("btn-loop-out"), $("btn-roll-l"), $("btn-roll-r"));
function flashOn(id) { const f = $(id); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }
const menuJet = createMenuJet($("jet-hole"));
menuJet.setColor(settings.color);

let state = "title"; // title | loading | playing | paused | results | end
let current = null;

// ---------- audio unlock on first touch ----------
const unlock = () => { audio.unlock(); };
for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, { capture: true });
audio.playTrack("menu");
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { if (!e.target.closest?.(".set-scroll, .chips, .preflight, #res-list")) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest?.("button");
  if (!b || b.disabled || b.classList.contains("wpn")) return;
  b.classList.remove("bounce", "pressed-glint"); void b.offsetWidth; b.classList.add("bounce", "pressed-glint");
  setTimeout(() => b.classList.remove("bounce", "pressed-glint"), 480);
  if (b.matches(".silver-chip, .silver-pill, .o-ring, .style-dial, .craft, .round-btn")) haptics.tick();
}, { capture: true });
document.addEventListener("dblclick", (e) => e.preventDefault());

// ---------- top row ----------
function syncAudioButtons() {
  $("btn-music").classList.toggle("off", !audio.musicOn());
  $("btn-sfx").classList.toggle("off", !audio.sfxOn());
  $("set-music").classList.toggle("on", audio.musicOn());
  $("set-sfx").classList.toggle("on", audio.sfxOn());
}
$("btn-music").addEventListener("click", () => { audio.setMusic(!audio.musicOn()); syncAudioButtons(); audio.click(); });
$("btn-sfx").addEventListener("click", () => { audio.setSfx(!audio.sfxOn()); syncAudioButtons(); audio.click(); });
$("btn-gear").addEventListener("click", () => openSettings());
syncAudioButtons();

// ---------- style dial (graphic only, no text) ----------
function dialSVG(el) {
  const ticks = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2, r1 = 44, r2 = 48;
    return `<line x1="${50 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * r2}" y2="${50 + Math.sin(a) * r2}" stroke="#1a1c20" stroke-width="1.6"/>`;
  }).join("");
  let wave = "";
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2, r = 40 + 5 * Math.sin(a * 7) + 2 * Math.sin(a * 3 + 1);
    wave += `${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)} `;
  }
  el.innerHTML = `
  <svg class="dial-real" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#0b0c0e"/>${ticks}
    <circle cx="50" cy="50" r="42" fill="url(#g-silver)" stroke="#000" stroke-width="2"/>
    <circle cx="50" cy="50" r="31" fill="url(#g-silver-edge)" stroke="#000" stroke-width="1.5"/>
    <circle cx="50" cy="50" r="27" fill="url(#g-silver)" filter="url(#f-brush)"/>
    <path d="M50 50 L22 50" stroke="#111" stroke-width="5" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="5" fill="#111"/>
    <path d="M30 26 A28 28 0 0 1 52 20" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </svg>
  <svg class="dial-dream" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="g-dream-${el.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffb3de"/><stop offset="0.35" stop-color="#c9b6ff"/><stop offset="0.65" stop-color="#b8f3ff"/><stop offset="1" stop-color="#fff1a8"/></linearGradient></defs>
    <path d="${wave}Z" fill="url(#g-dream-${el.id})" stroke="#5b3f8a" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 50 C 62 44, 70 56, 80 50" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9"/>
    <circle cx="50" cy="50" r="6" fill="#fff" opacity="0.9"/>
    <circle cx="34" cy="32" r="5" fill="#fff" opacity="0.7"/><circle cx="64" cy="70" r="3" fill="#fff" opacity="0.6"/>
  </svg>`;
}
const dials = [$("style-dial"), $("set-style")];
dials.forEach(dialSVG);
function syncDials() { for (const d of dials) { d.classList.toggle("dream", style.surreal); d.setAttribute("aria-pressed", String(style.surreal)); } }
for (const d of dials) d.addEventListener("click", () => { setSurreal(!style.surreal); audio.click(); });
onStyle(syncDials);
syncDials();

// ---------- opening screen ----------
document.body.classList.add("on-title");
document.querySelectorAll(".idle-o").forEach((b) => b.addEventListener("click", () => { b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); }));
$("o-jet").addEventListener("click", () => { audio.click(); openPreflight(); });

// ---------- progress ----------
function prog() {
  const p = loadProgress();
  return { pos: p?.pos || freshPosition(), max: p?.max || p?.pos || freshPosition(), finished: !!p?.finished, best: p?.best || {} };
}
const cmpPos = (a, b) => slotIndex(a) - slotIndex(b);

// ---------- pre-flight (after tapping the jet circle) ----------
const pf = { mode: "continue", sel: freshPosition() };
function openPreflight() {
  const P = prog();
  if (pf.mode === "vibe" && !P.finished) pf.mode = "continue";
  pf.sel = { ...(P.finished ? P.max : P.pos) };
  const pfEl = $("preflight"), jr = $("o-jet").getBoundingClientRect();
  pfEl.style.setProperty("--wx", `${((jr.left + jr.width / 2) / innerWidth) * 100}%`);
  pfEl.style.setProperty("--wy", `${((jr.top + jr.height / 2) / innerHeight) * 100}%`);
  pfEl.classList.remove("wipe"); void pfEl.offsetWidth; pfEl.classList.add("wipe");
  pfEl.classList.remove("hidden");
  $("pf-vibe").classList.toggle("hidden", !P.finished);
  renderCrafts(); renderPreflight();
}
function closePreflight() { $("preflight").classList.add("hidden"); }
$("pf-close").addEventListener("click", closePreflight);
function renderCrafts() {
  const box = $("pf-crafts");
  box.innerHTML = "";
  const icons = { jet: "✈️", chopper: "🚁", jetpack: "🎒", fighter: "🛩️" };
  for (const c of CRAFTS) {
    const fly = isFlyable(c.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "craft" + (settings.craft === c.id ? " on" : "") + (fly ? "" : " locked");
    b.innerHTML = `<span class="cdisc">${fly ? icons[c.id] : "🔒"}</span>${c.name}<small>${fly ? "Ready" : unlockLabel(c)}</small>`;
    b.disabled = !fly;
    b.addEventListener("click", () => { settings.craft = c.id; saveSettings(); renderCrafts(); });
    box.appendChild(b);
  }
  if (!isFlyable(settings.craft)) { settings.craft = "jet"; saveSettings(); }
}
function preflightPos() {
  const P = prog();
  return pf.mode === "continue" ? P.pos : pf.mode === "new" ? freshPosition() : pf.sel;
}
function renderPreflight() {
  const P = prog();
  for (const [id, m] of [["pf-continue", "continue"], ["pf-new", "new"], ["pf-select", "select"], ["pf-vibe", "vibe"]]) $(id).classList.toggle("on", pf.mode === m);
  $("pf-continue").textContent = P.finished ? "Ending" : (slotIndex(P.pos) === 0 ? "Start" : "Continue");
  const pos = preflightPos();
  const L = buildLevel(pos, overrides());
  $("pf-line").textContent = formatPosition(pos) + (pf.mode === "vibe" ? " · Vibe" : "");
  $("pf-sub").textContent = pf.mode === "continue" && P.finished ? "You finished all 10 series! Tap a time to see the ending." : `${overallLine(pos)} · ${L.title} · ${L.place.name} · ${THEME_LABEL[L.theme]}`;
  const showSel = pf.mode === "select" || pf.mode === "vibe";
  $("pf-levelsel").classList.toggle("hidden", !showSel);
  if (showSel) renderLevelSelect();
  document.querySelectorAll("#len-pick .silver-chip").forEach((b) => b.classList.toggle("last", +b.dataset.len === settings.minutes));
}
$("pf-continue").addEventListener("click", () => { pf.mode = "continue"; renderPreflight(); });
$("pf-new").addEventListener("click", () => { pf.mode = "new"; renderPreflight(); });
$("pf-select").addEventListener("click", () => { pf.mode = "select"; pf.sel = { ...prog().pos }; renderPreflight(); });
$("pf-vibe").addEventListener("click", () => { pf.mode = "vibe"; renderPreflight(); });
function renderLevelSelect() {
  const max = pf.mode === "vibe" ? { series: TOTAL_SERIES, book: BOOKS_PER_SERIES, chapter: CHAPTERS_PER_BOOK, level: LEVELS_PER_CHAPTER } : prog().max;
  const fields = [["series", "Series", TOTAL_SERIES], ["book", "Book", BOOKS_PER_SERIES], ["chapter", "Chapter", CHAPTERS_PER_BOOK], ["level", "Level", LEVELS_PER_CHAPTER]];
  const box = $("pf-levelsel");
  box.innerHTML = "";
  for (const [k, label, lim] of fields) {
    const d = document.createElement("div");
    d.className = "stepper";
    d.innerHTML = `${label}<span class="sv"><button type="button" aria-label="${label} down">−</button><b>${pf.sel[k]}</b><button type="button" aria-label="${label} up">+</button></span>`;
    const [dn, up] = d.querySelectorAll("button");
    const step = (delta) => {
      const n = { ...pf.sel };
      n[k] = Math.max(1, Math.min(lim, n[k] + delta));
      if (cmpPos(n, max) > 0) return; // only levels already reached (vibe mode: all 10,000)
      pf.sel = n; renderPreflight();
    };
    dn.addEventListener("click", () => step(-1));
    up.addEventListener("click", () => step(1));
    box.appendChild(d);
  }
}
document.querySelectorAll("#len-pick .silver-chip").forEach((b) => b.addEventListener("click", async () => {
  settings.minutes = +b.dataset.len; saveSettings();
  audio.click();
  const P = prog();
  if (pf.mode === "continue" && P.finished) { closePreflight(); showEnding(); return; }
  await maybeRequestGyro();
  let pos, mode;
  if (pf.mode === "continue") { pos = P.pos; mode = "progress"; }
  else if (pf.mode === "new") { pos = freshPosition(); mode = "progress"; saveProgress(pos, { finished: false, max: P.max }); pf.mode = "continue"; }
  else if (pf.mode === "vibe") { pos = { ...pf.sel }; mode = "vibe"; }
  else { pos = { ...pf.sel }; mode = cmpPos(pf.sel, P.pos) === 0 ? "progress" : "replay"; }
  await zoomIntoJet();
  closePreflight();
  launch(pos, mode);
}));
const fader = document.createElement("div");
fader.className = "fade-black";
document.body.appendChild(fader);
function zoomIntoJet() {
  return new Promise((res) => {
    const t = $("screen-title"), j = $("o-jet").getBoundingClientRect();
    t.style.setProperty("--zs", String((2.4 * Math.max(innerWidth, innerHeight)) / Math.max(40, j.width)));
    t.classList.remove("intro");
    t.classList.add("zooming");
    setTimeout(() => fader.classList.add("on"), 250);
    setTimeout(() => { res(); setTimeout(() => { t.classList.remove("zooming"); fader.classList.remove("on"); }, 120); }, 600);
  });
}
async function maybeRequestGyro() {
  if (controls.gyroOn() || !("DeviceOrientationEvent" in window)) return;
  await controls.requestGyro(); // iOS permission prompt (must be inside the tap)
  syncTilt();
}
function overrides() { return { place: settings.place, time: settings.time, weather: settings.weather }; }

// ---------- mission ----------
async function launch(pos, mode) {
  state = "loading";
  document.body.classList.remove("on-title");
  for (const id of ["screen-title", "screen-end", "results"]) $(id).classList.add("hidden");
  $("screen-loading").classList.remove("hidden");
  try { if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
  const level = buildLevel(pos, overrides());
  current = { pos, level, mode };
  audio.preload(trackFor(level.time, level.weather));
  audio.preloadVoice?.();
  try {
    await game.load(level, { quality: settings.quality, color: settings.color, minutes: settings.minutes });
  } catch (e) {
    console.error(e);
    $("loading-text").textContent = "Could not load the map. Check the internet and try again.";
    setTimeout(() => backToTitle(), 2500);
    return;
  }
  $("screen-loading").classList.add("hidden");
  $("hud").classList.remove("hidden");
  $("attr-play").classList.remove("hidden");
  document.body.classList.add("playing");
  for (const w of ["gun", "rocket", "bomb"]) $("wpn-" + w).classList.toggle("hidden", !level.weapons.includes(w));
  $("hud-pos").textContent = formatPosition(pos) + (mode === "vibe" ? " · Vibe" : mode === "replay" ? " · Replay" : "");
  $("btn-view").classList.toggle("hidden", !!level.lockView);
  updateViewBtn(game.view());
  hud.resize();
  audio.playTrack(trackFor(level.time, level.weather));
  state = "playing";
  game.start();
  hud.toast(level.title, true);
  setTimeout(() => hud.toast(level.tip), 900);
  const lh = $("look-hint");
  lh.classList.remove("fade");
  lh.classList.toggle("hidden", !(level.training || slotIndex(pos) < 15));
  setTimeout(() => lh.classList.add("fade"), 6000);
  if (!controls.gyroActive() && "ontouchstart" in window) setTimeout(() => hud.toast("Tip: turn on tilt in ⚙ settings"), 3500);
}
function updateViewBtn(m) {
  $("view-label").textContent = m === "cockpit" ? "Outside" : "Cockpit";
  $("view-ico").textContent = m === "cockpit" ? "🛩️" : "👁";
}
$("btn-view").addEventListener("click", () => { game.setView(game.view() === "cockpit" ? "chase" : "cockpit"); audio.click(); });

function onMissionEnd(r) {
  state = "results";
  audio.stopEngine();
  const ok = r.reason === "complete" || r.stars >= 2;
  if (r.reason === "complete") audio.win(); else audio.lose();
  const P = prog();
  let next = null, finishedGame = false;
  if (current.mode === "progress" && ok) {
    const n = nextPosition(current.pos);
    if (n.finished) { finishedGame = true; saveProgress(current.pos, { finished: true, max: current.pos }); }
    else {
      next = n;
      const max = cmpPos(n, P.max) > 0 ? n : P.max;
      saveProgress(n, { max, finished: P.finished });
      const fresh = updateUnlocks(max);
      if (fresh.length) setTimeout(() => hud.toast("New craft unlocked: " + fresh.join(", ")), 400);
    }
  } else if ((current.mode === "replay" || current.mode === "vibe") && ok) {
    const n = nextPosition(current.pos);
    if (!n.finished && (current.mode === "vibe" || cmpPos(n, P.max) <= 0)) next = n;
  }
  const key = formatPosition(current.pos);
  const best = { ...prog().best };
  const isBest = current.mode !== "vibe" && r.score > (best[key] || 0);
  if (isBest) { best[key] = r.score; saveProgress(prog().pos, { best }); }

  const titles = { complete: "Level complete!", time: ok ? "Time's up – nice flying!" : "Time's up!", down: "Your jet needs repairs!" };
  $("res-title").textContent = titles[r.reason] || "Mission over";
  $("res-stars").innerHTML = [0, 1, 2].map((i) => `<span class="s ${i < r.stars ? "on" : ""}">★</span>`).join("");
  $("res-sub").textContent = `${settings.name ? settings.name + " · " : ""}${formatPosition(current.pos)} · ${current.level.place.name}`;
  const rows = [];
  for (const o of current.level.objectives) rows.push([o.kind === "view" || o.kind === "orbit" ? o.label : `${o.label.split(" ")[0]} ${LABEL[o.kind]}`, `${Math.min(o.need, r.progress[o.kind] || 0)}/${o.need}`]);
  for (const kind of ["jet", "tank", "ship", "sam", "drone", "balloon", "target"]) if (r.stats.kills[kind] && !current.level.objectives.some((o) => o.kind === kind)) rows.push([LABEL[kind], r.stats.kills[kind]]);
  if (r.stats.loops) rows.push(["Loops", r.stats.loops]);
  if (r.stats.crashes) rows.push(["Crashes", r.stats.crashes]);
  if (r.stats.shots) rows.push(["Gun accuracy", Math.round((Math.min(r.stats.hits, r.stats.shots) / r.stats.shots) * 100) + "%"]);
  rows.push(["Time flown", `${Math.floor(r.elapsed / 60)}:${String(Math.floor(r.elapsed % 60)).padStart(2, "0")}`]);
  $("res-list").innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join("") + `<li class="total"><span>Score${isBest ? " · new best!" : ""}</span><b>${r.score}</b></li>`;
  const again = $("res-again");
  if (finishedGame) { again.textContent = "The end ›"; again.onclick = () => { $("results").classList.add("hidden"); teardown(); showEnding(); }; }
  else if (next) { again.textContent = "Next level ›"; again.onclick = () => { $("results").classList.add("hidden"); teardown(); launch(next, current.mode === "replay" && cmpPos(next, prog().pos) === 0 ? "progress" : current.mode); }; }
  else { again.textContent = "Try again"; again.onclick = () => { $("results").classList.add("hidden"); teardown(); launch(current.pos, current.mode); }; }
  setTimeout(() => { $("results").classList.add("fadein"); $("results").classList.remove("hidden"); }, 700);
}
$("res-menu").addEventListener("click", () => { $("results").classList.add("hidden"); backToTitle(); });

function teardown() {
  game.quit();
  $("hud").classList.add("hidden"); $("crash").classList.add("hidden");
  $("attr-play").classList.add("hidden");
  document.body.classList.remove("playing");
  hud.clear();
}
function backToTitle() {
  teardown();
  state = "title";
  for (const id of ["screen-loading", "screen-end"]) $(id).classList.add("hidden");
  $("screen-title").classList.remove("hidden");
  $("screen-title").classList.add("fadein");
  document.body.classList.add("on-title");
  $("set-quit").classList.add("hidden");
  audio.playTrack("menu");
}
function showEnding() {
  state = "end";
  document.body.classList.remove("on-title");
  $("screen-title").classList.add("hidden");
  $("screen-end").classList.remove("hidden");
  $("end-name").textContent = settings.name ? `Well done, ${settings.name}!` : "Well done, pilot!";
  audio.playTrack("menu"); audio.win();
}
$("end-menu").addEventListener("click", () => backToTitle());
$("end-vibe").addEventListener("click", () => { backToTitle(); pf.mode = "vibe"; openPreflight(); });

// ---------- settings ----------
function chips(boxId, items, get, set) {
  const box = $(boxId);
  box.innerHTML = "";
  for (const [val, label, swatch] of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (swatch ? " swatch" : "") + (get() === val ? " on" : "");
    if (swatch) { b.style.background = swatch; b.setAttribute("aria-label", label); b.title = label; } else b.textContent = label;
    b.addEventListener("click", () => { set(val); saveSettings(); chips(boxId, items, get, set); if (!$("preflight").classList.contains("hidden")) renderPreflight(); });
    box.appendChild(b);
  }
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
function buildSettings() {
  $("set-name").value = settings.name;
  chips("chips-len", [[3, "3 min"], [5, "5 min"], [7, "7 min"]], () => settings.minutes, (v) => { settings.minutes = v; });
  chips("chips-place", [["auto", "Story"], ["random", "Random"], ...PLACES.map((p) => [p.id, p.name])], () => settings.place, (v) => { settings.place = v; });
  chips("chips-time", [["auto", "Story"], ["random", "Random"], ...TIMES.map((t) => [t, cap(t)])], () => settings.time, (v) => { settings.time = v; });
  chips("chips-weather", [["auto", "Story"], ["random", "Random"], ...WEATHERS.map((w) => [w, cap(w)])], () => settings.weather, (v) => { settings.weather = v; });
  chips("chips-color", Object.entries(JET_COLORS).map(([k, c]) => [k, c.name, "#" + c.body.toString(16).padStart(6, "0")]), () => settings.color, (v) => { settings.color = v; menuJet.setColor(v); });
  document.querySelectorAll("[data-q]").forEach((b) => b.classList.toggle("on", b.dataset.q === settings.quality));
  $("set-invert").classList.toggle("on", controls.cfg.invert);
  $("set-haptics").classList.toggle("on", haptics.enabled());
  $("set-sens").value = controls.cfg.sens;
  syncAudioButtons(); syncTilt(); syncDials();
  const P = prog();
  $("set-pos").textContent = current && state === "paused" ? `${formatPosition(current.pos)} · paused` : `${formatPosition(P.pos)} · ${overallLine(P.pos)}`;
}
function syncTilt() {
  const b = $("set-tilt");
  b.textContent = controls.gyroActive() ? "On ✓" : controls.gyroOn() ? "Waiting…" : "Enable";
  b.classList.toggle("ok", controls.gyroOn());
}
function openSettings() {
  audio.click();
  if (state === "playing") { state = "paused"; game.pause(); $("set-quit").classList.remove("hidden"); }
  buildSettings();
  $("settings").classList.remove("fadein"); void $("settings").offsetWidth; $("settings").classList.add("fadein");
  $("settings").classList.remove("hidden");
}
function closeSettings() {
  settings.name = $("set-name").value.trim().slice(0, 16);
  saveSettings();
  $("settings").classList.add("hidden");
  if (state === "paused") { state = "playing"; game.resume(); }
}
$("set-close").addEventListener("click", closeSettings);
$("set-quit").addEventListener("click", () => { $("settings").classList.add("hidden"); backToTitle(); });
$("set-name").addEventListener("change", () => { settings.name = $("set-name").value.trim().slice(0, 16); saveSettings(); });
$("set-name").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") e.target.blur(); });
$("set-music").addEventListener("click", () => { audio.setMusic(!audio.musicOn()); syncAudioButtons(); });
$("set-sfx").addEventListener("click", () => { audio.setSfx(!audio.sfxOn()); syncAudioButtons(); });
$("set-haptics").addEventListener("click", () => { haptics.setOn(!haptics.enabled()); settings.haptics = haptics.enabled(); saveSettings(); buildSettings(); haptics.pulse(); });
document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { settings.quality = b.dataset.q; saveSettings(); applyQuality(); buildSettings(); }));
$("set-invert").addEventListener("click", () => { controls.setInvert(!controls.cfg.invert); buildSettings(); });
$("set-sens").addEventListener("input", (e) => controls.setSens(+e.target.value));
$("set-tilt").addEventListener("click", async () => { await controls.requestGyro(); syncTilt(); setTimeout(syncTilt, 700); });
$("set-cal").addEventListener("click", () => { controls.calibrate(); $("set-cal").textContent = "Calibrated ✓"; setTimeout(() => { $("set-cal").textContent = "Hold phone, tap"; }, 1500); });

// ---------- resize / visibility ----------
function onResize() { renderer.setSize(innerWidth, innerHeight, false); hud.resize(); menuJet.resize(); }
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") openSettings(); });

// ---------- loop (adaptive resolution) ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, slowT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tickStyle(now / 1000);
  if (state === "playing") {
    game.update(dt);
    game.render();
    hud.draw(game.hudState(), dt);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 38 && pixelRatio > 1) { if (++slowT >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false); slowT = 0; } }
      else slowT = 0;
    }
  } else if (state === "paused" || state === "results") {
    game.render();
  } else if (state === "title" && $("settings").classList.contains("hidden")) {
    menuJet.render();
  }
}
requestAnimationFrame(frame);

// test hook for the headless verification script
window.__ubu = { game, controls, audio, state: () => state, launch, settings, prog, setSurreal };
