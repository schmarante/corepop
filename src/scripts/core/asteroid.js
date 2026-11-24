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
 *   - Dazu `level.crystals` Spreng-Blöcke (Riss-Kristalle) in einer inneren Kernschicht, Farbe BLAST – nur der
 *     Spreng-Flieger trifft sie, das Bruchstück reißt dann tief in den Kern (siehe placeCrystals, fleet.js, game.js).
 * Tiefe = Abstand zur Oberfläche in Flächen-Schritten (Breitensuche von außen), funktioniert für jede Form.
 *
 * Schicht-Nummern (`voxel.layer`): 0 = Haut, 1 … core.length = Kernschichten.
 * @returns {{ voxels: Voxel[], grid: Map<string, Voxel>, bounds: number, total: number, alive: number,
 *             aliveByColor: Map<string, number>, targets: Map<string, Set<Voxel>>, crystals: Voxel[] }}
 *   `targets`: lebende, freiliegende Voxel je Farbe – mögliche Ziele, laufend gepflegt (removeVoxel); so muss die
 *   Zielsuche nicht jedes Mal alle Voxel durchgehen.
 *   `grid` enthält nur lebende Voxel.
 * @typedef {{ i: number, x: number, y: number, z: number, color: string, layer: number, depth: number,
 *             alive: boolean, reserved: boolean, exposed: boolean, shade: number,
 *             crystal: boolean, baseColor?: string }} Voxel
 *   baseColor: nur bei Kristallen – Farbe der Schicht darunter (wird er entschärft, game.js, ist er ein normaler Block)
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
        const v = { i: voxels.length, x, y, z, color: '', layer: 0, depth: 0, alive: true, reserved: false, exposed: false, shade: rng(), crystal: false };
        voxels.push(v);
        grid.set(voxelKey(x, y, z), v);
      }
  const asteroid = { voxels, grid, bounds: B, total: voxels.length, alive: voxels.length, aliveByColor: new Map(), targets: new Map(), crystals: [] };

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
  const inCore = [];
  for (const v of voxels) {
    if (v.depth < skin || visibleFromOutside(asteroid, v)) v.color = model.skin(v.x, v.y, v.z);
    else inCore.push(v);
  }
  // Schichtgrenzen (erste Tiefe je Schicht): gleichmäßig über die Tiefe verteilt. Innen ist aber wenig Volumen – eine
  // innere Schicht, die weniger als MIN_LAYER Voxel je Farbe hätte, wächst nach außen (sonst Mini-Schiffe, fleet.js)
  const perDepth = new Array(coreDepths + 1).fill(0);
  for (const v of inCore) perDepth[v.depth - skin]++;
  const starts = core.map((_, k) => Math.floor((k * coreDepths) / core.length));
  const countFrom = k => {
    let n = 0;
    for (let d = starts[k]; d < (starts[k + 1] ?? perDepth.length); d++) n += perDepth[d];
    return n;
  };
  for (let k = core.length - 1; k > 0; k--)
    while (countFrom(k) < MIN_LAYER * core[k].length && starts[k] > starts[k - 1] + 1) starts[k]--;
  for (const v of inCore) {
    let k = core.length - 1;
    while (k > 0 && v.depth - skin < starts[k]) k--;
    v.layer = k + 1;
    const colors = core[k];
    // Spirale: Winkel um die Y-Achse, mit der Höhe verdreht; positiver Rest (unten wird der Winkel negativ)
    const angle = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5 + v.y * 0.06;
    const sector = Math.floor(angle * colors.length * 2 + k);
    v.color = colors[((sector % colors.length) + colors.length) % colors.length];
  }
  placeCrystals(asteroid, level, rng, model.crystals);
  for (const v of voxels) {
    asteroid.aliveByColor.set(v.color, (asteroid.aliveByColor.get(v.color) ?? 0) + 1);
    if (!asteroid.targets.has(v.color)) asteroid.targets.set(v.color, new Set());
    if (v.exposed) asteroid.targets.get(v.color).add(v);
  }
  return asteroid;
}

/** So viele Voxel bekommt jede Farbe einer Kernschicht mindestens (= MIN_AMMO in fleet.js: keine Mini-Schiffe) */
const MIN_LAYER = 50;

/** Sprengkraft eines Kristalls (Energie am Sprengpunkt) – wächst mit der Figur. Siehe blastReach. */
export const blastPower = level => 4 + level.radius * 0.15;
const BLAST_FALLOFF = 0.5;   // Energieverlust je Voxel Abstand (die Druckwelle verteilt sich)
const BLAST_ABSORB = 1;      // Energieverlust je Würfel, der in gerader Linie dazwischen liegt
const MASS_PER_DEPTH = 0.4;  // innen liegende Würfel sind schwerer (Masse 1 an der Oberfläche, +0,4 je Tiefenstufe)

/** Abstand zwischen zwei Kristallen mindestens (Voxel): keiner im Wirkungskreis des anderen, wenn alles dazwischen voll ist */
export const crystalSpacing = level => blastPower(level) / (BLAST_FALLOFF + BLAST_ABSORB) + 1;

