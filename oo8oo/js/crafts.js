// Craft registry. This test build ships ONLY the jet; the others are locked placeholders (hooks).
// Rule: no level-to-craft lock. Once a craft is unlocked it can fly ANY unlocked level,
// in the main progression and in post-game Vibe (freeplay) mode.
import { slotIndex } from "./missions.js?v=5";

const KEY = "ubu-crafts-v1";
export const CRAFTS = [
  { id: "jet", name: "Jet", implemented: true, unlockAt: null, blurb: "Fast, round and friendly." },
  { id: "chopper", name: "Chopper", implemented: false, unlockAt: { series: 1, book: 2, chapter: 1, level: 1 }, blurb: "Hover and spin." },
  { id: "jetpack", name: "Jetpack", implemented: false, unlockAt: { series: 1, book: 4, chapter: 1, level: 1 }, blurb: "Fly like a superhero." },
  { id: "fighter", name: "Fighter", implemented: false, unlockAt: { series: 2, book: 1, chapter: 1, level: 1 }, blurb: "Heavy hitter." },
];
export const craftById = (id) => CRAFTS.find((c) => c.id === id);

export function loadUnlocked() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || "null"); if (Array.isArray(a) && a.includes("jet")) return a; } catch { /* ignore */ }
  return ["jet"];
}
function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }

/** Called whenever the furthest-reached position changes. Returns newly unlocked craft ids. */
export function updateUnlocks(maxPos) {
  const list = loadUnlocked();
  const fresh = [];
  for (const c of CRAFTS) {
    if (list.includes(c.id) || !c.unlockAt) continue;
    if (slotIndex(maxPos) >= slotIndex(c.unlockAt)) { list.push(c.id); fresh.push(c.id); }
  }
  if (fresh.length) save(list);
  return fresh;
}
/** Can this craft be flown right now? (unlocked AND built into this version) */
export function isFlyable(id) { const c = craftById(id); return !!c && c.implemented && loadUnlocked().includes(id); }
export function unlockLabel(c) {
  if (!c.unlockAt) return "Ready";
  const u = c.unlockAt;
  const unlocked = loadUnlocked().includes(c.id);
  if (unlocked && !c.implemented) return "Unlocked · coming soon";
  return `Unlocks at Series ${u.series} · Book ${u.book}`;
}
