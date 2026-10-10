// Ubu progression: an infinite, deterministic ladder of levels.
// Based on /workspace/jet-game/js/missions.js (seeded ladder), re-tuned:
//   10 levels / chapter, 10 chapters / book, 10 books / series, 10 series = 10,000 levels.
//   The game ENDS after Series 10 · Book 10 · Chapter 10 · Level 10 (no loop).
// Each level is one mission, seeded from its position. Real places, real mission types.

export const LEVELS_PER_CHAPTER = 10;
export const CHAPTERS_PER_BOOK = 10;
export const BOOKS_PER_SERIES = 10;
export const TOTAL_SERIES = 10;
export const TOTAL_LEVELS = TOTAL_SERIES * BOOKS_PER_SERIES * CHAPTERS_PER_BOOK * LEVELS_PER_CHAPTER;
const SAVE_KEY = "ubu-progress-v1";

// Landscape changes after each book, cycling through these.
export const THEME_ORDER = ["countryside", "coast", "city", "desert", "snow"];
export const THEME_LABEL = { countryside: "Village & countryside", coast: "Beach & coast", city: "City", desert: "Desert", snow: "Snow" };

export const PLACES = [
  // countryside / villages
  { id: "normandy", theme: "countryside", name: "Normandy villages", country: "France", lat: 49.335, lon: -0.62 },
  { id: "cornwall", theme: "countryside", name: "Cornwall coast villages", country: "UK", lat: 50.15, lon: -5.08 },
  { id: "tuscany", theme: "countryside", name: "Tuscan hills", country: "Italy", lat: 43.32, lon: 11.33 },
  { id: "jezreel", theme: "countryside", name: "Jezreel Valley", country: "Israel", lat: 32.63, lon: 35.25 },
  // beach / coast
  { id: "sydney", theme: "coast", name: "Sydney Harbour", country: "Australia", lat: -33.85, lon: 151.24 },
  { id: "capetown", theme: "coast", name: "Cape Town", country: "South Africa", lat: -33.92, lon: 18.43 },
  { id: "honolulu", theme: "coast", name: "Pearl Harbor", country: "Hawaii, USA", lat: 21.34, lon: -157.96 },
  { id: "rio", theme: "coast", name: "Rio de Janeiro", country: "Brazil", lat: -22.94, lon: -43.18 },
  // city
  { id: "nyc", theme: "city", name: "New York Harbor", country: "USA", lat: 40.70, lon: -74.02 },
  { id: "telaviv", theme: "city", name: "Tel Aviv", country: "Israel", lat: 32.08, lon: 34.78 },
  { id: "sf", theme: "city", name: "San Francisco", country: "USA", lat: 37.80, lon: -122.42 },
  { id: "hongkong", theme: "city", name: "Hong Kong", country: "China", lat: 22.29, lon: 114.17 },
  { id: "dubai", theme: "city", name: "Dubai", country: "UAE", lat: 25.13, lon: 55.17 },
  // desert
  { id: "giza", theme: "desert", name: "Giza Pyramids", country: "Egypt", lat: 29.98, lon: 31.14 },
  { id: "canyon", theme: "desert", name: "Grand Canyon", country: "USA", lat: 36.10, lon: -112.11 },
  { id: "wadirum", theme: "desert", name: "Wadi Rum", country: "Jordan", lat: 29.58, lon: 35.42 },
  { id: "monument", theme: "desert", name: "Monument Valley", country: "USA", lat: 36.99, lon: -110.10 },
  // snow
  { id: "alps", theme: "snow", name: "Matterhorn", country: "Swiss Alps", lat: 45.98, lon: 7.68 },
  { id: "bergen", theme: "snow", name: "Norwegian Fjords", country: "Norway", lat: 60.39, lon: 5.25 },
  { id: "fuji", theme: "snow", name: "Mount Fuji", country: "Japan", lat: 35.36, lon: 138.73 },
  { id: "hermon", theme: "snow", name: "Mount Hermon", country: "Israel", lat: 33.40, lon: 35.83 },
];
export const placeById = (id) => PLACES.find((p) => p.id === id);

