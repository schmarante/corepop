// Schüsse, Trümmer-Partikel und Spreng-Explosionen. Schüsse folgen dem Fortschritt aus der Spiellogik (shot.t 0 … 1).
//
// Sprengsatz (Kristall getroffen, siehe shatter): Jeder weggesprengte Würfel fliegt einzeln davon – vom Sprengpunkt
// weg, mit dem Tempo aus seiner Bewegungsenergie und Masse (core/asteroid.js → blastReach: Tempo = √(2E/m); innen
// liegende Würfel sind schwerer und träger), mit etwas Streuung und eigenem Taumeln. Würfel, deren
// Richtung in den restlichen Körper zeigt, werden nach außen abgelenkt; stoßen sie trotzdem an stehende Würfel,
// prallen sie an der getroffenen Fläche ab (Energieverlust, Reibung, neues Taumeln) – nie durch die Würfel. Dreht sich
// der Körper in einen Würfel hinein (Eigendrehung, Taumeln, Wischen), wird er herausgeschoben und von der Oberfläche
// mitgerissen (Stoß relativ zur bewegten Fläche) – schnelles Wischen schüttelt liegende Würfel heraus. Untereinander
// stoßen die Würfel auch (Raster-Hash je Bild, Impulsaustausch nach Masse) – sie schieben sich nie ineinander. Sie werden nicht
// kleiner, solange sie im Bild sind: Sie fliegen aus dem Bild bzw. an der Kamera vorbei; nur Nachzügler schrumpfen am
// Ende weich weg. Alle Würfel einer Explosion sind ein InstancedMesh (Piratenschiff: einige hundert Würfel).
// Ins All: Je weiter sich ein Würfel von der Figur entfernt, desto dunkler wird er (außerhalb des Lichts), bis er
// schwarz ist und verschwindet (SHATTER_DARK, in Körperradien). Gezählt wird der Abstand seitlich und nach hinten –
// wer auf die Kamera zufliegt, bleibt im Licht. Nach hinten (hinter die Figur, weg von der Kamera) werden sie
// ebenfalls schwarz (SHATTER_BEHIND) – wie Nebel ins All. (Tiefenschärfe wurde ausprobiert – gefakt pro Würfel und
// als Bildschirm-Effekt – und verworfen.)
// Treffer-Licht: Bei jedem Treffer blitzt ein kleiner Lichtpunkt in der Blockfarbe auf und beleuchtet die Figur an der
// getroffenen Stelle (Punktlicht, kurz vor der Fläche zur Kamera hin) – dazu ein heller Glanzpunkt. Feste Anzahl
// Punktlichter (HIT_LIGHTS), reihum benutzt: Lichter hinzufügen/entfernen würde alle Shader neu übersetzen (Ruckler).
// Kleine Teilchen (Treffer-Spritzer, Funken, Trümmer) sind je Art ein InstancedMesh (instancePool) – vorher war jedes
// ein eigenes Mesh = eigener Draw-Call (eine Spreng-Explosion allein 72). Funken sind Flächen zur Kamera mit weichem
// Glanz statt Kugeln, Trümmer und Spritzer einfache Würfel (taumeln – flache Flächen würden von der Seite verschwinden).
import * as THREE from 'three';
import { COLORS } from '../core/colors.js';
import { BLAST as BLAST_COLOR_ID } from '../core/asteroid.js';
import { candyBox, candyMaterial, voxelColor } from './asteroid-view.js';

