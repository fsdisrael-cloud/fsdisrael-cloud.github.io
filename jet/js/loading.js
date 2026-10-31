// Loading screen component. SEPARATE and easy to restyle:
//   - markup is built here (change the template below),
//   - styling lives in css/loading.css,
//   - the game only calls loading.show(), loading.set(progress 0..1, text) and loading.hide().
// Galoo's final loading graphics can replace the template/CSS without touching the game.
const TIPS = [
  "Tilt the top of your phone up to climb, down to dive.",
  "Your guns fire by themselves when an enemy is in front.",
  "Tap the screen for a missile. Red button = missile, yellow = bomb.",
  "Destroy every target, then land on the carrier.",
  "Boost your speed to outrun enemy missiles.",
];
export function createLoading(root) {
  root.innerHTML = `
    <div class="ld-bg" aria-hidden="true"><i class="ld-aurora"></i><i class="ld-aurora ld-b"></i></div>
    <div class="ld-center">
      <div class="ld-logo"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 41 30 60 46 60 51 38 45 35 58 32 60 29 58 26 45 4 51 4 46 23 30Z"/></svg><span>Jet</span></div>
      <div class="ld-level" data-ld="level"></div>
      <div class="ld-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i data-ld="fill"></i></div>
      <div class="ld-text" data-ld="text">Loading</div>
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
