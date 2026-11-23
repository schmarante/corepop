// Darstellung des Voxel-Körpers: ein InstancedMesh aus abgerundeten, glänzenden Candy-Würfeln.
// Aufbau: tilt (Neigung + Taumeln + Schweben, „fliegt durchs All“) → spin (Drehung um Y: Eigendrehung + Ziehen).
// Das Taumeln überlagert langsame Schwingungen mit krummen Frequenzen – es wiederholt sich nie sichtbar. Sichtbarkeit,
// Schussbahn und Bruchstücke rechnen über die Welt-Matrix automatisch mit.
//
// Übergänge (nichts poppt): der Körper wächst beim Laden hinein und schrumpft beim Levelwechsel heraus; ein
// getroffener Voxel blitzt hell auf und schrumpft weg.
// Leistung: Nur von außen sichtbare Voxel werden gezeichnet (auch schräg sichtbare an Stufen). Ein innerer Voxel
// kommt dazu, sobald ein Nachbar verschwindet – während dieser noch wegschrumpft und ihn verdeckt.
// Spezial-Würfel (Riss-Kristalle, sprengen ein Bruchstück ab): eigener Candy-Würfel in seiner Farbe, der pulsierend
// hell aufleuchtet und leicht atmet – deutlich als „besonders“ erkennbar, die Farbe bleibt aber lesbar.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../core/colors.js';
import { NEIGHBORS_26, visibleFromOutside, voxelKey } from '../core/asteroid.js';
import { easeInCubic, easeOutBack } from './easing.js';
import { attachVoxelAo, withVoxelAo } from './voxel-ao.js';

const TILT = 0.35;
// Taumeln: [Amplitude (rad bzw. Welteinheiten), Frequenz (rad/s), Phase] – mehrere Wellen je Achse überlagert
const TUMBLE_X = [[0.28, 0.21, 0], [0.1, 0.53, 2.1]];
const TUMBLE_Z = [[0.22, 0.17, 1.3], [0.08, 0.41, 0.4]];
const SWAY_X = [[0.35, 0.13, 0.7]];
const SWAY_Y = [[0.25, 0.19, 2.6]];
const waves = (list, t) => list.reduce((sum, [amp, freq, phase]) => sum + amp * Math.sin(t * freq + phase), 0);
const GAP = 1;           // Würfel liegen bündig aneinander – die gerundeten Kanten ergeben feine Rillen
const BEVEL = 0.16;      // Rundung der Kanten (Anteil der Voxelgröße)
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const PULSE = 5;         // rad/s – Puls der Spezial-Würfel
const PULSE_WHITE = 0.55; // Anteil Weiß auf dem Höhepunkt des Pulses
const SHRINK = 0.18;     // s – getroffener Voxel blitzt auf und schrumpft weg
const FLASH = 0.6;       // Anteil Weiß beim Aufblitzen
const APPEAR = 0.7;      // s – Körper wächst beim Laden hinein
const VANISH = 0.35;     // s – … und schrumpft beim Levelwechsel heraus
const WHITE = new THREE.Color(0xffffff);

/** Grundfarbe eines Voxels (leichte Helligkeitsvariation aus dem Seed) */
export const voxelColor = (v, out = new THREE.Color()) => out.setHex(COLORS[v.color]).multiplyScalar(0.92 + v.shade * 0.12);

/** Glänzendes Candy-Material (Umgebungslicht kommt aus stage.js) */
export const candyMaterial = (options = {}) => new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0, ...options });

/** Geometrie eines Candy-Würfels der Kantenlänge `size` */
export const candyBox = size => new RoundedBoxGeometry(size * GAP, size * GAP, size * GAP, 2, size * BEVEL);

