// Die Schiffe eines Levels: Pro Farbe gibt es Munition für alle Voxel plus eine Reserve (`level.reserve`, Anteil;
// Farben mit weniger als MIN_AMMO Voxeln bekommen ein zweites Schiff), denn aussortierte Schiffe sind weg (game.slide).
// Die Reserve-Schüsse mischen sich in alle Tiefen. Die Voxel werden von außen nach innen in Pakete geschnitten und nach Schicht sortiert auf die Spalten verteilt – eine Spalte je Hangar-Plattform
// (das vorderste Schiff einer Spalte fliegt nur auf die Plattform darüber, siehe game.js).
//
// Schwierigkeit: `level.shuffle` (0 … 1) mischt die Reihenfolge. Bei 0 steht fast immer vorn, was gerade freiliegt –
// blindes Antippen reicht. Je höher, desto öfter stehen Schiffe für tiefe Kernfarben schon vorn: Startet man sie zu
// früh, blockieren sie einen Hangarplatz, bis ihre Farbe freiliegt. Man muss also hinschauen, welche Farben gerade
// erreichbar sind. (Lösbarkeit prüft der schlaue Bot in src/scripts/core/simulate.js.)

import { BLAST } from './asteroid.js';

/** Schiffsklassen: so viel Munition passt hinein. Ein großes Schiff in einer Farbe, die gerade kaum freiliegt, schießt
 *  das Wenige weg und blockiert dann lange seinen Hangarplatz – ein Fehlgriff kostet. */
export const SHIP_CLASSES = [50, 100, 250];
/** Kleiner lohnt kein Flieger: ein Rest unter MIN_AMMO fliegt im vorigen Schiff derselben Farbe mit */
export const MIN_AMMO = 50;

/** Reserve je Farbe, falls ein Level keine angibt (Anteil der Voxelzahl) */
export const DEFAULT_RESERVE = 0.25;

/** Gewichte der Klassen, falls ein Level keine angibt */
const DEFAULT_MIX = { 50: 2, 100: 1 };

/** @returns {Ship[][]} Spalten, jeweils vorderstes Schiff zuerst
 *  @typedef {{ id: number, color: string, ammo: number, capacity: number, special?: 'bomber' }} Ship
 *    capacity: Klasse (50/100/250) – kleinste, in die die Munition passt (das letzte Schiff einer Farbe trägt
 *    den Rest mit, höchstens bis 250 + MIN_AMMO − 1).
 *    special 'bomber': Spreng-Flieger (Farbe BLAST, 1 Bombe) – trifft nur Spreng-Blöcke */
export function createFleet(asteroid, level, rng) {
  const byColor = new Map();
  for (const v of asteroid.voxels) {
    if (!byColor.has(v.color)) byColor.set(v.color, []);
    byColor.get(v.color).push(v);
  }
  const mix = Object.entries(level.ships ?? DEFAULT_MIX).map(([capacity, weight]) => [Number(capacity), weight]);
  const totalWeight = mix.reduce((sum, [, w]) => sum + w, 0);
  const pickClass = () => {
    let r = rng() * totalWeight;
    for (const [capacity, weight] of mix) if ((r -= weight) < 0) return capacity;
    return mix.at(-1)[0];
  };
  const packs = [];
  const spread = Math.max(...asteroid.voxels.map(v => v.layer)) + 1;   // so weit kann ein Paket nach vorn rutschen
  for (const [color, list] of byColor) {
    if (color === BLAST) {
      // Spreng-Flieger: je Spreng-Block einer mit genau einer Bombe
      for (const v of list) packs.push({ color, ammo: 1, capacity: 1, special: 'bomber', sortKey: v.layer + rng() * (1.2 + (level.shuffle ?? 0) * spread) });
      continue;
    }
    const shuffleKey = () => rng() * (1.2 + (level.shuffle ?? 0) * spread);
    if (list.length < MIN_AMMO) {
      // kleine Farbe (Hautdetail): zwei gleiche Schiffe – eins darf man aussortieren
      const depth = list.reduce((sum, v) => sum + v.layer, 0) / list.length;
      for (let n = 0; n < 2; n++) packs.push({ color, ammo: list.length, capacity: SHIP_CLASSES[0], sortKey: depth + shuffleKey() });
      continue;
    }
    const order = list.map(v => ({ layer: v.layer, r: rng() }));
    // Reserve: zusätzliche Schüsse in der Tiefe zufälliger Voxel dieser Farbe
    const reserve = Math.ceil(list.length * (level.reserve ?? DEFAULT_RESERVE));
    for (let n = 0; n < reserve; n++) order.push({ layer: rng.pick(list).layer, r: rng() });
    order.sort((a, b) => a.layer - b.layer || a.r - b.r);
    for (let k = 0; k < order.length; ) {
      let ammo = Math.min(pickClass(), order.length - k);
      if (order.length - k - ammo < MIN_AMMO) ammo = order.length - k;   // kein Mini-Rest-Schiff
      const capacity = SHIP_CLASSES.find(c => c >= ammo) ?? SHIP_CLASSES.at(-1);
      const depth = order.slice(k, k + ammo).reduce((sum, v) => sum + v.layer, 0) / ammo;
      packs.push({ color, ammo, capacity, sortKey: depth + shuffleKey() });
      k += ammo;
    }
  }
  packs.sort((a, b) => a.sortKey - b.sortKey);
  const columns = Array.from({ length: level.slots }, () => []);
  packs.forEach(({ color, ammo, capacity, special }, id) =>
    columns[id % level.slots].push(special ? { id, color, ammo, capacity, special } : { id, color, ammo, capacity }),
  );
  return columns;
}
