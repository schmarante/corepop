// Warteschlange als echte Flieger in der 3D-Szene: unter jeder Hangar-Plattform eine Spalte, die Schiffe stehen mit der
// Nase nach oben und tragen ihre Munition als Zahl auf dem Rumpf. Vorn steht das startbereite Schiff, dahinter (weiter
// unten, kleiner, dunkler) die wartenden; was nicht mehr hinpasst, zeigt „+n“.
// Liest jedes Bild die Spalten aus der Spiellogik (Schlüssel = ship.id) und gleitet jedes Schiff weich an seinen Platz –
// Nachrücken, Seitwärtsschieben (game.slide) und Neues ergeben sich so von selbst. Nichts poppt: neue Schiffe wachsen
// von hinten herein, übersprungene schrumpfen weg, ein aussortiertes fliegt seitlich hinaus (eject).
// Ein Schiff am Rand, das noch gebraucht wird (game.essential – hinausschieben = verloren), hat eine rote Zahl.
// Beim Start übernimmt der Hangar das Modell (take → hangar-view add) und lässt es zur Plattform hochfliegen.
import * as THREE from 'three';
import { createShipModel } from './ship-model.js';
import { SLOT_Z, slotSpacing } from './hangar-view.js';
import { easeInCubic, easeOutBack } from './easing.js';

const VISIBLE = 4;            // sichtbare Schiffe je Spalte
const FRONT_GAP = 2.9;        // Welteinheiten: Schiff auf der Plattform → vorderstes Schiff der Spalte
const ROW_GAP = 1.65;         // … → jedes weitere
const FRONT_SIZE = 1.12;
const WAIT_SIZE = 0.8;
const WAIT_DIM = 0.55;        // wartende Schiffe abgedunkelt
const BLOCKED_DIM = 0.35;     // vorderes Schiff, dessen Plattform belegt ist
const MOVE_RATE = 13;         // 1/s – Gleiten an den neuen Platz
const ENTER_FROM = -0.9;      // neue Schiffe kommen von etwas weiter unten
const LEAVE = 0.3;            // s – übersprungenes Schiff schrumpft weg
const EJECT = 0.45;           // s – aussortiertes Schiff fliegt seitlich hinaus
const EJECT_SPEED = 14;       // Welteinheiten/s
const SHAKE = 0.35;           // s – Wackeln (Plattform belegt)
const LABEL_ON_HULL = new THREE.Vector3(0, -0.16, 0.45);
const LABEL_SIZE = 0.58;
const LABEL_WHITE = new THREE.Color(0xffffff);
const LABEL_WARN = new THREE.Color(0xff6b78);
const MORE_PX = { w: 160, h: 72 };
const APPEAR = 0.5;
const FADE = 0.3;
const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * @param {THREE.Scene} scene
 * @param {number} count  Spalten (= Plattformen)
 * @param {{ moreText: (n: number) => string, design?: string }} options  Text für „+n“ (i18n kommt vom Modus),
 *   Flieger-Design (render/ship-model.js, freigespielt über Sterne)
 */
