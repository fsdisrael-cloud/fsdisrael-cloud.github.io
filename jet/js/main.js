// Jet - app shell. One opening screen, then straight into play. No settings, no options.
import * as THREE from "three";
import { createGame } from "./game.js?v=7";
import { createHud } from "./hud.js?v=7";
import { createControls } from "./controls.js?v=7";
import { createAudio, trackFor } from "./audio.js?v=7";
import { createHaptics } from "./haptics.js?v=7";
import { createLoading } from "./loading.js?v=7";
import { setSurreal, tickStyle } from "./surreal.js?v=7";
import { LEVELS, BIOMES, buildLevel, levelCount, loadLevelNo, saveLevelNo } from "./levels.js?v=7";

const $ = (id) => document.getElementById(id);

// ---------- build / version check ----------
const BUILD = 7;
{ const t = $("build-tag"); if (t) t.textContent = "Jet b" + BUILD; }
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
controls.bindTapMissile(canvas);
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
    onLoading: (t, p) => { if (typeof p === "number") lastProg = p; if (t) lastText = t; loading.set(p, t); },
  },
});

let state = "title"; // title | loading | playing | paused | results
let levelNo = loadLevelNo();
let preload = null; // { n, promise }

function startPreload(n) {
  lastProg = 0; lastText = "Loading…";
  const level = buildLevel(n);
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
  if (!b.classList.contains("stick-btn")) { audio.click(); haptics.tick(); }
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

// ---------- opening screen: 3 buttons ----------
// EASY TO RELABEL / REWIRE: each entry is { label, sub (optional small text), primary, run }.
// Button 1 is PLAY. Buttons 2 and 3 are PLACEHOLDERS (final function pending): change label/run here.
const HOW_HTML = `<p><b>Tilt</b> your phone like a wheel: top edge up = nose up, top edge down = nose down. Tilt sideways to bank and turn.</p><p>Or drag the <b>stick</b> (bottom right). Both work at once.</p><p>Guns fire <b>by themselves</b> on a target. Tap the screen or the red button for a missile, yellow for a bomb.</p>`;
const MENU_BUTTONS = [
  { label: "PLAY", sub: () => `Level ${levelNo}`, primary: true, run: () => play() },
  { label: "LEVELS", sub: () => `${levelNo}/${levelCount()}`, run: () => showPanel("Levels", levelsHtml()) },   // PLACEHOLDER (function pending)
  { label: "HOW TO FLY", run: () => showPanel("How to fly", HOW_HTML) },                                         // PLACEHOLDER (function pending)
];
function levelsHtml() {
  const d = LEVELS[levelNo - 1];
  const dots = LEVELS.map((_, i) => `<div class="dot ${i + 1 < levelNo ? "done" : i + 1 === levelNo ? "now" : ""}">${i + 1}</div>`).join("");
  return `<div>Level <b>${levelNo}</b> of ${levelCount()}: ${d.title}<br><small>${BIOMES[d.biome]}</small></div><div class="dots">${dots}</div>`;
}
function buildMenu() {
  const box = $("menu-buttons"); box.innerHTML = "";
  for (const b of MENU_BUTTONS) {
    const el = document.createElement("button");
    el.type = "button"; el.className = "metal-btn" + (b.primary ? " go" : "");
    el.innerHTML = `<i class="led"></i><span>${b.label}</span>${b.sub ? `<em class="sub">${b.sub()}</em>` : ""}`;
    el.addEventListener("click", () => b.run());
    box.appendChild(el);
  }
}
function showPanel(title, html) { $("panel-title").textContent = title; $("panel-body").innerHTML = html; $("panel").classList.remove("hidden"); }
$("panel-close").addEventListener("click", () => $("panel").classList.add("hidden"));
buildMenu();

// ---------- start / levels ----------
async function launch(n, fromTap) {
  if (state === "loading") return;
  state = "loading";
  levelNo = n; saveLevelNo(n);
  $("results").classList.add("hidden"); $("pause").classList.add("hidden"); $("crash").classList.add("hidden");
  loading.show(`Level ${n} - ${LEVELS[n - 1].title}`);
  loading.set(lastProg, lastText);
  let p = preload && preload.n === n ? preload : null;
  if (!p) { game.quit(); p = startPreload(n); }
  const ok = await p.promise;
  preload = null;
  if (!ok) { loading.set(1, "Could not load the map. Check your connection and tap PLAY again."); state = "title"; setTimeout(() => loading.hide(), 2200); preload = null; return; }
  const L = game.level();
  $("hud-level").textContent = `Level ${n}/${levelCount()}`;
  document.body.classList.remove("on-title"); document.body.classList.add("in-game");
  $("screen-title").classList.add("hidden");
  audio.playTrack(trackFor(L.time, L.weather));
  controls.calibrate(); controls.setEnabled(true);
  game.start();
  state = "playing";
  loading.hide();
}
function play() {
  // single first tap: unlock audio, ask for motion permission (iOS), calibrate neutral, start.
  audio.unlock();
  controls.requestGyro().then(() => controls.calibrate());
  haptics.pulse();
  launch(levelNo, true);
}

function onLevelEnd(r) {
  state = "results";
  audio.stopEngine(); controls.setEnabled(false);
  const n = levelNo, last = n >= levelCount();
  const won = r.reason === "complete";
  $("res-title").textContent = won ? (last ? "YOU WIN!" : `LEVEL ${n} CLEAR`) : "TIME UP";
  $("res-stars").textContent = won ? "★".repeat(r.stars) + "☆".repeat(3 - r.stars) : "";
  $("res-sub").textContent = `Score ${r.score}`;
  const k = r.stats.kills || {};
  const rows = Object.entries(k).map(([a, c]) => `${c} ${a === "jet" ? "planes" : a === "base" ? "base buildings" : a + "s"}`);
  $("res-list").textContent = rows.length ? rows.join(" · ") : "";
  if (won) { audio.win(); saveLevelNo(last ? 1 : n + 1); } else { audio.lose(); }
  const next = won ? (last ? 1 : n + 1) : n;
  $("res-btn-label").textContent = won ? (last ? "PLAY AGAIN" : "NEXT LEVEL") : "RETRY";
  $("res-btn").onclick = () => launch(next);
  $("results").classList.remove("hidden");
}

// ---------- camera view toggle (under the radar) ----------
$("btn-view").addEventListener("pointerdown", (e) => { e.stopPropagation(); controls.requestView(); });

// ---------- pause when the tab is hidden ----------
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") { state = "paused"; game.pause(); $("pause").classList.remove("hidden"); } });
$("pause-btn").addEventListener("click", () => { $("pause").classList.add("hidden"); state = "playing"; game.resume(); controls.calibrate(); });

// ---------- resize ----------
function onResize() { renderer.setSize(innerWidth, innerHeight, false); hud.resize(); }
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", () => setTimeout(onResize, 250));

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
      if (fps < 40 && pixelRatio > 1) { if (++slowT >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false); slowT = 0; } }
      else slowT = 0;
    }
  } else if (state === "paused" || state === "results") {
    game.render();
  }
}
requestAnimationFrame(frame);

// start loading the first level right away so PLAY is instant
startPreload(levelNo);

// test hook for the headless verification scripts
window.__ubu = { game, controls, audio, hud, loading, state: () => state, play, launch, levelNo: () => levelNo };
