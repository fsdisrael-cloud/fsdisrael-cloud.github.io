// Real-world terrain: Esri World Imagery satellite tiles + AWS Terrarium elevation,
// stitched in Web-Mercator, colour-graded for the Ubu look. Procedural fallback offline.
// Adapted from /workspace/jet-game/js/terrain.js (copied, then extended).
import * as THREE from "three";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const R = 6378137;
const HALF = Math.PI * R;
export const ATTRIBUTION = "Imagery © Esri, Maxar, Earthstar Geographics · Elevation: Mapzen/AWS Terrain Tiles";

function merc(lon, lat) {
  return { x: (R * lon * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) };
}
function tileSize(z) { return (2 * HALF) / 2 ** z; }

function loadImg(url, timeout = 9000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => { img.src = ""; reject(new Error("timeout")); }, timeout);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error(url)); };
    img.src = url;
  });
}

async function mosaic(urlFn, z, mxA, mxB, myBot, myTop, px = 256, fill = null) {
  const ts = tileSize(z);
  const tx0 = Math.floor((mxA + HALF) / ts), tx1 = Math.floor((mxB - 1 + HALF) / ts);
  const ty0 = Math.floor((HALF - myTop) / ts), ty1 = Math.floor((HALF - myBot - 1) / ts);
  const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1;
  const c = document.createElement("canvas");
  c.width = nx * px; c.height = ny * px;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, c.width, c.height); } // Jet: a missing imagery tile blends in instead of showing black
  let ok = 0;
  const jobs = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    jobs.push(loadImg(urlFn(z, tx0 + i, ty0 + j)).then((img) => { ctx.drawImage(img, i * px, j * px, px, px); ok++; }).catch(() => {}));
  }
  await Promise.all(jobs);
  // mercator bounds of the mosaic canvas
  const bx0 = tx0 * ts - HALF, by0 = HALF - ty0 * ts;
  return { canvas: c, ctx, ok, total: nx * ny, bx0, by0, ts, px, nx, ny };
}

function elevSampler(m) {
  if (!m || m.ok < m.total) return null;
  const data = m.ctx.getImageData(0, 0, m.canvas.width, m.canvas.height).data;
  const W = m.canvas.width, H = m.canvas.height;
  const scale = m.px / m.ts;
  const val = (ix, iy) => {
    ix = Math.max(0, Math.min(W - 1, ix)); iy = Math.max(0, Math.min(H - 1, iy));
    const k = (iy * W + ix) * 4;
    return data[k] * 256 + data[k + 1] + data[k + 2] / 256 - 32768;
  };
  return (mx, my) => {
    const fx = (mx - m.bx0) * scale - 0.5, fy = (m.by0 - my) * scale - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const a = val(ix, iy), b = val(ix + 1, iy), c = val(ix, iy + 1), d = val(ix + 1, iy + 1);
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
  };
}

// Crop a mosaic into a texture canvas for exact bounds + Ubu grade (saturation/contrast lift)
function gradeCrop(m, mxA, mxB, myBot, myTop, size) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const scale = m.px / m.ts;
  const sx = (mxA - m.bx0) * scale, sy = (m.by0 - myTop) * scale;
  const sw = (mxB - mxA) * scale, sh = (myTop - myBot) * scale;
  ctx.drawImage(m.canvas, sx, sy, sw, sh, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r = l + (r - l) * 1.35; g = l + (g - l) * 1.35; b = l + (b - l) * 1.35; // saturation
    r = 255 * Math.pow(Math.max(0, r) / 255, 0.8); g = 255 * Math.pow(Math.max(0, g) / 255, 0.8); b = 255 * Math.pow(Math.max(0, b) / 255, 0.78); // lift shadows (dark sea)
    r = (r - 128) * 1.05 + 134; g = (g - 128) * 1.05 + 134; b = (b - 128) * 1.05 + 136;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function proceduralCanvas(size, seed) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#6f9a4e"; g.fillRect(0, 0, size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cols = ["#7aa556", "#9fb062", "#c2b27a", "#5d8a43", "#a8946a", "#86a85a"];
  for (let i = 0; i < 260; i++) {
    g.fillStyle = cols[i % cols.length];
    g.save(); g.translate(rnd() * size, rnd() * size); g.rotate(rnd() * 3);
    g.fillRect(-30, -20, 30 + rnd() * 90, 20 + rnd() * 60); g.restore();
  }
  // sea on the west third
  const grd = g.createLinearGradient(0, 0, size * 0.42, 0);
  grd.addColorStop(0, "#1d5d86"); grd.addColorStop(0.8, "#2a7aa3"); grd.addColorStop(1, "rgba(42,122,163,0)");
  g.fillStyle = grd; g.fillRect(0, 0, size * 0.42, size);
  g.strokeStyle = "rgba(90,80,70,0.55)"; g.lineWidth = 4;
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(size * 0.4, rnd() * size); g.bezierCurveTo(rnd() * size, rnd() * size, rnd() * size, rnd() * size, size, rnd() * size); g.stroke(); }
  return c;
}

