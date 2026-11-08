// Jet - app shell. One opening screen, then straight into play. No settings, no options.
import * as THREE from "three";
import { createGame } from "./game.js?v=38";
import { createHud } from "./hud.js?v=38";
import { createControls } from "./controls.js?v=38";
import { runLabel, PLANETS, JET_TYPES, saveScene, loadScene, titleRun, TITLE_ART, TITLE_JETS } from "./variety.js?v=38";
import { createAudio, trackFor } from "./audio.js?v=38";
import { createHaptics } from "./haptics.js?v=38";
import { createRain2D } from "./rain2d.js?v=38";
import { createLoading } from "./loading.js?v=38";
import { logo3dHTML, initLogo3d } from "./logo3d.js?v=38";
import { setSurreal, tickStyle } from "./surreal.js?v=38";
import { LANGS, getLang, langInfo, setLang, initLang, applyDom, watchDom, tr } from "./i18n.js?v=38";
import { LEVELS, BIOMES, buildLevel, levelCount, loadLevelNo, saveLevelNo } from "./levels.js?v=38";

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
const BUILD = 27;
{ const t = $("build-tag"); if (t) t.textContent = "JET-X b" + BUILD; }
function hardReload(b) {
  const k = "jet-reload-" + b;
  try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* ignore */ }
  location.replace(location.pathname + "?b=" + b + "&t=" + Date.now());
}
function setVer(n) { if (!n) return; window.__ver = n; document.querySelectorAll("[data-ver]").forEach((e) => { e.textContent = "v" + n; }); }
setVer(BUILD);
fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((v) => setVer(v.build)).catch(() => {});
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
// b25: phones render at <=1.5x (sharp, but ~45% fewer pixels than 2x) and the adaptive check below still steps down if fps dips
const IS_TOUCH = matchMedia("(pointer: coarse)").matches;
window.__touchDev = IS_TOUCH;
let pixelRatio = Math.min(IS_TOUCH ? 1.3 : 2, window.devicePixelRatio || 1);   // b32: steadier frame rate on phones
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
const audio = createAudio();
const controls = createControls();
controls.mountStick($("stick"));
controls.bindWeapons($("weapons"));
controls.bindAux($("aux"));
controls.bindLookSurface(canvas); // head-look: swipe the bare screen = turn the view only
const haptics = createHaptics();
const hud = createHud();
document.querySelectorAll("[data-logo3d]").forEach((el) => { el.outerHTML = logo3dHTML(el.dataset.logo3d); });
initLogo3d();
const loading = createLoading($("loading"));
let lastProg = 0, lastText = "";
const flashEl = (id) => { const f = $(id); f.style.transition = "none"; f.style.opacity = "1"; void f.offsetWidth; f.style.transition = "opacity .45s ease-out"; f.style.opacity = "0"; };
window.__jet = { controls };
const game = createGame({
  renderer, audio, controls, haptics,
  events: {
    toast: (m, k) => hud.toast(m, k),
    onHurt: () => hud.hurtFlash(),
    onEnd: (r) => onLevelEnd(r),
    onBoom: (k) => { const f = $("boom-flash"); f.style.transition = "none"; f.style.opacity = String(Math.min(0.75, k)); void f.offsetWidth; f.style.transition = "opacity .4s ease-out"; f.style.opacity = "0"; },
    onCrash: () => {},
    onFade: (on) => { const f = $("fadeblack"); if (f) f.classList.toggle("on", !!on); },
    onEjectChute: (lv) => hud.toast(lv > 0 ? `PILOT SAFE  -  ${lv} ${lv === 1 ? "LIFE" : "LIVES"} LEFT` : "PILOT SAFE  -  NO LIVES LEFT", lv > 0 ? "good" : "bad"),
    onRespawn: () => { $("crash").classList.add("hidden"); hud.toast("BACK IN THE AIR", "good"); },
    onEmpty: (kind) => { const b = document.querySelector(kind === "bomb" ? ".w-bomb" : ".w-msl"); if (b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); } },
    onHit: (kill) => { const h = $("hitmark"); if (!h) return; h.classList.toggle("kill", !!kill); h.classList.remove("on"); void h.offsetWidth; h.classList.add("on"); },
    onPop: (pts, combo, kind) => {
      if (pts >= 0) { const sp = $("splash"); if (sp) { sp.textContent = "SPLASH " + game.killCount(); sp.classList.remove("on"); void sp.offsetWidth; sp.classList.add("on"); } }
      const box = $("popups"); if (!box) return;
      const d = document.createElement("div"); d.className = "pop" + (pts < 0 ? " bad" : combo >= 3 ? " big" : "") + (combo >= 2 && pts >= 0 ? " streak" : "");
      const SK = ["", "", "DOUBLE KILL", "TRIPLE KILL", "QUAD KILL", "RAMPAGE", "RAMPAGE", "UNSTOPPABLE", "UNSTOPPABLE", "UNSTOPPABLE", "GODLIKE"];
      d.innerHTML = pts < 0 ? `<b>-${-pts}</b><i>FRIENDLY HIT</i>` : `<b>+${pts}</b>${combo >= 2 ? `<i>${SK[Math.min(combo, 10)]} - COMBO x${combo}</i>` : ""}`;
      box.appendChild(d); setTimeout(() => d.remove(), 1300); while (box.children.length > 4) box.firstChild.remove();
    },
    onLoading: (t, p) => { if (typeof p === "number") lastProg = p; if (t) lastText = t; loading.set(p, t); },
  },
});

