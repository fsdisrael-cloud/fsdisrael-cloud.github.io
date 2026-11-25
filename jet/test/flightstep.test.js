import assert from "assert";
import { stepBody, noseOf, rightOf, headingOf, PITCH_RATE, ROLL_RATE } from "../js/flightstep.js";

function ident() { return [0, 0, 0, 1]; }
function wrap(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

// Bank 90° right, then pull. Heading must swing toward that wing. Altitude barely changes.
{
  const q = ident();
  const dt = 1 / 120;
  for (let t = 0; t < (Math.PI / 2) / ROLL_RATE; t += dt) stepBody(q, dt, 0, ROLL_RATE);
  const before = headingOf(noseOf(q));
  let y = 0, horiz = 0;
  const speed = 200;
  for (let t = 0; t < 0.7; t += dt) {
    stepBody(q, dt, PITCH_RATE, 0);
    const n = noseOf(q);
    y += n[1] * speed * dt;
    horiz += Math.hypot(n[0], n[2]) * speed * dt;
  }
  const turned = wrap(headingOf(noseOf(q)) - before);
  const right = rightOf(q);
  assert.ok(right[1] < -0.3, "still banked right, right wing down, got " + right[1]);
  // In this world a turn to the right decreases yaw (same sign as headingErr > 0 when the target is right).
  assert.ok(turned < -0.35, "pull while banked right changes heading toward the bank, got " + turned);
  assert.ok(Math.abs(y) < horiz * 0.35, "altitude holds during the break turn, dy " + y + " horiz " + horiz);
}

// Hold roll. The wing goes all the way around, past inverted, more than 360°.
{
  const q = ident();
  const dt = 1 / 120;
  let turned = 0;
  let minUp = 1;
  const ups = [];
  const steps = Math.ceil((Math.PI * 2) / ROLL_RATE / dt) + 2;
  for (let i = 0; i < steps; i++) {
    stepBody(q, dt, 0, ROLL_RATE);
    turned += ROLL_RATE * dt;
    const up = rotateUp(q);
    minUp = Math.min(minUp, up);
    ups.push(up);
  }
  assert.ok(turned > Math.PI * 2, "integrated roll passes 360");
  assert.ok(minUp < -0.8, "passed inverted, min up " + minUp);
  const endUp = ups[ups.length - 1];
  assert.ok(endUp > 0.8, "after a full roll the jet is upright again, up " + endUp);
}

function rotateUp(q) {
  const x = 0, y = 1, z = 0;
  const ix = q[3] * x + q[1] * z - q[2] * y;
  const iy = q[3] * y + q[2] * x - q[0] * z;
  const iz = q[3] * z + q[0] * y - q[1] * x;
  const iw = -q[0] * x - q[1] * y - q[2] * z;
  return iy * q[3] + iw * -q[1] + iz * -q[0] - ix * -q[2];
}

// Left roll is the other direction and also passes 360.
{
  const q = ident();
  const dt = 1 / 60;
  let turned = 0;
  for (let t = 0; t < (Math.PI * 2) / ROLL_RATE + dt; t += dt) {
    stepBody(q, dt, 0, -ROLL_RATE);
    turned -= ROLL_RATE * dt;
  }
  assert.ok(turned < -Math.PI * 2, "left roll passes -360");
}

console.log("flight step ok");