const PARTICLES_PER_HIT = 7;
const PARTICLE_LIFE = 0.6;
// Sprengsatz: Würfel fliegen einzeln davon
const SHATTER_SCALE = 5;        // Welteinheiten/s je Einheit √(2E/m) aus der Spiellogik
const SHATTER_JITTER = 0.15;    // Anteil zufälliger Streuung im Tempo
const SHATTER_OUTWARD = 0.35;   // Mindest-Anteil der Richtung weg vom Körper (nie hinein)
const SHATTER_SPIN = [1.2, 4.5]; // rad/s – Taumeln je Würfel (gemächlich – schneller wirkte hektisch)
const SHATTER_DRAG = 0.25;      // 1/s – kaum Bremsen (Weltall), nur damit es nicht zu hektisch wirkt
const SHATTER_DARK = [0.2, 2.8];  // Abstand zur Figurmitte (in Körperradien): ab hier dunkler … schwarz und weg
const SHATTER_BEHIND = [0.2, 2];  // Tiefe hinter der Figurmitte, von der Kamera weg (Körperradien): dunkler … schwarz
const SHATTER_MAX_AGE = 5;      // s – Nachzügler (schwer, langsam) schrumpfen danach weg
const SHATTER_SHRINK = 0.3;     // s
const HIT_LIGHTS = 3;            // Punktlichter für Treffer (reihum, immer in der Szene)
const HIT_LIGHT_LIFE = 0.16;     // s – Aufblitzen und Abklingen
const HIT_LIGHT_POWER = 4;     // Spitzenhelligkeit
const HIT_LIGHT_REACH = 9;       // Reichweite in Voxelgrößen
const HIT_LIGHT_LIFT = 0.9;      // Voxelgrößen vor der Fläche (Richtung Kamera)
const HIT_GLINT = 0.14;          // s – heller Glanzpunkt
const BOUNCE = 0.45;            // Anteil der Geschwindigkeit senkrecht zur Fläche, der beim Abprallen bleibt
const BOUNCE_FRICTION = 0.75;   // Anteil entlang der Fläche
// Dreht/schiebt sich der Körper gegen einen Würfel: träge – nur ein Teil seiner Bewegung geht über (schwere, innere
// Würfel weniger), kaum Rückprall, gedeckeltes Tempo. So wird geschoben und geschüttelt statt weggeschleudert.
const PUSH_TRANSFER = 0.45;     // Anteil der Oberflächenbewegung, den ein Würfel der Masse 0 übernähme
const PUSH_MASS = 0.5;          // je Masseeinheit weniger: Anteil = PUSH_TRANSFER / (1 + PUSH_MASS · Masse)
const PUSH_BOUNCE = 0.1;        // Rückprall beim Geschobenwerden
const PUSH_MAX = 4;             // Welteinheiten/s – mehr Tempo bekommt ein Würfel vom Körper nie
// Würfel untereinander: als Kugeln mit fast Kantenlänge, kaum elastisch (schieben sich weg statt zu spritzen)
const CUBE_GAP = 0.92;          // Mindestabstand der Mittelpunkte in Kantenlängen
const CUBE_BOUNCE = 0.15;
// Spreng-Explosion: Blitz, Druckwelle (Ring zur Kamera), Funken und Würfeltrümmer nach außen
const BLAST = { flash: 0.28, ring: 0.55, sparks: 42, debris: 30, sparkSpeed: [7, 16], debrisSpeed: [4, 10], drag: 2.2 };
const BLAST_COLOR = 0xff2bd6;
const SHOT_RADIUS = 0.15;   // Welteinheiten – Dicke eines Schusses (früher 0,15: wirkte wie ein Tropfen)
const TRAIL = 1.8;           // Welteinheiten – maximale Länge der Leuchtspur hinter einem Schuss
const TRAIL_SPAN = 0.12;     // Anteil der Flugbahn, den die Leuchtspur abdeckt
const CURVE_MIN = 2.5;       // Welteinheiten – so weit vor der Eintrittsfläche liegt der Bogenpunkt mindestens …
const CURVE_SHARE = 0.55;    // … bzw. dieser Anteil der Entfernung Schiff → Ziel (weite Schüsse: weiter Bogen)
const UP = new THREE.Vector3(0, 1, 0);

/** Punkt auf einer quadratischen Bézierkurve p0 → (p1) → p2 bei t */
function bezier(out, p0, p1, p2, t) {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return out.set(a * p0.x + b * p1.x + c * p2.x, a * p0.y + b * p1.y + c * p2.y, a * p0.z + b * p1.z + c * p2.z);
}

/** 27 Nachbarfelder (inkl. eigenem) für den Raster-Hash der Würfel */
const NEIGHBORHOOD = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) NEIGHBORHOOD.push([dx, dy, dz]);
let cubeId = 0;

/** sanfter Übergang 0 → 1 zwischen edge0 und edge1 (auch fallend, wenn edge0 > edge1) */
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Glanzpunkt eines Treffers: weicher, runder Lichtfleck */
let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

const POOL_START = 32;   // Instanzen am Anfang (wächst auf die nächste Zweierpotenz)

/**
 * Viele gleiche Teilchen in einem InstancedMesh: `draw(items, fill)` schreibt jedes Bild alle lebenden Teilchen neu
 * (fill(item, matrix, color) füllt Lage und Farbe). Wächst bei Bedarf, ein Draw-Call für alle.
 */
