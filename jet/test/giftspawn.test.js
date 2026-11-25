import assert from "assert";
import { giftPoints } from "../js/giftspawn.js";

const origin = { x: 1000, y: 400, z: -2000 };
const yaw = 0.7;
const pts = giftPoints(origin, yaw, 10);
assert.strictEqual(pts.length, 10);
const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
const rx = fz, rz = -fx;
for (const p of pts) {
  const dx = p.x - origin.x, dz = p.z - origin.z;
  const along = dx * fx + dz * fz;
  const lateral = dx * rx + dz * rz;
  assert.ok(along > 400, "gift must sit ahead of the nose, got " + along);
  assert.ok(Math.abs(lateral) < 400, "gift stays in the forward view");
  assert.ok(p.y > origin.y + 20, "gift is in the air");
}
assert.strictEqual(giftPoints(origin, yaw, 0).length, 0);
const full = 2.8;
let bank = 0;
const dt = 1 / 60;
for (let t = 0; t < (Math.PI * 2) / full + dt; t += dt) {
  const rate = 1 * full;
  bank = Math.atan2(Math.sin(bank + rate * dt), Math.cos(bank + rate * dt));
}
assert.ok(Math.abs(bank) < 0.2, "full stick completes a 360, bank wrapped near 0, got " + bank);
let left = 0;
for (let i = 0; i < 40; i++) left = Math.atan2(Math.sin(left + -full * dt), Math.cos(left + -full * dt));
assert.ok(left < 0, "left stick rolls the other way");
console.log("gift spawn path ok");
