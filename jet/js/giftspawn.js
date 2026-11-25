// Where gifts appear: in the air, ahead of the nose, inside the forward view.
export function giftPoints(origin, yaw, count) {
  const n = Math.max(0, count | 0);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = fz, rz = -fx;
  const out = [];
  for (let i = 0; i < n; i++) {
    const dist = 460 + (i % 5) * 170;
    const side = ((i % 7) - 3) * 90;
    const lift = 50 + (i % 4) * 45;
    out.push({
      x: origin.x + fx * dist + rx * side,
      y: origin.y + lift,
      z: origin.z + fz * dist + rz * side
    });
  }
  return out;
}
