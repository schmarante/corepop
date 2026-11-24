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
// hell aufleuchtet und leicht atmet – deutlich als „besonders“ erkennbar, die Farbe bleibt aber lesbar. Sie liegen in
// inneren Schichten; damit man sie trotzdem früh entdeckt (und den Spreng-Flieger behält), blinkt ein Leuchtfleck durch
// die Hülle, solange der Kristall auf der Seite zur Kamera liegt. Liegt er frei, bleibt nur ein Schein um ihn herum.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../core/colors.js';
import { DIRS, NEIGHBORS_26, visibleFromOutside, voxelKey } from '../core/asteroid.js';
import { easeInCubic, easeOutBack } from './easing.js';
import { attachVoxelAo, withVoxelAo } from './voxel-ao.js';
import { quality } from './quality.js';

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
const GLITCH_EVERY = [1, 2];   // s zwischen zwei Glitches (zufällig) – nur Boss-Level
const GLITCH_TIME = 0.22;        // s – so lange zuckt die Figur
const GLITCH_STEP = 0.055;       // s – je Schritt neue Versätze (ruckartig statt fließend)
const FLING_FRICTION = 2.2; // 1/s – wie schnell der Schwung nach dem Wischen ausläuft (nach ~1 s gut ein Zehntel)
const KICK_SPIN = 2.6;      // rad/s Drehschub je Einheit Drehmoment (Explosion, impulse)
const KICK_WOBBLE = 2.2;    // rad/s Kippschub je Einheit Drehmoment
const WOBBLE_SPRING = 14;   // 1/s² – wie stark das Kippen zurückfedert
const WOBBLE_DAMPING = 3.2; // 1/s – wie schnell das Nachwippen ausläuft
const FLING_MAX = 12;       // rad/s – mehr Schwung gibt ein Wisch nie
const RECOLOR = 0.45;     // s – Farbwechsel (Special): Aufblitzen und Übergang
const SHRINK = 0.18;     // s – getroffener Voxel blitzt auf und schrumpft weg
const FLASH = 0.6;       // Anteil Weiß beim Aufblitzen
const APPEAR = 0.7;      // s – Körper wächst beim Laden hinein
const VANISH = 0.35;     // s – … und schrumpft beim Levelwechsel heraus
const WHITE = new THREE.Color(0xffffff);
const GLOW_SIZE = 3.6;      // Voxel – Leuchtfleck eines Kristalls
const GLOW_BURIED = 1;      // Deckkraft des Flecks durch die Hülle (auf dem Höhepunkt des Pulses)
const GLOW_FREE = 0.35;     // … wenn der Kristall freiliegt
const GLOW_RATE = 6;        // 1/s – Überblenden

/** Weicher, runder Leuchtfleck (einmal erzeugt, von allen Kristallen geteilt) */
let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/** Grundfarbe eines Voxels (leichte Helligkeitsvariation aus dem Seed) */
export const voxelColor = (v, out = new THREE.Color()) => out.setHex(COLORS[v.color]).multiplyScalar(0.92 + v.shade * 0.12);

/** Glänzendes Candy-Material (Umgebungslicht kommt aus stage.js) */
export const candyMaterial = (options = {}) => new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0, ...options });

/** Geometrie eines Candy-Würfels der Kantenlänge `size` – Rundung je nach Grafik-Stufe (render/quality.js:
 *  2 Segmente = 300 Dreiecke, 1 Segment = 108) */
export const candyBox = size => new RoundedBoxGeometry(size * GAP, size * GAP, size * GAP, quality().segments, size * BEVEL);

