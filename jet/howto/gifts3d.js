// Same glass gifts as the game, floating over the manual's sky and landscape.
import * as THREE from "three";
import { createGiftObject, GIFT_PREVIEW } from "../js/giftslook.js?v=56";
import { createAllyJet, initEnv } from "../js/models.js?v=55";

const host = document.getElementById("gift-sky");
if (host) {
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  R.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.setClearColor(0x000000, 0);
  host.appendChild(R.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1.6, 0.2, 80);
  try { initEnv(R); } catch { /* preview still draws without the studio map */ }
  scene.add(new THREE.HemisphereLight(0xd7e7ff, 0x3a3428, 1.35));
  const sun = new THREE.DirectionalLight(0xfff4e4, 2.1);
  sun.position.set(-8, 12, 6);
  scene.add(sun);
  const objs = [];
  GIFT_PREVIEW.forEach((kind, i) => {
    let o;
    if (kind === "life") {
      try { o = createAllyJet(); o.scale.setScalar(0.42); }
      catch { o = createGiftObject("life"); }
    } else o = createGiftObject(kind);
    const x = (i - (GIFT_PREVIEW.length - 1) / 2) * 2.4;
    o.position.set(x, kind === "cash" ? -0.15 : 0.15, 0);
    if (kind !== "life") o.scale.multiplyScalar(0.09);
    scene.add(o);
    objs.push(o);
  });
  cam.position.set(0, 1.4, 22);
  cam.lookAt(0, 0.1, 0);
  let t = 0;
  const fit = () => {
    const w = host.clientWidth || 320, h = host.clientHeight || 220;
    R.setSize(w, h, false);
    cam.aspect = w / Math.max(1, h);
    cam.updateProjectionMatrix();
  };
  const loop = () => {
    t += 0.016;
    fit();
    objs.forEach((o, i) => {
      if (o.userData.baseY == null) o.userData.baseY = o.position.y;
      o.rotation.y = t * 0.35 + i;
      o.position.y = o.userData.baseY + Math.sin(t * 1.3 + i) * 0.12;
    });
    R.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
}
