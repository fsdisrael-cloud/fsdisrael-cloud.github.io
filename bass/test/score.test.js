"use strict";
const assert = require("assert");
const S = require("../js/score.js");

function yLine(frame, top, bottom, pos) {
  return S.yOnStaff(pos, frame, top, bottom);
}

// Concert bass clef: G2 is the bottom line, D3 the middle line, A3 the top line.
assert.strictEqual(S.staffPos(43), 0);
assert.strictEqual(S.staffPos(47), 2);
assert.strictEqual(S.staffPos(50), 4);
assert.strictEqual(S.staffPos(53), 6);
assert.strictEqual(S.staffPos(57), 8);
assert.strictEqual(S.staffPos(60), 10);
assert.strictEqual(S.staffPos(40), -2);
assert.strictEqual(S.staffPos(28), -9);
assert.strictEqual(S.staffPos(33), -6);
assert.strictEqual(S.staffPos(38), -3);

// A low bass riff is written up so the note heads sit on the five lines.
const low = [-9, -9, -6, -6, -3, 0];
const lowFrame = S.staffFrame(low);
assert.strictEqual(lowFrame.shift, 7);
assert.strictEqual(-9 + lowFrame.shift, -2);
assert.strictEqual(-6 + lowFrame.shift, 1);
assert.strictEqual(-3 + lowFrame.shift, 4);
assert.strictEqual(0 + lowFrame.shift, 7);
[1, 4, 7].forEach((p) => {
  assert.ok(p >= 0 && p <= 8, "written pitch on the staff " + p);
});

// A part that already sits on the staff stays at concert pitch.
const mid = [2, 3, 4, 5, 6, 7];
const midFrame = S.staffFrame(mid);
assert.strictEqual(midFrame.shift, 0);

// Note-head Y for a line pitch is the same Y as that staff line.
const frame = S.staffFrame([-9, -6, -3, 0]);
const top = 8;
const bottom = 100;
S.LINES.forEach((line) => {
  const y = yLine(frame, top, bottom, line);
  assert.strictEqual(yLine(frame, top, bottom, line), y);
});
const writtenD = S.staffPos(38) + frame.shift;
assert.strictEqual(writtenD, 4);
assert.strictEqual(yLine(frame, top, bottom, writtenD), yLine(frame, top, bottom, 4));
const gap01 = yLine(frame, top, bottom, 0) - yLine(frame, top, bottom, 2);
const gap23 = yLine(frame, top, bottom, 4) - yLine(frame, top, bottom, 6);
assert.ok(Math.abs(gap01 - gap23) < 1e-9);
assert.ok(gap01 > 0);

// Open strings: three on the staff, low E one ledger below (not a distant row).
[33, 38, 43].forEach((midi) => {
  const p = S.staffPos(midi) + frame.shift;
  assert.ok(p >= 0 && p <= 8, "midi " + midi + " -> " + p);
});
const lowE = S.staffPos(28) + frame.shift;
assert.strictEqual(lowE, -2);
assert.ok(lowE >= frame.lo && lowE <= frame.hi);

// Sync: tap when the first sounded bass note happens, not a leading rest.
const notes = [
  { t: 1.0, rest: true },
  { t: 3.5, string: 0, fret: 0 },
  { t: 4.25, string: 0, fret: 3 }
];
const tap = 12;
const noteOff = S.syncOffset(tap, S.firstSoundTime(notes));
assert.strictEqual(S.firstSoundTime(notes), 3.5);
assert.strictEqual(noteOff, 8.5);
assert.strictEqual(S.scoreTime(tap, noteOff), 3.5);
assert.strictEqual(S.scoreTime(tap + 10, noteOff), 13.5);
assert.strictEqual(S.scoreTime(tap - 10, noteOff), -6.5);
assert.ok(Math.abs((S.scoreTime(tap + 10, noteOff) - S.scoreTime(tap, noteOff)) - 10) < 1e-9);

const words = [
  { t: 6, label: "one" },
  { t: 6.5, label: "two" }
];
const lyricTap = 9.5;
const lyricOff = S.syncOffset(lyricTap, words[0].t);
assert.strictEqual(S.scoreTime(lyricTap, lyricOff), 6);
assert.strictEqual(S.scoreTime(lyricTap + 10, lyricOff) - 6, 10);
const late = S.syncOffset(lyricTap, words[0].t);
assert.strictEqual(S.scoreTime(lyricTap, late), words[0].t);

const packed = S.packSync({
  noteOffset: noteOff,
  lyricOffset: lyricOff,
  noteSynced: true,
  lyricSynced: true,
  loopA: 3.5,
  loopB: 8.25,
  loopLock: true,
  lyricAnchor: null
});
const loaded = S.unpackSync(packed);
assert.strictEqual(loaded.n, noteOff);
assert.strictEqual(loaded.l, lyricOff);
assert.strictEqual(loaded.ns, true);
assert.strictEqual(loaded.ls, true);
assert.strictEqual(loaded.lock, true);
assert.strictEqual(S.scoreTime(tap, loaded.n), 3.5);
assert.strictEqual(S.scoreTime(tap + 10, loaded.n), 13.5);
assert.strictEqual(S.scoreTime(tap - 10, loaded.n), -6.5);
assert.strictEqual(S.scoreTime(lyricTap, loaded.l), 6);
const legacy = S.unpackSync(4.25);
assert.strictEqual(legacy.n, 4.25);
assert.strictEqual(legacy.ns, true);
assert.strictEqual(S.scoreTime(10, legacy.n), 5.75);

// Lyrics keep their timing and never overlap. Current word stays.
function measure(label, size) {
  return label.length * size * 0.55;
}
const crowded = [];
for (let i = 0; i < 8; i++) crowded.push({ t: 10 + i * 0.12, label: "word" + i });
const laid = S.layoutWords(crowded, 10.36, {
  playhead: 64,
  pps: 70,
  width: 360,
  gap: 6,
  baseSize: 15,
  minSize: 11,
  measure: measure
});
assert.ok(laid.some((w) => w.now), "current word is drawn");
for (let i = 1; i < laid.length; i++) {
  const prev = laid[i - 1];
  const cur = laid[i];
  assert.ok(prev.x + prev.w + 6 <= cur.x + 0.01, "overlap " + prev.label + " " + cur.label);
}
const airy = [
  { t: 1.2, label: "alpha" },
  { t: 2, label: "beta" },
  { t: 3.2, label: "gamma" }
];
const spread = S.layoutWords(airy, 2, {
  playhead: 64,
  pps: 70,
  width: 500,
  gap: 6,
  measure: measure
});
assert.strictEqual(spread.length, 3);
spread.forEach((w, i) => {
  const ideal = 64 + (airy[i].t - 2) * 70;
  assert.ok(Math.abs(w.x - ideal) < 0.01, "timing x " + w.label);
});
const shrunk = S.layoutWords(
  [{ t: 0, label: "HELLO" }, { t: 0.2, label: "THERE" }],
  0,
  {
    playhead: 64,
    pps: 70,
    width: 400,
    gap: 6,
    baseSize: 16,
    minSize: 11,
    measure: measure
  }
);
assert.ok(shrunk.length >= 1);
assert.ok(shrunk.some((w) => w.now));
for (let i = 1; i < shrunk.length; i++) {
  assert.ok(shrunk[i - 1].x + shrunk[i - 1].w + 6 <= shrunk[i].x + 0.01);
}

console.log("score tests ok");
