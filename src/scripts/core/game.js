// Spielablauf als reine Logik (ohne Grafik, ohne DOM, deterministisch per Seed).
//
//   const game = createGame(LEVELS[0]);
//   game.launch(column)            → Schiff der Spalte in einen freien Hangar-Slot
//   game.step(dt, camera, origin)  → Zeit vorspulen; liefert Ereignisse für Darstellung, UI und später das Netzwerk
//
// `camera`: Kameraposition im Asteroiden-Raster (lokale Koordinaten, 1 = ein Voxel), siehe asteroid.js → facing().
// `origin(slot)`: Position des Schiffs in diesem Slot, ebenfalls im Raster.
//
// Zielregel: freiliegend und eine freie Fläche zeigt zur Kamera (die Spieler sehen das Ziel) ODER zum Schiff (es sieht
// das Ziel von unten). Geschossen wird mit Lenkgeschossen, die außen herum fliegen und durch genau diese Fläche
// eintreten (shot.normal) – nie durch den Körper hindurch. So ist jede freie Fläche im Lauf der Drehung irgendwann
// erreichbar: oben und an den Seiten über die Kamera, unten über das Schiff. Das Spiel kann sich nicht festfahren.
//
// Ereignisse (game.step / game.launch):
//   { type: 'launch', ship, slot }        Schiff fliegt in Slot `slot`
//   { type: 'fire', ship, slot, shot }     Schuss auf shot.voxel
//   { type: 'hit', shot, voxel }          Voxel zerstört
//   { type: 'fizzle', shot }              Ziel war schon weg (mit einem Bruchstück abgesprengt) – Schuss verpufft
//   { type: 'break', crystal, voxels }    Riss-Kristall getroffen: `voxels` brechen als Bruchstück ab
//   { type: 'skip', color, count }        Farbe komplett weg: `count` Schiffe dieser Farbe aus der Warteschlange entfernt
//   { type: 'leave', ship, slot }         Munition leer, Schiff fliegt ab
//   { type: 'free', slot }                Slot wieder frei
//   { type: 'won' } · { type: 'lost' }

import { createRng } from './rng.js';
import { createAsteroid, removeVoxel, bestFace } from './asteroid.js';
import { createFleet } from './fleet.js';

export const TIMING = {
  arrive: 0.45,    // s vom Antippen bis schussbereit
  fireEvery: 0.11, // s zwischen zwei Schüssen eines Schiffs
  shot: 0.28,      // s Flugzeit eines Schusses
  leave: 0.7,      // s bis ein leeres Schiff den Slot freigibt
  stuck: 0.8,      // s ohne mögliches Ziel bei vollem Hangar, bis das Spiel verloren ist
};
/** Mindest-Skalarprodukt Flächennormale · Richtung zur Kamera, damit ein Voxel als „sichtbar“ gilt */
export const FACING = 0.2;
const AIM_JITTER = 0.3;   // etwas Zufall bei der Zielwahl, damit nicht alle Schiffe dasselbe Muster schießen
const CRYSTAL_PRIORITY = 1;   // ein sichtbarer Kristall wird vor allen anderen Zielen beschossen
/** s – findet ein Schiff so lange kein Ziel nach der Zielregel, nimmt es jedes freiliegende Ziel seiner Farbe (das
 *  Lenkgeschoss fliegt außen herum). Absicherung: Liegt eine Farbe frei, ist sie immer treffbar – kein Festfahren. */
export const PATIENCE = 2.5;

/**
 * @param {object} level  Eintrag aus LEVELS
 * @param {{ seed?: string | number }} [options]  Seed überschreibt level.seed (Battle: gemeinsamer Seed)
 */
