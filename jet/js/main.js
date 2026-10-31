// Jet - app shell. One opening screen, then straight into play. No settings, no options.
import * as THREE from "three";
import { createGame } from "./game.js?v=12";
import { createHud } from "./hud.js?v=12";
import { createControls } from "./controls.js?v=12";
import { runLabel, PLANETS, JET_TYPES } from "./variety.js?v=12";
import { createAudio, trackFor } from "./audio.js?v=12";
import { createHaptics } from "./haptics.js?v=12";
import { createLoading } from "./loading.js?v=12";
import { setSurreal, tickStyle } from "./surreal.js?v=12";
import { LEVELS, BIOMES, buildLevel, levelCount, loadLevelNo, saveLevelNo } from "./levels.js?v=12";

const $ = (id) => document.getElementById(id);

// ---------- build / version check ----------
const BUILD = 12;
{ const t = $("build-tag"); if (t) t.textContent = "JET-X b" + BUILD; }
function hardReload(b) {
  const k = "jet-reload-" + b;
  try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* ignore */ }
  location.replace(location.pathname + "?b=" + b + "&t=" + Date.now());
}
async function checkVersion() {
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    const v = await r.json();
    const pageBuild = +(document.querySelector('meta[name="ubu-build"]')?.content || 0);
    const newest = Math.max(v.build || 0, BUILD);
    if (newest > BUILD || pageBuild < newest) { if (state === "playing" || state === "paused" || state === "loading") return; hardReload(newest); }
  } catch { /* offline: ignore */ }
}
setTimeout(checkVersion, 1500);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });

setSurreal(false); // fixed illustrated-realistic look (the psychedelic signature lives in sky/clouds/trails/explosions)

// ---------- core ----------
const canvas = $("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
let pixelRatio = Math.min(2, window.devicePixelRatio || 1);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
const audio = createAudio();
const controls = createControls();
controls.mountStick($("stick"));
controls.bindWeapons($("weapons"));
controls.bindLookSurface(canvas); // head-look: swipe the bare screen = turn the view only
const haptics = createHaptics();
const hud = createHud();
const loading = createLoading($("loading"));
let lastProg = 0, lastText = "";
const flashEl = (id) => { const f = $(id); f.style.transition = "none"; f.style.opacity = "1"; void f.offsetWidth; f.style.transition = "opacity .45s ease-out"; f.style.opacity = "0"; };
const game = createGame({
  renderer, audio, controls, haptics,
  events: {
    toast: (m) => hud.toast(m),
    onHurt: () => hud.hurtFlash(),
    onEnd: (r) => onLevelEnd(r),
    onBoom: (k) => { const f = $("boom-flash"); f.style.transition = "none"; f.style.opacity = String(Math.min(0.75, k)); void f.offsetWidth; f.style.transition = "opacity .4s ease-out"; f.style.opacity = "0"; },
    onCrash: () => $("crash").classList.remove("hidden"),
    onRespawn: () => { $("crash").classList.add("hidden"); hud.toast("Back in the sky!"); },
    onEmpty: (kind) => { const b = document.querySelector(kind === "bomb" ? ".w-bomb" : ".w-msl"); if (b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); } },
    onPop: (pts, combo, kind) => {
      const box = $("popups"); if (!box) return;
      const d = document.createElement("div"); d.className = "pop" + (combo >= 3 ? " big" : "");
      d.innerHTML = `<b>+${pts}</b>${combo >= 2 ? `<i>COMBO x${combo}</i>` : ""}`;
      box.appendChild(d); setTimeout(() => d.remove(), 1300); while (box.children.length > 4) box.firstChild.remove();
    },
    onLoading: (t, p) => { if (typeof p === "number") lastProg = p; if (t) lastText = t; loading.set(p, t); },
  },
});

let state = "title"; // title | loading | playing | paused | results
let levelNo = loadLevelNo();
let preload = null; // { n, promise }

