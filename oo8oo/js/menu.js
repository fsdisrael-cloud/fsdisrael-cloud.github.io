// Live 3D Ubu jet inside the filled "O" of the OO8OO opening screen (separate small renderer).
import * as THREE from "three";
import { createSky } from "./sky.js?v=5";
import { createPlayerJet } from "./models.js?v=5";
import { outlineUniforms } from "./toon.js?v=5";
import { style, onStyle } from "./surreal.js?v=5";

export function createMenuJet(holeEl) {
  const canvas = document.createElement("canvas");
  holeEl.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" }); }
  catch { return { render() {}, setColor() {}, resize() {} }; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 30000);
  const sky = createSky(scene, renderer);
  sky.apply("day", "clear", { center: new THREE.Vector3(0, 0, -2500), half: 2600, seed: 42 });
  scene.fog.near = 2500; scene.fog.far = 9000;
  // a hint of ground far below for the realistic vibe
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5b6d4a }));
  ground.position.y = -1200;
  scene.add(ground);
  const syncStyle = () => { sky.reapply(); scene.fog.near = 2500; scene.fog.far = 9000; ground.material.color.setHex(style.surreal ? 0xc9a8e8 : 0x5b6d4a); };
  onStyle(syncStyle); syncStyle();
  let jet = createPlayerJet("sky");
  scene.add(jet);
  jet.position.set(0, 1250, 0);
  const t0 = performance.now();
  let size = 0;

  function resize() {
    const r = holeEl.getBoundingClientRect();
    const s = Math.max(64, Math.round(r.width));
    if (s === size) return;
    size = s;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(s, s, false);
    camera.aspect = 1; camera.updateProjectionMatrix();
  }
  return {
    resize,
    setColor(key) { scene.remove(jet); jet = createPlayerJet(key); jet.position.set(0, 1250, 0); scene.add(jet); },
    render() {
      resize();
      const t = (performance.now() - t0) / 1000;
      jet.rotation.set(Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.25) * 0.5 + 0.6, Math.sin(t * 0.5) * 0.35, "YXZ");
      jet.position.y = 1250 + Math.sin(t * 0.9) * 0.6;
      const a = 0.9 + Math.sin(t * 0.2) * 0.25;
      camera.position.set(Math.sin(a) * 26, 1255, Math.cos(a) * 26);
      camera.lookAt(0, 1249.5, 0);
      sky.update(0.016, camera.position, null);
      outlineUniforms.uRes.value.set(size, size);
      renderer.render(scene, camera);
    },
  };
}
