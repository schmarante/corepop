// Three.js-Bühne: Renderer, Kamera, Licht. Transparent – der Sternenflug liegt dahinter (components/Starfield.astro).
// Passt sich der Größe des Canvas-Containers an (mobile-first: die Höhe ist knapp, die Breite bestimmt den
// Kameraabstand) und meldet die Ankerpunkte für Körper und Hangar.
//
// Candy-Look: Umgebungslicht aus einem weichen „Studio“ (RoomEnvironment, einmal vorberechnet) gibt allen
// MeshStandardMaterials Glanzlichter; dazu Sonne von vorn oben und farbige Randlichter von hinten (blau/pink wie das
// Logo), damit sich der Körper vom Weltall abhebt.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { startFrameLoop, GAME_FPS } from './frame-loop.js';

const FOV = 50;
const MIN_HALF_WIDTH = 7.5;   // so viel Welt muss links und rechts der Mitte sichtbar sein (Hangar-Reihe)
const BASE_DISTANCE = 20;
const SHAKE_DECAY = 3.5;      // 1/s – wie schnell das Wackeln abklingt
const SHAKE_AMOUNT = 0.35;    // Welteinheiten bei voller Stärke

/**
 * @param {HTMLCanvasElement} canvas  liegt in einem Container, der die Größe vorgibt
 * @param {{ onLayout?: (anchors: { asteroidY: number, hangarY: number, halfHeight: number }) => void,
 *           minHalfWidth?: number, minDistance?: number, insets?: () => { top: number, bottom: number } }} [options]
 *   insets: px oben/unten, die von Oberfläche verdeckt sind (Kopfzeile, Schiffsauswahl). Die Bühne zeichnet trotzdem
 *   über den ganzen Bildschirm (nichts wird an einer Kante abgeschnitten), platziert Körper und Hangar aber im freien
 *   Bereich dazwischen.
 *   minHalfWidth/minDistance: wie viel Welt sichtbar sein muss – Standard fürs Spiel (Hangar-Reihe), kleiner für
 *   Vorschauen, in denen nur der Körper zu sehen ist (Dev-Übersicht)
 */
export function createStage(canvas, { onLayout, minHalfWidth = MIN_HALF_WIDTH, minDistance = BASE_DISTANCE, insets } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;   // satte Farben ohne ausgebrannte Glanzlichter
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a1840, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 12);
  // Randlichter dezent und wenig gesättigt – sonst färben sie helle Würfel in Spielfarben (blau/pink) um
  const rimBlue = new THREE.DirectionalLight(0xa9d8ff, 1.2);
  rimBlue.position.set(-10, 4, -8);
  const rimPink = new THREE.DirectionalLight(0xffb3d6, 0.9);
  rimPink.position.set(10, -3, -8);
  scene.add(sun, rimBlue, rimPink);

  const anchors = { asteroidY: 0, hangarY: -2.5, halfHeight: 10 };
  const home = new THREE.Vector3();
  let shake = 0;

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Abstand so, dass der freie Bereich (ohne Kopfzeile/Schiffsauswahl) dieselbe Welt zeigt wie früher als eigene
    // Bühne: genug Höhe (minDistance) und genug Breite (minHalfWidth) – die verdeckten Ränder kommen nur dazu
    const { top = 0, bottom = 0 } = insets?.() ?? {};
    const share = Math.max(0.3, (h - top - bottom) / h);   // Anteil des freien Bereichs an der Bildhöhe
    const distance = Math.max(minDistance / share, minHalfWidth / (tan * camera.aspect));
    home.set(0, 0, distance);
    camera.position.copy(home);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const halfHeight = distance * tan;
    // freier Bereich zwischen Kopfzeile und Schiffsauswahl, in Welteinheiten (Ebene z = 0)
    const perPx = (2 * halfHeight) / h;
    const playTop = halfHeight - top * perPx;
    const playBottom = -halfHeight + bottom * perPx;
    const center = (playTop + playBottom) / 2;
    const half = (playTop - playBottom) / 2;
    anchors.halfHeight = half;
    anchors.asteroidY = center + half * 0.2;
    anchors.hangarY = center - half * 0.62;
    onLayout?.(anchors);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();

  let loop = null;
  return {
    /** neu ausrichten, z. B. wenn sich die Höhe der Schiffsauswahl ändert */
    relayout: resize,
    renderer,
    scene,
    camera,
    anchors,
    /** Bildschirm wackeln lassen (0 … 1, addiert sich, klingt von selbst ab) */
    shake(strength) {
      shake = Math.min(1, shake + strength);
    },
    /** startet die Render-Schleife (GAME_FPS, frame-loop.js); update(dt) läuft vor jedem Bild */
    run(update) {
      loop = startFrameLoop(dt => {
        update(dt);
        shake = Math.max(0, shake - dt * SHAKE_DECAY * Math.max(shake, 0.3));
        const k = shake * shake * SHAKE_AMOUNT;   // quadratisch: kleine Werte kaum spürbar, große deutlich
        camera.position.set(home.x + (Math.random() * 2 - 1) * k, home.y + (Math.random() * 2 - 1) * k, home.z);
        renderer.render(scene, camera);
        canvas.classList.add('is-ready');   // erstes Bild steht → weich einblenden (CSS .fade-in)
      }, { fps: GAME_FPS });
    },
    dispose() {
      loop?.stop();
      observer.disconnect();
      environment.dispose();
      renderer.dispose();
    },
  };
}
