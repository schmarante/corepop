// Die Schiffe eines Levels: Pro Farbe entspricht die Munition exakt der Voxelanzahl. Die Voxel werden von außen nach
// innen in Pakete geschnitten und nach Schicht sortiert auf die Spalten verteilt.
//
// Schwierigkeit: `level.shuffle` (0 … 1) mischt die Reihenfolge. Bei 0 steht fast immer vorn, was gerade freiliegt –
// blindes Antippen reicht. Je höher, desto öfter stehen Schiffe für tiefe Kernfarben schon vorn: Startet man sie zu
// früh, blockieren sie einen Hangarplatz, bis ihre Farbe freiliegt. Man muss also hinschauen, welche Farben gerade
// erreichbar sind. (Lösbarkeit prüft der schlaue Bot in src/scripts/core/simulate.js.)

import { BLAST } from './asteroid.js';

/** Schiffsklassen: so viel Munition passt hinein. Ein großes Schiff in einer Farbe, die gerade kaum freiliegt, schießt
 *  das Wenige weg und blockiert dann lange seinen Hangarplatz – ein Fehlgriff kostet. */
export const SHIP_CLASSES = [20, 50, 100, 250];

/** Gewichte der Klassen, falls ein Level keine angibt */
const DEFAULT_MIX = { 20: 2, 50: 1 };

/** @returns {Ship[][]} Spalten, jeweils vorderstes Schiff zuerst
 *  @typedef {{ id: number, color: string, ammo: number, capacity: number, special?: 'bomber' }} Ship
 *    capacity: Klasse (20/50/100/250); ammo ≤ capacity – das letzte Schiff einer Farbe trägt den Rest.
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
    const order = list.map(v => ({ layer: v.layer, r: rng() })).sort((a, b) => a.layer - b.layer || a.r - b.r);
    for (let k = 0; k < order.length; ) {
      const ammo = Math.min(pickClass(), order.length - k);
      const capacity = SHIP_CLASSES.find(c => c >= ammo);   // Rest-Schiff: kleinste Klasse, in die er passt
      const depth = order.slice(k, k + ammo).reduce((sum, v) => sum + v.layer, 0) / ammo;
      packs.push({ color, ammo, capacity, sortKey: depth + rng() * (1.2 + (level.shuffle ?? 0) * spread) });
      k += ammo;
    }
  }
  packs.sort((a, b) => a.sortKey - b.sortKey);
  const columns = Array.from({ length: level.columns }, () => []);
  packs.forEach(({ color, ammo, capacity, special }, id) =>
    columns[id % level.columns].push(special ? { id, color, ammo, capacity, special } : { id, color, ammo, capacity }),
  );
  return columns;
}
