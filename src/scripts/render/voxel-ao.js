// Ambient Occlusion für den Voxel-Körper, „gebacken“ statt als Bildschirm-Effekt (spart Akku):
// Für jede der 8 Ecken eines Voxels zählen wir die belegten Zellen rund um diese Ecke (die 7 anderen Zellen des
// 2×2×2-Blocks). Eine flache Oberfläche hat 3 davon (die Nachbarn in der Ebene) → hell; Mulden, Kraterränder und
// Stufen haben mehr → dunkler. Der Vertex-Shader verläuft die 8 Eckwerte trilinear über den Würfel, das Licht wird
// im Fragment-Shader damit abgedunkelt.
// Pro Voxel zwei Instanz-Attribute (aoA = Ecken 0–3, aoB = Ecken 4–7). Nach einem Treffer rechnen wir nur die
// Nachbarn neu (refresh). Die Werte liegen je Voxel vor (Quelle) und werden in den Instanz-Platz des Voxels kopiert –
// gezeichnet werden nur sichtbare Voxel, ihre Plätze vergibt asteroid-view (`slotOf`, `place`).
//
// Dazu Himmelslicht im großen Maßstab (aoSky, ein Wert je Voxel): Wie viel freien Raum sieht der Voxel? Strahlen in die
// 26 Richtungen, bis zu `range` Voxel weit – je mehr frei bleiben, desto heller. Eine flache Außenfläche ist voll hell,
// der Boden eines frisch gesprengten Kraters dunkel: Man sieht nicht sofort alle Farben innen, es wird heller, je
// weiter man aufräumt. Gerechnet über ein Byte-Feld der Belegung (schnell); nach einem Treffer wird die Umgebung als
// veraltet markiert und über mehrere Bilder nachgerechnet (SKY_BUDGET je Bild), jeder Voxel blendet weich über.
import * as THREE from 'three';
import { NEIGHBORS_26, voxelKey } from '../core/asteroid.js';

const FLAT = 3;          // belegte Zellen an einer Ecke einer flachen Oberfläche
const STRENGTH = 0.85;   // wie dunkel die tiefste Ecke wird (0 … 1)
const DIRECT = 0.75;     // Anteil, mit dem auch direktes Licht abgedunkelt wird (indirektes: voll)
const SKY_FLAT = 9 / 26;  // Anteil freier Richtungen einer flachen Außenfläche (= volle Helligkeit)
const SKY_MIN = 0.12;     // so dunkel wird es ganz innen
const SKY_DIRECT = 0.8;   // Anteil, mit dem auch direktes Licht abgedunkelt wird
const SKY_BUDGET = 160;   // so viele Voxel rechnet update() je Bild höchstens nach
const SKY_RATE = 5;       // 1/s – Überblenden auf den neuen Wert
const SKY_REACH = 0.8;    // Anteil von `range`: so weit um einen Treffer wird nachgerechnet

/** Ecke c (0 … 7) → Vorzeichen je Achse */
const CORNERS = Array.from({ length: 8 }, (_, c) => [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1]);

function cornerAo({ grid }, v, [sx, sy, sz]) {
  let count = 0;
  for (const dx of [0, sx])
    for (const dy of [0, sy])
      for (const dz of [0, sz]) if ((dx || dy || dz) && grid.has(voxelKey(v.x + dx, v.y + dy, v.z + dz))) count++;
  return 1 - (STRENGTH * Math.max(0, count - FLAT)) / (7 - FLAT);
}

/**
 * Hängt die AO-Attribute an die Geometrie des InstancedMesh. refresh(v) nach einem Treffer, update(dt) je Bild.
 * @param {{ range: number, visible: (i: number) => boolean }} options  range: Strahlenlänge fürs Himmelslicht (Voxel);
 *   visible: wird der Voxel gezeichnet? (nur die brauchen Himmelslicht)
 */