export function createGame(level, { seed = level.seed } = {}) {
  const rng = createRng(seed);
  const asteroid = createAsteroid(level, rng);
  const columns = createFleet(asteroid, level, rng);
  const aimRng = createRng(`${seed}:aim`);   // eigener Strom: Zielwahl verändert die Level-Erzeugung nicht

  /** @type {(null | { ship, phase: 'arriving' | 'ready' | 'leaving', t: number, cooldown: number, inFlight: number })[]} */
  const slots = new Array(level.slots).fill(null);
  let shots = [];
  let nextShot = 0;
  let stuckFor = 0;
  let state = 'play';   // 'play' | 'won' | 'lost'

  /** Bestes Ziel: freiliegend, zur Kamera gewandt, beste Wertung zuerst – das erste mit freier Schussbahn gewinnt
   *  (die Sichtlinie wird nur für so viele Kandidaten wie nötig verfolgt). */
  /** Bestes Ziel samt Eintrittsfläche, oder null. `anyFace`: Zielregel aussetzen (nach PATIENCE ohne Ziel). */
  function findTarget(color, camera, from, anyFace = false) {
    let best = null;
    let bestScore = -Infinity;
    for (const v of asteroid.targets.get(color) ?? []) {
      if (!v.alive || v.reserved) continue;
      const face = bestFace(asteroid, v, [camera, from]);
      if (!face || (!anyFace && face.dot < FACING)) continue;
      const score = face.dot + aimRng() * AIM_JITTER + (v.crystal ? CRYSTAL_PRIORITY : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { voxel: v, normal: face.normal };
      }
    }
    return best;
  }

  const hasAnyTarget = color => {
    for (const v of asteroid.targets.get(color) ?? []) if (v.alive && !v.reserved) return true;
    return false;
  };
  const colorGone = color => asteroid.aliveByColor.get(color) === 0;
  const skipped = new Set();   // Farben, deren Schiffe schon aus der Warteschlange genommen wurden

  /** Kristall getroffen: sein Bruchstück bricht ab. Liegt ein weiterer Kristall darin, bricht dessen Stück mit ab. */
  function breakOff(crystal, events) {
    const voxels = crystal.chunk.filter(v => v.alive);
    for (const v of voxels) removeVoxel(asteroid, v);
    events.push({ type: 'break', crystal, voxels });
    for (const v of voxels) if (v.crystal) breakOff(v, events);
  }

  /** Farben ohne Voxel: ihre Schiffe werden nicht mehr gebraucht – raus aus der Warteschlange (Schiffe im Hangar
   *  fliegen von selbst ab, siehe step). Durch Bruchstücke bleibt sonst Munition übrig und der Hangar verstopft. */
  function skipFinishedColors(events) {
    for (const [color, alive] of asteroid.aliveByColor) {
      if (alive > 0 || skipped.has(color)) continue;
      skipped.add(color);
      let count = 0;
      for (const column of columns) {
        const keep = column.filter(ship => ship.color !== color);
        count += column.length - keep.length;
        column.splice(0, column.length, ...keep);
      }
      if (count) events.push({ type: 'skip', color, count });
    }
  }

  return {
    level,
    asteroid,
    columns,
    slots,
    get state() {
      return state;
    },
    get shots() {
      return shots;
    },
    get destroyed() {
      return asteroid.total - asteroid.alive;
    },

    /** Kann das vorderste Schiff dieser Spalte gestartet werden? 'ok' | 'full' | 'empty' | 'over' */
    canLaunch(column) {
      if (state !== 'play') return 'over';
      if (!columns[column]?.length) return 'empty';
      return slots.includes(null) ? 'ok' : 'full';
    },

    /** Startet das vorderste Schiff einer Spalte. @returns {object[]} Ereignisse (leer, wenn nicht möglich) */
    launch(column) {
      if (this.canLaunch(column) !== 'ok') return [];
      const slot = slots.indexOf(null);
      const ship = columns[column].shift();
      slots[slot] = { ship, phase: 'arriving', t: 0, cooldown: 0, inFlight: 0, idle: 0 };
      return [{ type: 'launch', ship, slot, column }];
    },

    /**
     * Zündet einen Kristall sofort (ohne Schiff) – für Test-Hilfen (Taste B) und später Booster wie eine Bombe.
     * @returns {object[]} Ereignisse (hit, break, skip …)
     */
    detonate(crystal) {
      const events = [];
      if (state !== 'play' || !crystal?.alive) return events;
      removeVoxel(asteroid, crystal);
      events.push({ type: 'hit', shot: null, voxel: crystal });
      breakOff(crystal, events);
      skipFinishedColors(events);
      return events;
    },

    /** Spielzeit vorspulen. @returns {object[]} Ereignisse in dieser Reihenfolge */
    step(dt, camera, origin) {
      const events = [];
      if (state !== 'play') return events;

      slots.forEach((entry, slot) => {
        if (!entry) return;
        entry.t += dt;
        if (entry.phase === 'arriving') {
          if (entry.t >= TIMING.arrive) Object.assign(entry, { phase: 'ready', t: 0 });
        } else if (entry.phase === 'ready') {
          entry.cooldown -= dt;
          entry.idle += dt;   // seit dem letzten Schuss (wird beim Schießen zurückgesetzt)
          if (entry.ship.ammo > 0 && entry.cooldown <= 0) {
            const target = findTarget(entry.ship.color, camera, origin?.(slot), entry.idle > PATIENCE);
            if (target) {
              const { voxel, normal } = target;
              voxel.reserved = true;
              entry.ship.ammo--;
              entry.inFlight++;
              entry.cooldown = TIMING.fireEvery;
              entry.idle = 0;
              const shot = { id: nextShot++, slot, voxel, normal, t: 0 };   // normal: Eintrittsfläche (Raster)
              shots.push(shot);
              events.push({ type: 'fire', ship: entry.ship, slot, shot });
            }
          }
          if ((entry.ship.ammo === 0 || colorGone(entry.ship.color)) && entry.inFlight === 0) {
            Object.assign(entry, { phase: 'leaving', t: 0 });
            events.push({ type: 'leave', ship: entry.ship, slot });
          }
        } else if (entry.t >= TIMING.leave) {
          slots[slot] = null;
          events.push({ type: 'free', slot });
        }
      });

      shots = shots.filter(shot => {
        shot.t += dt / TIMING.shot;
        if (shot.t < 1) return true;
        if (slots[shot.slot]) slots[shot.slot].inFlight--;
        if (!shot.voxel.alive) {
          events.push({ type: 'fizzle', shot });
          return false;
        }
        removeVoxel(asteroid, shot.voxel);
        events.push({ type: 'hit', shot, voxel: shot.voxel });
        if (shot.voxel.crystal) breakOff(shot.voxel, events);
        return false;
      });
      skipFinishedColors(events);

      if (asteroid.alive === 0) {
        state = 'won';
        events.push({ type: 'won' });
        return events;
      }

      // Verloren: alle Slots mit schussbereiten Schiffen belegt, und keines hat irgendwo ein freiliegendes Ziel
      const jammed = shots.length === 0 && slots.every(e => e && e.phase === 'ready' && e.ship.ammo > 0);
      stuckFor = jammed && !slots.some(e => hasAnyTarget(e.ship.color)) ? stuckFor + dt : 0;
      if (stuckFor > TIMING.stuck) {
        state = 'lost';
        events.push({ type: 'lost' });
      }
      return events;
    },
  };
}
