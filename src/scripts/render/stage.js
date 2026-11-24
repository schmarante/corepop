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
import { quality, onQualityChange, createQualityMeter } from './quality.js';
import { attachShipBatches } from './ship-model.js';

const FOV = 50;
const MIN_HALF_WIDTH = 6.2;   // so viel Welt muss links und rechts der Mitte sichtbar sein (Hangar-Reihe mit 5 Plattformen)
// Senkrechter Stapel im freien Bereich (Welteinheiten): Körper oben, darunter Deck, darunter die Warteschlange
// (Förderband, render/belt-view.js). Was an Höhe übrig ist, verteilt sich auf die Lücken (SLACK).
const STACK = {
  top: 0.4,          // Rand oben
  body: 5.2,         // halbe Höhe, die der Körper braucht (inkl. Taumeln)
  bodyToHangar: 6.3, // Körpermitte → Schiff auf der Plattform
  hangarToEnd: 5.3,  // Schiff auf der Plattform → Unterkante des Förderbands (render/belt-view.js)
  bottom: 1.6,       // Rand unten: das Band klebt nicht am Bildschirmrand
};
const STACK_HEIGHT = STACK.top + STACK.body + STACK.bodyToHangar + STACK.hangarToEnd + STACK.bottom;
const SLACK = { top: 0.3, gap: 0.3 };   // Anteile der übrigen Höhe; der Rest kommt unten dazu
const SHADOW_MAP = 1024;       // Auflösung des Sonnenschattens (Figur füllt ihn ungefähr aus)
const SUN_DIRECTION = new THREE.Vector3(6, 10, 12).normalize();
const SHAKE_DECAY = 3.5;      // 1/s – wie schnell das Wackeln abklingt
const SHAKE_AMOUNT = 0.35;    // Welteinheiten bei voller Stärke

/**
 * @param {HTMLCanvasElement} canvas  liegt in einem Container, der die Größe vorgibt
 * @param {{ onLayout?: (anchors: { asteroidY: number, hangarY: number, halfHeight: number }) => void,
 *           minHalfWidth?: number, minHalfHeight?: number, insets?: () => { top: number, bottom: number },
 *           adaptive?: boolean }} [options]
 *   adaptive: Bildrate messen und die Grafik-Stufe bei Bedarf senken (render/quality.js) – nur im Spiel
 *   insets: px oben/unten, die von Oberfläche verdeckt sind (Kopfzeile, Schiffsauswahl). Die Bühne zeichnet trotzdem
 *   über den ganzen Bildschirm (nichts wird an einer Kante abgeschnitten), platziert Körper und Hangar aber im freien
 *   Bereich dazwischen.
 *   minHalfWidth/minHalfHeight: wie viel Welt sichtbar sein muss – Standard fürs Spiel (Hangar-Reihe, Stapel aus Körper,
 *   Deck und Warteschlange), kleiner für Vorschauen, in denen nur der Körper zu sehen ist (Dev-Übersicht)
 */
