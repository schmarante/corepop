// Förderband unter dem Deck (Spiellogik: core/game.js → belt, queue): ein dunkles Candy-Band mit laufenden Streifen,
// Rollen an den Enden, rechts die Luke, aus der neue Flieger kommen („+n“ vorn drauf: so viele warten noch). Die Flieger
// liegen klein in Parkstellung auf dem Band (flach, Nase in Laufrichtung), die Munition als Zahl darüber; beim Start
// heben sie ab und richten sich im Steigen auf (hangar-view.js → add, Drehung weich aus der Parkstellung).
// Liest jedes Bild das Band aus der Logik (Schlüssel = ship.id) und setzt jedes Schiff an seine Position – das Band
// bewegt sich ja gleichmäßig. Nichts poppt: neue Flieger wachsen aus der Luke heraus, ein Flieger am linken Ende kippt
// über die Kante und stürzt taumelnd ins All (drop), ein gestarteter wird an den Hangar übergeben (take → hangar-view).
// Lesbarkeit: Flieger einer fertigen Farbe sind grau (Falle – gestartet blockieren sie für immer). Ob ein Flieger noch
// gebraucht wird, zeigt das Band bewusst nicht (keine rote Warnung – das würde verraten, was man als Nächstes drückt).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createShipModel } from './ship-model.js';
import { SLOT_Z, slotSpacing } from './hangar-view.js';
import { candyMaterial } from './asteroid-view.js';
import { BELT_LENGTH } from '../core/game.js';
import { clamp01, easeInCubic, easeOutBack } from './easing.js';

const SPACING = 1.24;          // Welteinheiten je Bandplatz (Band + Luke passen in MIN_HALF_WIDTH, stage.js)
const BELOW = 3.5;             // Schiff auf der Plattform → Schiff auf dem Band (Mitte) – Luft zwischen Pads und Band
const SHIP_SIZE = 0.7;
/** Parkstellung: flach auf dem Band, Nase nach links (Laufrichtung) */
const PARKED = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const LABEL_ON_HULL = new THREE.Vector3(0, 0.62, 0.3);   // über dem liegenden Flieger
const LABEL_SIZE = 0.72;
const FINISHED_DIM = 0.85;     // Flieger einer fertigen Farbe: stark abgedunkelt (grau)
const EMERGE = 0.7;            // Bandplätze: so weit wächst ein Flieger aus der Luke heraus
const FALL = { time: 1.1, gravity: 16, spin: 7 };
const SHAKE = 0.35;            // s – Wackeln (keine Plattform frei)
const APPEAR = 0.5;
const FADE = 0.3;
const MORE_PX = { w: 160, h: 72 };
const TILT = 0.3;              // Band zur Kamera gekippt wie das Deck
const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

const SHIFT = -0.45;           // Band etwas nach links: die Luke rechts bleibt ganz im Bild
/** x-Position eines Bandplatzes */
const xOf = pos => (pos - (BELT_LENGTH - 1) / 2) * SPACING + SHIFT;

/**
 * @param {THREE.Scene} scene
 * @param {number} slotCount  Plattformen im Hangar (für den bevorzugten Slot über einem Flieger)
 * @param {{ moreText: (n: number) => string, design?: string }} options  „+n“-Text (i18n vom Modus), Flieger-Design
 */
