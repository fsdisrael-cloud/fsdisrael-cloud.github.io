// Jet - app shell. One opening screen, then straight into play. No settings, no options.
import * as THREE from "three";
import { createGame } from "./game.js?v=18";
import { createHud } from "./hud.js?v=18";
import { createControls } from "./controls.js?v=18";
import { runLabel, PLANETS, JET_TYPES } from "./variety.js?v=18";
import { createAudio, trackFor } from "./audio.js?v=18";
import { createHaptics } from "./haptics.js?v=18";
import { createLoading } from "./loading.js?v=18";
import { setSurreal, tickStyle } from "./surreal.js?v=18";
import { LEVELS, BIOMES, buildLevel, levelCount, loadLevelNo, saveLevelNo } from "./levels.js?v=18";

const $ = (id) => document.getElementById(id);

// ---------- build / version check ----------
// build 15: generated brushed-steel texture for the instrument plates (CSS var --brushed)
try {
  const bc = document.createElement("canvas"); bc.width = 128; bc.height = 64;
  const b = bc.getContext("2d"); let sd = 3; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { const y = rn() * 64, x = rn() * 128, l = 20 + rn() * 90; b.fillStyle = rn() < 0.5 ? `rgba(255,255,255,${0.02 + rn() * 0.07})` : `rgba(0,0,0,${0.05 + rn() * 0.12})`; b.fillRect(x, y, l, 1); b.fillRect(x - 128, y, l, 1); }
  document.documentElement.style.setProperty("--brushed", `url(${bc.toDataURL("image/png")})`);
  const wc = document.createElement("canvas"); wc.width = wc.height = 256;
  const w = wc.getContext("2d"); sd = 11;
  for (let i = 0; i < 90; i++) { const x = rn() * 256, y = rn() * 256, r = 4 + rn() * 26; const g = w.createRadialGradient(x, y, 0, x, y, r); const c = rn() < 0.45 ? "120,70,30" : "0,0,0"; g.addColorStop(0, `rgba(${c},${0.05 + rn() * 0.1})`); g.addColorStop(1, `rgba(${c},0)`); w.fillStyle = g; w.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 70; i++) { const x = rn() * 256, y = rn() * 256, a = rn() * 6.28, l = 8 + rn() * 40; w.strokeStyle = `rgba(210,215,220,${0.05 + rn() * 0.16})`; w.lineWidth = 0.6 + rn() * 0.5; w.beginPath(); w.moveTo(x, y); w.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); w.stroke(); }
  for (let i = 0; i < 500; i++) { w.fillStyle = `rgba(${rn() < 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rn() * 0.08})`; w.fillRect(rn() * 256, rn() * 256, 1 + rn() * 2, 1 + rn() * 2); }
  document.documentElement.style.setProperty("--worn", `url(${wc.toDataURL("image/png")})`);
} catch (e) { /* plain gradients if canvas is unavailable */ }
const BUILD = 18;
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
    onHit: (kill) => { const h = $("hitmark"); if (!h) return; h.classList.toggle("kill", !!kill); h.classList.remove("on"); void h.offsetWidth; h.classList.add("on"); if (kill) haptics.tick?.(); },
    onPop: (pts, combo, kind) => {
      const box = $("popups"); if (!box) return;
      const d = document.createElement("div"); d.className = "pop" + (pts < 0 ? " bad" : combo >= 3 ? " big" : "") + (combo >= 2 && pts >= 0 ? " streak" : "");
      const SK = ["", "", "DOUBLE KILL", "TRIPLE KILL", "QUAD KILL", "RAMPAGE", "RAMPAGE", "UNSTOPPABLE", "UNSTOPPABLE", "UNSTOPPABLE", "GODLIKE"];
      d.innerHTML = pts < 0 ? `<b>-${-pts}</b><i>FRIENDLY HIT</i>` : `<b>+${pts}</b>${combo >= 2 ? `<i>${SK[Math.min(combo, 10)]} - COMBO x${combo}</i>` : ""}`;
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
const unlock = () => { if (audio.isHeld() && state !== "paused") audio.release(); audio.unlock(); };
for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, { capture: true });
audio.playTrack("menu");
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { if (e.target.closest?.(".hs-wrap")) return; e.preventDefault(); }, { passive: false });
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
function syncAssist() { $("btn-assist").classList.toggle("off", !game.assistOn()); }
$("btn-assist").addEventListener("click", () => { game.setAssist(!game.assistOn()); syncAssist(); });
syncAssist();
function syncTilt() { $("btn-tilt").classList.toggle("off", !controls.tiltOn()); }
$("btn-tilt").addEventListener("click", () => { controls.setTilt(!controls.tiltOn()); syncTilt(); });
syncTilt();
// settings gear (top right): open on the opening screen, collapsed in play, tap the gear to open / close
{
  const st = $("settings"); let tm = 0;
  const setOpen = (v) => { st.classList.toggle("open", v); clearTimeout(tm); if (v && document.body.classList.contains("in-game")) tm = setTimeout(() => st.classList.remove("open"), 6000); };
  $("btn-settings").addEventListener("click", () => setOpen(!st.classList.contains("open")));
  for (const id of ["btn-music", "btn-sfx", "btn-tilt", "btn-assist"]) $(id).addEventListener("click", () => setOpen(true));
  window.__settingsOpen = setOpen;
}

