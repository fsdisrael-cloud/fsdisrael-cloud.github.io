// Jet levels. DATA-DRIVEN: to add level 11 to 100, just append an entry to LEVELS.
// Nothing else needs to change. Fields:
//   title, biome (snow|desert|valley|mountains), place {name, lat, lon}, time, weather,
//   seconds (time limit), jets (enemy planes to shoot down), tank / flak / sam / base (ground targets
//   to destroy), carrier (true = land on the aircraft carrier to finish; needs sea in the place),
//   hostile (0-1.2, how hard ground and air enemies shoot), diff (0-1),
//   ally (optional) { jet, tank, ship } = friendly forces fighting on the player's side (defaults below).
export const BIOMES = {
  snow: "Alaskan snow, lakes and sea",
  desert: "Desert",
  valley: "Green valley",
  mountains: "Mountains",
};
import { rollRun } from "./variety.js?v=17";
const P = {
  seward: { name: "Resurrection Bay, Alaska", lat: 60.05, lon: -149.4 },
  monument: { name: "Monument Valley", lat: 36.99, lon: -110.10 },
  interlaken: { name: "Swiss lake valley", lat: 46.68, lon: 7.86 },
  alps: { name: "Matterhorn", lat: 45.98, lon: 7.68 },
  pws: { name: "Prince William Sound, Alaska", lat: 60.9, lon: -148.0 },
  wadirum: { name: "Wadi Rum", lat: 29.58, lon: 35.42 },
  normandy: { name: "Normandy coast", lat: 49.335, lon: -0.62 },
  fjord: { name: "Norwegian fjords", lat: 60.39, lon: 5.25 },
  glacier: { name: "Glacier Bay, Alaska", lat: 58.7, lon: -136.2 },
  dubai: { name: "Gulf desert coast", lat: 25.13, lon: 55.17 },
};
export const LEVELS = [
  { title: "Fjord Strike",    biome: "snow",      place: P.seward,    time: "day",   weather: "clear",  seconds: 120, jets: 3, tank: 3, flak: 1, sam: 0, base: 2, carrier: true,  hostile: 0.45, diff: 0.10 },
  { title: "Desert Base",     biome: "desert",    place: P.monument,  time: "day",   weather: "clear",  seconds: 130, jets: 3, tank: 4, flak: 2, sam: 1, base: 4, carrier: false, hostile: 0.55, diff: 0.20 },
  { title: "Lake Valley Raid", biome: "valley",   place: P.interlaken,time: "dawn",  weather: "clear",  seconds: 140, jets: 4, tank: 4, flak: 2, sam: 1, base: 4, carrier: true,  hostile: 0.60, diff: 0.30 },
  { title: "Peak Patrol",     biome: "mountains", place: P.alps,      time: "day",   weather: "cloudy", seconds: 140, jets: 5, tank: 3, flak: 3, sam: 2, base: 3, carrier: false, hostile: 0.65, diff: 0.40 },
  { title: "Sound Assault",   biome: "snow",      place: P.pws,       time: "dusk",  weather: "clear",  seconds: 150, jets: 5, tank: 5, flak: 3, sam: 2, base: 5, carrier: true,  hostile: 0.70, diff: 0.50 },
  { title: "Dune Storm",      biome: "desert",    place: P.wadirum,   time: "day",   weather: "clear",  seconds: 150, jets: 6, tank: 6, flak: 3, sam: 3, base: 6, carrier: false, hostile: 0.78, diff: 0.60 },
  { title: "Coast Valley",    biome: "valley",    place: P.normandy,  time: "dusk",  weather: "cloudy", seconds: 160, jets: 6, tank: 6, flak: 4, sam: 3, base: 6, carrier: true,  hostile: 0.85, diff: 0.70 },
  { title: "Fjord Ridge",     biome: "mountains", place: P.fjord,     time: "dawn",  weather: "fog",    seconds: 160, jets: 7, tank: 6, flak: 4, sam: 4, base: 6, carrier: true,  hostile: 0.92, diff: 0.80 },
  { title: "Glacier Night",   biome: "snow",      place: P.glacier,   time: "night", weather: "clear",  seconds: 170, jets: 8, tank: 7, flak: 5, sam: 4, base: 7, carrier: true,  hostile: 1.0,  diff: 0.90 },
  { title: "Gulf Finale",     biome: "desert",    place: P.dubai,     time: "dusk",  weather: "clear",  seconds: 180, jets: 9, tank: 8, flak: 5, sam: 5, base: 8, carrier: true,  hostile: 1.1,  diff: 1.00 },
];
export const levelCount = () => LEVELS.length;
const KEY = "jet-level-v1";
export function loadLevelNo() {
  try { const n = parseInt(localStorage.getItem(KEY) || "1", 10); return n >= 1 && n <= LEVELS.length ? n : 1; } catch { return 1; }
}
export function saveLevelNo(n) { try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ } }

const VERB = { jet: "Shoot down", tank: "Destroy", flak: "Destroy", sam: "Destroy", base: "Destroy" };
const NOUN = { jet: "enemy planes", tank: "tanks", flak: "flak guns", sam: "SAM sites", base: "base buildings" };
/** Build the engine level object for level number n (1-based). */
export function buildLevel(n, run0) {
  const d0 = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, n - 1))];
  // every launch gets a fresh random world; the level only sets difficulty and the mission size
  const run = run0 || rollRun();
  const m = run.mix, sc = (v, k) => (v ? Math.max(1, Math.round(v * k)) : 0);
  const d = { ...d0, place: run.place, biome: run.place.biome, time: run.time, weather: run.weather, carrier: !!(d0.carrier && run.place.sea),
    tank: sc(d0.tank, m[0] * 1.6), base: sc(d0.base, m[1] * 1.15), flak: m[2] ? Math.max(d0.flak ? 1 : 0, Math.round(d0.flak * m[2] * 1.3)) : 0, sam: m[3] ? Math.round(d0.sam * m[3] * 1.4) : 0 };
  const objectives = [];
  for (const k of ["jet", "base", "tank", "flak", "sam"]) if (d[k]) objectives.push({ kind: k, need: d[k], label: `${VERB[k]} ${d[k]} ${NOUN[k]}` });
  if (d.carrier) objectives.push({ kind: "land", need: 1, label: "Land on the carrier" });
  return {
    run, n, title: `${n}. ${d0.title}`, biome: d.biome, place: d.place, time: d.time, weather: d.weather,
    seconds: d.seconds, difficulty: d.diff, hostile: d.hostile, calm: false,
    seed: run.seed || ((n * 2654435761) >>> 0), objectives,
    ground: { tank: d.tank + 1, flak: d.flak, sam: d.sam, base: d.base, ship: 0 }, jets: d.jets,
    allies: { jet: 2 + (n >= 5 ? 1 : 0) + (n >= 9 ? 1 : 0), tank: 2 + (d.diff > 0.5 ? 2 : 0), ship: run.place.sea ? (d.carrier || d.biome === "snow" ? 2 : 1) : 0, ...(d.ally || {}) },
    carrier: !!d.carrier, balloons: 0, drones: 0, targets: 0, ring: null, weapons: ["gun", "rocket", "bomb"], view: "chase", lockView: false,
  };
}