export function createStage(canvas, { onLayout, minHalfWidth = MIN_HALF_WIDTH, minHalfHeight = STACK_HEIGHT / 2, insets, adaptive = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.NeutralToneMapping;   // satte Farben ohne ausgebrannte Glanzlichter
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.45;

  const detachShips = attachShipBatches(scene);   // Flieger gesammelt zeichnen (ship-model.js)
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a1840, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 12);
  // Sonnenschatten nur auf der Figur (asteroid-view.js: cast/receive): weiches Schattenbild, das der Figur folgt
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun.target);
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
    // Abstand so, dass der freie Bereich (ohne Kopfzeile) genug Höhe (minHalfHeight) und genug Breite (minHalfWidth)
    // zeigt – die verdeckten Ränder kommen nur dazu
    const { top = 0, bottom = 0 } = insets?.() ?? {};
    const share = Math.max(0.3, (h - top - bottom) / h);   // Anteil des freien Bereichs an der Bildhöhe
    const distance = Math.max(minHalfHeight / (tan * share), minHalfWidth / (tan * camera.aspect));
    home.set(0, 0, distance);
    camera.position.copy(home);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const halfHeight = distance * tan;
    // freier Bereich zwischen Kopfzeile und Schiffsauswahl, in Welteinheiten (Ebene z = 0)
    const perPx = (2 * halfHeight) / h;
    const playTop = halfHeight - top * perPx;
    const playBottom = -halfHeight + bottom * perPx;
    const half = (playTop - playBottom) / 2;
    const slack = Math.max(0, 2 * half - STACK_HEIGHT);
    anchors.halfHeight = half;
    anchors.asteroidY = playTop - STACK.top - STACK.body - slack * SLACK.top;
    anchors.hangarY = anchors.asteroidY - STACK.bodyToHangar - slack * SLACK.gap;
    onLayout?.(anchors);
  }
  /** Grafik-Stufe anwenden (Schatten an/aus übersetzt die Shader einmal neu – three.js merkt das an den Lichtern) */
  function applyQuality({ shadows, pixelRatio }) {
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatio));
    resize();
  }
  const stopQuality = onQualityChange(applyQuality);
  const meter = adaptive ? createQualityMeter(GAME_FPS) : null;

  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  applyQuality(quality());

  let loop = null;
  const frameHooks = new Set();
  return {
    /** neu ausrichten, z. B. wenn sich die Höhe der Schiffsauswahl ändert */
    relayout: resize,
    renderer,
    scene,
    camera,
    anchors,
    /** Sonnenschatten auf die Figur ausrichten: Mitte (Welt) und Radius (Welteinheiten) – beim Laden und Neuausrichten */
    aimShadow(center, radius) {
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(SUN_DIRECTION, radius * 4);
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -radius * 1.3;   // etwas Luft fürs Schweben/Taumeln
      cam.right = cam.top = radius * 1.3;
      cam.near = radius * 1.5;
      cam.far = radius * 6.5;
      cam.updateProjectionMatrix();
    },
    /** Bildschirm wackeln lassen (0 … 1, addiert sich, klingt von selbst ab) */
    shake(strength) {
      shake = Math.min(1, shake + strength);
    },
    /** Shader aller Objekte jetzt übersetzen (beim Laden eines Levels, mit den Platzhaltern aus effects-view warmUp) –
     *  sonst hakt die erste Explosion, während die GPU Shader übersetzt */
    warmUp() {
      renderer.compile(scene, camera);
    },
    /** Rückruf nach jedem Bild mit Zeiten in ms ({ dt, update, render } – CPU-Seite) – für den Dev-Profiler;
     *  liefert eine Abmelde-Funktion */
    onFrame(fn) {
      frameHooks.add(fn);
      return () => frameHooks.delete(fn);
    },
    /** startet die Render-Schleife (GAME_FPS, frame-loop.js); update(dt) läuft vor jedem Bild */
    run(update) {
      loop = startFrameLoop(dt => {
        const t0 = performance.now();
        update(dt);
        const t1 = performance.now();
        shake = Math.max(0, shake - dt * SHAKE_DECAY * Math.max(shake, 0.3));
        const k = shake * shake * SHAKE_AMOUNT;   // quadratisch: kleine Werte kaum spürbar, große deutlich
        camera.position.set(home.x + (Math.random() * 2 - 1) * k, home.y + (Math.random() * 2 - 1) * k, home.z);
        renderer.render(scene, camera);
        if (frameHooks.size) {
          const t2 = performance.now();
          for (const fn of frameHooks) fn({ dt, update: t1 - t0, render: t2 - t1 });
        }
        meter?.frame();
        canvas.classList.add('is-ready');   // erstes Bild steht → weich einblenden (CSS .fade-in)
      }, { fps: GAME_FPS, onTick: meter?.tick });
    },
    dispose() {
      loop?.stop();
      stopQuality();
      detachShips();
      observer.disconnect();
      environment.dispose();
      renderer.dispose();
    },
  };
}
