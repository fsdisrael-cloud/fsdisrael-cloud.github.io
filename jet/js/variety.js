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
  mars: { name: "Ruddus (rust desert world)", weapon: "std", top: 0x7a3a28, hor: 0xe8a070, bot: 0xb86a44, fog: 0xc88058, tint: [1.45, 0.82, 0.58], sun: 0xffd2a8, cloud: 0xe8b090, stars: 0.0 },
  ice: { name: "Glacia (ice moon)", weapon: "laser", fx: 0x6fe8ff, top: 0x142a58, hor: 0xb4dcff, bot: 0x9cc4ec, fog: 0xa8cce8, tint: [1.2, 1.5, 1.95], sun: 0xeaf6ff, cloud: 0xeaf6ff, stars: 0.25 },
  toxic: { name: "Veridian (toxic jungle)", weapon: "plasma", fx: 0xc8ff30, top: 0x1c3a14, hor: 0xc4f060, bot: 0x7ab038, fog: 0x8ec040, tint: [0.95, 1.5, 0.55], sun: 0xf4ffb0, cloud: 0xd0ff80, stars: 0.0 },
  violet: { name: "Nebulon (violet world)", weapon: "plasma", fx: 0xd25cff, top: 0x1a0a48, hor: 0xff70d8, bot: 0x7a3ca8, fog: 0x9a52c8, tint: [1.4, 0.8, 1.7], sun: 0xffc0f4, cloud: 0xffa8f0, stars: 0.5 },
  lava: { name: "Pyros (lava world)", weapon: "laser", fx: 0xff7a30, top: 0x1c0606, hor: 0xff6a20, bot: 0x7a2410, fog: 0x7a2814, tint: [1.7, 0.7, 0.45], sun: 0xff9a50, cloud: 0x6a2418, stars: 0.0 },
};

export const JET_TYPES = {
  // livery + airframe for the player; `wing` 0 = delta, 1 = swept, 2 = broad
  viper: { name: "F-V Viper", lo: 0x4e5762, hi: 0x98a2ae, wing: 0x7d8793, glow: 0xff9a3a, shape: 0 },
  raptor: { name: "R-22 Raptor", lo: 0x0c0e11, hi: 0x30353d, wing: 0x16191e, glow: 0xff6a2a, shape: 1 },
  falcon: { name: "F-16 Falcon", lo: 0x58606b, hi: 0x9aa3ae, wing: 0x7c858f, glow: 0xffb040, shape: 2 },
  tomcat: { name: "T-14 Tomcat", lo: 0x121c30, hi: 0x56688a, wing: 0x1e2c48, glow: 0x4ad0ff, shape: 1 },
  // sci-fi craft for alien worlds
  nova: { name: "NX-1 Nova", lo: 0x2a2f46, hi: 0xd9e6ff, wing: 0x4a5a8c, glow: 0x50e8ff, shape: 3 },
  wraith: { name: "VX-7 Wraith", lo: 0x0a0a12, hi: 0x2e2a4a, wing: 0x15121f, glow: 0xb060ff, shape: 4 },
  ion: { name: "IX-3 Ion", lo: 0x16261f, hi: 0x6fa890, wing: 0x1f3a30, glow: 0x60ff9a, shape: 3 },
  arctic: { name: "A-9 Arctic", lo: 0x7a8594, hi: 0xc8d0da, wing: 0x8c97a6, glow: 0x7ad8ff, shape: 0 },
};
export const FOE_TYPES = {
  red: { name: "MiG red", lo: 0x2a1418, hi: 0x7a3a40, wing: 0x4a2a30, glass: 0xff5a4a, glow: 0xff4030, shape: 1 },
  camo: { name: "Camo fighter", lo: 0x2c3a22, hi: 0x6c7c4c, wing: 0x44532f, glass: 0xffa040, glow: 0xff7a30, shape: 2 },
  voidhawk: { name: "Void hawk", lo: 0x180a26, hi: 0x5a2f80, wing: 0x2c1646, glass: 0xff40ff, glow: 0xff40ff, shape: 4 },
  drone: { name: "Hive blade", lo: 0x0c2418, hi: 0x2f7a4c, wing: 0x16402a, glass: 0xb0ff40, glow: 0xb0ff40, shape: 3 },
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
  const planetKey = rng() < 0.75 ? "earth" : pick(["mars", "ice", "toxic", "violet", "lava"], rng);
  const planet = PLANETS[planetKey];
  const place = pick(EARTH_PLACES, rng);
  const time = wpick([["day", 34], ["dawn", 14], ["dusk", 20], ["night", 32]], rng);
  const season = pick(Object.keys(SEASONS), rng);
  let weather = wpick([["clear", 52], ["cloudy", 20], ["fog", 8], ["rain", 8], ["snow", 4], ["storm", 8]], rng);
  if (planetKey !== "earth") weather = wpick([["clear", 60], ["cloudy", 24], ["fog", 16]], rng);
  else if (weather === "snow" && !SEASONS[season].snowOk && place.biome !== "snow") weather = "cloudy";
  else if (season === "winter" && weather === "clear" && rng() < 0.4) weather = "snow";
  const alien = planetKey !== "earth";
  const jet = pick(alien ? ["nova", "wraith", "ion"] : ["viper", "raptor", "falcon", "tomcat", "arctic"], rng);   // modern fighters on Earth, sci-fi craft on alien worlds
  const foe = pick(alien ? ["voidhawk", "drone"] : ["red", "camo", "black", "sand"], rng);
  const tgt = planetKey !== "earth" ? "alien" : (place.biome === "desert" ? pick(["desert", "army"], rng) : place.biome === "snow" || season === "winter" ? pick(["arctic", "army"], rng) : pick(["army", "navy", "desert"], rng));
  // test / share hook: ?time=night&planet=lava&season=winter&weather=clear&jet=raptor&place=3
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("planet") && PLANETS[q.get("planet")]) { var qp = q.get("planet"); }
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
