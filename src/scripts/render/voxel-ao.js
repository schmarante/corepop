// Ambient Occlusion für den Voxel-Körper, „gebacken“ statt als Bildschirm-Effekt (spart Akku):
// Für jede der 8 Ecken eines Voxels zählen wir die belegten Zellen rund um diese Ecke (die 7 anderen Zellen des
// 2×2×2-Blocks). Eine flache Oberfläche hat 3 davon (die Nachbarn in der Ebene) → hell; Mulden, Kraterränder und
// Stufen haben mehr → dunkler. Der Vertex-Shader verläuft die 8 Eckwerte trilinear über den Würfel, das Licht wird
// im Fragment-Shader damit abgedunkelt.
// Pro Voxel zwei Instanz-Attribute (aoA = Ecken 0–3, aoB = Ecken 4–7). Nach einem Treffer rechnen wir nur die
// Nachbarn neu (refresh).
import * as THREE from 'three';
import { NEIGHBORS_26, voxelKey } from '../core/asteroid.js';

const FLAT = 3;          // belegte Zellen an einer Ecke einer flachen Oberfläche
const STRENGTH = 0.85;   // wie dunkel die tiefste Ecke wird (0 … 1)
const DIRECT = 0.75;     // Anteil, mit dem auch direktes Licht abgedunkelt wird (indirektes: voll)

/** Ecke c (0 … 7) → Vorzeichen je Achse */
const CORNERS = Array.from({ length: 8 }, (_, c) => [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1]);

function cornerAo({ grid }, v, [sx, sy, sz]) {
  let count = 0;
  for (const dx of [0, sx])
    for (const dy of [0, sy])
      for (const dz of [0, sz]) if ((dx || dy || dz) && grid.has(voxelKey(v.x + dx, v.y + dy, v.z + dz))) count++;
  return 1 - (STRENGTH * Math.max(0, count - FLAT)) / (7 - FLAT);
}

/** Hängt die AO-Attribute an die Geometrie des InstancedMesh und liefert refresh(v) für Nachbarn eines Treffers */
export function attachVoxelAo(mesh, asteroid) {
  const n = asteroid.voxels.length;
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  mesh.geometry.setAttribute('aoA', a);
  mesh.geometry.setAttribute('aoB', b);

  const write = v => {
    for (let c = 0; c < 8; c++) (c < 4 ? a : b).array[v.i * 4 + (c % 4)] = cornerAo(asteroid, v, CORNERS[c]);
  };
  for (const v of asteroid.voxels) write(v);

  return {
    /** Voxel `v` ist weg: AO der lebenden Nachbarn neu berechnen */
    refresh(v) {
      for (const [dx, dy, dz] of NEIGHBORS_26) {
        const nb = asteroid.grid.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
        if (nb) write(nb);
      }
      a.needsUpdate = true;
      b.needsUpdate = true;
    },
  };
}

/**
 * Macht aus einem MeshStandardMaterial eines mit Voxel-AO. `size` = Kantenlänge eines Voxels (Geometrie zentriert,
 * also Positionen −size/2 … +size/2).
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
        uniform float aoSize;
        varying float vVoxelAo;`,
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
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vVoxelAo;`)
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vVoxelAo;
        reflectedLight.indirectSpecular *= vVoxelAo;
        reflectedLight.directDiffuse *= mix(1.0, vVoxelAo, ${DIRECT.toFixed(2)});`,
      );
  };
  material.customProgramCacheKey = () => 'voxel-ao';
  return material;
}
