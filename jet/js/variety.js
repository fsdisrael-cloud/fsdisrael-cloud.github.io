// Jet: per-run variety. Every launch (PLAY, retry, next level) rolls a fresh combination of
// place, time of day, weather, season, planet, aircraft livery/type and target look.
// Pure data + a tiny roller, so adding a planet / season / livery is one entry here.

export const EARTH_PLACES = [
  { name: "Resurrection Bay, Alaska", lat: 60.05, lon: -149.4, sea: true, biome: "snow" },
  { name: "Monument Valley", lat: 36.99, lon: -110.10, biome: "desert" },
  { name: "Swiss lake valley", lat: 46.68, lon: 7.86, sea: true, biome: "valley" },
  { name: "Matterhorn", lat: 45.98, lon: 7.68, biome: "mountains" },
  { name: "Prince William Sound, Alaska", lat: 60.9, lon: -148.0, sea: true, biome: "snow" },
  { name: "Wadi Rum", lat: 29.58, lon: 35.42, biome: "desert" },
  { name: "Normandy coast", lat: 49.335, lon: -0.62, sea: true, biome: "valley" },
  { name: "Norwegian fjords", lat: 60.39, lon: 5.25, sea: true, biome: "mountains" },
  { name: "Glacier Bay, Alaska", lat: 58.7, lon: -136.2, sea: true, biome: "snow" },
  { name: "Gulf desert coast", lat: 25.13, lon: 55.17, sea: true, biome: "desert" },
  { name: "Grand Canyon", lat: 36.1, lon: -112.1, biome: "desert" },
  { name: "Kauai coast", lat: 22.1, lon: -159.5, sea: true, biome: "valley" },
  { name: "Iceland highlands", lat: 64.0, lon: -19.0, biome: "mountains" },
  { name: "Himalaya", lat: 28.0, lon: 86.9, biome: "mountains" },
  { name: "Lofoten islands", lat: 68.2, lon: 13.6, sea: true, biome: "mountains" },
  { name: "Santorini", lat: 36.4, lon: 25.4, sea: true, biome: "valley" },
  { name: "Patagonia", lat: -50.9, lon: -73.0, sea: true, biome: "mountains" },
  { name: "Amazon river", lat: -3.1, lon: -60.0, biome: "valley" },
  // b23: more oceans and coasts (water at sea level), more snow
  { name: "Amalfi coast", lat: 40.63, lon: 14.6, sea: true, biome: "valley" },
  { name: "Hawaii open ocean", lat: 20.8, lon: -156.4, sea: true, biome: "valley" },
  { name: "Greenland fjords", lat: 61.2, lon: -45.4, biome: "snow" },
  { name: "Cape Town coast", lat: -34.0, lon: 18.4, sea: true, biome: "mountains" },
  { name: "Hong Kong islands", lat: 22.25, lon: 114.2, sea: true, biome: "valley" },
  { name: "Faroe Islands", lat: 62.0, lon: -6.8, biome: "snow" },
  { name: "Croatian coast", lat: 43.5, lon: 16.4, sea: true, biome: "valley" },
  { name: "Bora Bora lagoon", lat: -16.5, lon: -151.74, sea: true, biome: "valley" },
  { name: "Kamchatka", lat: 53.0, lon: 158.6, biome: "snow" },
  { name: "Alaska Range", lat: 63.07, lon: -151.0, biome: "snow" },
];

// Seasons tint the real imagery (multiplied, values above 1 brighten).
export const SEASONS = {
  spring: { tint: [0.92, 1.18, 0.88], snowOk: false },
  summer: { tint: [1.08, 1.08, 1.0], snowOk: false },
  autumn: { tint: [1.28, 0.96, 0.68], snowOk: false },
  winter: { tint: [1.5, 1.6, 1.78], snowOk: true },
};

// Planets. Colours replace the sky / fog / terrain tint; `weapon` picks the weapon style.
//  top/hor/bot = sky gradient, fog, tint = terrain multiply, sun, cloud, stars = star brightness at day
export const PLANETS = {
  earth: { name: "Earth", weapon: "std" },
};

