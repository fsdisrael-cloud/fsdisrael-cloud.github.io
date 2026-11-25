// Body-axis flight step. Quaternion is [x, y, z, w].
// Local +X is right, local -Z is the nose. Velocity is the nose times speed.
// Pull (positive pitch rate) rotates about the jet's own right axis.
// Roll (positive) rotates about the nose and keeps going through 360.

export const PITCH_RATE = 1.45;
export const ROLL_RATE = 2.8;

export function expoStick(v, p) {
  const a = Math.min(1, Math.abs(v));
  return a < 0.02 ? 0 : Math.sign(v) * Math.pow(a, p);
}

const dq = [0, 0, 0, 1];

function mul(a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  a[0] = aw * bx + ax * bw + ay * bz - az * by;
  a[1] = aw * by - ax * bz + ay * bw + az * bx;
  a[2] = aw * bz + ax * by - ay * bx + az * bw;
  a[3] = aw * bw - ax * bx - ay * by - az * bz;
}

function axis(out, x, y, z, ang) {
  const h = ang * 0.5, s = Math.sin(h);
  out[0] = x * s;
  out[1] = y * s;
  out[2] = z * s;
  out[3] = Math.cos(h);
}

function norm(a) {
  const n = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
  a[0] /= n; a[1] /= n; a[2] /= n; a[3] /= n;
}

/** Rotate q by body rates (rad/s) for dt seconds. Mutates q. */
export function stepBody(q, dt, pitchRate, rollRate) {
  if (pitchRate) {
    axis(dq, 1, 0, 0, pitchRate * dt);
    mul(q, dq);
  }
  if (rollRate) {
    axis(dq, 0, 0, -1, rollRate * dt);
    mul(q, dq);
  }
  norm(q);
  return q;
}

export function rotate(q, x, y, z) {
  const ix = q[3] * x + q[1] * z - q[2] * y;
  const iy = q[3] * y + q[2] * x - q[0] * z;
  const iz = q[3] * z + q[0] * y - q[1] * x;
  const iw = -q[0] * x - q[1] * y - q[2] * z;
  return [
    ix * q[3] + iw * -q[0] + iy * -q[2] - iz * -q[1],
    iy * q[3] + iw * -q[1] + iz * -q[0] - ix * -q[2],
    iz * q[3] + iw * -q[2] + ix * -q[1] - iy * -q[0]
  ];
}

export function noseOf(q) { return rotate(q, 0, 0, -1); }
export function rightOf(q) { return rotate(q, 1, 0, 0); }
export function headingOf(n) { return Math.atan2(-n[0], -n[2]); }
