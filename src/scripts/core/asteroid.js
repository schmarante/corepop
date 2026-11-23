// Der Voxel-Körper als reine Daten: Voxel auf ganzzahligen Koordinaten, Haut + Kernschichten, Freiliegen, Kristalle.
// Keine Grafik – die Darstellung (render/asteroid-view.js) liest nur von hier.
import { MODELS } from './models/index.js';

/** Die sechs Flächennormalen eines Voxels */
export const DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

export const voxelKey = (x, y, z) => `${x},${y},${z}`;

/** Alle 26 Nachbarn (auch diagonal) – für „von außen sichtbar“: an Stufen sieht man schräg auf Voxel, die keine
 *  freie Fläche haben. Haut und Darstellung richten sich danach, das Freiliegen (Schießen) nach den 6 Flächen. */
export const NEIGHBORS_26 = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++) if (dx || dy || dz) NEIGHBORS_26.push([dx, dy, dz]);

/** Ist `v` von außen zu sehen (irgendein Nachbar inkl. diagonaler leer)? */
export const visibleFromOutside = ({ grid }, v) => NEIGHBORS_26.some(([dx, dy, dz]) => !grid.has(voxelKey(v.x + dx, v.y + dy, v.z + dz)));

/**
 * Baut den Voxel-Körper eines Levels – „wie ein Lolli“:
 *   - Die Figur (level.model, siehe models/) bestimmt Form und Außenhaut: die äußersten `level.skin` Voxel
 *     (Tiefe 0 … skin−1) plus alles, was man von außen schräg sieht (Stufen), bekommen die Hautfarbe der Figur
 *     → man erkennt das Objekt, und kein Kern blitzt durch.
 *   - Darunter liegt der bunte Kern: `level.core` = Schichten von außen nach innen, gleichmäßig auf die restliche
 *     Tiefe verteilt; mehrere Farben einer Schicht drehen sich als Spirale um die Y-Achse.
 *   - Dazu `level.crystals` Spreng-Blöcke (Riss-Kristalle) in der ersten Kernschicht, Farbe BLAST – nur der
 *     Spreng-Flieger trifft sie (siehe placeCrystals, fleet.js, game.js).
 * Tiefe = Abstand zur Oberfläche in Flächen-Schritten (Breitensuche von außen), funktioniert für jede Form.
 *
 * Schicht-Nummern (`voxel.layer`): 0 = Haut, 1 … core.length = Kernschichten.
 * @returns {{ voxels: Voxel[], grid: Map<string, Voxel>, total: number, alive: number,
 *             aliveByColor: Map<string, number>, targets: Map<string, Set<Voxel>>, crystals: Voxel[] }}
 *   `targets`: lebende, freiliegende Voxel je Farbe – mögliche Ziele, laufend gepflegt (removeVoxel); so muss die
 *   Zielsuche nicht jedes Mal alle Voxel durchgehen.
 *   `grid` enthält nur lebende Voxel.
 * @typedef {{ i: number, x: number, y: number, z: number, color: string, layer: number, depth: number,
 *             alive: boolean, reserved: boolean, exposed: boolean, shade: number,
 *             crystal: boolean, chunk: Voxel[] | null }} Voxel
 *   chunk: nur bei Kristallen – die Voxel, die mit ihm abbrechen (ohne ihn selbst)
 */
export function createAsteroid(level, rng) {
  const { build } = MODELS[level.model.type];
  const model = build({ radius: level.radius, ...level.model }, rng);
  const voxels = [];
  const grid = new Map();
  const B = model.bounds;
  for (let x = -B; x <= B; x++)
    for (let y = -B; y <= B; y++)
      for (let z = -B; z <= B; z++) {
        if (!model.solid(x, y, z)) continue;
        // shade: kleine Helligkeitsvariation für die Darstellung – aus dem Seed, damit alle Geräte gleich aussehen
        const v = { i: voxels.length, x, y, z, color: '', layer: 0, depth: 0, alive: true, reserved: false, exposed: false, shade: rng(), crystal: false, chunk: null };
        voxels.push(v);
        grid.set(voxelKey(x, y, z), v);
      }
  const asteroid = { voxels, grid, total: voxels.length, alive: voxels.length, aliveByColor: new Map(), targets: new Map(), crystals: [] };

  // Tiefe per Breitensuche von der Oberfläche nach innen
  for (const v of voxels) {
    v.depth = -1;
    v.exposed = openNormals(asteroid, v).length > 0;
  }
  let frontier = voxels.filter(v => v.exposed);
  for (const v of frontier) v.depth = 0;
  let maxDepth = 0;
  while (frontier.length) {
    const next = [];
    for (const v of frontier)
      for (const [dx, dy, dz] of DIRS) {
        const n = grid.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
        if (n && n.depth < 0) {
          n.depth = v.depth + 1;
          maxDepth = Math.max(maxDepth, n.depth);
          next.push(n);
        }
      }
    frontier = next;
  }

  const skin = level.skin ?? 1;
  const { core } = level;
  const coreDepths = Math.max(1, maxDepth - skin + 1);   // so viele Tiefenstufen teilen sich die Kernschichten
  for (const v of voxels) {
    if (v.depth < skin || visibleFromOutside(asteroid, v)) {
      v.color = model.skin(v.x, v.y, v.z);
      continue;
    }
    const k = Math.min(core.length - 1, Math.floor(((v.depth - skin) * core.length) / coreDepths));
    v.layer = k + 1;
    const colors = core[k];
    // Spirale: Winkel um die Y-Achse, mit der Höhe verdreht; positiver Rest (unten wird der Winkel negativ)
    const angle = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5 + v.y * 0.06;
    const sector = Math.floor(angle * colors.length * 2 + k);
    v.color = colors[((sector % colors.length) + colors.length) % colors.length];
  }
  placeCrystals(asteroid, level, rng);
  for (const v of voxels) {
    asteroid.aliveByColor.set(v.color, (asteroid.aliveByColor.get(v.color) ?? 0) + 1);
    if (!asteroid.targets.has(v.color)) asteroid.targets.set(v.color, new Set());
    if (v.exposed) asteroid.targets.get(v.color).add(v);
  }
  return asteroid;
}