let preloadReady = false;
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
document.addEventListener("touchmove", (e) => { if (e.target.closest?.(".hs-wrap, #lang-list, #panel-body, .toggles")) return; e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());
// every button: pressed animation + click sound + haptic tick
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest?.("button");
  if (!b || b.disabled) return;
  if (!b.classList.contains("wbtn")) { audio.click(); }
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
$("btn-tilt").addEventListener("click", async () => {
  if (controls.tiltOn()) { controls.setTilt(false); syncTilt(); return; }
  // turning TILT on is the only place the iOS motion-permission prompt may appear (it is a direct tap, so iOS allows it)
  const ok = await controls.requestGyro();
  controls.setTilt(ok); controls.calibrate(); syncTilt();
});
syncTilt();
function syncInvert() { $("btn-invert").classList.toggle("off", !controls.invertOn()); }
$("btn-invert").addEventListener("click", () => { controls.setInvert(!controls.invertOn()); syncInvert(); });
syncInvert();
const lookBtn = document.createElement("button"); lookBtn.id = "btn-look-invert"; lookBtn.type = "button"; lookBtn.className = "tgl"; lookBtn.innerHTML = "↕<span>LOOK</span>"; lookBtn.setAttribute("aria-label", "Invert vertical look");
$("btn-invert").after(lookBtn);
const syncLook = () => lookBtn.classList.toggle("off", !controls.invertLookOn());
lookBtn.addEventListener("click", () => { controls.setInvertLook(!controls.invertLookOn()); syncLook(); }); syncLook();
// settings gear (top right): open on the opening screen, collapsed in play, tap the gear to open / close
{
  const st = $("settings"); let tm = 0;
  const setOpen = (v) => { st.classList.toggle("open", v); clearTimeout(tm); if (v && document.body.classList.contains("in-game")) tm = setTimeout(() => st.classList.remove("open"), 6000); };
  // b28: iOS sometimes swallows the synthetic click over the 3D canvas -> act on touchend/pointerup directly (deduped)
  let lastT = 0; const gearTap = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); const n = performance.now(); if (n - lastT < 350) return; lastT = n; setOpen(!st.classList.contains("open")); };
  const gb = $("btn-settings"); gb.addEventListener("touchend", gearTap, { passive: false }); gb.addEventListener("click", gearTap);
  gb.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
  $("btn-lang2")?.addEventListener("click", (e) => { e.stopPropagation(); setOpen(false); window.__langOpen?.(true, true); });
  for (const id of ["btn-music", "btn-sfx", "btn-tilt", "btn-invert", "btn-assist"]) $(id).addEventListener("click", () => setOpen(true));
  window.__settingsOpen = setOpen;
}

// ---------- mission time choice (opening screen): 3 / 5 / 10 minutes / Endless, remembered ----------
const timeSec = 180; // Build 24: every level is 3:00
let carryLives = 5;
let carryScore = 0;   // score carried from level to level within one run

