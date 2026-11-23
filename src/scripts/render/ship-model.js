// 3D-Modell eines Schiffs im Candy-Look: rundlicher Rumpf in der Spielfarbe, Glas-Cockpit, zwei gerundete Flügel,
// Triebwerk mit Flamme, darunter eine Blase mit der Munition. Eigenes Design.
// Aufbau: group (Position, Größe) → bob (Schweben, Rückstoß) → hull (Ausrichtung zum Ziel) → Teile.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../core/colors.js';
import { candyMaterial } from './asteroid-view.js';

const LABEL_PX = 96;

// Geometrien teilen sich alle Schiffe (werden nie entsorgt – wenige hundert Dreiecke)
const BODY = new THREE.CapsuleGeometry(0.27, 0.5, 6, 14);
const NOSE = new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const COCKPIT = new THREE.SphereGeometry(0.16, 16, 12);
const WING = new RoundedBoxGeometry(0.55, 0.1, 0.3, 2, 0.05);
const FIN = new RoundedBoxGeometry(0.08, 0.26, 0.22, 2, 0.035);
const ENGINE = new THREE.CylinderGeometry(0.17, 0.2, 0.16, 16);
const FLAME = new THREE.ConeGeometry(0.15, 0.5, 12).rotateZ(Math.PI);
const GLASS = candyMaterial({ color: 0xd8f1ff, roughness: 0.08, emissive: 0x4aa8ff, emissiveIntensity: 0.25 });
const METAL = candyMaterial({ color: 0x3b3f6e, roughness: 0.3, metalness: 0.4 });
const FIRE = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

/** Größe je Schiffsklasse (Munition); Spreng-Flieger etwas kräftiger */
const CLASS_SCALE = { 1: 1.05, 20: 0.85, 50: 1, 100: 1.16, 250: 1.38 };
const BOMB = new THREE.SphereGeometry(0.26, 16, 12);
const BOMB_MATERIAL = candyMaterial({ color: 0x2b2d4a, roughness: 0.3 });

/** @param {{ capacity?: number, special?: string }} [kind]  Schiffsklasse / Spreng-Flieger */
export function createShipModel(colorId, ammo, { capacity = 20, special } = {}) {
  const base = new THREE.Color(COLORS[colorId]);
  const paint = candyMaterial({ color: base });
  const trim = candyMaterial({ color: base.clone().multiplyScalar(0.72) });

  const group = new THREE.Group();
  const bob = new THREE.Group();
  const hull = new THREE.Group();

  const body = new THREE.Mesh(BODY, paint);
  const nose = new THREE.Mesh(NOSE, paint);   // nur damit die Spitze etwas voller wirkt
  nose.position.y = 0.26;
  nose.scale.set(1, 0.9, 1);
  const cockpit = new THREE.Mesh(COCKPIT, GLASS);
  cockpit.position.set(0, 0.2, 0.17);
  cockpit.scale.set(1, 1.35, 0.85);
  const wingL = new THREE.Mesh(WING, trim);
  wingL.position.set(-0.36, -0.14, 0);
  wingL.rotation.z = 0.32;
  const wingR = wingL.clone();
  wingR.position.x = 0.36;
  wingR.rotation.z = -0.32;
  const fin = new THREE.Mesh(FIN, trim);
  fin.position.set(0, -0.22, -0.2);
  const engine = new THREE.Mesh(ENGINE, METAL);
  engine.position.y = -0.5;
  const flame = new THREE.Mesh(FLAME, FIRE);
  flame.position.y = -0.82;
  hull.add(body, nose, cockpit, wingL, wingR, fin, engine, flame);
  if (special === 'bomber') {
    // Bombe unter dem Rumpf
    const bomb = new THREE.Mesh(BOMB, BOMB_MATERIAL);
    bomb.position.set(0, -0.1, -0.3);
    hull.add(bomb);
  }
  bob.add(hull);
  bob.scale.setScalar(CLASS_SCALE[special === 'bomber' ? 1 : capacity] ?? 1);

  // Munitions-Blase: weiße Zahl auf dunkler Kugel mit Rand in der Schiffsfarbe
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LABEL_PX;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  label.scale.set(0.72, 0.72, 1);
  label.position.y = -1.15;
  label.renderOrder = 10;
  group.add(bob, label);

  const css = `#${base.getHexString()}`;
  let shown = null;
  const setAmmo = n => {
    if (n === shown) return;
    shown = n;
    const ctx = canvas.getContext('2d');
    const c = LABEL_PX / 2;
    ctx.clearRect(0, 0, LABEL_PX, LABEL_PX);
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(17,20,42,.85)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = css;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 44px "Sour Gummy", ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), c, c + 3);
    texture.needsUpdate = true;
  };
  setAmmo(ammo);

  return {
    group,
    bob,
    hull,
    flame,
    label,
    setAmmo,
    dispose() {
      paint.dispose();
      trim.dispose();
      label.material.dispose();
      texture.dispose();
    },
  };
}