/** Radius des Bruchstücks um einen Kristall (in Voxeln) – wächst leicht mit dem Asteroiden */
export const chunkRadius = level => 1.6 + level.radius * 0.15;

/** Farbe der Spreng-Blöcke (Riss-Kristalle): nur Spreng-Flieger (Munition 1) treffen sie, normale Schiffe nie. */
export const BLAST = 'x';

/** Kristalle in die erste Kernschicht (direkt unter der Haut), weit genug auseinander, dass sich ihre Bruchstücke
 *  nicht überlappen. Sie bekommen die Spreng-Farbe BLAST. */
function placeCrystals(asteroid, level, rng) {
  const count = level.crystals ?? 0;
  if (!count) return;
  const layer = 1;
  const r = chunkRadius(level);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const candidates = asteroid.voxels.filter(v => v.layer === layer);
  for (let n = 0; n < count; n++) {
    const free = candidates.filter(v => asteroid.crystals.every(c => dist(c, v) > 2 * r + 1));
    if (!free.length) break;
    const crystal = rng.pick(free);
    crystal.crystal = true;
    crystal.color = BLAST;   // eigene Farbe: nur Spreng-Flieger treffen ihn
    crystal.chunk = asteroid.voxels.filter(v => v !== crystal && dist(crystal, v) <= r);
    asteroid.crystals.push(crystal);
  }
}

/** Normalen der Flächen von `v`, vor denen kein Voxel liegt */
export function openNormals({ grid }, v) {
  return DIRS.filter(([dx, dy, dz]) => !grid.has(voxelKey(v.x + dx, v.y + dy, v.z + dz)));
}

/** Entfernt einen Voxel; seine Nachbarn liegen danach frei. */
export function removeVoxel(asteroid, v) {
  if (!v.alive) return;
  v.alive = false;
  asteroid.grid.delete(voxelKey(v.x, v.y, v.z));
  asteroid.alive--;
  asteroid.aliveByColor.set(v.color, asteroid.aliveByColor.get(v.color) - 1);
  asteroid.targets.get(v.color).delete(v);
  for (const [dx, dy, dz] of DIRS) {
    const n = asteroid.grid.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
    if (n && !n.exposed) {
      n.exposed = true;
      asteroid.targets.get(n.color).add(n);
    }
  }
}

/**
 * Beste freie Fläche von `v` in Richtung eines der Punkte (z. B. Kamera und Schiff): die Normale mit dem größten
 * Skalarprodukt zur Richtung auf einen der Punkte. @returns {{ normal: number[], dot: number } | null}
 */
export function bestFace(asteroid, v, points) {
  let best = null;
  for (const n of openNormals(asteroid, v))
    for (const p of points) {
      if (!p) continue;
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const dz = p.z - v.z;
      const d = (n[0] * dx + n[1] * dy + n[2] * dz) / (Math.hypot(dx, dy, dz) || 1);
      if (!best || d > best.dot) best = { normal: n, dot: d };
    }
  return best;
}

/**
 * Wie stark zeigt `v` zur Kamera? Bestes Skalarprodukt aus freier Flächennormale und Richtung zur Kamera
 * (-1 … 1, -1 auch wenn keine Fläche frei ist). `camera` ist die Kameraposition im Asteroiden-Raster
 * (lokale Koordinaten, 1 = ein Voxel) – so braucht die Logik keine Grafik-Bibliothek.
 */
export function facing(asteroid, v, camera) {
  const cx = camera.x - v.x;
  const cy = camera.y - v.y;
  const cz = camera.z - v.z;
  const len = Math.hypot(cx, cy, cz) || 1;
  let best = -1;
  for (const [dx, dy, dz] of openNormals(asteroid, v)) best = Math.max(best, (dx * cx + dy * cy + dz * cz) / len);
  return best;
}
