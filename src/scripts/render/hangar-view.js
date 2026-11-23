// Hangar: ein Hangarboden (Deck) mit Landeplattformen, von denen alle Schiffe aus schießen. Liest jedes Bild den
// Zustand der Slots aus der Spiellogik (Phase + Zeit) und animiert daraus Anflug, Schweben, Zielen, Rückstoß und
// Abflug. Freie Plattformen leuchten, belegte dimmen ab – weich überblendet.
// Übergänge: Deck wächst beim Laden hinein und schrumpft beim Levelwechsel weg (vanish), Munitionsanzeigen blenden.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TIMING } from '../core/game.js';
import { createShipModel } from './ship-model.js';
import { candyMaterial } from './asteroid-view.js';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic } from './easing.js';

const SLOT_Z = 2;
const DECK_TILT = 0.3;        // rad – Deck zur Kamera gekippt, damit man die Oberseite sieht
const DECK_BELOW = 1.05;      // Abstand Schiffsmitte → Deck-Oberseite
const ARRIVE_FROM = new THREE.Vector3(0, -4, 5);   // Anflug von vorn unten (dort liegt die Warteschlange)
const UP = new THREE.Vector3(0, 1, 0);
const APPEAR = 0.5;           // s – Deck wächst hinein
const FADE = 0.3;             // s – Deck schrumpft beim Levelwechsel weg
const SHRINK_OUT = 0.25;      // s – abfliegendes Schiff schrumpft am Ende seines Abflugs weg
const AIM_RATE = 17;          // 1/s – wie schnell ein Schiff zum Ziel dreht (bildratenunabhängig)
const TURN_AWAY_RATE = 6;
const PAD_RATE = 8;           // 1/s – Überblenden der Plattform-Beleuchtung
const RECOIL = 0.16;          // Welteinheiten Rückstoß pro Schuss
const RECOIL_DECAY = 14;      // 1/s
const PAD_FREE = 0.95;        // Leuchtstärke freie / belegte Plattform
const PAD_TAKEN = 0.25;
/** Anteil für bildratenunabhängiges Annähern (statt fester Faktoren pro Bild) */
const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