export function createBeltView(scene, slotCount, { moreText, design = 'classic' }) {
  const root = new THREE.Group();
  scene.add(root);
  let y = -2.5;
  let age = 0;
  let vanish = null;
  let travelled = 0;   // Bandweg für die laufenden Streifen

  // Band: Platte mit laufenden Streifen (Textur verschiebt sich), Rollen an den Enden, Luke rechts
  const width = SPACING * (BELT_LENGTH - 0.2);
  const deck = new THREE.Group();
  deck.rotation.x = TILT;
  deck.scale.setScalar(0.001);
  const slabGeometry = new RoundedBoxGeometry(width, 0.32, 1.5, 3, 0.14);
  const stripes = stripeTexture();
  stripes.repeat.set(BELT_LENGTH * 1.5, 1);
  const slabMaterial = candyMaterial({ color: 0x3a3f7a, roughness: 0.55, map: stripes });
  const slab = new THREE.Mesh(slabGeometry, slabMaterial);
  slab.position.y = -0.16;
  const rollerGeometry = new THREE.CylinderGeometry(0.24, 0.24, 1.6, 20).rotateX(Math.PI / 2);
  const rollerMaterial = candyMaterial({ color: 0x6fc8ff, roughness: 0.3, metalness: 0.3 });
  const rollers = [-1, 1].map(side => {
    const roller = new THREE.Mesh(rollerGeometry, rollerMaterial);
    roller.position.set((side * width) / 2, -0.16, 0);
    return roller;
  });
  const hatchGeometry = new RoundedBoxGeometry(1.1, 1.5, 1.6, 3, 0.2);
  const hatchMaterial = candyMaterial({ color: 0x2b2f62, roughness: 0.45 });
  const hatch = new THREE.Mesh(hatchGeometry, hatchMaterial);
  hatch.position.set(width / 2 + 0.35, 0.55, 0);
  const mouthGeometry = new THREE.PlaneGeometry(0.85, 1.05);
  const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
  mouth.position.set(width / 2 - 0.22, 0.5, 0.2);
  mouth.rotation.y = -Math.PI / 2;
  deck.add(slab, ...rollers, hatch, mouth);
  root.add(deck);

  // „+n“ über der Luke: so viele Flieger warten noch
  const moreCanvas = document.createElement('canvas');
  moreCanvas.width = MORE_PX.w;
  moreCanvas.height = MORE_PX.h;
  const moreTexture = new THREE.CanvasTexture(moreCanvas);
  moreTexture.colorSpace = THREE.SRGBColorSpace;
  const more = new THREE.Sprite(new THREE.SpriteMaterial({ map: moreTexture, transparent: true, opacity: 0, depthWrite: false }));
  more.scale.set(1.15, 1.15 * (MORE_PX.h / MORE_PX.w), 1);
  more.material.depthTest = false;   // vorn auf der Luke, nie von ihr verdeckt
  more.renderOrder = 6;
  root.add(more);
  let moreShown = -1;
  let moreOpacity = 0;

  /** ship.id → { model, ship, dim } */
  const items = new Map();
  /** stürzen gerade ab bzw. schrumpfen weg: { model, t, velocity, spin } */
  const falling = [];
  const shakes = new Map();   // ship.id → s seit dem Wackeln
  const target = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tumble = new THREE.Quaternion();

  const beltY = () => y - BELOW;
  const place = (pos, out = target) => out.set(xOf(pos), beltY() - 0.12, SLOT_Z + 0.35);   // liegt auf dem Band

  function create(ship, pos) {
    const model = createShipModel(ship.color, ship.ammo, { capacity: ship.capacity, special: ship.special, design });
    model.flame.scale.setScalar(0.001);   // Triebwerk aus, bis er startet
    model.hull.quaternion.copy(PARKED);
    model.label.position.copy(LABEL_ON_HULL);
    model.label.scale.setScalar(LABEL_SIZE);
    place(pos, model.group.position);
    model.group.scale.setScalar(0.001);
    root.add(model.group);
    const item = { model, ship, dim: 0 };
    items.set(ship.id, item);
    return item;
  }

  function disposeModel(model) {
    root.remove(model.group);
    model.dispose();
  }

  function drawMore(n) {
    if (n === moreShown) return;
    moreShown = n;
    const ctx = moreCanvas.getContext('2d');
    ctx.clearRect(0, 0, MORE_PX.w, MORE_PX.h);
    if (n > 0) {
      ctx.fillStyle = 'rgba(200,205,240,.9)';
      ctx.font = '800 40px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(moreText(n), MORE_PX.w / 2, MORE_PX.h / 2);
    }
    moreTexture.needsUpdate = true;
  }

  return {
    get gone() {
      return vanish !== null && vanish >= FADE;
    },
    vanish() {
      vanish ??= 0;
    },
    /** Weltposition der Luke (dorthin fliegen zurückgezogene Flieger) */
    hatchPosition(out = new THREE.Vector3()) {
      root.updateMatrixWorld(true);
      return mouth.getWorldPosition(out);
    },
    setY(value) {
      y = value;
      deck.position.set(SHIFT, beltY() - 0.75, SLOT_Z + 0.35);
    },
    /** Modell des gestarteten Fliegers für den Hangar (hangar-view add) – oder null */
    take(ship) {
      const item = items.get(ship.id);
      if (!item) return null;
      items.delete(ship.id);
      root.remove(item.model.group);
      return item.model;
    },
    /** Flieger ist am Bandende heruntergefallen: kippt über die Kante und stürzt taumelnd ins All */
    drop(ship) {
      const item = items.get(ship.id);
      if (!item) return;
      items.delete(ship.id);
      falling.push({
        model: item.model,
        t: 0,
        size: item.model.group.scale.x,
        velocity: new THREE.Vector3(-1.6, 1.2, 0.6),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 1).normalize(),
      });
    },
    /** kurzes Wackeln (keine Plattform frei) */
    shake(ship) {
      if (items.has(ship.id)) shakes.set(ship.id, 0);
    },
    /**
     * Welcher Flieger liegt unter diesem Bildschirmpunkt (NDC)? @returns {{ id, slot } | null}
     *   slot: die Plattform, über der er gerade steht (bevorzugt beim Start); null = nicht auf dem Band
     */
    pick(ndc, camera) {
      const top = v.set(0, beltY() + 1, SLOT_Z).project(camera).y;
      const bottom = v.set(0, beltY() - 1.3, SLOT_Z).project(camera).y;
      if (ndc.y > top || ndc.y < bottom) return null;
      let best = null;
      let bestDistance = Infinity;
      for (const [id, item] of items) {
        const d = Math.abs(v.copy(item.model.group.position).project(camera).x - ndc.x);
        if (d < bestDistance) {
          bestDistance = d;
          best = { id, x: item.model.group.position.x };
        }
      }
      const reach = Math.abs(v.set(SPACING * 0.6, beltY(), SLOT_Z).project(camera).x - target.set(0, beltY(), SLOT_Z).project(camera).x);
      if (!best || bestDistance > reach) return null;
      const spacing = slotSpacing(slotCount);
      const slot = Math.round(best.x / spacing + (slotCount - 1) / 2);
      return { id: best.id, slot: Math.max(0, Math.min(slotCount - 1, slot)) };
    },
    /** Flieger auf dem Band von links nach rechts (für die Tasten 1 … 9) */
    visibleIds(belt) {
      return belt.filter(item => item.pos <= BELT_LENGTH - 0.5).map(item => item.ship.id);
    },
    /**
     * @param {{ ship, pos }[]} belt  game.belt   @param {number} waiting  Schiffe in der Luke   @param {number} speed  Plätze/s
     * @param {{ finished: (ship) => boolean }} state  Farbe des Fliegers fertig? (grau)
     */
    update(belt, waiting, speed, dt, { finished = () => false } = {}) {
      age += dt;
      const out = vanish === null ? 1 : 1 - easeInCubic((vanish += dt) / FADE);
      deck.scale.setScalar(Math.max(0.001, Math.min(easeOutBack(age / APPEAR), out)));
      // laufende Streifen: Textur wandert mit dem Band nach links
      if (vanish === null) travelled += speed * dt;
      stripes.offset.x = (travelled * 1.5) % 1;
      for (const roller of rollers) roller.rotation.z += (speed * SPACING * dt) / 0.24;
      mouthMaterial.opacity = (0.4 + 0.2 * Math.sin(age * 3)) * out;

      const k = approach(10, dt);
      const seen = new Set();
      for (const { ship, pos } of belt) {
        seen.add(ship.id);
        const item = items.get(ship.id) ?? create(ship, pos);
        const { model } = item;
        place(pos, model.group.position);
        // Wackeln, wenn keine Plattform frei ist
        const shakeT = shakes.get(ship.id);
        if (shakeT !== undefined) {
          model.group.position.x += Math.sin(shakeT * 40) * 0.12 * (1 - shakeT / SHAKE);
          if (shakeT + dt > SHAKE) shakes.delete(ship.id);
          else shakes.set(ship.id, shakeT + dt);
        }
        // aus der Luke herauswachsen
        const emerge = clamp01((BELT_LENGTH - 0.5 + EMERGE - pos) / EMERGE);
        model.group.scale.setScalar(Math.max(0.001, SHIP_SIZE * easeOutBack(emerge) * out));
        model.bob.position.y = 0;   // geparkt: liegt still
        model.setAmmo(ship.ammo);
        item.dim += ((finished(ship) ? FINISHED_DIM : 0) - item.dim) * k;
        model.setDim(item.dim);
        model.label.material.opacity = out;
      }
      // nicht mehr auf dem Band (z. B. Levelende): wegschrumpfen
      for (const [id, item] of items)
        if (!seen.has(id)) {
          items.delete(id);
          falling.push({ model: item.model, t: FALL.time - 0.25, size: item.model.group.scale.x, velocity: new THREE.Vector3(), spin: new THREE.Vector3(0, 1, 0) });
        }
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.t += dt;
        f.velocity.y -= FALL.gravity * dt;
        f.model.group.position.addScaledVector(f.velocity, dt);
        f.model.hull.quaternion.premultiply(tumble.setFromAxisAngle(f.spin, FALL.spin * dt));
        const p = clamp01((f.t - (FALL.time - 0.25)) / 0.25);   // am Ende weich wegschrumpfen
        f.model.group.scale.setScalar(Math.max(0.001, f.size * (1 - easeInCubic(p)) * out));
        if (f.t >= FALL.time) {
          disposeModel(f.model);
          falling.splice(i, 1);
        }
      }

      drawMore(waiting);
      moreOpacity += ((waiting > 0 ? 1 : 0) - moreOpacity) * k;
      more.material.opacity = moreOpacity * out;
      more.position.set(width / 2 + 0.35 + SHIFT, beltY() + 0.5, SLOT_Z + 1.3);   // vorn oben auf der Luke
    },
    dispose() {
      for (const item of items.values()) disposeModel(item.model);
      for (const f of falling) disposeModel(f.model);
      items.clear();
      falling.length = 0;
      [slabGeometry, slabMaterial, stripes, rollerGeometry, rollerMaterial, hatchGeometry, hatchMaterial, mouthGeometry, mouthMaterial, moreTexture, more.material].forEach(o => o.dispose());
      scene.remove(root);
    },
  };
}

/** Streifen des Bandes (Querrillen), wiederholt sich – die Verschiebung lässt das Band laufen */
function stripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#9aa0d8';
  ctx.fillRect(0, 0, 10, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