export function createQueueView(scene, count, { moreText, design = 'classic' }) {
  const root = new THREE.Group();
  scene.add(root);
  const spacing = slotSpacing(count);
  let y = -2.5;
  let age = 0;
  let vanish = null;
  /** ship.id → { model, ship, size, dim, warn } */
  const items = new Map();
  /** fliegen gerade hinaus bzw. schrumpfen weg: { model, t, size, dir, eject } */
  const leaving = [];
  const shakes = new Array(count).fill(-1);   // s seit dem Wackeln der Spalte (-1 = ruhig)
  const target = new THREE.Vector3();
  const v = new THREE.Vector3();

  const columnX = c => (c - (count - 1) / 2) * spacing;
  const place = (c, row, out = target) => out.set(columnX(c), y - FRONT_GAP - row * ROW_GAP, SLOT_Z);

  // „+n“ je Spalte: Text-Sprite unter der letzten sichtbaren Reihe, blendet weich
  const mores = Array.from({ length: count }, (_, c) => {
    const canvas = document.createElement('canvas');
    canvas.width = MORE_PX.w;
    canvas.height = MORE_PX.h;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }));
    sprite.scale.set(0.9, 0.9 * (MORE_PX.h / MORE_PX.w), 1);
    root.add(sprite);
    return { canvas, texture, sprite, shown: 0, opacity: 0, column: c };
  });
  function drawMore(more, n) {
    if (n === more.shown || n <= 0) return;
    more.shown = n;
    const ctx = more.canvas.getContext('2d');
    ctx.clearRect(0, 0, MORE_PX.w, MORE_PX.h);
    ctx.fillStyle = 'rgba(200,205,240,.85)';
    ctx.font = '800 40px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(moreText(n), MORE_PX.w / 2, MORE_PX.h / 2);
    more.texture.needsUpdate = true;
  }

  function create(ship, c, row) {
    const model = createShipModel(ship.color, ship.ammo, { capacity: ship.capacity, special: ship.special, design });
    model.flame.scale.setScalar(0.001);   // Triebwerk aus, bis es startet
    model.label.position.copy(LABEL_ON_HULL);
    model.label.scale.setScalar(LABEL_SIZE);
    place(c, row, model.group.position).y += ENTER_FROM;
    model.group.scale.setScalar(0.001);
    root.add(model.group);
    const item = { model, ship, size: 0, dim: WAIT_DIM, warn: 0 };
    items.set(ship.id, item);
    return item;
  }

  /** Modell aus der Verwaltung nehmen (gehört danach dem Hangar bzw. der Hinaus-Animation) */
  function detach(ship) {
    const item = items.get(ship.id);
    if (!item) return null;
    items.delete(ship.id);
    return item;
  }

  function disposeModel(model) {
    root.remove(model.group);
    model.dispose();
  }

  return {
    get gone() {
      return vanish !== null && vanish >= FADE;
    },
    vanish() {
      vanish ??= 0;
    },
    setY(value) {
      y = value;
    },
    /** Modell des gestarteten Schiffs für den Hangar (hangar-view add) – oder null */
    take(ship) {
      const item = detach(ship);
      if (!item) return null;
      root.remove(item.model.group);
      return item.model;
    },
    /** Aussortiert: fliegt seitlich (dir -1/+1) hinaus und schrumpft weg. Stellt es sich hinten an, wächst es dort neu herein. */
    eject(ship, dir) {
      const item = detach(ship);
      if (item) leaving.push({ model: item.model, t: 0, size: item.size, dir, eject: true });
    },
    /** Kurzes Wackeln des vordersten Schiffs einer Spalte (Plattform darüber belegt) */
    shake(column) {
      if (column >= 0 && column < count) shakes[column] = 0;
    },
    /**
     * Welche Spalte liegt unter diesem Bildschirmpunkt? `ndc`: Normalized Device Coordinates (-1 … 1).
     * @returns {{ column: number, step: number } | null}  step: Spaltenabstand in NDC-Breite; null = über der Schlange
     */
    pick(ndc, camera) {
      const top = v.set(0, y - FRONT_GAP + ROW_GAP * 0.55, SLOT_Z).project(camera).y;
      if (ndc.y > top) return null;
      let column = 0;
      let best = Infinity;
      for (let c = 0; c < count; c++) {
        const d = Math.abs(place(c, 0, v).project(camera).x - ndc.x);
        if (d < best) {
          best = d;
          column = c;
        }
      }
      const step = Math.abs(place(1, 0, v).project(camera).x - place(0, 0, target).project(camera).x) || 0.2;
      return { column, step };
    },
    /** @param {object[][]} columns  game.columns  @param {(object|null)[]} slots  game.slots
     *  @param {(ship: object) => boolean} [essential]  game.essential – Randschiff wird noch gebraucht */
    update(columns, slots, dt, essential = () => false) {
      age += dt;
      const out = vanish === null ? 1 : 1 - easeInCubic((vanish += dt) / FADE);
      const k = approach(MOVE_RATE, dt);
      const seen = new Set();

      columns.forEach((ships, c) => {
        const shakeT = shakes[c];
        if (shakeT >= 0) shakes[c] = shakeT + dt > SHAKE ? -1 : shakeT + dt;
        ships.slice(0, VISIBLE).forEach((ship, row) => {
          seen.add(ship.id);
          const item = items.get(ship.id) ?? create(ship, c, row);
          const { model } = item;
          place(c, row, target);
          if (row === 0 && shakeT >= 0) target.x += Math.sin(shakeT * 40) * 0.12 * (1 - shakeT / SHAKE);
          model.group.position.lerp(target, k);
          const wantSize = row === 0 ? FRONT_SIZE : WAIT_SIZE;
          item.size += (wantSize - item.size) * k;
          const wantDim = row > 0 ? WAIT_DIM : slots[c] ? BLOCKED_DIM : 0;
          item.dim += (wantDim - item.dim) * k;
          model.setDim(item.dim);
          model.setAmmo(ship.ammo);
          const edge = row === 0 && (c === 0 || c === count - 1);
          item.warn += ((edge && essential(ship) ? 1 : 0) - item.warn) * k;
          model.label.material.color.copy(LABEL_WHITE).lerp(LABEL_WARN, item.warn);
          model.label.material.opacity = row === 0 ? 1 : 0.7;
          // vorn: leichtes Schweben, „startbereit“
          model.bob.position.y = row === 0 ? Math.sin(age * 2.4 + c) * 0.05 : 0;
          model.group.scale.setScalar(Math.max(0.001, item.size * out));
        });
        const more = mores[c];
        const rest = ships.length - VISIBLE;
        drawMore(more, rest);
        more.opacity += ((rest > 0 ? 1 : 0) - more.opacity) * k;
        more.sprite.material.opacity = more.opacity * out;
        place(c, VISIBLE - 0.35, more.sprite.position);
      });

      // nicht mehr in der Schlange (übersprungen): wegschrumpfen
      for (const [id, item] of items)
        if (!seen.has(id)) {
          items.delete(id);
          leaving.push({ model: item.model, t: 0, size: item.size, dir: 0, eject: false });
        }
      for (let i = leaving.length - 1; i >= 0; i--) {
        const l = leaving[i];
        l.t += dt;
        const duration = l.eject ? EJECT : LEAVE;
        if (l.eject) l.model.group.position.x += l.dir * EJECT_SPEED * dt * (0.4 + l.t / duration);
        const p = Math.min(1, l.t / duration);
        l.model.group.scale.setScalar(Math.max(0.001, (1 - easeInCubic(p)) * l.size * out));
        if (p >= 1) {
          disposeModel(l.model);
          leaving.splice(i, 1);
        }
      }
      // Level-Start: alles wächst mit leichtem Überschwingen herein
      if (age < APPEAR) for (const item of items.values()) item.model.group.scale.multiplyScalar(Math.max(0.001, easeOutBack(age / APPEAR)));
    },
    dispose() {
      for (const item of items.values()) disposeModel(item.model);
      for (const l of leaving) disposeModel(l.model);
      items.clear();
      leaving.length = 0;
      for (const m of mores) {
        m.sprite.material.dispose();
        m.texture.dispose();
      }
      scene.remove(root);
    },
  };
}