export function createHangarView(scene, slotCount) {
  const root = new THREE.Group();
  scene.add(root);
  let y = -2.5;
  const spacing = Math.min(2.4, 13 / slotCount);

  // Deck: dunkle Candy-Platte mit Leuchtkante, darauf je Slot eine Plattform mit Leuchtring
  const deck = new THREE.Group();
  deck.rotation.x = DECK_TILT;
  deck.scale.setScalar(0.001);
  const width = spacing * (slotCount - 1) + 2.2;
  const slabGeometry = new RoundedBoxGeometry(width, 0.42, 2.5, 3, 0.2);
  const slabMaterial = candyMaterial({ color: 0x2b2f62, roughness: 0.5 });
  const slab = new THREE.Mesh(slabGeometry, slabMaterial);
  slab.position.y = -0.21;
  const edgeGeometry = new RoundedBoxGeometry(width - 0.3, 0.07, 0.07, 2, 0.03);
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x6fc8ff });
  const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
  edge.position.set(0, -0.12, 1.26);
  deck.add(slab, edge);

  const padGeometry = new THREE.CylinderGeometry(0.62, 0.68, 0.1, 40);
  const padMaterial = candyMaterial({ color: 0x4b5199, roughness: 0.35 });
  const glowGeometry = new THREE.RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2);
  const pads = Array.from({ length: slotCount }, (_, i) => {
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.position.set((i - (slotCount - 1) / 2) * spacing, 0.05, 0);
    const glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: PAD_FREE, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = 0.06;
    pad.add(glow);
    deck.add(pad);
    return { glow, light: PAD_FREE };
  });
  root.add(deck);

  let age = 0;
  let vanish = null;
  /** Slot-Index → { model, aim: Vector3 | null, recoil: number, t: number } */
  const ships = new Map();
  const target = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const slotPosition = (i, out = new THREE.Vector3()) => out.set((i - (slotCount - 1) / 2) * spacing, y, SLOT_Z);

  return {
    slotPosition,
    get gone() {
      return vanish !== null && vanish >= FADE;
    },
    vanish() {
      vanish ??= 0;
    },
    setY(value) {
      y = value;
      deck.position.set(0, y - DECK_BELOW, SLOT_Z);
    },
    add(slot, ship) {
      const model = createShipModel(ship.color, ship.ammo, ship);
      slotPosition(slot, model.group.position).add(ARRIVE_FROM);
      model.group.scale.setScalar(0.001);
      root.add(model.group);
      ships.set(slot, { model, aim: null, recoil: 0, t: Math.random() * 10 });
    },
    /** Schiff zielt auf diese Weltposition (letzter Schuss) */
    aim(slot, worldPosition) {
      const s = ships.get(slot);
      if (s) s.aim = (s.aim ?? new THREE.Vector3()).copy(worldPosition);
    },
    /** Rückstoß beim Schuss */
    recoil(slot) {
      const s = ships.get(slot);
      if (s) s.recoil = 1;
    },
    /** Spitze des Schiffs – dort startet ein Schuss */
    muzzle(slot, out = new THREE.Vector3()) {
      const s = ships.get(slot);
      if (!s) return slotPosition(slot, out);
      s.model.group.updateMatrixWorld(true);
      return s.model.hull.localToWorld(out.set(0, 0.6, 0));
    },
    remove(slot) {
      const s = ships.get(slot);
      if (!s) return;
      root.remove(s.model.group);
      s.model.dispose();
      ships.delete(slot);
    },
    update(slots, dt) {
      age += dt;
      const out = vanish === null ? 1 : 1 - easeInCubic((vanish += dt) / FADE);
      deck.scale.setScalar(Math.max(0.001, Math.min(easeOutBack(age / APPEAR), out)));

      pads.forEach((pad, i) => {
        const wanted = slots[i] && slots[i].phase !== 'leaving' ? PAD_TAKEN : PAD_FREE;
        pad.light += (wanted - pad.light) * approach(PAD_RATE, dt);
        pad.glow.material.opacity = pad.light;
      });

      for (const [slot, s] of ships) {
        const entry = slots[slot];
        if (!entry) continue;
        const { model } = s;
        s.t += dt;
        model.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
        model.setAmmo(entry.ship.ammo);
        const home = slotPosition(slot, target);
        let size = 1;
        let label = 1;
        if (entry.phase === 'arriving') {
          const p = clamp01(entry.t / TIMING.arrive);
          model.group.position.copy(home).addScaledVector(ARRIVE_FROM, 1 - easeOutCubic(p));
          size = 0.4 + 0.6 * easeOutCubic(p);
          label = p;
        } else if (entry.phase === 'ready') {
          model.group.position.copy(home);
          if (s.aim) q.setFromUnitVectors(UP, aimDir.copy(s.aim).sub(model.group.position).normalize());
          else q.identity();
          model.hull.quaternion.slerp(q, approach(AIM_RATE, dt));
        } else {
          label = 1 - clamp01(entry.t / 0.15);
          dir.set(slot < slotCount / 2 ? -1 : 1, 1, -0.4).normalize();
          model.hull.quaternion.slerp(q.setFromUnitVectors(UP, dir), approach(TURN_AWAY_RATE, dt));
          model.group.position.addScaledVector(dir, dt * (6 + entry.t * 30));
          size = 1 - easeInCubic((entry.t - (TIMING.leave - SHRINK_OUT)) / SHRINK_OUT);
        }
        // Schweben + Rückstoß (entgegen der Blickrichtung des Rumpfs)
        s.recoil *= 1 - approach(RECOIL_DECAY, dt);
        aimDir.set(0, 1, 0).applyQuaternion(model.hull.quaternion);
        model.bob.position.set(0, Math.sin(s.t * 2.6) * 0.07, 0).addScaledVector(aimDir, -RECOIL * s.recoil);
        model.label.material.opacity = label;
        model.group.scale.setScalar(Math.max(0.001, size * out));
      }
    },
    dispose() {
      for (const slot of [...ships.keys()]) this.remove(slot);
      for (const pad of pads) pad.glow.material.dispose();
      [slabGeometry, slabMaterial, edgeGeometry, edgeMaterial, padGeometry, padMaterial, glowGeometry].forEach(o => o.dispose());
      scene.remove(root);
    },
  };
}
