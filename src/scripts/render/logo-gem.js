// Spreng-Kristall im Logo (das „o“ in „pop“, components/Logo.astro): derselbe abgerundete Candy-Würfel wie im Spiel
// (candyBox), in Spreng-Magenta, leicht durchscheinend – eine glänzende Hülle mit Klarlack (Kantenreflexe aus der
// Umgebungsbeleuchtung, Randlichter blau/pink wie auf der Bühne), darin ein leuchtender Kern. Pulsiert wie im Spiel
// und dreht sich langsam; das Hüpfen kommt vom Wort drumherum (CSS). Winzige eigene Bühne, BACKGROUND_FPS.
// Sobald das erste Bild steht, wächst er mit Überschwingen heraus und schiebt die beiden „p“ auseinander (CSS-Breite
// über .is-ready am Elternelement). Ohne WebGL: flache CSS-Ersatzform (.is-fallback).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COLORS } from '../core/colors.js';
import { candyBox } from './asteroid-view.js';
import { startFrameLoop, BACKGROUND_FPS } from './frame-loop.js';
import { easeOutBack } from './easing.js';

const SPIN = 0.45;        // rad/s
const TILT = -0.42;       // rad – leicht von oben, man sieht die Oberseite
const PULSE = 5;          // rad/s – wie im Spiel (asteroid-view.js PULSE)
const WHITE = new THREE.Color(0xffffff);
const GROW = 0.55;        // s – wächst heraus (wie die Breite im CSS)

/** @param {HTMLCanvasElement} canvas  @returns {() => void} aufräumen */
export function startLogoGem(canvas) {
  const holder = canvas.parentElement;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    holder.classList.add('is-fallback');
    return () => {};
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.45;   // wie die Spielbühne (stage.js)
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a1840, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 5, 6);
  const rimBlue = new THREE.DirectionalLight(0xa9d8ff, 1.6);
  rimBlue.position.set(-5, 2, -4);
  const rimPink = new THREE.DirectionalLight(0xffb3d6, 1.3);
  rimPink.position.set(5, -2, -4);
  scene.add(sun, rimBlue, rimPink);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 3.9);   // Würfel ragt nur leicht über seinen Platz zwischen den „p“

  const base = new THREE.Color(COLORS.x);
  const geometry = candyBox(1);
  // Hülle: glänzend, Klarlack für die Kantenreflexe, leicht durchscheinend
  const shell = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color: base, emissive: base, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0,
    clearcoat: 0.6, clearcoatRoughness: 0.12, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  // Kern: leuchtet durch die Hülle
  const core = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: base.clone().lerp(WHITE, 0.15) }));
  core.scale.setScalar(0.55);
  const gem = new THREE.Group();
  gem.add(core, shell);
  gem.rotation.x = TILT;
  scene.add(gem);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w && h) renderer.setSize(w, h, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let time = Math.random() * 10;
  let age = 0;
  gem.rotation.y = 0.6;
  const loop = startFrameLoop(dt => {
    time += dt;
    age += dt;
    if (!still) gem.rotation.y += SPIN * dt;
    const pulse = 0.5 + 0.5 * Math.sin(time * PULSE);
    const grow = still ? 1 : easeOutBack(Math.min(1, age / GROW));
    gem.scale.setScalar(Math.max(0.001, grow * (0.96 + pulse * 0.06)));
    shell.material.color.copy(base).lerp(WHITE, pulse * 0.3);
    shell.material.emissiveIntensity = 0.25 + pulse * 0.6;
    renderer.render(scene, camera);
    holder.classList.add('is-ready');   // erstes Bild steht → Platz machen (die „p“ rücken auseinander)
  }, { fps: BACKGROUND_FPS });

  return () => {
    loop.stop();
    observer.disconnect();
    geometry.dispose();
    shell.material.dispose();
    core.material.dispose();
    scene.environment.dispose();
    renderer.dispose();
  };
}
