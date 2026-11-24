// Hangar: ein Hangarboden (Deck) mit Landeplattformen, von denen alle Schiffe aus schießen. Liest jedes Bild den
// Zustand der Slots aus der Spiellogik (Phase + Zeit) und animiert daraus Anflug, Schweben, Zielen, Rückstoß und
// Abflug. Freie Plattformen leuchten, belegte dimmen ab – weich überblendet. Ein blockiertes Schiff (findet kein Ziel
// ganz außen, core/game.js → BLOCKED_AFTER) kippt zur Seite, das Triebwerk geht aus, die Munitionszahl wird rot und
// ein größerer Ring um die Plattform pulsiert rot: Der Hangar ist der Engpass, alle Plattformen blockiert = verloren.
// Übergänge: Deck wächst beim Laden hinein und schrumpft beim Levelwechsel weg (vanish), Munitionsanzeigen blenden.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TIMING, BLOCKED_AFTER } from '../core/game.js';
import { createShipModel } from './ship-model.js';
import { candyMaterial } from './asteroid-view.js';
import { clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic } from './easing.js';

export const SLOT_Z = 2;
/** Abstand der Plattformen (= Spalten der Warteschlange, render/queue-view.js) */
export const slotSpacing = count => Math.min(2.4, 10.5 / count);   // 5 Plattformen etwas enger, damit das Deck in MIN_HALF_WIDTH (stage.js) passt
/** Munitions-Blase unter dem Schiff (Position im Modell, ship-model.js) */
export const LABEL_BELOW = new THREE.Vector3(0, -1.15, 0);
const DECK_TILT = 0.3;        // rad – Deck zur Kamera gekippt, damit man die Oberseite sieht
const DECK_BELOW = 1.05;      // Abstand Schiffsmitte → Deck-Oberseite
const ARRIVE_FROM = new THREE.Vector3(0, -4, 5);   // Anflug von vorn unten, falls kein Modell aus der Warteschlange kommt
const ARRIVE_ARC = 0.6;       // Welteinheiten – der Start aus der Warteschlange hüpft leicht nach vorn
const UP = new THREE.Vector3(0, 1, 0);
const UPRIGHT = new THREE.Quaternion();
const APPEAR = 0.5;           // s – Deck wächst hinein
const FADE = 0.3;             // s – Deck schrumpft beim Levelwechsel weg
const SHRINK_OUT = 0.25;      // s – abfliegendes Schiff schrumpft am Ende seines Abflugs weg
const AIM_RATE = 17;          // 1/s – wie schnell ein Schiff zum Ziel dreht (bildratenunabhängig)
const TURN_AWAY_RATE = 6;
const PAD_RATE = 8;           // 1/s – Überblenden der Plattform-Beleuchtung
const RECOIL = 0.16;          // Welteinheiten Rückstoß pro Schuss
const RECOIL_DECAY = 14;      // 1/s
const EXTRA_RISE = 1.7;       // Zusatz-Plattform: so viel höher als das Deck …
const EXTRA_SIDE = 0.7;       // … und so weit rechts vom Deckrand
const EXTRA_MAX_X = 5.2;      // höchstens (bleibt im Bild, stage.js MIN_HALF_WIDTH)
const RECALL_TIME = 0.8;      // s – Rückflug zur Luke (Special Zurückziehen)
const RECALL_ARC = 1.6;       // Welteinheiten – so hoch steigt er dabei
const LABEL_SIZE = 0.72;      // Munitions-Blase auf der Plattform
const PAD_FREE = 0.95;        // Leuchtstärke freie / belegte Plattform
const PAD_TAKEN = 0.25;
const PAD_COLOR = new THREE.Color(0x6fc8ff);
const BLOCKED_COLOR = new THREE.Color(0xff4d5e);
const BLOCKED_RATE = 6;       // 1/s – Überblenden in den Blockiert-Zustand und zurück
const DROOP = 0.6;            // rad – so weit kippt ein blockiertes Schiff zur Seite
const BLOCKED_RING = 0.35;    // so viel größer wird der Ring einer blockierten Plattform
/** Anteil für bildratenunabhängiges Annähern (statt fester Faktoren pro Bild) */
const approach = (rate, dt) => 1 - Math.exp(-rate * dt);
/** Schiff steht schussbereit mit Munition da, findet aber schon länger kein Ziel */
const isBlocked = entry => !!entry && entry.phase === 'ready' && entry.ship.ammo > 0 && entry.idle >= BLOCKED_AFTER;