// ---------- mission time choice (opening screen): 3 / 5 / 10 minutes / Endless, remembered ----------
const timeSec = 300; // Build 17: the round is always 5:00 (no picker)

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
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, n: levelNo, run, score: hs.score | 0, timeLeft: Math.max(5, Math.round(hs.timeLeft || 0)), endless: false, snap: game.snapshot(), t: Date.now() }));
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
  try { const sv0 = localStorage.getItem("jet-view"); if ((sv0 === "cockpit" || sv0 === "chase") && sv0 !== game.view() && !L.lockView) game.setView(sv0); } catch { /* ignore */ }
  window.__applyThrottle?.(parseFloat(document.getElementById('thr').style.getPropertyValue('--t')) || 0.35);
  game.setTime(sv ? sv.timeLeft : timeSec);
  if (sv) game.setScore(sv.score);
  if (sv?.snap) { try { game.restoreSnap(sv.snap); } catch { /* ignore */ } }
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
  showHighScores(r.score, () => $("results").classList.remove("hidden"));
}

// ---------- arcade high scores: top 10, 5-letter name entry, saved in localStorage (jet-scores-v1) ----------
const SCORE_KEY = "jet-scores-v1";
function loadScores() { try { const v = JSON.parse(localStorage.getItem(SCORE_KEY)); if (v && Array.isArray(v.list)) return v; } catch { /* ignore */ } return { list: [], last: "ACE" }; }
// Build 15: endless leaderboard (every score kept). Entry is prefilled with the last name; CLEAR NAME wipes it; OK saves,
// then the list scrolls to your rank and highlights it. TOP jumps to #1, HOME returns to the starting page.
function showHighScores(score, done) {
  const box = $("hs"), card = box.querySelector(".hs-card"), data = loadScores(), wrap = $("hs-wrap");
  const entering = score > 0;
  if (!entering && !data.list.length) { done(); return; }
  let mine = null;
  const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-";
  let letters = (data.last || "ACE").toUpperCase().padEnd(5, " ").slice(0, 5).split("");
  let cur = 0, finished = false;
  const esc = (t) => String(t).replace(/[<>&"]/g, "");
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dstr = (t) => { if (!t) return ""; const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`; };
  const renderList = () => {
    if (!data.list.length) { $("hs-list").innerHTML = `<li class="empty">NO RECORDS ON FILE</li>`; return; }
    $("hs-list").innerHTML = data.list.map((e, i) => `<li class="${e === mine ? "me" : ""}${i < 3 ? " top" + (i + 1) : ""}"><span>${i + 1}</span><em>${esc(e.n.trim() || "-----")}</em><b>${fmt(e.s)}</b><u>${dstr(e.d)}</u></li>`).join("");
  };
  const renderEntry = () => {
    $("hs-entry").innerHTML = letters.map((c, i) => `<div class="hs-slot${i === cur ? " on" : ""}" data-i="${i}"><button type="button" data-d="1" aria-label="up">&#9650;</button><b>${c === " " ? "&nbsp;" : c}</b><button type="button" data-d="-1" aria-label="down">&#9660;</button></div>`).join("");
  };
  const jumpTop = () => wrap.scrollTo({ top: 0, behavior: "smooth" });
  const jumpMine = (smooth) => {
    const el = $("hs-list").querySelector("li.me"); if (!el) return;
    const top = el.offsetTop - (wrap.clientHeight - el.offsetHeight) / 2;
    wrap.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  };
  const toList = () => { card.classList.remove("entry"); $("hs-new").classList.add("hidden"); $("hs-btn").classList.remove("hidden"); renderList(); wrap.scrollTop = 0; setTimeout(() => jumpMine(true), 250); };
  const commit = () => {
    if (!entering || mine) return;
    const name = letters.join("").trim().toUpperCase() || "-----";
    mine = { n: name, s: score, d: Date.now() };
    data.list.push(mine); data.list.sort((a, b) => b.s - a.s); if (data.list.length > 20000) data.list.length = 20000;
    if (name !== "-----") data.last = name;
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(data)); } catch { /* storage full or blocked: keep playing */ }
    toList();
  };
  const leave = () => { if (finished) return; finished = true; box.classList.add("hidden"); window.removeEventListener("keydown", keyH, true); };
  const finish = () => { leave(); done(); };
  const keyH = (e) => {
    if (box.classList.contains("hidden")) return;
    if (!card.classList.contains("entry")) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish(); } return; }
    const k = e.key;
    if (k === "Enter") commit();
    else if (k === "Backspace") { letters[cur] = " "; cur = Math.max(0, cur - 1); renderEntry(); }
    else if (k === "ArrowLeft") { cur = Math.max(0, cur - 1); renderEntry(); }
    else if (k === "ArrowRight") { cur = Math.min(4, cur + 1); renderEntry(); }
    else if (k === "ArrowUp" || k === "ArrowDown") { const i = CH.indexOf(letters[cur]); letters[cur] = CH[(i + (k === "ArrowUp" ? 1 : -1) + CH.length) % CH.length]; renderEntry(); }
    else if (k.length === 1 && /[a-zA-Z0-9]/.test(k)) { letters[cur] = k.toUpperCase(); cur = Math.min(4, cur + 1); renderEntry(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  $("hs-score").textContent = fmt(score);
  card.classList.toggle("entry", entering);
  $("hs-new").classList.toggle("hidden", !entering);
  $("hs-btn").classList.toggle("hidden", entering);
  if (entering) renderEntry(); else renderList();
  $("hs-entry").onclick = (e) => {
    const slot = e.target.closest(".hs-slot"); if (!slot) return;
    cur = +slot.dataset.i; const btn = e.target.closest("button");
    if (btn) { const i = CH.indexOf(letters[cur]); letters[cur] = CH[(i + +btn.dataset.d + CH.length) % CH.length]; }
    renderEntry();
  };
  $("hs-clear").onclick = () => { letters = [" ", " ", " ", " ", " "]; cur = 0; renderEntry(); };
  $("hs-ok").onclick = commit; $("hs-btn").onclick = finish; $("hs-top").onclick = jumpTop;
  $("hs-home").onclick = () => { leave(); location.href = location.pathname; };
  window.addEventListener("keydown", keyH, true);
  setTimeout(() => box.classList.remove("hidden"), 700);
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
function goBackground() { audio.hold(); writeSave(); if (state === "playing") { state = "paused"; game.pause(); controls.setEnabled(false); $("resume").classList.remove("hidden"); } }
document.addEventListener("visibilitychange", () => { if (document.hidden) goBackground(); });
window.addEventListener("pagehide", goBackground);
// CONT / NEW must always work: change game state first, audio afterwards in try/catch (iOS audio calls can throw or hang)
let _rsT = 0; const rsOnce = () => { const n = performance.now(); if (n - _rsT < 500) return false; _rsT = n; return true; };
const safe = (fn) => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) { console.warn(e); } };
function doCont(e) { e?.preventDefault?.(); if (!rsOnce()) return; $("resume").classList.add("hidden"); state = "playing"; safe(() => { game.resume(); controls.setEnabled(true); controls.calibrate(); }); safe(() => audio.release()); safe(() => audio.unlock()); safe(() => audio.startEngine()); }
function doNew(e) { e?.preventDefault?.(); if (!rsOnce()) return; $("resume").classList.add("hidden"); clearSave(); state = "title"; safe(() => audio.release()); safe(() => audio.unlock()); safe(() => play()); }
for (const [id, fn] of [["rs-cont", doCont], ["rs-new", doNew]]) { $(id).addEventListener("pointerup", fn); $(id).addEventListener("click", fn); }
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
setInterval(() => { if (state === "playing" && !document.hidden) writeSave(); }, 4000);
window.addEventListener("jet-tap", () => { try { game.lockNearest(); } catch { /* ignore */ } });
window.addEventListener("keydown", (e) => { if (e.code === "KeyT" && !e.repeat) { try { game.lockNearest(); } catch { /* ignore */ } } });
window.__ubu = { goBackground, readSave, writeSave, game, controls, audio, hud, loading, state: () => state, play, launch, levelNo: () => levelNo };