export function attachVoxelAo(mesh, asteroid, { range, visible, slotOf }) {
  const n = asteroid.voxels.length;
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const sky = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
  mesh.geometry.setAttribute('aoA', a);
  mesh.geometry.setAttribute('aoB', b);
  mesh.geometry.setAttribute('aoSky', sky);
  // Quelle je Voxel: 8 Ecken + Himmelslicht
  const corners = new Float32Array(n * 8);
  const skyValue = new Float32Array(n).fill(1);

  /** Werte von Voxel i in seinen Instanz-Platz s kopieren */
  const copy = (i, s) => {
    a.array.set(corners.subarray(i * 8, i * 8 + 4), s * 4);
    b.array.set(corners.subarray(i * 8 + 4, i * 8 + 8), s * 4);
    sky.array[s] = skyValue[i];
  };
  const write = v => {
    for (let c = 0; c < 8; c++) corners[v.i * 8 + c] = cornerAo(asteroid, v, CORNERS[c]);
    const s = slotOf(v.i);
    if (s >= 0) copy(v.i, s);
  };
  for (const v of asteroid.voxels) write(v);

  // Belegung als Byte-Feld (+ Voxel-Index je Feld) – Strahlen laufen hier statt über die Map der Spiellogik
  const B = asteroid.bounds;
  const W = 2 * B + 1;
  const solid = new Uint8Array(W * W * W);
  const cellVoxel = new Int32Array(W * W * W).fill(-1);
  const cell = (x, y, z) => ((x + B) * W + (y + B)) * W + (z + B);
  const inside = (x, y, z) => Math.abs(x) <= B && Math.abs(y) <= B && Math.abs(z) <= B;
  for (const v of asteroid.voxels) {
    cellVoxel[cell(v.x, v.y, v.z)] = v.i;
    if (v.alive) solid[cell(v.x, v.y, v.z)] = 1;
  }
  /** Himmelslicht: Anteil freier Strahlen (nach k Schritten getroffen zählt anteilig), flache Außenfläche = 1 */
  const skyOf = v => {
    let open = 0;
    for (const [dx, dy, dz] of NEIGHBORS_26) {
      let k = 1;
      for (; k <= range; k++) {
        const x = v.x + dx * k;
        const y = v.y + dy * k;
        const z = v.z + dz * k;
        if (!inside(x, y, z)) {
          k = range + 1;
          break;
        }
        if (solid[cell(x, y, z)]) break;
      }
      open += k > range ? 1 : (k - 1) / range;
    }
    const s = Math.min(1, open / NEIGHBORS_26.length / SKY_FLAT);
    return SKY_MIN + (1 - SKY_MIN) * s * s;
  };
  const target = new Float32Array(n).fill(1);
  const dirty = new Set();
  const fading = new Set();
  for (const v of asteroid.voxels) if (v.alive && visible(v.i)) skyValue[v.i] = target[v.i] = skyOf(v);

  return {
    /** Voxel i hat (neu) den Instanz-Platz s bekommen */
    place(i, s) {
      copy(i, s);
      a.needsUpdate = b.needsUpdate = sky.needsUpdate = true;
    },
    /** Voxel `v` ist weg: AO der lebenden Nachbarn neu, Himmelslicht der Umgebung als veraltet markieren */
    refresh(v) {
      for (const [dx, dy, dz] of NEIGHBORS_26) {
        const nb = asteroid.grid.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
        if (nb) write(nb);
      }
      a.needsUpdate = true;
      b.needsUpdate = true;
      solid[cell(v.x, v.y, v.z)] = 0;
      const r = Math.ceil(range * SKY_REACH);
      for (let x = v.x - r; x <= v.x + r; x++)
        for (let y = v.y - r; y <= v.y + r; y++)
          for (let z = v.z - r; z <= v.z + r; z++) {
            if (!inside(x, y, z)) continue;
            const c = cell(x, y, z);
            if (solid[c]) dirty.add(cellVoxel[c]);
          }
    },
    /** je Bild: veraltetes Himmelslicht nachrechnen (begrenzt) und weich überblenden */
    update(dt) {
      let budget = SKY_BUDGET;
      for (const i of dirty) {
        if (budget-- <= 0) break;
        dirty.delete(i);
        const v = asteroid.voxels[i];
        if (!v.alive || !visible(i)) continue;
        target[i] = skyOf(v);
        if (Math.abs(target[i] - skyValue[i]) > 0.005) fading.add(i);
      }
      if (!fading.size) return;
      const k = 1 - Math.exp(-SKY_RATE * dt);
      for (const i of fading) {
        skyValue[i] += (target[i] - skyValue[i]) * k;
        if (Math.abs(target[i] - skyValue[i]) < 0.005) {
          skyValue[i] = target[i];
          fading.delete(i);
        }
        const s = slotOf(i);
        if (s >= 0) sky.array[s] = skyValue[i];
      }
      sky.needsUpdate = true;
    },
  };
}

/**
 * Macht aus einem MeshStandardMaterial eines mit Voxel-AO (Ecken + Himmelslicht). `size` = Kantenlänge eines Voxels
 * (Geometrie zentriert, also Positionen −size/2 … +size/2).
 */
export function withVoxelAo(material, size) {
  material.onBeforeCompile = shader => {
    shader.uniforms.aoSize = { value: size };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aoA;
        attribute vec4 aoB;
        attribute float aoSky;
        uniform float aoSize;
        varying float vVoxelAo;
        varying float vVoxelSky;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 t = clamp(position / aoSize + 0.5, 0.0, 1.0);
          // Ecken: Bit 0 = x, Bit 1 = y, Bit 2 = z (wie CORNERS in voxel-ao.js)
          float x00 = mix(aoA.x, aoA.y, t.x);
          float x10 = mix(aoA.z, aoA.w, t.x);
          float x01 = mix(aoB.x, aoB.y, t.x);
          float x11 = mix(aoB.z, aoB.w, t.x);
          vVoxelAo = mix(mix(x00, x10, t.y), mix(x01, x11, t.y), t.z);
          vVoxelSky = aoSky;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vVoxelAo;\nvarying float vVoxelSky;`)
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vVoxelAo * vVoxelSky;
        reflectedLight.indirectSpecular *= vVoxelAo * vVoxelSky;
        reflectedLight.directDiffuse *= mix(1.0, vVoxelAo, ${DIRECT.toFixed(2)}) * mix(1.0, vVoxelSky, ${SKY_DIRECT.toFixed(2)});
        reflectedLight.directSpecular *= mix(1.0, vVoxelSky, ${SKY_DIRECT.toFixed(2)});`,
      );
  };
  material.customProgramCacheKey = () => 'voxel-ao-sky';
  return material;
}