export function createHangarView(scene, slotCount) {
  const root = new THREE.Group();
  root.name = 'Hangar';
  scene.add(root);
  let y = -2.5;
  const spacing = slotSpacing(slotCount);

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
    return { glow, light: PAD_FREE, blocked: 0 };
  });
  root.add(deck);

  let age = 0;
  // blockiert: links zur linken, rechts zur rechten Seite kippen (nach außen, damit sich Nachbarn nicht berühren)
  const droop = side => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * DROOP);
  const droopLeft = droop(1);
  const droopRight = droop(-1);
  const LABEL_WHITE = new THREE.Color(0xffffff);
  const LABEL_BLOCKED = new THREE.Color(0xff6b78);
  let vanish = null;
  /** Slot-Index → { model, aim: Vector3 | null, recoil: number, t: number } */
  const ships = new Map();
  /** zurückgezogene Schiffe auf dem Weg zur Luke: { model, t, from, to, size } */
  const returning = [];
  const pickPoint = new THREE.Vector3();
  const target = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const q = new THREE.Quaternion();

  // Zusatz-Plattform (Special 'pad', addPad): schwebt rechts oberhalb des Decks – daneben ist bei 5 Plattformen kein
  // Platz, direkt darüber läge sie in der Figur
  const extraX = Math.min(width / 2 + EXTRA_SIDE, EXTRA_MAX_X);
  let extra = null;   // { group, glow, light, blocked, age }
  const slotPosition = (i, out = new THREE.Vector3()) =>
    i >= slotCount ? out.set(extraX, y + EXTRA_RISE, SLOT_Z) : out.set((i - (slotCount - 1) / 2) * spacing, y, SLOT_Z);

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
      extra?.group.position.set(extraX, y + EXTRA_RISE - DECK_BELOW, SLOT_Z);
    },
    /** Zusatz-Plattform (Special) wächst herein; Schiffe in Slot `slot` landen dort */
    addPad() {
      if (extra) return;
      const group = new THREE.Group();
      group.rotation.x = DECK_TILT;
      group.scale.setScalar(0.001);
      const pad = new THREE.Mesh(padGeometry, padMaterial);
      pad.position.y = 0.05;
      const glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: PAD_FREE, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 0.06;
      pad.add(glow);
      // Schwebe-Ring darunter: leuchtet in Spreng-Magenta (Special)
      const halo = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.5);
      halo.position.y = -0.2;
      group.add(pad, halo);
      group.position.set(extraX, y + EXTRA_RISE - DECK_BELOW, SLOT_Z);
      root.add(group);
      extra = { group, glow, halo, light: PAD_FREE, blocked: 0, age: 0 };
    },
    /** Schiff landet auf der Plattform. `model`: das Modell aus der Warteschlange (queue-view → take) – es fliegt von
     *  dort hoch, die Zahl wandert vom Rumpf in die Blase darunter. Ohne Modell: Anflug von vorn unten. */
    add(slot, ship, model = null) {
      const from = model
        ? { position: model.group.position.clone(), size: model.group.scale.x, label: model.label.position.clone(), labelSize: model.label.scale.x, turn: model.hull.quaternion.clone() }
        : { position: slotPosition(slot).add(ARRIVE_FROM), size: 0.001, label: LABEL_BELOW.clone(), labelSize: LABEL_SIZE, turn: new THREE.Quaternion() };
      model ??= createShipModel(ship.color, ship.ammo, ship);
      model.group.position.copy(from.position);
      model.group.scale.setScalar(Math.max(0.001, from.size));
      root.add(model.group);
      ships.set(slot, { model, from, aim: null, recoil: 0, blocked: 0, t: Math.random() * 10 });
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
    /** Special Zurückziehen: Schiff hebt ab und fliegt zur Luke des Förderbands (`to`, Welt), schrumpft dort weg */
    recall(slot, to) {
      const s = ships.get(slot);
      if (!s) return;
      ships.delete(slot);
      returning.push({ model: s.model, t: 0, from: s.model.group.position.clone(), to: root.worldToLocal(to.clone()), size: s.model.group.scale.x });
    },
    /** Welche Plattform (mit Schiff) liegt unter diesem Bildschirmpunkt (NDC)? @returns {number | null} */
    pick(ndc, camera) {
      let best = null;
      let bestDistance = 0.12;   // NDC – etwa eine Plattformbreite
      for (const [slot, s] of ships) {
        const p = pickPoint.copy(s.model.group.position).project(camera);
        const d = Math.hypot(p.x - ndc.x, (p.y - ndc.y) * 0.6);
        if (d < bestDistance) {
          bestDistance = d;
          best = slot;
        }
      }
      return best;
    },
    update(slots, dt) {
      age += dt;
      // zurückgezogene Schiffe: Bogen nach oben, dann hinunter zur Luke; Rumpf kippt in Flugrichtung, schrumpft am Ende
      for (let i = returning.length - 1; i >= 0; i--) {
        const r = returning[i];
        r.t += dt;
        const p = clamp01(r.t / RECALL_TIME);
        const e = easeInOutCubic(p);
        r.model.group.position.lerpVectors(r.from, r.to, e);
        r.model.group.position.y += Math.sin(p * Math.PI) * RECALL_ARC;
        r.model.hull.quaternion.slerp(q.setFromUnitVectors(UP, dir.copy(r.to).sub(r.from).normalize()), approach(TURN_AWAY_RATE, dt));
        r.model.flame.scale.set(1, 0.6 + Math.random() * 0.4, 1);
        r.model.label.material.opacity = 1 - p;
        r.model.group.scale.setScalar(Math.max(0.001, r.size * (1 - easeInCubic(clamp01((p - 0.7) / 0.3)))));
        if (p >= 1) {
          root.remove(r.model.group);
          r.model.dispose();
          returning.splice(i, 1);
        }
      }
      const out = vanish === null ? 1 : 1 - easeInCubic((vanish += dt) / FADE);
      deck.scale.setScalar(Math.max(0.001, Math.min(easeOutBack(age / APPEAR), out)));

      if (extra) {
        extra.age += dt;
        extra.group.scale.setScalar(Math.max(0.001, Math.min(easeOutBack(extra.age / APPEAR), out)));
        extra.group.position.y = y + EXTRA_RISE - DECK_BELOW + Math.sin(age * 1.8) * 0.06;   // schwebt
        extra.halo.material.opacity = 0.35 + 0.25 * Math.sin(age * 3);
      }
      [...pads, ...(extra ? [extra] : [])].forEach((pad, i) => {
        const wanted = slots[i] && slots[i].phase !== 'leaving' ? PAD_TAKEN : PAD_FREE;
        pad.light += (wanted - pad.light) * approach(PAD_RATE, dt);
        pad.blocked += ((isBlocked(slots[i]) ? 1 : 0) - pad.blocked) * approach(BLOCKED_RATE, dt);
        pad.glow.material.color.copy(PAD_COLOR).lerp(BLOCKED_COLOR, pad.blocked);
        pad.glow.material.opacity = pad.light + pad.blocked * (0.45 + 0.3 * Math.sin(age * 6));
        pad.glow.scale.setScalar(1 + BLOCKED_RING * pad.blocked);
      });

      for (const [slot, s] of ships) {
        const entry = slots[slot];
        if (!entry) continue;
        const { model } = s;
        s.t += dt;
        s.blocked += ((isBlocked(entry) ? 1 : 0) - s.blocked) * approach(BLOCKED_RATE, dt);
        model.flame.scale.set(1, Math.max(0.001, (0.8 + Math.random() * 0.5) * (1 - s.blocked)), 1);   // blockiert: Triebwerk aus
        model.label.material.color.copy(LABEL_WHITE).lerp(LABEL_BLOCKED, s.blocked);
        model.setAmmo(entry.ship.ammo);
        const home = slotPosition(slot, target);
        let size = 1;
        let label = 1;
        if (entry.phase === 'arriving') {
          const p = clamp01(entry.t / TIMING.arrive);
          const e = easeOutCubic(p);
          model.group.position.lerpVectors(s.from.position, home, e);
          model.group.position.z += Math.sin(p * Math.PI) * ARRIVE_ARC;
          size = s.from.size + (1 - s.from.size) * e;
          model.label.position.lerpVectors(s.from.label, LABEL_BELOW, e);
          model.label.scale.setScalar(s.from.labelSize + (LABEL_SIZE - s.from.labelSize) * e);
          model.setDim(0);
          // aus der Parkstellung (Förderband) weich aufrichten, schon in der ersten Hälfte des Anflugs
          model.hull.quaternion.slerpQuaternions(s.from.turn, UPRIGHT, easeOutCubic(Math.min(1, p * 1.8)));
        } else if (entry.phase === 'ready') {
          model.group.position.copy(home);
          if (isBlocked(entry)) q.copy(slot < (slotCount - 1) / 2 ? droopLeft : droopRight);   // blockiert: zur Seite kippen
          else if (s.aim) q.setFromUnitVectors(UP, aimDir.copy(s.aim).sub(model.group.position).normalize());
          else q.identity();
          model.hull.quaternion.slerp(q, approach(isBlocked(entry) ? TURN_AWAY_RATE : AIM_RATE, dt));
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
      if (extra) {
        extra.glow.material.dispose();
        extra.halo.material.dispose();
      }
      [slabGeometry, slabMaterial, edgeGeometry, edgeMaterial, padGeometry, padMaterial, glowGeometry].forEach(o => o.dispose());
      scene.remove(root);
    },
  };
}
