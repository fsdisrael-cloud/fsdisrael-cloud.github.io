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
import { rollRun, EARTH_PLACES } from "./variety.js?v=45";
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
  try { const n = parseInt(localStorage.getItem(KEY) || "1", 10); return n >= 1 && n <= 999 ? n : 1; } catch { return 1; }
}
export function saveLevelNo(n) { try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ } }

const VERB = { jet: "Shoot down", tank: "Destroy", flak: "Destroy", sam: "Destroy", base: "Destroy" };
const NOUN = { jet: "enemy planes", tank: "tanks", flak: "flak guns", sam: "SAM sites", base: "base buildings" };
/** Build the engine level object for level number n (1-based). */
export function buildLevel(n, run0) {
  n = Math.max(1, Math.min(999, n | 0));
  const d0 = LEVELS[(n - 1) % LEVELS.length];
  let run = run0 || rollRun();
  // Exactly one mission in five is night. The other four stay daytime even if the scene roll was night.
  const nightOps = n % 5 === 0;
  let timeLock = "";
  try { timeLock = new URLSearchParams(location.search).get("time") || ""; } catch { /* ignore */ }
  if (!timeLock) {
    if (nightOps) run = { ...run, time: "night" };
    else if (run.time === "night") run = { ...run, time: "day" };
  }
  const carrierOnly = n % 5 === 4;
  if (carrierOnly) {
    const coasts = EARTH_PLACES.filter((p) => p.sea);
    run = { ...run, place: coasts[(n * 3) % coasts.length] };
  }
  // 1.40: mission 1 is about 5 air, 2 sea, 5 ground, then a slow climb.
  const air = Math.min(24, 5 + Math.floor((n - 1) * 0.35));
  const sea = Math.min(8, 2 + Math.floor((n - 1) * 0.08));
  const ground = Math.min(18, 5 + Math.floor((n - 1) * 0.22));
  const tank = Math.max(1, Math.round(ground * 0.4));
  const flak = Math.max(1, Math.round(ground * 0.2));
  const sam = n < 3 ? 0 : Math.max(1, Math.round(ground * 0.15));
  let base = Math.max(1, ground - tank - flak - sam);
  const diff = Math.min(0.8, 0.06 + (n - 1) * 0.007);
  const hostile = Math.min(0.75, 0.2 + (n - 1) * 0.005);
  const objectives = [{ kind: "jet", need: air, label: `Destroy ${air} enemies` }];
  if (base) objectives.push({ kind: "base", need: base, label: `${VERB.base} ${base} ${NOUN.base}` });
  if (tank) objectives.push({ kind: "tank", need: tank, label: `${VERB.tank} ${tank} ${NOUN.tank}` });
  if (flak) objectives.push({ kind: "flak", need: flak, label: `${VERB.flak} ${flak} ${NOUN.flak}` });
  if (sam) objectives.push({ kind: "sam", need: sam, label: `${VERB.sam} ${sam} ${NOUN.sam}` });
  if (sea) objectives.push({ kind: "ship", need: sea, label: `Destroy ${sea} ships` });
  const carrier = carrierOnly || !!(d0.carrier && run.place.sea);
  return {
    run, n, title: n >= 999 ? "999. FINAL SORTIE" : nightOps ? `${n}. NIGHT OPS` : `${n}. ${d0.title}`, nightOps, biome: run.place.biome, place: run.place, time: run.time, weather: run.weather,
    seconds: 180, difficulty: diff, hostile, calm: n < 4,
    seed: run.seed || ((n * 2654435761) >>> 0), objectives,
    ground: { tank, flak, sam, base, ship: 0 }, jets: air, sea,
    allies: { jet: n < 3 ? 1 : 2, tank: 1, ship: run.place.sea ? 1 : 0 },
    carrier, carrierOnly, balloons: 0, drones: 0, targets: 0, ring: null, weapons: ["gun", "rocket", "bomb"], view: "chase", lockView: false,
  };
}