export const KINDS = ["tank", "ship", "sam", "jet"];
export const LABEL = { jet: "enemy jets", tank: "tanks", ship: "ships", sam: "SAM sites", ring: "rings", balloon: "balloons", drone: "drones", target: "practice targets", view: "view switch", orbit: "camera orbit" };
export const LABEL1 = { jet: "Enemy jet", tank: "Tank", ship: "Ship", sam: "SAM site", balloon: "Balloon", drone: "Drone", target: "Target", ring: "Ring" };
export const POINTS = { jet: 250, tank: 100, ship: 300, sam: 200, balloon: 50, drone: 80, target: 50, ring: 40 };
const VERB = { tank: "Stop", ship: "Sink", sam: "Knock out", jet: "Shoot down", ring: "Fly through", balloon: "Pop", drone: "Shoot", target: "Hit" };
const TYPE_NAME = { tank: "Strike", ship: "Maritime Strike", sam: "SEAD (air-defence busting)", jet: "Combat Air Patrol" };

export function freshPosition() { return { series: 1, book: 1, chapter: 1, level: 1 }; }
export function isFinalLevel(p) { return p.series === TOTAL_SERIES && p.book === BOOKS_PER_SERIES && p.chapter === CHAPTERS_PER_BOOK && p.level === LEVELS_PER_CHAPTER; }
export function overallLine(p) { return `Series ${Math.min(p.series, TOTAL_SERIES)} of ${TOTAL_SERIES} · level ${slotIndex(p) + 1} of ${TOTAL_LEVELS.toLocaleString("en-US")}`; }
export function formatPosition(p) {
  return `Series ${p.series} · Book ${p.book} · Chapter ${p.chapter} · Level ${p.level}/${LEVELS_PER_CHAPTER}`;
}
export function nextPosition(pos) {
  const n = { ...pos };
  n.level += 1;
  if (n.level > LEVELS_PER_CHAPTER) { n.level = 1; n.chapter += 1; }
  if (n.chapter > CHAPTERS_PER_BOOK) { n.chapter = 1; n.book += 1; }
  if (n.book > BOOKS_PER_SERIES) { n.book = 1; n.series += 1; }
  if (n.series > TOTAL_SERIES) return { ...pos, finished: true }; // game complete
  return n;
}
export function missionSeed(pos) {
  let h = 2166136261;
  for (const n of [pos.series | 0, pos.book | 0, pos.chapter | 0, pos.level | 0, 0x0b0b]) {
    h ^= n + 0x9e3779b9;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function slotIndex(p) {
  const perSeries = BOOKS_PER_SERIES * CHAPTERS_PER_BOOK * LEVELS_PER_CHAPTER;
  return (p.series - 1) * perSeries + ((p.book - 1) * CHAPTERS_PER_BOOK + (p.chapter - 1)) * LEVELS_PER_CHAPTER + (p.level - 1);
}
/** 0 on the first level, reaches its kid-friendly max (1.0) exactly at the last level of Series 10.
 *  Early part ramps gently (2 target types ~chapter 5, 3 types ~book 2-3), the long tail keeps climbing slowly. */
export function difficulty01(p) {
  const s = slotIndex(p), last = TOTAL_LEVELS - 1;
  const early = 1 - Math.exp(-s / 120);
  const late = (1 - Math.exp(-s / 3000)) / (1 - Math.exp(-last / 3000));
  return Math.min(1, 0.5 * early + 0.5 * late);
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
function weighted(rng, table) {
  const tot = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * tot;
  for (const [v, w] of table) { if ((r -= w) <= 0) return v; }
  return table[0][0];
}
const obj = (kind, need, extra = "") => ({ kind, need, label: `${VERB[kind] || "Do"} ${need} ${LABEL[kind]}${extra}` });

// ---------- Book 1 · Chapter 1 = training ----------
const TRAINING = [
  { title: "Training 1 · Tilt to fly", tip: "Tilt your phone to steer (keyboard: W A S D). Fly through the big rings!", objectives: [obj("ring", 6)], weapons: ["gun", "rocket", "bomb"], ring: { size: 70, tight: 0 }, view: "chase" },
  { title: "Training 2 · Climb and dive", tip: "Tilt back to climb, forward to dive. These rings are smaller and go up and down.", objectives: [obj("ring", 8)], weapons: ["gun", "rocket", "bomb"], ring: { size: 46, tight: 1 }, view: "chase" },
  { title: "Training 3 · Look around", tip: "Cockpit view: drag your right thumb to turn your head. Spot the balloons and fly into them.", objectives: [obj("balloon", 5)], weapons: ["gun", "rocket", "bomb"], balloons: 5, view: "cockpit", lockView: true },
  { title: "Training 4 · Outside camera", tip: "Tap the eye button to go outside, then drag on the right side to circle the camera around your jet.", objectives: [{ kind: "view", need: 1, label: "Switch to outside view" }, { kind: "orbit", need: 1, label: "Drag the camera all the way around" }, obj("ring", 4)], weapons: ["gun", "rocket", "bomb"], ring: { size: 60, tight: 0 }, view: "cockpit" },
  { title: "Training 5 · Machine gun", tip: "Hold the yellow GUN button (Space) and hit the practice targets.", objectives: [obj("target", 5)], weapons: ["gun", "rocket", "bomb"], targets: 6, view: "chase" },
  { title: "Training 6 · Moving drones", tip: "Drones move slowly. Aim a little ahead of them and hold GUN.", objectives: [obj("drone", 4)], weapons: ["gun", "rocket", "bomb"], drones: 5, view: "chase" },
  { title: "Training 7 · Rockets", tip: "Point at a tank until the ring locks, then tap the pink ROCKET button (F).", objectives: [obj("tank", 4)], weapons: ["gun", "rocket", "bomb"], ground: { tank: 5 }, view: "chase" },
  { title: "Training 8 · Bombs", tip: "Bombs fall ahead of you. Put the orange ground circle on a target and tap BOMB (B).", objectives: [obj("ship", 2), obj("sam", 2)], weapons: ["gun", "rocket", "bomb"], ground: { ship: 3, sam: 3 }, view: "chase" },
  { title: "Training 9 · First battle", tip: "Your first real fight! Use everything. The enemies are easy today.", objectives: [obj("jet", 2), obj("tank", 3)], weapons: ["gun", "rocket", "bomb"], ground: { tank: 4, sam: 1 }, jets: 2, hostile: 0.35, view: "chase" },
  { title: "Training 10 · Calm night flight", tip: "A calm night flight. Practise everything: rings, a balloon, and a few sleepy targets.", objectives: [obj("ring", 5), obj("balloon", 2), obj("tank", 2)], weapons: ["gun", "rocket", "bomb"], ring: { size: 60, tight: 0 }, balloons: 3, ground: { tank: 3 }, view: "chase", night: true },
];

export function buildLevel(pos, overrides = {}) {
  const p = { series: Math.min(TOTAL_SERIES, Math.max(1, pos.series | 0)), book: Math.max(1, pos.book | 0), chapter: Math.max(1, pos.chapter | 0), level: Math.max(1, pos.level | 0) };
  const seed = missionSeed(p);
  const rng = mulberry32(seed);
  const diff = difficulty01(p);
  const theme = THEME_ORDER[(p.book - 1 + (p.series - 1) * BOOKS_PER_SERIES) % THEME_ORDER.length];
  const training = p.series === 1 && p.book === 1 && p.chapter === 1;
  const night = p.level === LEVELS_PER_CHAPTER;
  let place = training ? placeById("honolulu") : pick(rng, PLACES.filter((x) => x.theme === theme));

  const s = {
    pos: p, line: formatPosition(p), seed, difficulty: diff, theme, training,
    place, time: "day", weather: "clear", title: "", typeName: "", tip: "",
    objectives: [], ground: { tank: 0, ship: 0, sam: 0 }, jets: 0, balloons: 0, drones: 0, targets: 0,
    ring: null, weapons: ["gun", "rocket", "bomb"], view: null, lockView: false,
    hostile: 0, calm: false,
  };

  if (training) {
    const t = TRAINING[p.level - 1];
    Object.assign(s, {
      title: t.title, tip: t.tip, objectives: t.objectives.map((o) => ({ ...o })), weapons: t.weapons,
      ring: t.ring || null, balloons: t.balloons || 0, drones: t.drones || 0, targets: t.targets || 0,
      jets: t.jets || 0, hostile: t.hostile || 0, view: t.view, lockView: !!t.lockView,
      typeName: "Flight school", calm: !t.hostile,
    });
    s.ground = { tank: 0, ship: 0, sam: 0, ...(t.ground || {}) };
    s.time = t.night ? "night" : "day";
    s.weather = "clear";
  } else if (night) {
    // calm night flight to end every chapter
    const kind = pick(rng, ["tank", "ship", "sam"]);
    s.title = `Night flight over ${place.name}`;
    s.typeName = "Calm night patrol";
    s.tip = "Calm night flight: follow the glowing rings, nobody shoots back tonight.";
    s.objectives = [obj("ring", 6), obj(kind, 3)];
    s.ring = { size: 60, tight: 0 };
    s.ground[kind] = 4;
    s.time = "night"; s.weather = rng() < 0.75 ? "clear" : "cloudy";
    s.calm = true; s.hostile = 0;
  } else {
    const kindCount = diff < 0.15 ? 1 : diff < 0.4 ? 2 : diff < 0.7 ? 3 : 4;
    const start = Math.floor(rng() * KINDS.length);
    const kinds = [];
    for (let i = 0; i < kindCount; i++) kinds.push(KINDS[(start + i) % KINDS.length]);
    for (const k of kinds) {
      const need = Math.min(6, 3 + (p.level >= 4 ? 1 : 0) + Math.floor(diff * 2.2 + rng() * 0.6));
      s.objectives.push(obj(k, need));
      if (k === "jet") s.jets = need; else s.ground[k] = need + (k === "tank" ? 2 : 1);
    }
    s.typeName = kinds.length === 1 ? TYPE_NAME[kinds[0]] : kinds.length === 4 ? "Full combat sortie" : "Strike package";
    const words = { countryside: ["Hedgerow", "Orchard", "Mill", "Valley"], coast: ["Harbour", "Pier", "Lighthouse", "Cove"], city: ["Skyline", "Bridge", "Plaza", "Rooftop"], desert: ["Dune", "Mesa", "Oasis", "Wadi"], snow: ["Glacier", "Ridge", "Summit", "Frost"] }[theme];
    s.title = `${pick(rng, words)} ${pick(rng, ["Patrol", "Sweep", "Run", "Watch", "Strike"])}`;
    s.time = weighted(rng, [["day", 52], ["dawn", 18], ["dusk", 18], ["night", 12]]);
    const wx = theme === "snow" ? [["snow", 45], ["clear", 25], ["cloudy", 20], ["fog", 10]]
      : theme === "desert" ? [["clear", 60], ["cloudy", 20], ["fog", 8], ["storm", diff > 0.2 ? 12 : 0]]
      : [["clear", 38], ["cloudy", 24], ["rain", 14], ["fog", 10], ["storm", diff > 0.2 ? 10 : 2], ["snow", 4]];
    s.weather = weighted(rng, wx);
    s.hostile = 0.4 + diff * 0.6;
    s.tip = { tank: "Rockets lock onto tanks. Bombs are great too!", ship: "Ships are big: two rockets or one bomb.", sam: "SAM sites shoot slow missiles. Turn hard to dodge!", jet: "Get behind enemy jets and hold GUN, or lock a rocket." }[kinds[0]];
  }

  // user overrides from settings (place/time/weather)
  if (overrides.place && overrides.place !== "auto") {
    place = overrides.place === "random" ? pick(mulberry32(Date.now() >>> 0), PLACES) : (placeById(overrides.place) || place);
    s.place = place;
  }
  if (overrides.time && overrides.time !== "auto") s.time = overrides.time === "random" ? pick(mulberry32(Date.now() ^ 77), ["dawn", "day", "dusk", "night"]) : overrides.time;
  if (overrides.weather && overrides.weather !== "auto") s.weather = overrides.weather === "random" ? pick(mulberry32(Date.now() ^ 99), ["clear", "cloudy", "rain", "fog", "snow", "storm"]) : overrides.weather;
  return s;
}

export function loadProgress() {
  try {
    const r = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!r || !r.pos || !r.pos.series) return null;
    return r;
  } catch { return null; }
}
export function saveProgress(pos, extra = {}) {
  const prev = loadProgress() || {};
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...prev, ...extra, pos })); } catch { /* ignore */ }
}
export function clearProgress() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
