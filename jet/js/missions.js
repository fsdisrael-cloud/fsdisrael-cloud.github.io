// Shared gameplay constants (Jet). Levels live in levels.js.
export const LABEL = { jet: "enemy planes", tank: "tanks", flak: "flak guns", sam: "SAM sites", base: "base buildings", land: "landing", ship: "ships" };
export const LABEL1 = { jet: "Enemy plane", tank: "Tank", flak: "Flak gun", sam: "SAM site", base: "Base", ship: "Ship", land: "Landed" };
export const POINTS = { jet: 250, tank: 100, flak: 150, sam: 200, base: 120, ship: 300 };
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