export function createAsteroidView(scene, asteroid, level, { glitch = false } = {}) {
  const size = Math.min(1, 4 / level.radius);   // Voxelgröße: größere Körper bleiben gleich groß im Bild
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  const spin = new THREE.Group();
  tilt.add(spin);
  tilt.scale.setScalar(0.001);
  tilt.name = 'Figur';   // Namen nur für den Dev-Profiler
  scene.add(tilt);

  const mesh = new THREE.InstancedMesh(candyBox(size), withVoxelAo(candyMaterial(), size * GAP), asteroid.voxels.length);
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
  // Mulden, Krater und Stufen dunkler; Krater-Inneres sieht wenig Himmel (voxel-ao.js)
  const ao = attachVoxelAo(mesh, asteroid, { range: Math.round(4 + level.radius * 0.25), visible: i => shown[i] === 1 });
  mesh.name = 'Figur-Würfel';
  mesh.castShadow = true;      // Sonnenschatten (stage.js): Kraterränder und Erhebungen werfen Schatten auf die Figur
  mesh.receiveShadow = true;
  spin.add(mesh);

  // Glitch (Boss-Level): alle paar Sekunden zuckt die Figur kurz – springt ruckartig zur Seite, zwei Farbgeister
  // (Magenta, Türkis) flackern versetzt auf. Die Geister teilen sich Geometrie und Würfel-Lagen mit der Figur
  // (dieselbe instanceMatrix) und folgen ihrer Welt-Matrix mit einem Versatz quer zum Bild.
  const ghosts = glitch && !matchMedia('(prefers-reduced-motion: reduce)').matches
    ? [0xff2bd6, 0x2bd6ff].map(color => {
        const ghost = new THREE.InstancedMesh(mesh.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), asteroid.voxels.length);
        ghost.instanceMatrix = mesh.instanceMatrix;
        ghost.matrixAutoUpdate = false;
        ghost.matrixWorldAutoUpdate = false;   // Welt-Matrix setzen wir selbst (Figur + Versatz)
        ghost.name = 'Glitch-Geist';
        ghost.frustumCulled = false;
        ghost.visible = false;
        ghost.renderOrder = 3;
        scene.add(ghost);
        return ghost;
      })
    : [];
  let nextGlitch = GLITCH_EVERY[0] + Math.random() * (GLITCH_EVERY[1] - GLITCH_EVERY[0]);
  let glitchT = -1;   // s seit Beginn des Zuckens (-1 = ruhig)
  let glitchStep = -1;
  const glitchOffsets = [0, 0];
  let glitchJump = 0;
  const offsetMatrix = new THREE.Matrix4();

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

  /** voxel.i → { v, group, gem, glow, base, glowLevel, dying? } – gem = der pulsierende Würfel, glow = Leuchtfleck */
  const crystals = new Map();
  for (const v of asteroid.crystals) {
    if (!v.alive) continue;
    const base = new THREE.Color(COLORS[v.color]);
    const gem = new THREE.Mesh(mesh.geometry, candyMaterial({ color: base, emissive: base, roughness: 0.2 }));
    // durch die Hülle sichtbar: ohne Tiefentest, additiv
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: base, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(GLOW_SIZE * size);
    glow.renderOrder = 5;
    const group = new THREE.Group();
    group.add(gem, glow);
    group.position.set(v.x * size, v.y * size, v.z * size);
    spin.add(group);
    crystals.set(v.i, { v, group, gem, glow, base, glowLevel: 0 });
  }

  const radius = Math.max(...asteroid.voxels.map(v => Math.hypot(v.x, v.y, v.z)));   // in Voxeln
  let flingVelocity = 0;   // rad/s – Schwung nach dem Wischen (und Rückstoß einer Explosion um die Hochachse)
  /** Rückstoß-Wippen nach einer Explosion: Kippwinkel um x/z (rad) und ihre Geschwindigkeit – federt zurück */
  const wobble = { x: 0, z: 0, vx: 0, vz: 0 };
  const kickR = new THREE.Vector3();
  const kickF = new THREE.Vector3();
  const kickT = new THREE.Vector3();
  let time = Math.random() * 100;   // Startpunkt im Taumeln – nur Optik, beeinflusst die Spiellogik nicht direkt
  let baseY = 0;
  let appear = 0;          // s seit dem Laden
  let vanish = null;       // s seit Beginn des Herausschrumpfens (null = bleibt)
  /** voxel.i → s seit dem Treffer (Voxel, die gerade aufblitzen und wegschrumpfen) */
  const dying = new Map();
  /** voxel.i → s seit dem Farbwechsel (Special) – blitzen auf und blenden in die neue Farbe */
  const recoloring = new Map();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  const cameraLocal = new THREE.Vector3();
  const quaternionWorld = new THREE.Quaternion();
  const crystalWorld = new THREE.Vector3();
  const centerWorld = new THREE.Vector3();
  const gridFrom = new THREE.Vector3();
  const gridTo = new THREE.Vector3();
  const lead = new THREE.Vector3();
  // Kollision mit fliegenden Würfeln (effects-view → shatter): Lage des Rasters einmal pro Bild (update), dazu die
  // vom Bild davor – daraus die Bewegung der Oberfläche (Drehen, Taumeln, Wischen: Würfel werden mitgerissen)
  const gridNow = new THREE.Matrix4();
  const gridBefore = new THREE.Matrix4();
  const worldToGrid = new THREE.Matrix4();
  const gridRotation = new THREE.Quaternion();
  const gridScaleVec = new THREE.Vector3();
  let gridScale = size;     // Welteinheiten je Rasterschritt
  let frameDt = 0;
  let framesSeen = 0;
  const probe = new THREE.Vector3();
  const pushGrid = new THREE.Vector3();
  const before = new THREE.Vector3();
  /** lebt ein Voxel im Rasterfeld (gerundet)? */
  const solidAt = (x, y, z) => asteroid.grid.has(voxelKey(Math.round(x), Math.round(y), Math.round(z)));
  const HALF = 0.45;        // halbe Kantenlänge eines fliegenden Würfels (Raster) – knapp unter 0,5, damit er in Lücken passt

  function removeCrystal(i) {
    const c = crystals.get(i);
    spin.remove(c.group);
    c.gem.material.dispose();
    c.glow.material.dispose();
    crystals.delete(i);
  }

  return {
    size,
    spin,
    /** Radius des Körpers in Welteinheiten (ausgewachsen) */
    radius: (radius + 0.5) * size,
    setY(y) {
      baseY = y;
    },
    rotate(radians) {
      spin.rotation.y += radians;
    },
    /**
     * Rückstoß einer Explosion: Der Sprengpunkt (Welt) bekommt einen Stoß von der Kamera weg (die Würfel fliegen
     * überwiegend nach vorn heraus). Drehmoment = Hebel × Kraft: um die Hochachse dreht die Figur kurz schneller
     * (läuft aus wie ein Wisch), um x/z kippt sie und federt zurück. `strength` ~ weggesprengte Masse.
     */
    impulse(worldPoint, strength, cameraPosition) {
      tilt.updateMatrixWorld(true);
      spin.getWorldPosition(centerWorld);
      kickR.copy(worldPoint).sub(centerWorld).divideScalar(Math.max(0.001, (radius + 0.5) * size));   // Hebel, ~ −1 … 1
      kickF.copy(worldPoint).sub(cameraPosition).normalize().multiplyScalar(strength);
      kickT.crossVectors(kickR, kickF);
      flingVelocity = Math.max(-FLING_MAX, Math.min(FLING_MAX, flingVelocity + kickT.y * KICK_SPIN));
      wobble.vx += kickT.x * KICK_WOBBLE;
      wobble.vz += kickT.z * KICK_WOBBLE;
    },
    /** Schwung nach dem Wischen (rad/s): dreht weiter und läuft weich aus; 0 = sofort anhalten (angefasst) */
    fling(radiansPerSecond) {
      flingVelocity = Math.max(-FLING_MAX, Math.min(FLING_MAX, radiansPerSecond));
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
      // Schwung vom Wischen: weiterdrehen, bildratenunabhängig abbremsen
      if (flingVelocity) {
        spin.rotation.y += flingVelocity * dt;
        flingVelocity *= Math.exp(-FLING_FRICTION * dt);
        if (Math.abs(flingVelocity) < 0.02) flingVelocity = 0;
      }
      ao.update(dt);
      appear += dt;
      const grow = vanish === null ? easeOutBack(appear / APPEAR) : 1 - easeInCubic((vanish += dt) / VANISH);
      tilt.scale.setScalar(Math.max(0.001, grow));
      // Rückstoß-Wippen: gedämpfte Feder zurück in die Ruhelage
      for (const [a, v] of [['x', 'vx'], ['z', 'vz']]) {
        wobble[v] += (-WOBBLE_SPRING * wobble[a] - WOBBLE_DAMPING * wobble[v]) * dt;
        wobble[a] += wobble[v] * dt;
      }
      tilt.rotation.set(TILT + waves(TUMBLE_X, time) + wobble.x, 0, waves(TUMBLE_Z, time) + wobble.z);
      tilt.position.set(waves(SWAY_X, time), baseY + waves(SWAY_Y, time), 0);
      // Glitch: wenige ruckartige Schritte (je Schritt neue Versätze), dazwischen ruhig
      if (ghosts.length && vanish === null) {
        if (glitchT < 0 && (nextGlitch -= dt) <= 0) glitchT = 0;
        if (glitchT >= 0) {
          glitchT += dt;
          const step = Math.floor(glitchT / GLITCH_STEP);
          if (step !== glitchStep) {
            glitchStep = step;
            const r = (radius + 0.5) * size;
            glitchOffsets[0] = (0.06 + Math.random() * 0.12) * r;
            glitchOffsets[1] = -(0.06 + Math.random() * 0.12) * r;
            glitchJump = (Math.random() * 2 - 1) * 0.07 * r;
          }
          if (glitchT >= GLITCH_TIME) {
            glitchT = -1;
            glitchStep = -1;
            glitchJump = 0;
            nextGlitch = GLITCH_EVERY[0] + Math.random() * (GLITCH_EVERY[1] - GLITCH_EVERY[0]);
          }
        }
        const on = glitchT >= 0;
        tilt.position.x += glitchJump;
        tilt.updateMatrixWorld(true);
        ghosts.forEach((ghost, k) => {
          ghost.visible = on;
          if (!on) return;
          ghost.matrixWorld.copy(offsetMatrix.makeTranslation(glitchOffsets[k], 0, 0)).multiply(spin.matrixWorld);
          ghost.material.opacity = 0.16 + Math.random() * 0.14;   // flackert
        });
      }

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

      // Lage des Rasters für Kollisionen festhalten (jetzt und im Bild davor)
      tilt.updateMatrixWorld(true);
      gridBefore.copy(framesSeen++ ? gridNow : spin.matrixWorld);
      gridNow.copy(spin.matrixWorld);
      worldToGrid.copy(gridNow).invert();
      gridNow.decompose(probe, gridRotation, gridScaleVec);
      gridScale = size * gridScaleVec.x;
      frameDt = dt;

      if (recoloring.size) {
        for (const [i, t] of recoloring) {
          const p = Math.min(1, (t + dt) / RECOLOR);
          const v = asteroid.voxels[i];
          if (v.alive && shown[i]) mesh.setColorAt(i, voxelColor(v, color).lerp(WHITE, 0.8 * (1 - p)));
          if (p >= 1) recoloring.delete(i);
          else recoloring.set(i, t + dt);
        }
        mesh.instanceColor.needsUpdate = true;
      }

      const pulse = 0.5 + 0.5 * Math.sin(time * PULSE);
      if (crystals.size) {
        tilt.updateMatrixWorld(true);
        spin.getWorldPosition(centerWorld);
      }
      const reach = (radius + 0.5) * size;
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
        // Leuchtfleck: vergraben nur auf der Seite zur Kamera (+z), sonst schiene er durch den ganzen Körper
        const buried = !visibleFromOutside(asteroid, c.v);
        const front = (c.group.getWorldPosition(crystalWorld).z - centerWorld.z) / reach;
        const want = buried ? GLOW_BURIED * Math.min(1, Math.max(0, front * 1.6 + 0.15)) : GLOW_FREE;
        c.glowLevel += (want - c.glowLevel) * (1 - Math.exp(-GLOW_RATE * dt));
        c.glow.material.opacity = c.glowLevel * (0.25 + 0.75 * pulse);
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
    /**
     * Stößt ein fliegender Würfel (Bewegung `from` → `to`, Welt) an einen stehenden Würfel des Körpers? Geprüft wird
     * seine Vorderkante (halbe Würfelbreite in Flugrichtung). @returns {THREE.Vector3 | null}  Weltnormale der
     * getroffenen Fläche (in `out`), sonst null
     */
    collide(from, to, out = new THREE.Vector3()) {
      gridFrom.copy(from).applyMatrix4(worldToGrid).divideScalar(size);
      gridTo.copy(to).applyMatrix4(worldToGrid).divideScalar(size);
      lead.copy(gridTo).sub(gridFrom);
      if (lead.lengthSq() < 1e-8) return null;
      lead.normalize().multiplyScalar(HALF).add(gridTo);
      const cell = [Math.round(lead.x), Math.round(lead.y), Math.round(lead.z)];
      if (!asteroid.grid.has(voxelKey(...cell))) return null;
      // Eintrittsfläche: die Achse, auf der die Vorderkante am tiefsten im Feld steckt, gegen die Flugrichtung
      const depth = [lead.x - cell[0], lead.y - cell[1], lead.z - cell[2]];
      const move = [gridTo.x - gridFrom.x, gridTo.y - gridFrom.y, gridTo.z - gridFrom.z];
      let axis = 0;
      let best = -Infinity;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(move[a]) < 1e-6) continue;
        // wie weit die Kante über die Feldgrenze (−0,5 bzw. +0,5) in Bewegungsrichtung eingedrungen ist – am wenigsten = zuerst gekreuzt
        const entered = 0.5 + Math.sign(move[a]) * depth[a];
        const score = -entered;
        if (score > best) {
          best = score;
          axis = a;
        }
      }
      const n = [0, 0, 0];
      n[axis] = -Math.sign(move[axis]) || 1;
      if (asteroid.grid.has(voxelKey(cell[0] + n[0], cell[1] + n[1], cell[2] + n[2]))) {
        // Nachbarfeld davor ist auch voll (Kante/Ecke): die Achse mit der größten Bewegung nehmen
        const a = move.map(Math.abs).indexOf(Math.max(...move.map(Math.abs)));
        n.fill(0);
        n[a] = -Math.sign(move[a]);
      }
      return out.set(...n).applyQuaternion(gridRotation).normalize();
    },
    /**
     * Hat sich der Körper in einen fliegenden Würfel (Mittelpunkt `position`, Welt) hineingedreht? Dann den
     * Verschiebevektor (Welt) heraus an die freie Seite in `out` – sonst null.
     */
    penetration(position, out = new THREE.Vector3()) {
      const g = gridFrom.copy(position).applyMatrix4(worldToGrid).divideScalar(size);
      pushGrid.set(0, 0, 0);
      // Mittelpunkt steckt schon im Körper (die Figur hat ihn in einem Bild weit überstrichen): ins nächste freie
      // Nachbarfeld – das, zu dem er am nächsten liegt
      if (solidAt(g.x, g.y, g.z)) {
        const cell = [Math.round(g.x), Math.round(g.y), Math.round(g.z)];
        let best = null;
        let bestDistance = Infinity;
        for (const [dx, dy, dz] of DIRS) {
          if (solidAt(cell[0] + dx, cell[1] + dy, cell[2] + dz)) continue;
          const d = Math.hypot(cell[0] + dx - g.x, cell[1] + dy - g.y, cell[2] + dz - g.z);
          if (d < bestDistance) {
            bestDistance = d;
            best = [dx, dy, dz];
          }
        }
        if (!best) return null;   // ringsum voll – nichts zu machen, er wird gleich weggeräumt (Lebenszeit)
        // an die Grenze zum freien Feld, Kante knapp draußen
        const axis = best.findIndex(c => c !== 0);
        const key = ['x', 'y', 'z'][axis];
        pushGrid[key] = cell[axis] + best[axis] * (0.5 + HALF + 0.01) - g[key];
        return out.copy(pushGrid).multiplyScalar(gridScale).applyQuaternion(gridRotation);
      }
      for (const axis of ['x', 'y', 'z'])
        for (const sign of [-1, 1]) {
          probe.copy(g);
          probe[axis] += sign * HALF;
          if (!solidAt(probe.x, probe.y, probe.z)) continue;
          // bis an die Feldgrenze zurück (Kante des Würfels auf die Fläche des Nachbarfelds)
          const target = Math.round(probe[axis]) - sign * (0.5 + HALF + 0.01);
          const delta = target - g[axis];
          if (Math.sign(delta) === -sign && Math.abs(delta) > Math.abs(pushGrid[axis])) pushGrid[axis] = delta;
        }
      if (pushGrid.lengthSq() === 0) return null;
      return out.copy(pushGrid).multiplyScalar(gridScale).applyQuaternion(gridRotation);
    },
    /** Geschwindigkeit der Körperoberfläche an diesem Weltpunkt (Drehen, Taumeln, Wischen) */
    surfaceVelocity(position, out = new THREE.Vector3()) {
      if (frameDt <= 0) return out.set(0, 0, 0);
      // derselbe Rasterpunkt im Bild davor
      before.copy(position).applyMatrix4(worldToGrid).applyMatrix4(gridBefore);
      return out.copy(position).sub(before).divideScalar(frameDt);
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
    /** Special Farbwechsel: diese Voxel haben eine neue Farbe – blitzen hell auf und gehen in die neue Farbe über */
    recolor(voxels) {
      for (const v of voxels) recoloring.set(v.i, 0);
    },
    /** Kristall entschärft (game.js → defuse): der Spezial-Würfel schrumpft weg, darunter liegt ein normaler Block */
    defuse(v) {
      mesh.setColorAt(v.i, voxelColor(v, color));
      mesh.instanceColor.needsUpdate = true;
      if (v.alive && visibleFromOutside(asteroid, v)) {
        shown[v.i] = 1;
        mesh.setMatrixAt(v.i, place(v));
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (crystals.has(v.i)) crystals.get(v.i).dying = 0;
    },
    dispose() {
      for (const { gem, glow } of crystals.values()) {
        gem.material.dispose();
        glow.material.dispose();
      }
      scene.remove(tilt);
      for (const ghost of ghosts) {
        scene.remove(ghost);
        ghost.material.dispose();
      }
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}