function instancePool(parent, geometry, material, name) {
  let mesh = null;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  return {
    draw(items, fill) {
      if (!mesh && !items.length) return;
      if (!mesh || mesh.instanceMatrix.count < items.length) {
        const capacity = Math.max(POOL_START, 2 ** Math.ceil(Math.log2(items.length || 1)));
        if (mesh) {
          parent.remove(mesh);
          mesh.dispose();
        }
        mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.name = name;
        mesh.frustumCulled = false;
        mesh.setColorAt(0, color.set(0xffffff));
        parent.add(mesh);
      }
      for (let k = 0; k < items.length; k++) {
        fill(items[k], matrix, color);
        mesh.setMatrixAt(k, matrix);
        mesh.setColorAt(k, color);
      }
      mesh.count = items.length;
      mesh.visible = items.length > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      if (mesh) {
        parent.remove(mesh);
        mesh.dispose();
      }
      geometry.dispose();
      material.dispose();
    },
  };
}

/** @param {THREE.Scene} scene  @param {THREE.Camera} camera  (Druckwelle zur Kamera, Würfel hinter der Kamera sind weg) */
export function createEffectsView(scene, camera) {
  const root = new THREE.Group();
  root.name = 'Effekte';
  scene.add(root);
  // Schuss: dünner Leuchtstreifen (kleine Spitze, Spur gleich breit beginnend) statt Tropfen
  const shotGeometry = new THREE.SphereGeometry(SHOT_RADIUS, 10, 6);
  // Spur: Kegel, Spitze hinten; additiv, damit sie leuchtet
  const trailGeometry = new THREE.ConeGeometry(SHOT_RADIUS * 0.9, 1, 8, 1, true).rotateZ(Math.PI);
  const glow = new Map();
  const glowMaterial = colorId => {
    if (!glow.has(colorId))
      glow.set(colorId, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[colorId]).lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    return glow.get(colorId);
  };
  // Treffer-Spritzer, Funken, Trümmer: je ein InstancedMesh (Farbe je Instanz)
  const spatters = instancePool(root, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 'Spritzer');
  const sparkPool = instancePool(root, new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 'Funken');
  const debrisPool = instancePool(root, new THREE.BoxGeometry(1, 1, 1), candyMaterial(), 'Trümmer');
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  const euler = new THREE.Euler();
  /** shot.id → { mesh, start } */
  const shots = new Map();
  let particles = [];
  /** Sprengsätze: je einer { mesh, box, material, cubes: { position, velocity, quaternion, spin, gone }[], age } */
  let shatters = [];
  /** Spreng-Explosionen: { flash, ring, life } und ihre Teilchen in `sparks` und `debris` */
  let blasts = [];
  let sparks = [];
  let debris = [];
  const flashGeometry = new THREE.SphereGeometry(1, 20, 14);
  const ringGeometry = new THREE.RingGeometry(0.85, 1, 48);
  const glowColors = [0xffffff, 0xffe14d, BLAST_COLOR];
  const SPARK_SIZE = 0.42;   // Welteinheiten – Fläche mit weichem Glanz (der helle Kern ist etwa so groß wie früher die Kugel)
  const additive = color => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  // Treffer-Lichter: immer da (Intensität 0, wenn frei), reihum vergeben
  const hitLights = Array.from({ length: HIT_LIGHTS }, () => {
    const light = new THREE.PointLight(0xffffff, 0, 1, 2);
    root.add(light);
    return { light, life: 0 };
  });
  let nextLight = 0;
  const glintMaterial = new THREE.SpriteMaterial({ map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  let glints = [];
  /** Platzhalter fürs Vorkompilieren (warmUp) – beim nächsten update wieder weg */
  let warm = [];
  const toCamera = new THREE.Vector3();
  function disposeShatter(sh) {
    root.remove(sh.mesh);
    for (const o of [sh.mesh, sh.box, sh.material]) o.dispose();
  }

  return {
    /**
     * Platzhalter aller Effekt-Arten (winzig, unsichtbar) für ein Bild in die Szene – damit stage.warmUp ihre Shader
     * beim Laden übersetzt statt bei der ersten Explosion. Verschwinden beim nächsten update.
     */
    warmUp(size) {
      const cube = new THREE.InstancedMesh(candyBox(size), candyMaterial(), 1);   // wie shatter: instanziert + Farbe + Schatten
      cube.castShadow = true;
      cube.receiveShadow = true;
      cube.setMatrixAt(0, new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5));
      cube.setColorAt(0, new THREE.Color());
      const parts = [
        cube,
        new THREE.Mesh(flashGeometry, additive(0xffffff)),
        new THREE.Mesh(ringGeometry, additive(BLAST_COLOR)),
        new THREE.Sprite(glintMaterial),
      ];
      // Teilchen-Pools: je eine winzige Instanz, damit ihre InstancedMeshes (und Shader) schon da sind
      const tiny = (_, m, c) => {
        m.makeScale(1e-5, 1e-5, 1e-5).setPosition(camera.position.x, camera.position.y, camera.position.z - 5);
        c.set(0xffffff);
      };
      for (const pool of [spatters, sparkPool, debrisPool]) pool.draw([0], tiny);
      for (const part of parts) {
        if (part !== cube) part.scale.setScalar(1e-5);
        part.position.copy(camera.position).add(new THREE.Vector3(0, 0, -5));
        root.add(part);
      }
      warm = parts;
    },
    addShot(shot, colorId, start) {
      const mesh = new THREE.Mesh(shotGeometry, glowMaterial(colorId).clone());
      mesh.material.opacity = 1;
      mesh.material.color.lerp(new THREE.Color(0xffffff), 0.3);
      const trail = new THREE.Mesh(trailGeometry, glowMaterial(colorId));
      mesh.position.copy(start);
      root.add(mesh, trail);
      shots.set(shot.id, { mesh, trail, start: start.clone() });
    },
    /** Treffer-Licht: kurzer Lichtpunkt in der Blockfarbe, der die Figur an `position` beleuchtet, plus Glanzpunkt */
    flash(position, colorId, size) {
      toCamera.copy(camera.position).sub(position).normalize();
      const slot = hitLights[nextLight];
      nextLight = (nextLight + 1) % HIT_LIGHTS;
      slot.life = HIT_LIGHT_LIFE;
      slot.light.color.setHex(COLORS[colorId]).lerp(new THREE.Color(0xffffff), 0.45);
      slot.light.distance = size * HIT_LIGHT_REACH;
      slot.light.position.copy(position).addScaledVector(toCamera, size * HIT_LIGHT_LIFT);
      const glint = new THREE.Sprite(glintMaterial.clone());
      glint.material.color.copy(slot.light.color);
      glint.position.copy(slot.light.position);
      glint.renderOrder = 4;
      root.add(glint);
      glints.push({ sprite: glint, life: 0, size });
    },
    /** Explosion an `position`; `size` = Voxelgröße */
    burst(position, colorId, size) {
      for (let k = 0; k < PARTICLES_PER_HIT; k++)
        particles.push({
          position: position.clone(), spin: 0, color: COLORS[colorId], size, life: PARTICLE_LIFE,
          velocity: new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 4),
        });
    },
    /**
     * Sprengsatz: Die weggesprengten Voxel fliegen einzeln davon. Startet exakt an ihrer Stelle (`matrixWorld` =
     * Welt-Matrix des Voxel-Rasters); `at` = Sprengpunkt (Welt), `body` = { center, radius } des restlichen Körpers,
     * `energy`/`mass` je Voxel aus der Spiellogik (break-Ereignis) → Tempo √(2E/m).
     * `surface`: der restliche Körper für Kollisionen (asteroid-view: collide, penetration, surfaceVelocity) – optional
     */
    shatter(voxels, matrixWorld, size, body, at, energy, mass, surface = null) {
      if (!voxels.length) return;   // letzter Stein war der Kristall: nichts fliegt weg (ein leeres Mesh hätte keine Instanzfarben)
      const box = candyBox(size);
      const material = candyMaterial();
      const mesh = new THREE.InstancedMesh(box, material, voxels.length);
      mesh.frustumCulled = false;   // Würfel verteilen sich weit – die Hülle der Instanzen ändert sich laufend
      mesh.castShadow = true;       // Sonnenschatten (stage.js): auf die Figur und aufeinander
      mesh.receiveShadow = true;
      const base = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrixWorld.decompose(new THREE.Vector3(), base, scale);
      const cubes = voxels.map((v, k) => {
        cubeId++;
        const color = voxelColor(v);
        mesh.setColorAt(k, color);
        const position = new THREE.Vector3(v.x * size, v.y * size, v.z * size).applyMatrix4(matrixWorld);
        // Richtung: vom Sprengpunkt weg (der Kristall selbst: zufällig), mit Streuung; nie in den Körper hinein
        const radial = position.clone().sub(at);
        const distance = radial.length();
        const direction = distance > 1e-3 ? radial.divideScalar(distance) : new THREE.Vector3().randomDirection();
        const outward = position.clone().sub(body.center).normalize();
        direction.addScaledVector(new THREE.Vector3().randomDirection(), 0.35).normalize();
        const into = direction.dot(outward);
        if (into < SHATTER_OUTWARD) direction.addScaledVector(outward, SHATTER_OUTWARD - into).normalize();
        const kinetic = Math.sqrt((2 * energy[k]) / mass[k]);
        const speed = SHATTER_SCALE * kinetic * (1 + (Math.random() * 2 - 1) * SHATTER_JITTER);
        return {
          position,
          velocity: direction.multiplyScalar(speed),
          quaternion: base.clone(),
          spin: new THREE.Vector3().randomDirection(),
          spinSpeed: SHATTER_SPIN[0] + Math.random() * (SHATTER_SPIN[1] - SHATTER_SPIN[0]),
          id: cubeId,
          scale: scale.x,
          size: size * scale.x,   // Kantenlänge in Welteinheiten
          mass: mass[k],
          color,
          gone: false,
        };
      });
      root.add(mesh);
      shatters.push({ mesh, box, material, cubes, age: 0, center: body.center.clone(), radius: body.radius, surface });
      this.updateShatters(0);
    },
    /** Würfel der Sprengsätze weiterbewegen (Teil von update; dt = 0 setzt nur die Startlage) */
    updateShatters(dt) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s3 = new THREE.Vector3();
      const next = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const push = new THREE.Vector3();
      const ground = new THREE.Vector3();
      const relative = new THREE.Vector3();
      const offsetV = new THREE.Vector3();
      const tint = new THREE.Color();
      const rel = new THREE.Vector3();
      const view = new THREE.Vector3();
      /** Abstand zur Figur seitlich und nach hinten (der Anteil auf die Kamera zu zählt nicht) – fürs Abdunkeln im All */
      const spaceDistance = (position, center) => {
        rel.copy(position).sub(center);
        view.copy(camera.position).sub(center).normalize();
        const toward = Math.max(0, rel.dot(view));
        return rel.addScaledVector(view, -toward).length();
      };
      /** wie tief hinter der Figurmitte (von der Kamera weg) – negativ davor */
      const behindDepth = (position, center) => {
        view.copy(camera.position).sub(center).normalize();
        return -rel.copy(position).sub(center).dot(view);
      };
      /** Helligkeit 1 … 0: ins All hinaus (seitlich) und nach hinten schwarz */
      const lightAt = (position, sh) =>
        Math.min(
          1 - smoothstep(sh.radius * SHATTER_DARK[0], sh.radius * SHATTER_DARK[1], spaceDistance(position, sh.center)),
          1 - smoothstep(sh.radius * SHATTER_BEHIND[0], sh.radius * SHATTER_BEHIND[1], behindDepth(position, sh.center)),
        );
      /** Würfel untereinander: überlappende auseinanderschieben, Impuls nach Masse austauschen (kaum elastisch) */
      function separateCubes() {
        const cubes = [];
        for (const sh of shatters) for (const c of sh.cubes) if (!c.gone) cubes.push(c);
        if (cubes.length < 2) return;
        const cell = cubes[0].size;
        const hash = new Map();
        const keyOf = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);   // Zahl statt Text: schneller
        for (const c of cubes) {
          c.cell = [Math.floor(c.position.x / cell), Math.floor(c.position.y / cell), Math.floor(c.position.z / cell)];
          const key = keyOf(...c.cell);
          if (!hash.has(key)) hash.set(key, []);
          hash.get(key).push(c);
        }
        for (const a of cubes) {
          for (const [dx, dy, dz] of NEIGHBORHOOD) {
            const list = hash.get(keyOf(a.cell[0] + dx, a.cell[1] + dy, a.cell[2] + dz));
            if (!list) continue;
            for (const b of list) {
              if (b === a || b.id < a.id) continue;   // jedes Paar einmal
              const min = ((a.size + b.size) / 2) * CUBE_GAP;
              relative.copy(a.position).sub(b.position);
              const d = relative.length();
              if (d >= min || d < 1e-6) continue;
              relative.divideScalar(d);
              // auseinanderschieben, der leichtere mehr
              const wa = b.mass / (a.mass + b.mass);
              a.position.addScaledVector(relative, (min - d) * wa);
              b.position.addScaledVector(relative, -(min - d) * (1 - wa));
              // Stoß entlang der Verbindung
              const closing = relative.dot(offsetV.copy(a.velocity).sub(b.velocity));
              if (closing >= 0) continue;
              const j = (-(1 + CUBE_BOUNCE) * closing) / (1 / a.mass + 1 / b.mass);
              a.velocity.addScaledVector(relative, j / a.mass);
              b.velocity.addScaledVector(relative, -j / b.mass);
            }
          }
        }
      }
      /** Der Körper schiebt gegen den Würfel: träge mitnehmen statt wegschleudern (siehe PUSH_*) */
      const pushed = (c, n, surfaceVelocity) => {
        relative.copy(c.velocity).sub(surfaceVelocity);
        const into = relative.dot(n);
        if (into >= 0) return;
        const take = PUSH_TRANSFER / (1 + PUSH_MASS * c.mass);
        // senkrecht: nur anteilig auf das Tempo der Fläche bringen, kaum Rückprall; entlang der Fläche: etwas mitnehmen
        c.velocity.addScaledVector(n, -into * take * (1 + PUSH_BOUNCE));
        relative.addScaledVector(n, -into);   // nur noch der Anteil entlang der Fläche
        c.velocity.addScaledVector(relative, -take * 0.5);
        if (c.velocity.length() > PUSH_MAX) c.velocity.setLength(PUSH_MAX);
        c.spinSpeed = Math.min(c.spinSpeed + Math.abs(into) * take, SHATTER_SPIN[1]);
      };
      /** Stoß an einer Fläche, die sich mit `surfaceVelocity` bewegt: relativ zu ihr abprallen (gedämpft, Reibung) */
      const bounce = (c, n, surfaceVelocity) => {
        relative.copy(c.velocity).sub(surfaceVelocity);
        const into = relative.dot(n);
        if (into >= 0) return false;
        relative.addScaledVector(n, -into).multiplyScalar(BOUNCE_FRICTION).addScaledVector(n, -into * BOUNCE);
        c.velocity.copy(relative).add(surfaceVelocity);
        c.spin.randomDirection();
        c.spinSpeed = Math.min(SHATTER_SPIN[1], c.spinSpeed * 0.8 + relative.length() * 0.25);
        return true;
      };
      if (dt > 0) separateCubes();
      shatters = shatters.filter(sh => {
        sh.age += dt;
        const shrink = Math.max(0, 1 - Math.max(0, sh.age - SHATTER_MAX_AGE) / SHATTER_SHRINK);
        let alive = 0;
        sh.cubes.forEach((c, k) => {
          if (!c.gone) {
            c.velocity.multiplyScalar(Math.max(0, 1 - SHATTER_DRAG * dt));
            const surface = dt > 0 ? sh.surface : null;
            // 1. Körper hat sich hineingedreht: herausschieben und von der bewegten Oberfläche mitreißen lassen
            if (surface?.penetration(c.position, push)) {
              c.position.add(push);
              pushed(c, normal.copy(push).normalize(), surface.surfaceVelocity(c.position, ground));
            }
            // 2. eigene Bewegung: stößt die Vorderkante an einen stehenden Würfel → abprallen und stehen bleiben
            next.copy(c.position).addScaledVector(c.velocity, dt);
            // (die Bewegung der Fläche geht dabei nur anteilig über – träge, siehe PUSH_*)
            if (surface?.collide(c.position, next, normal) && bounce(c, normal, surface.surfaceVelocity(c.position, ground).multiplyScalar(PUSH_TRANSFER / (1 + PUSH_MASS * c.mass)))) {
              // abgeprallt: diesen Schritt nicht weiterfliegen
            } else c.position.copy(next);
            c.quaternion.premultiply(q.setFromAxisAngle(c.spin, c.spinSpeed * dt));
            // aus dem Bild: weit weg vom Körper oder hinter der Kamera
            c.gone = lightAt(c.position, sh) <= 0 || c.position.z > camera.position.z - 0.5 || shrink === 0;
          }
          if (c.gone) {
            sh.mesh.setMatrixAt(k, m.makeScale(0, 0, 0));
            return;
          }
          alive++;
          const size = c.scale * Math.max(0.001, shrink);
          sh.mesh.setMatrixAt(k, m.compose(c.position, c.quaternion, s3.setScalar(size)));
          // ins All: seitlich und nach hinten dunkler bis schwarz
          const light = lightAt(c.position, sh);
          sh.mesh.setColorAt(k, tint.copy(c.color).multiplyScalar(light));
        });
        sh.mesh.instanceMatrix.needsUpdate = true;
        sh.mesh.instanceColor.needsUpdate = true;
        if (alive) return true;
        disposeShatter(sh);
        return false;
      });
    },
    /**
     * Spreng-Explosion am Spreng-Block    /**
     * Spreng-Explosion am Spreng-Block: heller Blitz, Druckwelle, Funken und Würfeltrümmer in den Farben des
     * Bruchstücks – alles nach außen (`outward` = Weltrichtung weg vom Körper, mit Streuung).
     */
    explode(position, outward, colorIds, size) {
      if (!colorIds.length) colorIds = [BLAST_COLOR_ID];   // nichts weggesprengt (letzter Stein): Trümmer in Spreng-Farbe
      const flash = new THREE.Mesh(flashGeometry, additive(0xffd6f5));
      flash.position.copy(position);
      const ring = new THREE.Mesh(ringGeometry, additive(BLAST_COLOR));
      ring.position.copy(position);
      ring.lookAt(camera.position);
      root.add(flash, ring);
      blasts.push({ flash, ring, life: 0, size });
      const direction = () => {
        // überwiegend nach außen: Zufallsrichtung, zur Außenrichtung gezogen
        const d = new THREE.Vector3().randomDirection().addScaledVector(outward, 1.3).normalize();
        return d;
      };
      const speed = ([a, b]) => a + Math.random() * (b - a);
      for (let k = 0; k < BLAST.sparks; k++)
        sparks.push({
          position: position.clone(), color: glowColors[k % glowColors.length],
          velocity: direction().multiplyScalar(speed(BLAST.sparkSpeed)), life: 0, span: 0.45 + Math.random() * 0.45, scale: 1 + Math.random(),
        });
      for (let k = 0; k < BLAST.debris; k++)
        debris.push({
          position: position.clone(), color: COLORS[colorIds[k % colorIds.length]], size: size * 0.55,
          rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          velocity: direction().multiplyScalar(speed(BLAST.debrisSpeed)), life: 0, span: 1.1 + Math.random() * 0.8, scale: 0.6 + Math.random() * 0.7,
          spin: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 6),
        });
    },
    /** Schuss endet. Verpufft er (Ziel schon weg), zerstiebt er in einem kleinen Funkenregen statt zu verschwinden. */
    removeShot(shot, { fizzle = false, colorId = null } = {}) {
      const s = shots.get(shot.id);
      if (!s) return;
      if (fizzle && colorId) this.burst(s.mesh.position, colorId, 0.4);
      root.remove(s.mesh, s.trail);
      s.mesh.material.dispose();
      shots.delete(shot.id);
    },
    /**
     * @param {Array<{ id, t, voxel, normal }>} activeShots
     * @param {(shot, target: THREE.Vector3, normal: THREE.Vector3) => void} aim  füllt Ziel (Welt) und Eintrittsnormale (Welt)
     */
    update(dt, activeShots, aim) {
      for (const part of warm) {
        root.remove(part);
        if (part.isInstancedMesh) {
          part.geometry.dispose();
          part.dispose();
        }
        if (part.material !== glintMaterial) part.material.dispose();
      }
      warm = [];
      const target = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const control = new THREE.Vector3();
      const behind = new THREE.Vector3();
      const trailDir = new THREE.Vector3();
      for (const shot of activeShots) {
        const s = shots.get(shot.id);
        if (!s) continue;
        // Lenkgeschoss: Bogen (quadratische Bézierkurve) vom Start über einen Punkt vor der Eintrittsfläche ins Ziel –
        // fliegt außen herum und trifft die Fläche von vorn, nie durch den Körper
        aim(shot, target, normal);
        const reach = Math.max(CURVE_MIN, s.start.distanceTo(target) * CURVE_SHARE);
        control.copy(target).addScaledVector(normal, reach);
        const u = Math.min(1, shot.t);
        bezier(s.mesh.position, s.start, control, target, u);
        s.mesh.scale.setScalar(Math.min(1, 0.2 + shot.t * 4));   // wächst aus der Schiffsspitze heraus
        // Leuchtspur: vom Punkt kurz zuvor auf der Bahn bis zum Geschoss
        bezier(behind, s.start, control, target, Math.max(0, u - TRAIL_SPAN));
        const back = trailDir.copy(behind).sub(s.mesh.position);
        const length = Math.min(TRAIL, back.length());
        s.trail.visible = length > 0.05;
        if (s.trail.visible) {
          back.normalize();
          s.trail.quaternion.setFromUnitVectors(UP, back.negate());
          s.trail.scale.set(1, length, 1);
          s.trail.position.copy(s.mesh.position).addScaledVector(back, -length / 2);
        }
      }
      this.updateShatters(dt);
      // Treffer-Lichter klingen ab (quadratisch: kurzer, heller Blitz)
      for (const slot of hitLights) {
        slot.life = Math.max(0, slot.life - dt);
        const k = slot.life / HIT_LIGHT_LIFE;
        slot.light.intensity = HIT_LIGHT_POWER * k * k;
      }
      glints = glints.filter(g => {
        g.life += dt;
        const p = Math.min(1, g.life / HIT_GLINT);
        g.sprite.scale.setScalar(g.size * (0.6 + 1.6 * p));
        g.sprite.material.opacity = (1 - p) * 0.9;
        if (p < 1) return true;
        root.remove(g.sprite);
        g.sprite.material.dispose();
        return false;
      });
      // Spreng-Explosionen: Blitz wächst und verblasst, Druckwelle dehnt sich aus, Teilchen fliegen mit Luftwiderstand
      blasts = blasts.filter(b => {
        b.life += dt;
        const f = Math.min(1, b.life / BLAST.flash);
        b.flash.scale.setScalar(b.size * (0.5 + 3.5 * f));
        b.flash.material.opacity = 1 - f;
        const r = Math.min(1, b.life / BLAST.ring);
        b.ring.scale.setScalar(b.size * (1 + 9 * (1 - (1 - r) ** 3)));
        b.ring.material.opacity = 0.9 * (1 - r);
        if (b.life < Math.max(BLAST.flash, BLAST.ring)) return true;
        root.remove(b.flash, b.ring);
        b.flash.material.dispose();
        b.ring.material.dispose();
        return false;
      });
      // Funken und Trümmer: Luftwiderstand, im letzten Drittel weich wegschrumpfen
      const fly = p => {
        p.life += dt;
        p.velocity.multiplyScalar(Math.max(0, 1 - BLAST.drag * dt));
        p.position.addScaledVector(p.velocity, dt);
        p.left = 1 - p.life / p.span;
        p.shrink = Math.max(0.001, p.scale * Math.min(1, p.left / 0.35));
        return p.left > 0;
      };
      sparks = sparks.filter(fly);
      debris = debris.filter(p => {
        p.rotation.x += p.spin.x * dt;
        p.rotation.y += p.spin.y * dt;
        return fly(p);
      });
      particles = particles.filter(p => {
        p.life -= dt;
        p.position.addScaledVector(p.velocity, dt);
        p.spin += dt * 6;
        return p.life > 0;
      });
      // in die Pools schreiben (ein Draw-Call je Art)
      sparkPool.draw(sparks, (p, m, c) => {
        m.compose(p.position, camera.quaternion, scaleVec.setScalar(SPARK_SIZE * p.shrink));   // Fläche zur Kamera
        c.setHex(p.color);
      });
      debrisPool.draw(debris, (p, m, c) => {
        m.compose(p.position, rotation.setFromEuler(p.rotation), scaleVec.setScalar(p.size * p.shrink));
        c.setHex(p.color);
      });
      spatters.draw(particles, (p, m, c) => {
        m.compose(p.position, rotation.setFromEuler(euler.set(p.spin, 0, 0)), scaleVec.setScalar(Math.max(0.0001, (p.size * 0.3 * p.life) / PARTICLE_LIFE)));
        c.setHex(p.color);
      });
    },
    dispose() {
      for (const b of blasts) {
        b.flash.material.dispose();
        b.ring.material.dispose();
      }
      [flashGeometry, ringGeometry].forEach(o => o.dispose());
      for (const pool of [spatters, sparkPool, debrisPool]) pool.dispose();
      for (const sh of shatters) disposeShatter(sh);
      for (const g of glints) g.sprite.material.dispose();
      glintMaterial.dispose();
      scene.remove(root);
      shotGeometry.dispose();
      trailGeometry.dispose();
      for (const m of glow.values()) m.dispose();
    },
  };
}