export async function buildTerrain(lat, lon, { quality = "high", onProgress } = {}) {
  const c = merc(lon, lat);
  const k = Math.cos((lat * Math.PI) / 180); // mercator -> true metres
  const Z = 13, N = quality === "low" ? 5 : 6;
  const ts = tileSize(Z);
  const tcx = (c.x + HALF) / ts, tcy = (HALF - c.y) / ts;
  const tx0 = Math.round(tcx - N / 2), ty0 = Math.round(tcy - N / 2);
  const mxA = tx0 * ts - HALF, mxB = mxA + N * ts;
  const myTop = HALF - ty0 * ts, myBot = myTop - N * ts;
  // far ring
  const ZF = 10, NF = 4, tsF = tileSize(ZF);
  const fx0 = Math.round((c.x + HALF) / tsF - NF / 2), fy0 = Math.round((HALF - c.y) / tsF - NF / 2);
  const fA = fx0 * tsF - HALF, fB = fA + NF * tsF, fTop = HALF - fy0 * tsF, fBot = fTop - NF * tsF;

  const esri = (z, x, y) => `${ESRI}/${z}/${y}/${x}`;
  const terr = (z, x, y) => `${TERRARIUM}/${z}/${x}/${y}.png`;
  onProgress?.(0.1);
  const [img, imgF, el, elF] = await Promise.all([
    mosaic(esri, Z, mxA, mxB, myBot, myTop, 256, "#5a6a4c"),
    mosaic(esri, ZF, fA, fB, fBot, fTop, 256, "#5a6a4c"),
    mosaic(terr, 11, mxA, mxB, myBot, myTop),
    mosaic(terr, 8, fA, fB, fBot, fTop),
  ]);
  onProgress?.(0.8);
  const imageryOk = img.ok >= img.total * 0.7;
  const elev = elevSampler(el);
  const elevF = elevSampler(elF);

  const toWorld = (mx, my) => ({ x: (mx - c.x) * k, z: -(my - c.y) * k });
  const toMerc = (x, z) => ({ mx: c.x + x / k, my: c.y - z / k });

  // procedural height fallback: sea in the west, rolling hills east
  const procH = (x, z) => {
    const coast = x + 2400 + Math.sin(z * 0.0008) * 900;
    if (coast < 0) return -20 + coast * 0.01;
    return Math.min(coast * 0.05, 30) + 60 * Math.max(0, Math.sin(x * 0.0011) * Math.cos(z * 0.0009)) + 18 * Math.sin(x * 0.004 + z * 0.003);
  };
  const rawAt = (x, z) => {
    if (elev) { const m = toMerc(x, z); return elev(m.mx, m.my); }
    return procH(x, z);
  };

  // --- detail mesh ---
  const W = (mxB - mxA) * k; // true metres
  const SEG = quality === "low" ? 96 : 128;
  const geo = new THREE.PlaneGeometry(W, W, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const p0 = toWorld(mxA, myTop), p1 = toWorld(mxB, myBot);
  const cx = (p0.x + p1.x) / 2, cz = (p0.z + p1.z) / 2;
  const pos = geo.attributes.position;
  const grid = new Float32Array((SEG + 1) * (SEG + 1));
  const rawGrid = new Float32Array((SEG + 1) * (SEG + 1));
  let maxH = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const raw = rawAt(x, z);
    const h = Math.max(0, raw);
    rawGrid[i] = raw; grid[i] = h;
    if (h > maxH) maxH = h;
    pos.setY(i, h);
  }
  // Jet: soften needle-thin DEM peaks (arcade-friendly mountains): two light blur passes, sea stays at 0
  {
    const N = SEG + 1, tmp = new Float32Array(N * N);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = grid[j * N + i], l = grid[j * N + Math.max(0, i - 1)], r = grid[j * N + Math.min(N - 1, i + 1)];
        tmp[j * N + i] = (l + 2 * c + r) / 4;
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = tmp[j * N + i], u = tmp[Math.max(0, j - 1) * N + i], d = tmp[Math.min(N - 1, j + 1) * N + i];
        grid[j * N + i] = (u + 2 * c + d) / 4;
      }
    }
    for (let i = 0; i < pos.count; i++) pos.setY(i, grid[i]);
  }
  geo.computeVertexNormals();
  const texSize = quality === "low" ? 1024 : 2048;
  const detailCanvas = imageryOk ? gradeCrop(img, mxA, mxB, myBot, myTop, texSize) : proceduralCanvas(texSize, 7);
  const tex = new THREE.CanvasTexture(detailCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const detail = new THREE.Mesh(geo, mat);
  detail.position.set(cx, 0, cz);

  // --- far mesh ---
  const WF = (fB - fA) * k;
  const fgeo = new THREE.PlaneGeometry(WF, WF, 48, 48);
  fgeo.rotateX(-Math.PI / 2);
  const q0 = toWorld(fA, fTop), q1 = toWorld(fB, fBot);
  const fcx = (q0.x + q1.x) / 2, fcz = (q0.z + q1.z) / 2;
  const fpos = fgeo.attributes.position;
  const halfD = W / 2;
  for (let i = 0; i < fpos.count; i++) {
    const x = fpos.getX(i) + fcx, z = fpos.getZ(i) + fcz;
    let h;
    if (elevF) { const m = toMerc(x, z); h = Math.max(0, elevF(m.mx, m.my)); } else h = Math.max(0, procH(x, z));
    const inside = Math.abs(x - cx) < halfD + 200 && Math.abs(z - cz) < halfD + 200;
    fpos.setY(i, inside ? -400 : h - 4); // hidden under the detailed map inside its area
  }
  fgeo.computeVertexNormals();
  const ftex = new THREE.CanvasTexture(img.ok && imgF.ok >= imgF.total * 0.7 ? gradeCrop(imgF, fA, fB, fBot, fTop, 1024) : proceduralCanvas(512, 3));
  ftex.colorSpace = THREE.SRGBColorSpace;
  const fmat = new THREE.MeshLambertMaterial({ map: ftex });
  const far = new THREE.Mesh(fgeo, fmat);
  far.position.set(fcx, 0, fcz);

  // --- samplers on detail grid (bilinear) ---
  const x0 = cx - W / 2, z0 = cz - W / 2, cell = W / SEG;
  function bil(arr, x, z) {
    const fx = (x - x0) / cell, fz = (z - z0) / cell;
    if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return null;
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    const r = SEG + 1;
    const a = arr[j * r + i], b = arr[j * r + i + 1], c2 = arr[(j + 1) * r + i], d = arr[(j + 1) * r + i + 1];
    return (a * (1 - ax) + b * ax) * (1 - az) + (c2 * (1 - ax) + d * ax) * az;
  }
  const heightAt = (x, z) => { const h = bil(grid, x, z); return h == null ? Math.max(0, rawAt(x, z)) : h; };
  const rawHeight = (x, z) => { const h = bil(rawGrid, x, z); return h == null ? rawAt(x, z) : h; };
  const isWater = (x, z) => rawHeight(x, z) < 0.15;   // b23: same test as the water shader (sea level), so seas without bathymetry still count

  onProgress?.(1);
  return {
    detail, far, heightAt, rawHeight, isWater, maxH,
    half: W / 2 - 300, center: new THREE.Vector3(cx, 0, cz),
    imageryOk, hasElevation: !!elev,
    materials: [mat, fmat],
    dispose() { geo.dispose(); fgeo.dispose(); tex.dispose(); ftex.dispose(); mat.dispose(); fmat.dispose(); },
  };
}