// ---------- opening screen: 3 buttons ----------
// EASY TO RELABEL / REWIRE: each entry is { label, sub (optional small text), primary, run }.
// Button 1 is PLAY. Buttons 2 and 3 are PLACEHOLDERS (final function pending): change label/run here.
const HOW_HTML = `<p><b>Tilt</b> your phone like a wheel: top edge toward you = nose up, top edge away = nose down. Tilt sideways to bank and turn.</p><p>Or drag the <b>stick</b> (bottom right): pull it down (toward you) to climb, push it up to dive, like a real jet. Prefer the other way? Use the INVERT toggle in settings. Both work at once.</p><p><b>Weapons</b> are bottom left: hold GUN, tap MISSILE or BOMB. Racks of 10 reload over time; the gun cools down after it overheats.</p><p><b>Swipe</b> anywhere else to look around. It only turns your view, never the plane. Green forces are your friends.</p>`;
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
  { id: "cont", label: "CONTINUE", sub: "", run: () => { const sv = readSave(); if (sv) play(sv); } },
  { id: "new", label: "NEW", sub: "NEW SORTIE", primary: true, run: () => { clearSave(); play(); } },
];
const SEC_LINKS = [
  { label: "HOW TO", run: () => showPanel("How to", HOW_HTML + `<p style="text-align:center;margin-top:14px"><a class="t26-cont" style="display:inline-block;text-decoration:none" href="howto/" target="_blank" rel="noopener"><span>OPEN FULL HOW-TO GUIDE</span></a></p>`) },    // PLACEHOLDER (function pending)
  { label: "LEVELS", run: () => showPanel("Levels", levelsHtml()) },        // PLACEHOLDER (function pending)
];
function levelsHtml() {
  const d = LEVELS[Math.min(levelNo, LEVELS.length) - 1];
  const dots = LEVELS.map((_, i) => `<div class="dot ${i + 1 < levelNo ? "done" : i + 1 === levelNo ? "now" : ""}">${i + 1}</div>`).join("");
  return `<div>Level <b>${levelNo}</b>: ${d.title}<br><small>${BIOMES[d.biome]}</small></div><div class="dots">${dots}</div>`;
}
function buildMenu() {
  const box = $("menu-buttons"); box.innerHTML = "";
  const sv = readSave();
  for (const b of MENU_BUTTONS) {
    const el = document.createElement("button");
    const off = b.id === "cont" && !sv;
    if (off || b.id === "new") continue;   // b26: TAP TO FLY starts a new sortie; CONT only shows when there is a save
    el.type = "button"; el.className = "plate" + (b.primary ? " go" : "") + (off ? " off" : ""); el.disabled = off;
    if (b.id === "cont") { el.className = "t26-cont"; el.innerHTML = `<span>${b.label}</span>`; }   // b31: same style as the TAP TO FLY plate
    else el.innerHTML = `<i class="led"></i><span class="pt">${b.label}</span><em class="ps">${off ? "NO SAVE" : b.sub}</em>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); b.run(); });
    box.appendChild(el);
  }
  const sl = $("sec-links"); sl.innerHTML = "";
  for (const b of SEC_LINKS) { const el = document.createElement("button"); el.type = "button"; el.className = "slink"; el.textContent = b.label; el.addEventListener("click", (e) => { e.stopPropagation(); b.run(); }); sl.appendChild(el); }
}
function showPanel(title, html) { $("panel-title").textContent = title; $("panel-body").innerHTML = html; $("panel").classList.remove("hidden"); document.body.classList.add("panel-open"); }
$("panel-close").addEventListener("click", () => { $("panel").classList.add("hidden"); document.body.classList.remove("panel-open"); });

// ---------- b26: language picker ----------
initLang();
{
  const btn = $("lang-btn"), list = $("lang-list"), cur = $("lang-cur");
  const render = () => {
    cur.textContent = langInfo()[1]; const l2 = document.querySelector("#btn-lang2 span"); if (l2) l2.textContent = langInfo()[1];
    list.innerHTML = "";
    for (const [code, name, flag] of LANGS) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.code = code; b.setAttribute("role", "option"); b.className = code === getLang() ? "on" : "";
      b.innerHTML = `<span class="fl">${flag}</span><span class="nm"></span>`; b.querySelector(".nm").textContent = name; b.dir = "auto";
      list.appendChild(b);
    }
  };
  const open = (v, fromSettings) => { list.classList.toggle("float", !!(v && fromSettings)); if (v && fromSettings) document.body.appendChild(list); else if (list.parentNode !== btn.parentNode) btn.parentNode.appendChild(list); list.classList.toggle("hidden", !v); btn.setAttribute("aria-expanded", v ? "true" : "false"); if (v) { const on = list.querySelector(".on"); if (on) list.scrollTop = Math.max(0, on.offsetTop - 60); } };
  btn.addEventListener("click", (e) => { e.stopPropagation(); window.__langTapGuard?.(); open(list.classList.contains("hidden")); });
  list.addEventListener("click", (e) => {
    e.stopPropagation(); window.__langTapGuard?.();
    const b = e.target.closest("button[data-code]"); if (!b) return;
    setLang(b.dataset.code); render(); open(false); audio.click?.();
  });
  document.addEventListener("pointerdown", (e) => { if (!list.classList.contains("hidden") && !e.target.closest("#lang-list, #lang-btn, #btn-lang2")) { open(false); window.__langTapGuard?.(); } }, true);
  render();
  window.__langRender = render; window.__langOpen = open;
}
buildMenu(); applyDom(); watchDom();
game.attachWeaponCam($("wcam-c"));
window.__jet.game = game; window.__jet.audio = audio;

// ---------- start / levels ----------
async function launch(n, fromTap, sv) {
  if (state === "loading") return;
  state = "loading";
  levelNo = n; saveLevelNo(n);
  document.body.classList.remove("tp-a", "tp-b", "tp-c", "preview", "rolling"); previewOn = false; game.titleOff();
  $("results").classList.add("hidden"); $("pause").classList.add("hidden"); $("resume").classList.add("hidden"); $("crash").classList.add("hidden");
  liveLoad = !!(!sv && preload && preload.n === n && preloadReady);
  let p = !sv && preload && preload.n === n ? preload : null;
  if (!p) { game.quit(); p = startPreload(n, sv ? { ...sv.run, planet: PLANETS[sv.run.planetKey] } : undefined); } // every launch rolls a new random world
  loading.show(`Level ${n} - ${runLabel(p.level.run)}`);
  $("loading").classList.toggle("live", liveLoad);
  if (!sv) saveScene(p.level.run);
  loading.set(lastProg, lastText);
  const ok = await p.promise;
  preload = null;
  if (!ok) { loading.set(1, "Could not load the map. Check your connection and tap PLAY again."); state = "title"; document.body.classList.add("tp-c"); setTimeout(() => loading.hide(), 2200); preload = null; return; }
  const L = game.level();
  $("hud-level").textContent = `LEVEL ${n}`;
  const nightOn = L.time === "night";
  document.body.classList.toggle("nv-on", nightOn);
  $("hud-world").textContent = runLabel(L.run);
  document.body.classList.remove("on-title"); document.body.classList.add("in-game");
  $("screen-title").classList.add("hidden");
  audio.playTrack("techno", { seed: L.run?.seed });
  controls.calibrate(); controls.resetLook(); controls.setEnabled(true);
  try { const sv0 = localStorage.getItem("jet-view"); if ((sv0 === "cockpit" || sv0 === "chase") && sv0 !== game.view() && !L.lockView) game.setView(sv0); } catch { /* ignore */ }
  window.__applyThrottle?.(parseFloat(document.getElementById('thr').style.getPropertyValue('--t')) || 0.35);
  game.setTime(0);   // b26: no time limit - the run ends when the lives are gone
  game.setScore(sv ? sv.score : carryScore);
  game.dbg.setLives(carryLives);
  if (sv?.snap) { try { game.restoreSnap(sv.snap); } catch { /* ignore */ } }
  window.__settingsOpen?.(false);
  game.start(); try { controls.calibrate(); } catch { /* ignore */ }   // b35: tilt neutral = how the phone is held at launch
  { const b = $("lvl-banner"), lv = game.level?.() || {}, ob = (lv.objectives || []).map((o) => o.label).filter(Boolean)[0] || "Destroy the enemy";   // b34: clear level goal
    $("lvl-b1").textContent = `LEVEL ${n}`; $("lvl-b2").textContent = ob.toUpperCase() + ((n % 5 === 0) ? " · BOSS!" : "");
    b.classList.remove("hidden", "go"); void b.offsetWidth; b.classList.add("go"); clearTimeout(window.__lvlB); window.__lvlB = setTimeout(() => b.classList.add("hidden"), 4200); }
  { const lt = $("lvl-title"); lt.querySelector("b").textContent = `LEVEL ${n}`; lt.querySelector("em").textContent = (game.level().title || "").replace(/^\d+\.\s*/, "").toUpperCase(); lt.classList.remove("show"); void lt.offsetWidth; lt.classList.add("show"); }
  state = "playing";
  liveLoad = false; $("loading").classList.remove("live");
  loading.hide();
}
function play(sv) {
  // single first tap: unlock audio, ask for motion permission (iOS), calibrate neutral, start.
  audio.unlock();
  controls.startTiltIfAllowed();   // never asks for motion permission here: only the TILT toggle does
  if (!sv) { carryScore = 0; carryLives = 5; }
  launch(sv ? sv.n : levelNo, true, sv);
}

function onLevelEnd(r) {
  state = "results";
  audio.stopEngine(); controls.setEnabled(false);
  clearSave();
  const n = levelNo;
  const won = r.reason === "complete";   // survived the 3 minutes
  $("res-title").textContent = won ? `WIN LEVEL ${n}` : "GAME OVER";
  $("res-stars").textContent = won ? "★".repeat(r.stars) + "☆".repeat(3 - r.stars) : "";
  $("res-sub").textContent = won ? `Score ${r.score} · next: level ${n + 1}` : `Score ${r.score} · reached level ${n}`;
  const k = r.stats.kills || {};
  const rows = Object.entries(k).map(([a, c]) => `${c} ${a === "jet" ? "planes" : a === "base" ? "base buildings" : a + "s"}`);
  $("res-list").textContent = rows.length ? rows.join(" · ") : "";
  let next;
  if (won) { audio.win(); next = n + 1; saveLevelNo(next); carryScore = r.score; carryLives = game.dbg.lives(); }
  else { audio.lose(); carryLives = 5; next = 1; saveLevelNo(1); carryScore = 0; }
  $("res-btn-label").textContent = won ? "NEXT LEVEL" : "NEW GAME";
  $("res-btn").onclick = () => launch(next);
  setTimeout(() => { if (state === "results" && !preload) startPreload(next); }, 1800);
  // b34 arcade flow: level complete auto-advances; game over offers instant CONTINUE on the same level
  clearInterval(window.__resCd); const cdEl = $("res-count"), b2 = $("res-btn2"); b2.hidden = true; cdEl.textContent = "";
  $("results").classList.toggle("won", won); $("results").classList.toggle("lost", !won);
  if (won) { $("results").classList.remove("hidden"); let c = 6; cdEl.textContent = `Next level in ${c}`; window.__resCd = setInterval(() => { if (state !== "results") return clearInterval(window.__resCd); if (--c <= 0) { clearInterval(window.__resCd); launch(next); } else cdEl.textContent = `Next level in ${c}`; }, 1000); return; }
  if (!won) {
    $("results").classList.remove("hidden"); $("res-title").textContent = "SHOT DOWN";
    $("res-btn-label").textContent = `CONTINUE ▶ LEVEL ${n}`; carryLives = 5; carryScore = 0;
    $("res-btn").onclick = () => { clearInterval(window.__resCd); saveLevelNo(n); launch(n); };
    b2.hidden = false; $("res-btn2-label").textContent = "SAVE SCORE";
    b2.onclick = () => { clearInterval(window.__resCd); $("results").classList.add("hidden"); showHighScores(r.score, () => { $("results").classList.remove("hidden"); $("res-btn-label").textContent = "NEW GAME"; $("res-btn").onclick = () => launch(1); b2.hidden = true; }); };
    let c = 9; cdEl.textContent = `Continue? ${c}`; window.__resCd = setInterval(() => { if (state !== "results") return clearInterval(window.__resCd); if (--c <= 0) { clearInterval(window.__resCd); cdEl.textContent = ""; } else cdEl.textContent = `Continue? ${c}`; }, 1000);
    return;
  }
  {
    $("results").classList.remove("hidden"); $("res-btn-label").textContent = "ENTER HIGH SCORE";
    $("res-btn").onclick = () => { $("results").classList.add("hidden"); showHighScores(r.score, () => { $("results").classList.remove("hidden"); $("res-btn-label").textContent = "NEW GAME"; $("res-btn").onclick = () => launch(1); }, n); };
  }
}

// ---------- arcade high scores: top 10, 5-letter name entry, saved in localStorage (jet-scores-v1) ----------
const SCORE_KEY = "jet-scores-v1";
function loadScores() { try { const v = JSON.parse(localStorage.getItem(SCORE_KEY)); if (v && Array.isArray(v.list)) return v; } catch { /* ignore */ } return { list: [], last: "ACE" }; }
// Build 15: endless leaderboard (every score kept). Entry is prefilled with the last name; CLEAR NAME wipes it; OK saves,
// then the list scrolls to your rank and highlights it. TOP jumps to #1, HOME returns to the starting page.
function showHighScores(score, done, lv = 1) {
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
    $("hs-list").innerHTML = data.list.map((e, i) => `<li class="${e === mine ? "me" : ""}${i < 3 ? " top" + (i + 1) : ""}"><span>${i + 1}</span><em>${esc(e.n.trim() || "-----")}</em><i>L${e.lv || 1}</i><b>${fmt(e.s)}</b><u>${dstr(e.d)}</u></li>`).join("");
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
    mine = { n: name, s: score, d: Date.now(), lv };
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
let liveLoad = false, previewOn = false, saveT = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, slowT = 0;
const hudCv = document.getElementById("hud-canvas");
const rainCv = $("rain-canopy"), rain2d = createRain2D(rainCv); let lastKc = 0, inCloudS = false;
// b23: one-time hint the first time each control is used
const HINTS = { stick: "Drag the stick: a small push = gentle turn, a full push = hard turn", gun: "Hold GUN to shoot. Let go to stop", missile: "MISSILE: tap to fire at the locked target", bomb: "BOMB: drops on the orange TGT marker. Fly over the target", tgt: "TGT arrows pick the next ground target. You can also tap a target" };
let hintsSeen = {}; try { hintsSeen = JSON.parse(localStorage.getItem("jet-hints") || "{}") || {}; } catch { /* ignore */ }
let hintTO = 0;
window.addEventListener("jet-ctl", (e) => {
  const k = e.detail; if (state !== "playing" || !HINTS[k] || hintsSeen[k]) return;
  hintsSeen[k] = 1; try { localStorage.setItem("jet-hints", JSON.stringify(hintsSeen)); } catch { /* ignore */ }
  const h = $("hint"); if (!h) return; h.textContent = HINTS[k]; h.classList.add("on"); clearTimeout(hintTO); hintTO = setTimeout(() => h.classList.remove("on"), 3200);
});
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tickStyle(now / 1000);
  if (state !== "playing" && rainCv.style.opacity !== "0") rainCv.style.opacity = "0";
  { const hv = (state === "playing" || state === "paused" || state === "results") ? "" : "hidden"; if (hudCv.style.visibility !== hv) { hudCv.style.visibility = hv; if (hv) hud.clear?.(); } }   // no gameplay markers on the menu / loading screens
  if (state === "playing") {
    game.update(dt);
    game.render();
    if ((saveT += dt) > 4) { saveT = 0; writeSave(); }
    { const vb = $("btn-view"), vv = game.view(); if (vb.dataset.view !== vv) vb.dataset.view = vv; }
    { const hs = game.hudState(); hud.draw(hs, dt);
      const wx = game.weather(), spd = hs.player ? hs.player.speed : 150;
      rain2d.update(dt, wx === "rain" || wx === "storm" ? 1 : 0, game.view(), spd);
      const kc = game.killCount(); if (kc !== lastKc) { lastKc = kc; const k = $("hud-kl"); if (k) k.textContent = String(kc); }
      const ci = game.cloudIn(); if (ci > 0.35 && !inCloudS) { inCloudS = true; try { audio.whoosh(); } catch { /* ignore */ } } else if (ci < 0.12) inCloudS = false; }
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 46 && pixelRatio > 1) { if (++slowT >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false); slowT = 0; } }
      else slowT = 0;
    }
  } else if (state === "title" && previewOn) {
    // Designed title art stays static; save mobile GPU and battery.
    // game.titleFrame(dt);
  } else if (state === "loading" && liveLoad) {
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
  let sceneHist = [], sceneIdx = -1;
  const forced = /[?&](time|planet|place|weather|season)=/.test(location.search);
  const p0 = startPreload(levelNo, forced ? undefined : titleRun("f35"));
  p0.promise.then((ok) => { preloadReady = ok; });
  const t0 = performance.now();
  function setArtFor(jet) { const A = TITLE_ART[jet] || TITLE_ART.viper, s = document.documentElement.style, u = `url("${new URL("img/art/" + A.img, location.href).href}")`; s.setProperty("--title-p", u, "important"); s.setProperty("--title-l", `url("${new URL("img/art/" + A.img.replace(".jpg", "_l.jpg"), location.href).href}")`, "important"); }   // b33/b35
  setArtFor("f35"); setTimeout(() => { for (const k of TITLE_JETS) { const im = new Image(); im.src = "img/art/" + TITLE_ART[k].img.replace(".jpg", innerWidth > innerHeight ? "_l.jpg" : ".jpg"); } }, 2500);
  $("scene-label")?.addEventListener("click", (e) => { e.stopPropagation(); reroll(1); });
  const setLabel = () => { const r = preload?.level?.run; if (r) setArtFor(r.jet); const jn = JET_TYPES[r?.jet]?.name || "", j0 = jn.split(" ")[0]; $("scene-label").textContent = r ? `${r.place?.name || runLabel(r)} · ${/\d/.test(j0) ? j0 : jn}`.toUpperCase() : "";   /* b36: scene + jet only */ };
  // dir 0 / 1: a new random scene; -1: step back to the previous scene; swiping left/right on the menu calls this
  async function reroll(dir = 0) {
    if (state !== "title" || body.classList.contains("rolling")) return;
    let run0;
    if (dir < 0) { if (sceneIdx <= 0) return; sceneIdx--; run0 = sceneHist[sceneIdx]; }
    else if (sceneIdx < sceneHist.length - 1) { sceneIdx++; run0 = sceneHist[sceneIdx]; }
    body.classList.add("rolling"); previewOn = false; preloadReady = false;
    game.quit(); const cj = preload?.level?.run?.jet, nj = TITLE_JETS[(TITLE_JETS.indexOf(cj) + 1) % TITLE_JETS.length]; const p = startPreload(levelNo, run0 || titleRun(nj));   // b33: each tap = next jet + its scene + its art
    const ok0 = await Promise.all([p.promise, new Promise((r) => setTimeout(r, 700))]);
    if (state !== "title") return;
    preloadReady = !!ok0[0];
    if (!run0) { sceneHist = sceneHist.slice(0, sceneIdx + 1); sceneHist.push(p.level.run); sceneIdx = sceneHist.length - 1; }
    saveScene(p.level.run);
    setLabel(); body.classList.remove("rolling"); previewOn = true;
  }
  // Art variants follow scene changes; never reveal the rejected live/plain menu.
  let art = window.__titleArt ?? 0;   // b30: ONE art per session, chosen in <head> before first paint

  $("tap-fly").addEventListener("click", (e) => { e.stopPropagation(); if (preloadReady && state === "title") { clearSave(); play(); } });
  $("btn-reroll").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("btn-reroll").addEventListener("click", (e) => { e.stopPropagation(); reroll(1); });
  // swipe left = next scene, swipe right = previous scene (title menu only, never starting a swipe on a button)
  { let sw = null; const T = $("screen-title");
    T.addEventListener("pointerdown", (e) => { sw = body.classList.contains("tp-c") && !e.target.closest("button") ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
    T.addEventListener("pointerup", (e) => { if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; const ok = Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - sw.t < 900; sw = null; if (ok) reroll(dx < 0 ? 1 : -1); }); }
  window.__ubuReroll = reroll;
  p0.promise.then(async (ok) => {
    const wait = Math.max(0, 1400 - (performance.now() - t0)); // let the logo breathe
    await new Promise((r) => setTimeout(r, wait));
    if (state !== "title") return;
    try { $("hud-timer").textContent = timeSec ? `${Math.floor(timeSec / 60)}:00` : "0:00"; } catch { /* ignore */ }
    setLabel(); previewOn = ok; body.classList.toggle("preview", !!ok);
    if (ok) { sceneHist = [preload.level.run]; sceneIdx = 0; saveScene(preload.level.run); }
    body.classList.remove("tp-a"); body.classList.add("tp-b");
  });
  // b26: TAP TO FLY (or a tap anywhere that is not a control) starts the sortie directly
  let tapGuard = 0;
  $("screen-title").addEventListener("click", (e) => {
    if (state !== "title" || !(body.classList.contains("tp-b") || body.classList.contains("tp-c"))) return;
    if (e.target.closest("button, #settings, #lang-btn, #lang-list, .slink, .plate, #panel, .menu-buttons, .sec-links")) return;
    if (performance.now() < tapGuard) return;
    clearSave(); play();
  });
  window.__langTapGuard = () => { tapGuard = performance.now() + 350; };
}

// test hook for the headless verification scripts
setInterval(() => { if (state === "playing" && !document.hidden) writeSave(); }, 4000);
window.addEventListener("jet-tap", (e) => { try { const d = e.detail; if (!(d && typeof d.x === "number" && game.tapSelect(d.x, d.y))) game.lockNearest(); } catch { /* ignore */ } });
window.addEventListener("keydown", (e) => { if (e.code === "KeyT" && !e.repeat) { try { game.lockNearest(); } catch { /* ignore */ } } });
$("btn-eject")?.addEventListener("click", () => game.eject());
// b30: yellow/black seat handles - hold 0.8 s to eject (any time in the air)
{ const h = $("eject-handles"); let tm = 0; const go = (e) => { e.preventDefault(); e.stopPropagation(); h.classList.add("pull"); clearTimeout(tm); tm = setTimeout(() => { h.classList.remove("pull"); game.ejectNow?.(); }, 350); };   // b32: quick pull (0.35 s)
  const stop = () => { clearTimeout(tm); h.classList.remove("pull"); };
  h?.addEventListener("touchstart", go, { passive: false, capture: true }); h?.addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch") go(e); }); for (const n of ["touchend", "touchcancel", "mouseup", "mouseleave"]) h?.addEventListener(n, stop); }
$("btn-takeoff")?.addEventListener("click", () => { controls.calibrate(); game.takeoff(); });   // b31: tilt neutral = how you hold the phone at takeoff
$("btn-autoland")?.addEventListener("click", () => game.autoLand());
window.addEventListener("keydown", (e) => { if (e.code === "Enter" && !e.repeat) game.takeoff(); if (e.code === "KeyL" && !e.repeat) game.autoLand(); });
window.__ubu = { goBackground, readSave, writeSave, game, controls, audio, hud, loading, state: () => state, play, launch, levelNo: () => levelNo };
// b32: version on title (V 1.<build>)
fetch("version.json?t=" + Date.now()).then(r => r.json()).then(j => { const e = document.getElementById("t32-ver"); if (e && j && j.build) e.textContent = "V 1." + j.build; }).catch(() => {});
// b32: SCENERY button = new scene + new jet; localized label
{ const L = { en:"SCENE & JET", he:"נוף ומטוס", es:"ESCENA Y AVIÓN", fr:"DÉCOR ET AVION", de:"SZENE & JET", ar:"المشهد والطائرة", ru:"СЦЕНА И САМОЛЁТ", pt:"CENÁRIO E AVIÃO", it:"SCENA E JET" };
  const up = () => { const e = document.getElementById("reroll-lbl"); if (e) e.textContent = L[(document.documentElement.lang || "en").slice(0, 2)] || L.en; };
  up(); new MutationObserver(up).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] }); }
// b33: hold LOOK BACK to glance behind (gentle bandit-behind cue lights it up)
{ const b = document.getElementById("btn-six"); if (b) { const on = (e) => { e.preventDefault(); e.stopPropagation(); controls.lookBack = true; }, off = () => { controls.lookBack = false; };
  b.addEventListener("pointerdown", on); b.addEventListener("touchstart", on, { passive: false }); b.addEventListener("pointerdown", (e) => { try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ } }); for (const ev of ["pointerup", "pointercancel", "touchend", "touchcancel"]) b.addEventListener(ev, off); } }

// b34: WebGL context lost (iOS memory) -> clear message + one-tap reload instead of a black screen
renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); const d = document.createElement("div"); d.style.cssText = "position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:#070c12;color:#ffd36a;font:800 20px system-ui;text-align:center"; d.textContent = "Graphics reset - tap to continue"; d.onclick = () => location.reload(); document.body.appendChild(d); });
// b35: title layout - caption + SCENE & JET live in a row directly above TAP TO FLY (flow layout, never overlaps)
(function titleRow() {
  const lab = document.getElementById("scene-label"), rr = document.getElementById("btn-reroll"), tap = document.getElementById("tap-fly");
  if (!lab || !rr || !tap) return;
  const row = document.createElement("div"); row.className = "t35-row"; const top = document.querySelector(".t26-top"); (top || tap.parentElement).append(row); row.append(lab, rr);   /* b36: caption row under the logo */
  document.body.appendChild(tap); { const al = document.getElementById("btn-autoland"), fd = document.getElementById("fuel-dial"); if (al && fd) fd.parentNode.insertBefore(al, fd); }   /* b37: AUTO LAND left of fuel */ { const by = document.querySelector(".t26-by"), vv = document.getElementById("t32-ver"); if (by) document.body.appendChild(by); if (vv) document.body.appendChild(vv); row.prepend(rr); } /* b36: tap-fly out of transformed parent */
})();
// b35: iOS forgets motion permission each session - re-ask on the first tap if TILT was left on
addEventListener("click", () => { let pref = false; try { pref = localStorage.getItem("jet-tilt-v2") === "1"; } catch { /* ignore */ }
  if (pref && controls.needsPermission() && !controls.tiltOn()) controls.requestGyro().then((ok) => { controls.setTilt(ok); controls.calibrate(); try { syncTilt(); } catch { /* ignore */ } }); }, { once: true, capture: true });
