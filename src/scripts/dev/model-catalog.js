// Dev-Übersicht der Modelle: welche Figuren gibt es, mit welcher Level-Einstellung werden sie gezeigt, und
// Kennzahlen dazu. Läuft beim Bauen (Astro, Kennzahlen) und im Browser (3D-Vorschau) – reine Daten aus core/.
import { MODELS } from '../core/models/index.js';
import { LEVELS } from '../core/levels.js';
import { createAsteroid, removeVoxel } from '../core/asteroid.js';
import { createFleet } from '../core/fleet.js';
import { createRng } from '../core/rng.js';

/** Einstellung für Modelle, die in keinem Level stecken – damit man sie trotzdem sieht */
const PREVIEW_DEFAULTS = { radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], slots: 4, ships: { 50: 2, 100: 1 }, crystals: 2 };

/** @returns {{ id: string, levelIndex: number | null, level: object }[]} je Modell ein Eintrag */
export function modelCatalog() {
  return Object.keys(MODELS).map(id => {
    const levelIndex = LEVELS.findIndex(l => l.model.type === id);
    const level = levelIndex >= 0 ? LEVELS[levelIndex] : { ...PREVIEW_DEFAULTS, model: { type: id }, seed: `preview-${id}` };
    return { id, levelIndex: levelIndex >= 0 ? levelIndex : null, level };
  });
}

/** Körper eines Eintrags bauen – mit `cut` ist die vordere Hälfte (z > 0) entfernt: Blick auf die Lolli-Schichten */
export function buildBody(level, { cut = false } = {}) {
  const rng = createRng(level.seed);
  const body = createAsteroid(level, rng);
  const ships = createFleet(body, level, rng).flat().length;
  if (cut) for (const v of body.voxels) if (v.z > 0) removeVoxel(body, v);
  return { body, ships };
}

/** Kennzahlen eines Eintrags */
export function modelStats(level) {
  const { body, ships } = buildBody(level);
  const count = filter => {
    const out = {};
    for (const v of body.voxels) if (filter(v)) out[v.color] = (out[v.color] ?? 0) + 1;
    return out;
  };
  return {
    total: body.total,
    ships,
    skin: count(v => v.layer === 0),
    core: level.core.map((_, k) => count(v => v.layer === k + 1)),
    crystals: body.crystals.length,
    diameter: 2 * Math.ceil(Math.max(...body.voxels.map(v => Math.hypot(v.x, v.y, v.z)))) + 1,
  };
}
