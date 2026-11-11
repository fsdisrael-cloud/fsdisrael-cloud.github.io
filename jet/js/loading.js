// Loading screen component. SEPARATE and easy to restyle:
//   - markup is built here (change the template below),
//   - styling lives in css/loading.css,
//   - the game only calls loading.show(), loading.set(progress 0..1, text) and loading.hide().
// Galoo's final loading graphics can replace the template/CSS without touching the game.
import { logo3dHTML } from "./logo3d.js?v=46";
const TITLE = "JET-X"; // alt text; the visible wordmark is img/wordmark.png (swap that file to rebrand)
const WORDMARK = "img/logo_v6.png?v=46";
const ART = []; // chosen by orientation in css/loading.css
const TIPS = [
  "Tilt the top of your phone up to climb, down to dive.",
  "Your guns fire by themselves when an enemy is in front.",
  "Swipe the bare screen to look around. It never turns the plane.",
  "Green forces are on your side. Your weapons cannot hurt them.",
  "Destroy every target, then land on the carrier.",
  "Missile and bomb racks reload over time. Watch the gun heat.",
];
export function createLoading(root) {
  for (const u of ART) { const im = new Image(); im.src = u; } // warm the cache so the art is there when PLAY is tapped
  root.innerHTML = `
    <div class="ld-bg" aria-hidden="true"></div>
    <div class="ld-shade" aria-hidden="true"></div>
    <div class="ld-top">${logo3dHTML("ld-title")}<div class="built-by">Built by Grok</div><div class="ld-level" data-ld="level"></div></div>
    <div class="credit-b">TESSIE</div>
    <div class="ver-b" data-ver>${window.__ver ? "v" + window.__ver : ""}</div>
    <div class="ld-bottom">
      <div class="ld-text" data-ld="text">Loading</div>
      <div class="ld-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i data-ld="fill"></i></div>
      <div class="ld-tip" data-ld="tip"></div>
    </div>`;
  const q = (k) => root.querySelector(`[data-ld="${k}"]`);
  const fill = q("fill"), text = q("text"), tip = q("tip"), lvl = q("level");
  let shown = 0, target = 0, raf = 0;
  function tick() {
    shown += (target - shown) * 0.18;
    if (Math.abs(target - shown) < 0.002) shown = target;
    fill.style.width = (shown * 100).toFixed(1) + "%";
    root.querySelector(".ld-bar").setAttribute("aria-valuenow", String(Math.round(shown * 100)));
    if (!root.classList.contains("hidden") && shown !== target) raf = requestAnimationFrame(tick);
  }
  return {
    show(levelText = "") {
      lvl.textContent = levelText; shown = 0; target = 0; fill.style.width = "0%";
      tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      root.classList.remove("hidden"); root.classList.remove("ld-out");
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    },
    set(p, t) {
      if (typeof p === "number") target = Math.max(target, Math.min(1, p));
      if (t) text.textContent = t;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    },
    hide() { target = 1; root.classList.add("ld-out"); setTimeout(() => root.classList.add("hidden"), 350); },
    isVisible: () => !root.classList.contains("hidden"),
  };
}