export const JET_TYPES = {
  // livery + airframe for the player; `wing` 0 = delta, 1 = swept, 2 = broad
  viper: { name: "F-V Viper", lo: 0x2a313a, hi: 0x76808c, wing: 0x474f59, glow: 0xff9a3a, shape: 0 },
  raptor: { name: "R-22 Raptor", lo: 0x0c0e11, hi: 0x30353d, wing: 0x16191e, glow: 0xff6a2a, shape: 1 },
  falcon: { name: "F-16 Falcon", lo: 0x303741, hi: 0x7e8894, wing: 0x4c545f, glow: 0xffb040, shape: 2 },
  tomcat: { name: "T-14 Tomcat", lo: 0x121c30, hi: 0x56688a, wing: 0x1e2c48, glow: 0x4ad0ff, shape: 1 },
  arctic: { name: "A-9 Arctic", lo: 0x566170, hi: 0xa4aebb, wing: 0x6a7584, glow: 0x7ad8ff, shape: 0 },
  f35: { name: "F-35 Lightning II", lo: 0x3a4048, hi: 0x6e767f, wing: 0x4a5058, glow: 0xffa040, shape: 1 },
  b21: { name: "B-21 Raider", lo: 0x0a0b0d, hi: 0x2a2d33, wing: 0x15171b, glow: 0xff7030, shape: 4, tailless: true, flat: true, wingSpan: 1.55 },
  f47: { name: "F-47 NGAD", lo: 0x1c2026, hi: 0x4a525c, wing: 0x262b32, glow: 0x7ad8ff, shape: 1, tailless: true, canard: true },
  tempest: { name: "GCAP Tempest", lo: 0x4a525c, hi: 0x8a939e, wing: 0x5a636e, glow: 0xffb040, shape: 1 },
  j36: { name: "J-36", lo: 0x22262c, hi: 0x545c66, wing: 0x2e333a, glow: 0xff6a2a, shape: 4, tailless: true, flat: true, wingSpan: 1.35 },
  sr71: { name: "SR-71 Blackbird", lo: 0x08090b, hi: 0x24272c, wing: 0x101215, glow: 0xff9a3a, shape: 1, long: true, tailless: true },
  a12: { name: "A-12 Archangel", lo: 0x0b0c0f, hi: 0x2c3036, wing: 0x14161a, glow: 0x7ad8ff, shape: 1, long: true, tailless: true },
};
export const FOE_TYPES = {
  red: { name: "MiG red", lo: 0x2a1418, hi: 0x7a3a40, wing: 0x4a2a30, glass: 0xff5a4a, glow: 0xff4030, shape: 1 },
  camo: { name: "Camo fighter", lo: 0x2c3a22, hi: 0x6c7c4c, wing: 0x44532f, glass: 0xffa040, glow: 0xff7a30, shape: 2 },
  black: { name: "Black bat", lo: 0x0a0a0e, hi: 0x30323c, wing: 0x1a1c22, glass: 0xff2a2a, glow: 0xff2a2a, shape: 0 },
  sand: { name: "Desert raider", lo: 0x5a4a30, hi: 0xa28c5c, wing: 0x7a6640, glass: 0xff5a30, glow: 0xff6a30, shape: 1 },
};
export const TARGET_STYLES = ["army", "desert", "arctic", "navy"];

const pick = (a, r) => a[Math.floor(r() * a.length)];
function wpick(table, r) {
  let t = 0; for (const [, w] of table) t += w;
  let x = r() * t; for (const [k, w] of table) { if ((x -= w) <= 0) return k; }
  return table[0][0];
}

/** Roll one run. `rng` defaults to Math.random (a new world every restart). */
export function rollRun(rng = Math.random) {
  // 1.40: about 80% daytime (mostly full day), about 20% night.
  const planetKey = "earth";
  const planet = PLANETS[planetKey];
  const place = pick(EARTH_PLACES, rng);
  const tod = rng();
  const daytime = tod < 0.8;
  const time = !daytime ? "night" : rng() < 0.84 ? "day" : rng() < 0.5 ? "dawn" : "dusk";
  const season = pick(Object.keys(SEASONS), rng);
  let weather = daytime ? wpick([["clear", 74], ["cloudy", 26]], rng) : wpick([["clear", 46], ["cloudy", 22], ["fog", 10], ["rain", 10], ["snow", 6], ["storm", 6]], rng);
  if (weather === "snow" && !SEASONS[season].snowOk && place.biome !== "snow") weather = "cloudy";
  else if (season === "winter" && weather === "clear" && rng() < 0.4) weather = "snow";
  if (season === "summer" && weather === "cloudy" && rng() < 0.7) weather = "clear";   // b23: summer gets clearer skies
  const jet = pick(["viper", "raptor", "falcon", "tomcat", "arctic", "f35", "b21", "f47", "tempest", "j36", "sr71", "a12"], rng);
  const foe = pick(["red", "camo", "black", "sand"], rng);
  const tgt = (place.biome === "desert" ? pick(["desert", "army"], rng) : place.biome === "snow" || season === "winter" ? pick(["arctic", "army"], rng) : pick(["army", "navy", "desert"], rng));
  // test / share hook: ?time=night&season=winter&weather=clear&jet=raptor&place=3
  try {
    const q = new URLSearchParams(location.search);
    var qp = null;
    var ov = { time: q.get("time"), season: q.get("season"), weather: q.get("weather"), jet: q.get("jet"), foe: q.get("foe"), tgt: q.get("tgt"), place: q.get("place") };
  } catch { var ov = {}; }
  const R = { planetKey, planet, place, time, season, weather, jet, foe, tgt, mix: [0.6 + rng() * 0.9, 0.6 + rng() * 0.9, rng() < 0.2 ? 0 : 0.6 + rng() * 0.9, rng() < 0.2 ? 0 : 0.6 + rng() * 0.9], seed: (rng() * 4294967295) >>> 0 };
  if (qp) { R.planetKey = qp; R.planet = PLANETS[qp]; }
  for (const k of ["time", "season", "weather", "jet", "foe", "tgt"]) if (ov[k]) R[k] = ov[k];
  if (ov.place != null && EARTH_PLACES[+ov.place]) R.place = EARTH_PLACES[+ov.place];
  return R;
}