function startPreload(n, run0) {
  lastProg = 0; lastText = "Loading…";
  const level = buildLevel(n, run0);
  preload = { n, level, promise: game.load(level, { seconds: level.seconds }).then(() => true).catch((e) => { console.error(e); return false; }) };
  return preload;
}

// ---------- audio / input unlock ----------
const unlock = () => { audio.unlock(); };
for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, { capture: true });
audio.playTrack("menu");
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());
// every button: pressed animation + click sound + haptic tick
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest?.("button");
  if (!b || b.disabled) return;
  if (!b.classList.contains("wbtn")) { audio.click(); haptics.tick(); }
  if (b.classList.contains("metal-btn")) { b.classList.add("pressed"); setTimeout(() => b.classList.remove("pressed"), 140); }
}, { capture: true });

// ---------- Music / Effects toggles (always available) ----------
function syncAudioButtons() {
  $("btn-music").classList.toggle("off", !audio.musicOn());
  $("btn-sfx").classList.toggle("off", !audio.sfxOn());
}
$("btn-music").addEventListener("click", () => { audio.setMusic(!audio.musicOn()); syncAudioButtons(); });
$("btn-sfx").addEventListener("click", () => { audio.setSfx(!audio.sfxOn()); syncAudioButtons(); if (audio.sfxOn()) audio.click(); });
syncAudioButtons();
// settings gear (top right): open on the opening screen, collapsed in play, tap the gear to open / close
{
  const st = $("settings"); let tm = 0;
  const setOpen = (v) => { st.classList.toggle("open", v); clearTimeout(tm); if (v && document.body.classList.contains("in-game")) tm = setTimeout(() => st.classList.remove("open"), 6000); };
  $("btn-settings").addEventListener("click", () => setOpen(!st.classList.contains("open")));
  for (const id of ["btn-music", "btn-sfx"]) $(id).addEventListener("click", () => setOpen(true));
  window.__settingsOpen = setOpen;
}

// ---------- mission time choice (opening screen): 3 / 5 / 10 minutes / Endless, remembered ----------
const TIME_CHOICES = [{ label: "3 min", sec: 180 }, { label: "5 min", sec: 300 }, { label: "10 min", sec: 600 }, { label: "Endless", sec: 0 }];
function loadTime() { try { const v = localStorage.getItem("jet-time"); if (v !== null && TIME_CHOICES.some((c) => String(c.sec) === v)) return +v; } catch { /* ignore */ } return 300; }
let timeSec = loadTime();
function buildTimePick() {
  const seg = $("time-seg"); seg.innerHTML = "";
  for (const c of TIME_CHOICES) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = c.label; b.className = c.sec === timeSec ? "on" : ""; b.setAttribute("aria-pressed", String(c.sec === timeSec));
    b.addEventListener("click", () => { timeSec = c.sec; try { localStorage.setItem("jet-time", String(c.sec)); } catch { /* ignore */ } buildTimePick(); });
    seg.appendChild(b);
  }
}
buildTimePick();