/**
 * Sprengsatz: Welche lebenden Voxel reißt die Explosion eines Kristalls mit, und mit wie viel Restenergie?
 * Energie am Voxel = Sprengkraft − Abstand · BLAST_FALLOFF − (Würfel in gerader Linie dazwischen) · BLAST_ABSORB.
 * Bleibt etwas übrig, fliegt er weg; die Restenergie ist seine Bewegungsenergie. Innen liegende Würfel sind schwerer
 * (`mass`, nach Tiefe) und damit träger: Tempo = √(2 · Energie / Masse) (Darstellung, effects-view.js → shatter).
 * Durch freie Räume (Schacht, Außenseite) trägt die Druckwelle weit, durch dichte Würfel kaum – liegt der Kristall
 * dicht unter der Hülle, reißt er sie mit auf.
 * @returns {{ voxel: Voxel, energy: number, mass: number }[]}  ohne den Kristall selbst
 */
export function blastReach(asteroid, crystal, power) {
  const { grid } = asteroid;
  const reach = power / BLAST_FALLOFF;
  const start = voxelKey(crystal.x, crystal.y, crystal.z);
  const hits = [];
  for (const v of asteroid.voxels) {
    if (!v.alive || v === crystal) continue;
    const dx = v.x - crystal.x;
    const dy = v.y - crystal.y;
    const dz = v.z - crystal.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > reach) continue;
    let energy = power - d * BLAST_FALLOFF;
    // Würfel auf der Linie zählen: in halben Schritten, jedes Rasterfeld einmal, ohne Start und Ziel
    const end = voxelKey(v.x, v.y, v.z);
    const steps = Math.ceil(d * 2);
    let last = start;
    for (let k = 1; k < steps && energy > 0; k++) {
      const t = k / steps;
      const key = voxelKey(Math.round(crystal.x + dx * t), Math.round(crystal.y + dy * t), Math.round(crystal.z + dz * t));
      if (key === last || key === end) continue;
      last = key;
      if (grid.has(key)) energy -= BLAST_ABSORB;
    }
    if (energy > 0) hits.push({ voxel: v, energy, mass: 1 + v.depth * MASS_PER_DEPTH });
  }
  return hits;
}

/** Farbe der Spreng-Blöcke (Riss-Kristalle): nur Spreng-Flieger (Munition 1) treffen sie, normale Schiffe nie. */
export const BLAST = 'x';

/** Kristalle in die inneren Kernschichten (ab der zweiten): Erst wenn man sich bis dorthin vorgearbeitet hat, liegt
 *  der blinkende Würfel frei – seine Explosion (blastReach) reißt dann Kern und nahe Hülle auf. Mit etwas Abstand
 *  zueinander (crystalSpacing; erreicht die Druckwelle doch einen anderen, geht der mit hoch). Sie bekommen die
 *  Spreng-Farbe BLAST. */
function placeCrystals(asteroid, level, rng, fixed) {
  // Figur legt die Kristalle selbst fest (z. B. die Augen einer Maske): je Punkt der nächstgelegene Voxel – auch in der
  // Hülle, dann liegt er gleich frei und man muss ihn mit Spreng-Fliegern treffen
  if (fixed?.length) {
    for (const [px, py, pz] of fixed) {
      let best = null;
      let bestDistance = Infinity;
      for (const v of asteroid.voxels) {
        if (v.crystal) continue;
        const d = Math.hypot(v.x - px, v.y - py, v.z - pz);
        if (d < bestDistance) {
          bestDistance = d;
          best = v;
        }
      }
      if (!best) continue;
      best.crystal = true;
      best.baseColor = best.color;
      best.color = BLAST;
      asteroid.crystals.push(best);
    }
    return;
  }
  const count = level.crystals ?? 0;
  if (!count) return;
  const minLayer = Math.min(2, level.core.length);
  const r = crystalSpacing(level);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const candidates = asteroid.voxels.filter(v => v.layer >= minLayer);
  for (let n = 0; n < count; n++) {
    const free = candidates.filter(v => asteroid.crystals.every(c => dist(c, v) > r));
    if (!free.length) break;
    const crystal = rng.pick(free);
    crystal.crystal = true;
    crystal.baseColor = crystal.color;
    crystal.color = BLAST;   // eigene Farbe: nur Spreng-Flieger treffen ihn
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
 * Liegt vor der Fläche `n` von `v` in gerader Linie nichts mehr bis nach draußen? Nur dann ist der Voxel über diese
 * Fläche treffbar („ganz außen“ – wie der erste Pixel einer Reihe). Wände eines Lochs zählen so nicht: Ihre Seitenfläche
 * schaut auf die gegenüberliegende Wand. Man muss Schicht für Schicht abtragen. Festfahren ist ausgeschlossen: Der
 * äußerste Voxel in jeder Achsenrichtung ist immer treffbar.
 */
export function clearRay({ grid, bounds }, v, [dx, dy, dz]) {
  for (let k = 1; ; k++) {
    const x = v.x + dx * k;
    const y = v.y + dy * k;
    const z = v.z + dz * k;
    if (Math.abs(x) > bounds || Math.abs(y) > bounds || Math.abs(z) > bounds) return true;
    if (grid.has(voxelKey(x, y, z))) return false;
  }
}

/** Ist `v` überhaupt treffbar (irgendeine freie Fläche mit freier Linie nach draußen)? */
export const hittable = (asteroid, v) => openNormals(asteroid, v).some(n => clearRay(asteroid, v, n));

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