export function createAsteroidView(scene, asteroid, level) {
  const size = Math.min(1, 3.6 / level.radius);   // Voxelgröße: größere Körper bleiben gleich groß im Bild
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  const spin = new THREE.Group();
  tilt.add(spin);
  tilt.scale.setScalar(0.001);
  scene.add(tilt);

  const mesh = new THREE.InstancedMesh(candyBox(size), withVoxelAo(candyMaterial(), size * GAP), asteroid.voxels.length);
  const ao = attachVoxelAo(mesh, asteroid);   // Mulden, Krater und Stufen dunkler (voxel-ao.js)
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const place = v => matrix.makeTranslation(v.x * size, v.y * size, v.z * size);
  /** Voxel-Index → wird gezeichnet */
  const shown = new Uint8Array(asteroid.voxels.length);
  for (const v of asteroid.voxels) {
    const visible = v.alive && !v.crystal && visibleFromOutside(asteroid, v);
    shown[v.i] = visible ? 1 : 0;
    mesh.setMatrixAt(v.i, visible ? place(v) : HIDDEN);
    mesh.setColorAt(v.i, voxelColor(v, color));
  }
  spin.add(mesh);

  /** Nachbarn (auch diagonal), die jetzt von außen sichtbar sind, ab sofort zeichnen */
  function revealAround(v) {
    let changed = false;
    for (const [dx, dy, dz] of NEIGHBORS_26) {
      const n = asteroid.grid.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
      if (!n || shown[n.i] || n.crystal) continue;
      shown[n.i] = 1;
      mesh.setMatrixAt(n.i, place(n));
      changed = true;
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  }

  /** voxel.i → { group, gem, base, dying? } – gem = der pulsierende Würfel */
  const crystals = new Map();
  for (const v of asteroid.crystals) {
    if (!v.alive) continue;
    const base = new THREE.Color(COLORS[v.color]);
    const gem = new THREE.Mesh(mesh.geometry, candyMaterial({ color: base, emissive: base, roughness: 0.2 }));
    const group = new THREE.Group();
    group.add(gem);
    group.position.set(v.x * size, v.y * size, v.z * size);
    spin.add(group);
    crystals.set(v.i, { group, gem, base });
  }

  const radius = Math.max(...asteroid.voxels.map(v => Math.hypot(v.x, v.y, v.z)));   // in Voxeln
  let time = Math.random() * 100;   // Startpunkt im Taumeln – nur Optik, beeinflusst die Spiellogik nicht direkt
  let baseY = 0;
  let appear = 0;          // s seit dem Laden
  let vanish = null;       // s seit Beginn des Herausschrumpfens (null = bleibt)
  /** voxel.i → s seit dem Treffer (Voxel, die gerade aufblitzen und wegschrumpfen) */
  const dying = new Map();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  const cameraLocal = new THREE.Vector3();
  const quaternionWorld = new THREE.Quaternion();

  function removeCrystal(i) {
    const c = crystals.get(i);
    spin.remove(c.group);
    c.gem.material.dispose();
    crystals.delete(i);
  }

  return {
    size,
    spin,
    setY(y) {
      baseY = y;
    },
    rotate(radians) {
      spin.rotation.y += radians;
    },
    /** true, sobald das Herausschrumpfen fertig ist (dann dispose) */
    get gone() {
      return vanish !== null && vanish >= VANISH;
    },
    vanish() {
      vanish ??= 0;
    },
    update(dt) {
      time += dt;
      appear += dt;
      const grow = vanish === null ? easeOutBack(appear / APPEAR) : 1 - easeInCubic((vanish += dt) / VANISH);
      tilt.scale.setScalar(Math.max(0.001, grow));
      tilt.rotation.set(TILT + waves(TUMBLE_X, time), 0, waves(TUMBLE_Z, time));
      tilt.position.set(waves(SWAY_X, time), baseY + waves(SWAY_Y, time), 0);

      if (dying.size) {
        for (const [i, t] of dying) {
          const v = asteroid.voxels[i];
          const p = (t + dt) / SHRINK;
          if (p >= 1) {
            mesh.setMatrixAt(i, HIDDEN);
            dying.delete(i);
            continue;
          }
          dying.set(i, t + dt);
          // erst kurz aufblähen und weiß aufblitzen, dann zusammenschrumpfen
          const k = p < 0.25 ? 1 + p * 0.5 : 1.125 * (1 - easeInCubic((p - 0.25) / 0.75));
          mesh.setMatrixAt(i, matrix.compose(position.set(v.x * size, v.y * size, v.z * size), quaternion, scaleVec.setScalar(Math.max(0.001, k))));
          mesh.setColorAt(i, voxelColor(v, color).lerp(WHITE, FLASH * (1 - p)));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }

      const pulse = 0.5 + 0.5 * Math.sin(time * PULSE);
      for (const [i, c] of crystals) {
        if (c.dying !== undefined) {
          c.dying += dt;
          c.group.scale.setScalar(Math.max(0.001, 1 - easeInCubic(c.dying / SHRINK)));
          if (c.dying >= SHRINK) removeCrystal(i);
          continue;
        }
        c.gem.scale.setScalar(0.96 + pulse * 0.1);
        c.gem.material.color.copy(c.base).lerp(WHITE, pulse * PULSE_WHITE);
        c.gem.material.emissiveIntensity = 0.15 + pulse * 0.9;
      }
    },
    /** Hülle des Körpers in Weltkoordinaten (Mittelpunkt + Radius) – Bruchstücke fliegen außen herum */
    bounds() {
      tilt.updateMatrixWorld(true);
      return { center: spin.getWorldPosition(new THREE.Vector3()), radius: (radius + 0.5) * size * tilt.scale.x };
    },
    /** Welt-Matrix des Voxel-Rasters (für Bruchstücke, die sich lösen) */
    get matrixWorld() {
      tilt.updateMatrixWorld(true);
      return spin.matrixWorld;
    },
    /** Weltposition eines Voxels */
    worldPosition(v, out = new THREE.Vector3()) {
      return spin.localToWorld(out.set(v.x * size, v.y * size, v.z * size));
    },
    /** Richtung im Voxel-Raster (z. B. Flächennormale) → Weltrichtung */
    normalToWorld([x, y, z], out = new THREE.Vector3()) {
      tilt.updateMatrixWorld(true);
      return out.set(x, y, z).applyQuaternion(spin.getWorldQuaternion(quaternionWorld));
    },
    /** Weltpunkt → Voxel-Raster (z. B. Schiffsposition für die Schussbahn) */
    toGrid(world, out = new THREE.Vector3()) {
      tilt.updateMatrixWorld(true);
      return spin.worldToLocal(out.copy(world)).divideScalar(size);
    },
    /** Kameraposition im Voxel-Raster – das braucht die Spiellogik für die Sichtbarkeit */
    cameraInGrid(camera) {
      tilt.updateMatrixWorld(true);
      return spin.worldToLocal(cameraLocal.copy(camera.position)).divideScalar(size);
    },
    /**
     * Voxel verschwindet. Standard: blitzt auf und schrumpft weg (Treffer).
     * `detach`: sofort ausblenden – nur wenn eine Kopie an derselben Stelle übernimmt (Bruchstück, effects-view).
     * Danach freiliegende Nachbarn zeigen (die Spiellogik hat sie schon als freiliegend markiert).
     */
    remove(v, { detach = false } = {}) {
      if (detach) {
        mesh.setMatrixAt(v.i, HIDDEN);
        mesh.instanceMatrix.needsUpdate = true;
        dying.delete(v.i);
        if (crystals.has(v.i)) removeCrystal(v.i);
      } else if (crystals.has(v.i)) crystals.get(v.i).dying = 0;
      else if (shown[v.i]) dying.set(v.i, 0);
      revealAround(v);
      ao.refresh(v);
    },
    dispose() {
      for (const { gem } of crystals.values()) gem.material.dispose();
      scene.remove(tilt);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}