// ---------- opening screen: 3 buttons ----------
// EASY TO RELABEL / REWIRE: each entry is { label, sub (optional small text), primary, run }.
// Button 1 is PLAY. Buttons 2 and 3 are PLACEHOLDERS (final function pending): change label/run here.
const HOW_HTML = `<p><b>Tilt</b> your phone like a wheel: top edge up = nose up, top edge down = nose down. Tilt sideways to bank and turn.</p><p>Or drag the <b>stick</b> (bottom right). Both work at once.</p><p><b>Weapons</b> are bottom left: hold GUN, tap MISSILE or BOMB. Racks of 10 reload over time; the gun cools down after it overheats.</p><p><b>Swipe</b> anywhere else to look around. It only turns your view, never the plane. Green forces are your friends.</p>`;
// Opening flow: logo + live scene while terrain loads -> HUD powers on -> tap anywhere -> CONT / NEW plates.
// CONT resumes the autosave (jet-save-v1); it is disabled when there is no save. LEVELS / HOW TO FLY are small placeholder links.
const SAVE_KEY = "jet-save-v1";
function readSave() { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); return v && v.v === 1 && v.run && PLANETS[v.run.planetKey] ? v : null; } catch { return null; } }
function writeSave() {
  if (state !== "playing") return;
  try {
    const L = game.level(), hs = game.hudState(); if (!L?.run) return;
    const { planet, ...run } = L.run;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, n: levelNo, run, score: hs.score | 0, timeLeft: Math.max(5, Math.round(hs.timeLeft || 0)), endless: timeSec === 0, t: Date.now() }));
  } catch { /* ignore */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
const MENU_BUTTONS = [
  { id: "cont", label: "CONT", sub: "RESUME SORTIE", run: () => { const sv = readSave(); if (sv) play(sv); } },
  { id: "new", label: "NEW", sub: "NEW SORTIE", primary: true, run: () => { clearSave(); play(); } },
];
const SEC_LINKS = [
  { label: "LEVELS", run: () => showPanel("Levels", levelsHtml()) },        // PLACEHOLDER (function pending)
  { label: "HOW TO FLY", run: () => showPanel("How to fly", HOW_HTML) },    // PLACEHOLDER (function pending)
];
function levelsHtml() {
  const d = LEVELS[levelNo - 1];
  const dots = LEVELS.map((_, i) => `<div class="dot ${i + 1 < levelNo ? "done" : i + 1 === levelNo ? "now" : ""}">${i + 1}</div>`).join("");
  return `<div>Level <b>${levelNo}</b> of ${levelCount()}: ${d.title}<br><small>${BIOMES[d.biome]}</small></div><div class="dots">${dots}</div>`;
}
function buildMenu() {
  const box = $("menu-buttons"); box.innerHTML = "";
  const sv = readSave();
  for (const b of MENU_BUTTONS) {
    const el = document.createElement("button");
    const off = b.id === "cont" && !sv;
    el.type = "button"; el.className = "plate" + (b.primary ? " go" : "") + (off ? " off" : ""); el.disabled = off;
    el.innerHTML = `<i class="led"></i><span class="pt">${b.label}</span><em class="ps">${off ? "NO SAVE" : b.sub}</em>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); b.run(); });
    box.appendChild(el);
  }
  const sl = $("sec-links"); sl.innerHTML = "";
  for (const b of SEC_LINKS) { const el = document.createElement("button"); el.type = "button"; el.className = "slink"; el.textContent = b.label; el.addEventListener("click", (e) => { e.stopPropagation(); b.run(); }); sl.appendChild(el); }
}
function showPanel(title, html) { $("panel-title").textContent = title; $("panel-body").innerHTML = html; $("panel").classList.remove("hidden"); }
$("panel-close").addEventListener("click", () => $("panel").classList.add("hidden"));
buildMenu();
game.attachWeaponCam($("wcam-c"));

// ---------- start / levels ----------
async function launch(n, fromTap, sv) {
  if (state === "loading") return;
  state = "loading";
  levelNo = n; saveLevelNo(n);
  document.body.classList.remove("tp-a", "tp-b", "tp-c", "preview", "rolling"); previewOn = false;
  $("results").classList.add("hidden"); $("pause").classList.add("hidden"); $("resume").classList.add("hidden"); $("crash").classList.add("hidden");
  let p = !sv && preload && preload.n === n ? preload : null;
  if (!p) { game.quit(); p = startPreload(n, sv ? { ...sv.run, planet: PLANETS[sv.run.planetKey] } : undefined); } // every launch rolls a new random world
  loading.show(`Level ${n} - ${runLabel(p.level.run)}`);
  loading.set(lastProg, lastText);
  const ok = await p.promise;
  preload = null;
  if (!ok) { loading.set(1, "Could not load the map. Check your connection and tap PLAY again."); state = "title"; document.body.classList.add("tp-c"); setTimeout(() => loading.hide(), 2200); preload = null; return; }
  const L = game.level();
  $("hud-level").textContent = `Level ${n}/${levelCount()}`;
  const nightOn = L.time === "night";
  document.body.classList.toggle("nv-on", nightOn);
  $("hud-world").textContent = runLabel(L.run);
  document.body.classList.remove("on-title"); document.body.classList.add("in-game");
  $("screen-title").classList.add("hidden");
  audio.playTrack("techno", { seed: L.run?.seed, alien: L.run?.planetKey !== "earth" });
  controls.calibrate(); controls.resetLook(); controls.setEnabled(true);
  window.__applyThrottle?.(parseFloat(document.getElementById('thr').style.getPropertyValue('--t')) || 0.35);
  game.setTime(sv ? (sv.endless ? 0 : sv.timeLeft) : timeSec);
  if (sv) game.setScore(sv.score);
  window.__settingsOpen?.(false);
  game.start();
  state = "playing";
  loading.hide();
}
function play(sv) {
  // single first tap: unlock audio, ask for motion permission (iOS), calibrate neutral, start.
  audio.unlock();
  controls.requestGyro().then(() => controls.calibrate());
  haptics.pulse();
  launch(sv ? sv.n : levelNo, true, sv);
}

function onLevelEnd(r) {
  state = "results";
  audio.stopEngine(); controls.setEnabled(false);
  clearSave();
  const n = levelNo, last = n >= levelCount();
  const won = r.reason === "complete";
  $("res-title").textContent = won ? (last ? "YOU WIN!" : `LEVEL ${n} CLEAR`) : r.reason === "down" ? "SHOT DOWN" : "TIME UP";
  $("res-stars").textContent = won ? "★".repeat(r.stars) + "☆".repeat(3 - r.stars) : "";
  $("res-sub").textContent = `Score ${r.score}`;
  const k = r.stats.kills || {};
  const rows = Object.entries(k).map(([a, c]) => `${c} ${a === "jet" ? "planes" : a === "base" ? "base buildings" : a + "s"}`);
  $("res-list").textContent = rows.length ? rows.join(" · ") : "";
  if (won) { audio.win(); saveLevelNo(last ? 1 : n + 1); } else { audio.lose(); }
  const next = won ? (last ? 1 : n + 1) : n;
  $("res-btn-label").textContent = won ? (last ? "PLAY AGAIN" : "NEXT LEVEL") : "RETRY";
  $("res-btn").onclick = () => launch(next);
  setTimeout(() => { if (state === "results" && !preload) startPreload(next); }, 1800);   // next world loads while you read the card: RETRY / NEXT start fast
  $("results").classList.remove("hidden");
}

// ---------- throttle lever (under the view toggle): drag up = faster ----------
{
  const track = $("thr-track"); let thr = 0.35;
  try { const v = parseFloat(localStorage.getItem("jet-throttle")); if (v >= 0 && v <= 1) thr = v; } catch { /* ignore */ }
  const apply = (v, save) => { thr = Math.max(0, Math.min(1, v)); game.setThrottle(thr); $("thr").style.setProperty("--t", thr.toFixed(3)); if (save) { try { localStorage.setItem("jet-throttle", thr.toFixed(2)); } catch { /* ignore */ } } };
  const fromEvent = (e) => { const r = track.getBoundingClientRect(); return 1 - (e.clientY - r.top) / r.height; };
  let drag = false;
  const thrEl = $("thr");
  thrEl.addEventListener("pointerdown", (e) => { e.stopPropagation(); drag = true; try { thrEl.setPointerCapture(e.pointerId); } catch { /* ignore */ } apply(fromEvent(e)); });
  thrEl.addEventListener("pointermove", (e) => { if (drag) { e.stopPropagation(); apply(fromEvent(e)); } });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) thrEl.addEventListener(t, () => { if (drag) { drag = false; apply(thr, true); } });
  window.addEventListener("keydown", (e) => { if (e.key === "w" || e.key === "W") apply(thr + 0.08, true); if (e.key === "q" || e.key === "Q") apply(thr - 0.08, true); });
  window.__applyThrottle = apply;
  apply(thr);
  game.onReady = () => game.setThrottle(thr);
}

// ---------- camera view toggle (under the radar) ----------
$("btn-view").addEventListener("pointerdown", (e) => { e.stopPropagation(); controls.requestView(); });

// ---------- pause when the tab is hidden ----------
function goBackground() { writeSave(); if (state === "playing") { state = "paused"; game.pause(); controls.setEnabled(false); $("resume").classList.remove("hidden"); } }
document.addEventListener("visibilitychange", () => { if (document.hidden) goBackground(); });
window.addEventListener("pagehide", goBackground);
$("rs-cont").addEventListener("click", () => { $("resume").classList.add("hidden"); state = "playing"; game.resume(); controls.setEnabled(true); controls.calibrate(); });
$("rs-new").addEventListener("click", () => { $("resume").classList.add("hidden"); clearSave(); state = "title"; play(); });
$("pause-btn").addEventListener("click", () => { $("pause").classList.add("hidden"); state = "playing"; game.resume(); controls.calibrate(); });

// ---------- resize ----------
function onResize() { renderer.setSize(innerWidth, innerHeight, false); hud.resize(); }
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", () => setTimeout(onResize, 250));

// ---------- loop (adaptive resolution) ----------
let previewOn = false, saveT = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, slowT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tickStyle(now / 1000);
  if (state === "playing") {
    game.update(dt);
    game.render();
    if ((saveT += dt) > 4) { saveT = 0; writeSave(); }
    { const vb = $("btn-view"), vv = game.view(); if (vb.dataset.view !== vv) vb.dataset.view = vv; }
    hud.draw(game.hudState(), dt);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 40 && pixelRatio > 1) { if (++slowT >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false); slowT = 0; } }
      else slowT = 0;
    }
  } else if (state === "title" && previewOn) {
    game.render();
  } else if (state === "paused" || state === "results") {
    game.render();
  }
}
requestAnimationFrame(frame);

// start loading the first level right away; the opening screen shows only the logo until it is ready
{
  const body = document.body;
  body.classList.add("tp-a");
  const p0 = startPreload(levelNo);
  const t0 = performance.now();
  const setLabel = () => { const r = preload?.level?.run; $("scene-label").textContent = r ? `${runLabel(r)}  //  ${JET_TYPES[r.jet]?.name || ""}`.toUpperCase() : ""; };
  async function reroll() {
    if (state !== "title" || body.classList.contains("rolling")) return;
    body.classList.add("rolling"); previewOn = false;
    game.quit(); const p = startPreload(levelNo);
    await Promise.all([p.promise, new Promise((r) => setTimeout(r, 700))]);
    if (state !== "title") return;
    setLabel(); body.classList.remove("rolling"); previewOn = true;
  }
  $("btn-reroll").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("btn-reroll").addEventListener("click", (e) => { e.stopPropagation(); reroll(); });
  window.__ubuReroll = reroll;
  p0.promise.then(async (ok) => {
    const wait = Math.max(0, 1400 - (performance.now() - t0)); // let the logo breathe
    await new Promise((r) => setTimeout(r, wait));
    if (state !== "title") return;
    try { $("hud-timer").textContent = timeSec ? `${Math.floor(timeSec / 60)}:00` : "0:00"; hud.draw(game.hudState(), 0); } catch { /* ignore */ }
    setLabel(); previewOn = ok; body.classList.toggle("preview", !!ok);
    body.classList.remove("tp-a"); body.classList.add("tp-b");
  });
  $("screen-title").addEventListener("pointerdown", () => {
    if (state !== "title" || !body.classList.contains("tp-b")) return;
    body.classList.remove("tp-b"); body.classList.add("tp-c"); buildMenu();
  });
}

// test hook for the headless verification scripts
window.__ubu = { goBackground, readSave, writeSave, game, controls, audio, hud, loading, state: () => state, play, launch, levelNo: () => levelNo };
