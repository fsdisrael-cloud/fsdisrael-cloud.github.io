// b38: the how-to stick lab flies the REAL game jet (same model, control surfaces and afterburner as in game)
import * as THREE from "three";
import { initEnv, createPlayerJet } from "../js/models.js?v=40";
import { JET_TYPES } from "../js/variety.js?v=40";
const sky = document.getElementById("lab-sky");
if (sky) try {
  const L = () => window.LAB || {};
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
  R.domElement.className = "lab-gl"; sky.insertBefore(R.domElement, sky.firstChild);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(34, 1.6, 0.5, 400);
  initEnv(R);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a3020, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-6, 12, 6); scene.add(sun);
  const jk = new URLSearchParams(location.search).get("jet"), JK = JET_TYPES[jk] ? jk : "f35"; const jet = createPlayerJet(JK, JET_TYPES[JK]); jet.scale.setScalar(0.5); scene.add(jet); const u = jet.userData;
  if (u.canopy) u.canopy.visible = true; u.setGear?.(0);
  cam.position.set(-6.5, 4.6, 19); cam.lookAt(0.4, 0.2, -2);
  const belly = new THREE.Vector3(), nose = new THREE.Vector3(), tmp = new THREE.Vector3();
  let eng = null; const thr = document.getElementById("lab-thr");
  const startEng = () => { if (eng) return; try { const C = new (window.AudioContext || window.webkitAudioContext)(), n = C.createBufferSource(), b = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; n.buffer = b; n.loop = true; const f = C.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400; const g = C.createGain(); g.gain.value = 0; n.connect(f); f.connect(g); g.connect(C.destination); n.start(); eng = { C, f, g }; } catch { /* no audio */ } };
  sky.closest(".lab33")?.addEventListener("pointerdown", startEng, { passive: true });
  thr?.addEventListener("input", startEng);
  let ry = 0, rx = 0, rz = 0, t0 = performance.now();
  const loop = () => {
    const S = L(), w = sky.clientWidth, h = sky.clientHeight;
    if (w && (R.domElement.width !== Math.round(w * R.getPixelRatio()))) { R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const T = thr ? +thr.value / 100 : 0.6; S.thr = T; const brk = S.brakeT > 0 ? 1 : 0; if (S.brakeT > 0) S.brakeT -= 1 / 60;
    const p = S.p || 0, bank = S.bank || 0, ra = S.ra || 0;
    const noseTilt = (0.5 - T) * 0.42;
    rx += (p * 0.55 + noseTilt - rx) * 0.12; rz += (-bank * 0.95 - ra - rz) * 0.18; ry += (-bank * 0.3 - ry) * 0.08;
    jet.rotation.set(rx, ry, rz, "YXZ");
    const far = (T - 0.5) * 4.5;
    jet.position.set((S.x || 0) / Math.max(1, w) * 9, -(S.y || 0) / Math.max(1, h) * 6 + (S.dy || 0) * -0.02, far);
    cam.position.z = 19 + far;
    cam.lookAt(0.4, 0.2 + noseTilt, -2);
    u.ctl?.({ pitch: -p + noseTilt, roll: bank, yaw: bank * 0.4, flap: T < 0.4 ? 0.8 : 0, brake: T < 0.38 ? 1 : brk, burn: T > 0.85 ? 1 : 0 });
    u.burn?.(0.25 + T * 0.9, T > 0.85 ? (T - 0.85) * 6 : 0);
    if (eng) { eng.g.gain.value = 0.05 + T * 0.16; eng.f.frequency.value = 250 + T * 1400; }
    jet.updateMatrixWorld(true);
    belly.set(0, -1.1, -1.5).applyMatrix4(jet.matrixWorld).project(cam); nose.set(0, -0.6, -40).applyMatrix4(jet.matrixWorld).project(cam);
    const bx = (belly.x + 1) / 2 * w, by = (1 - belly.y) / 2 * h, nx = (nose.x + 1) / 2 * w, ny = (1 - nose.y) / 2 * h, dl = Math.hypot(nx - bx, ny - by) || 1;
    window.LABP = { bx, by, dx: (nx - bx) / dl, dy: (ny - by) / dl, thr: T };
    R.render(scene, cam); requestAnimationFrame(loop);
  };
  loop(); document.documentElement.classList.add("lab3d");
} catch (e) { console.warn("lab3d off", e); }