export function runLabel(run) {
  const t = { day: "Day", dawn: "Dawn", dusk: "Dusk", night: "Night" }[run.time];
  const w = run.planetKey === "earth" ? run.place.name + " - " + run.season[0].toUpperCase() + run.season.slice(1) : run.planet.name.split(" (")[0];
  return `${w} - ${t}`;
}

/** Scene persistence (last chosen scene is remembered between launches). */
const SCENE_KEY = "jet-scene-v1";
export function saveScene(run) {
  try { localStorage.setItem(SCENE_KEY, JSON.stringify({ planetKey: run.planetKey, place: run.place?.name, time: run.time, season: run.season, weather: run.weather, jet: run.jet, foe: run.foe, tgt: run.tgt, mix: run.mix, seed: run.seed })); } catch { /* ignore */ }
}
export function loadScene() {
  try {
    const o = JSON.parse(localStorage.getItem(SCENE_KEY)); if (!o || o.planetKey !== "earth" || !PLANETS[o.planetKey]) return null;
    const place = EARTH_PLACES.find((p) => p.name === o.place) || EARTH_PLACES[0];
    return { planetKey: o.planetKey, planet: PLANETS[o.planetKey], place, time: o.time, season: o.season, weather: o.weather, jet: o.jet, foe: o.foe, tgt: o.tgt, mix: o.mix, seed: o.seed };
  } catch { return null; }
}

/** b33: pre-made title art: one image per jet, each with its own terrain / season / weather / time (the run matches the art) */
export const TITLE_ART = {
  viper:  { img: "title_viper.jpg?v=46",  biome: "mountains", sea: true, time: "dusk",  season: "summer", weather: "cloudy" },
  falcon: { img: "title_falcon.jpg?v=46", biome: "snow",      sea: true, time: "night", season: "winter", weather: "snow" },
  tomcat: { img: "title_tomcat.jpg?v=46", biome: "valley",    sea: true, time: "day",   season: "summer", weather: "clear" },
  raptor: { img: "title_raptor.jpg?v=46", biome: "valley",    sea: false, time: "dusk", season: "autumn", weather: "storm" },
  arctic: { img: "title_arctic.jpg?v=46", biome: "desert",    sea: null, time: "dawn",  season: "summer", weather: "clear" },
  f35:    { img: "title_f35.jpg?v=46",    biome: "snow",      sea: null, time: "night", season: "winter", weather: "clear" },
  b21:    { img: "title_b21.jpg?v=46",    biome: "desert",    sea: null, time: "night", season: "summer", weather: "clear" },
  f47:    { img: "title_f47.jpg?v=46",    biome: "snow",      sea: null, time: "dawn",  season: "winter", weather: "cloudy" },
  tempest:{ img: "title_tempest.jpg?v=46",biome: "valley",    sea: true, time: "dusk",  season: "summer", weather: "cloudy" },
  j36:    { img: "title_j36.jpg?v=46",    biome: "valley",    sea: true, time: "dusk",  season: "autumn", weather: "storm" },
  sr71:   { img: "title_sr71.jpg?v=46",   biome: "desert",    sea: null, time: "day",   season: "summer", weather: "clear" },
  a12:    { img: "title_a12.jpg?v=46",    biome: "snow",      sea: true, time: "night", season: "winter", weather: "clear" },
};
export const TITLE_JETS = Object.keys(TITLE_ART);
export function titleRun(jet) {
  const R = rollRun();
  jet = TITLE_ART[jet] ? jet : TITLE_JETS[Math.floor(Math.random() * TITLE_JETS.length)];
  const A = TITLE_ART[jet];
  R.planetKey = "earth"; R.planet = PLANETS.earth;
  let pool = EARTH_PLACES.filter((p) => p.biome === A.biome && (A.sea == null || !!p.sea === A.sea));
  if (!pool.length) pool = EARTH_PLACES.filter((p) => p.biome === A.biome);
  R.place = pool[Math.floor(Math.random() * pool.length)] || R.place;
  R.time = A.time; R.weather = A.weather; R.season = SEASONS[A.season] ? A.season : R.season; R.jet = jet;
  R.foe = ["red", "camo", "black", "sand"][Math.floor(Math.random() * 4)];
  R.tgt = R.place.biome === "desert" ? "desert" : R.place.biome === "snow" ? "arctic" : "army";
  return R;
}
