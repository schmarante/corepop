// Schüsse, Trümmer-Partikel und abgesprengte Bruchstücke. Schüsse folgen dem Fortschritt aus der Spiellogik (shot.t 0 … 1).
//
// Bruchstücke werden nicht kleiner: Sie lösen sich gerade nach außen, bis sie den Körper ganz verlassen haben
// (Schutzkugel um den Körper, siehe breakOff). Zeigt die Bruchstelle zur Kamera, treiben sie danach langsam an der
// Kamera vorbei; liegt sie seitlich oder hinten, fliegen sie zur Seite ins All davon (statt sich eng um den Körper
// herumzuschlängeln). Führt ein Kurs doch in die Schutzkugel, gleiten sie außen entlang – nie durch die Würfel. Je näher sie kommen, desto unschärfer werden sie (Tiefenunschärfe/DOF). Die Unschärfe ist kein
// Bildschirm-Effekt (der würde jedes Bild komplett nachbearbeiten – zu teuer fürs Handy), sondern nur fürs
// Bruchstück: Das Stück selbst bleibt voll deckend (nie durchsichtig), darum liegen BLUR_COPIES schwache Kopien auf
// einer kleinen Scheibe quer zur Blickrichtung – ein weicher Halo an den Kanten – und die Glanzlichter werden stumpf.
// Kostet ein paar Dutzend Würfel extra.
import * as THREE from 'three';
import { COLORS } from '../core/colors.js';
import { candyBox, candyMaterial, voxelColor } from './asteroid-view.js';

const PARTICLES_PER_HIT = 7;
const PARTICLE_LIFE = 0.6;
const CLEARANCE = 0.6;       // Welteinheiten Luft zwischen Bruchstück und Körper
const CHUNK_KICK = 3;        // Welteinheiten/s – Ruck beim Absprengen (nach außen)
const CHUNK_SPEED = [1.2, 7]; // Welteinheiten/s – Reisegeschwindigkeit: langsam los, schneller kurz vor der Kamera
const CHUNK_ACCEL = 1.6;     // 1/s – wie schnell es auf seinen Kurs einschwenkt
const CHUNK_MAX_AGE = 9;     // s – Sicherheitsnetz, falls es nie hinter der Kamera ankommt
const TOWARD_CAMERA = 0.35;  // Bruchstelle zeigt mindestens so stark zur Kamera (z-Anteil) → an der Kamera vorbei
const AWAY_DISTANCE = 45;    // Welteinheiten vom Körper – dort ist ein seitlich wegfliegendes Stück verschwunden
const PASS_SIDE = 0.7;       // Welteinheiten – so weit seitlich (und etwas oben) zieht es an der Kamera vorbei –
                             // knapp, damit es lange im Bild bleibt und man die Unschärfe sieht
const BLUR_COPIES = 8;
// Spreng-Explosion: Blitz, Druckwelle (Ring zur Kamera), Funken und Würfeltrümmer nach außen
const BLAST = { flash: 0.28, ring: 0.55, sparks: 42, debris: 30, sparkSpeed: [7, 16], debrisSpeed: [4, 10], drag: 2.2 };
const BLAST_COLOR = 0xff2bd6;
const BLUR_RADIUS = 0.45;    // Welteinheiten – Unschärfe-Scheibe bei voller Unschärfe
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

/** sanfter Übergang 0 → 1 zwischen edge0 und edge1 */
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Punkte auf einer Scheibe (Sonnenblumen-Muster), Radius ≤ 1 – Versatz der Unschärfe-Kopien */
const DISK = Array.from({ length: BLUR_COPIES }, (_, k) => {
  const r = Math.sqrt((k + 0.5) / BLUR_COPIES);
  const a = k * 2.39996;
  return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
});

/** @param {THREE.Scene} scene  @param {THREE.Camera} camera  (für Kurs und Unschärfe der Bruchstücke) */
export function createEffectsView(scene, camera) {
  const root = new THREE.Group();
  scene.add(root);
  const shotGeometry = new THREE.SphereGeometry(0.15, 12, 8);
  // Spur: Kegel, Spitze hinten; additiv, damit sie leuchtet
  const trailGeometry = new THREE.ConeGeometry(0.13, 1, 10, 1, true).rotateZ(Math.PI);
  const glow = new Map();
  const glowMaterial = colorId => {
    if (!glow.has(colorId))
      glow.set(colorId, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[colorId]).lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    return glow.get(colorId);
  };
  const particleGeometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const material = colorId => {
    if (!materials.has(colorId)) materials.set(colorId, new THREE.MeshBasicMaterial({ color: COLORS[colorId] }));
    return materials.get(colorId);
  };
  /** shot.id → { mesh, start } */
  const shots = new Map();
  let particles = [];
  let chunks = [];
  /** Spreng-Explosionen: { flash, ring, life } und ihre Teilchen in `pieces` */
  let blasts = [];
  let pieces = [];
  const flashGeometry = new THREE.SphereGeometry(1, 20, 14);
  const ringGeometry = new THREE.RingGeometry(0.85, 1, 48);
  const sparkGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  let debrisGeometry = null;
  const glowColors = [0xffffff, 0xffe14d, BLAST_COLOR];
  const additive = color => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkMaterials = glowColors.map(additive);
  const debrisMaterials = new Map();

  return {
    addShot(shot, colorId, start) {
      const mesh = new THREE.Mesh(shotGeometry, glowMaterial(colorId).clone());
      mesh.material.opacity = 1;
      mesh.material.color.lerp(new THREE.Color(0xffffff), 0.3);
      const trail = new THREE.Mesh(trailGeometry, glowMaterial(colorId));
      mesh.position.copy(start);
      root.add(mesh, trail);
      shots.set(shot.id, { mesh, trail, start: start.clone() });
    },
    /** Explosion an `position`; `size` = Voxelgröße */
    burst(position, colorId, size) {
      for (let k = 0; k < PARTICLES_PER_HIT; k++) {
        const mesh = new THREE.Mesh(particleGeometry, material(colorId));
        mesh.position.copy(position);
        mesh.scale.setScalar(size * 0.3);
        root.add(mesh);
        particles.push({ mesh, size, life: PARTICLE_LIFE, velocity: new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 4) });
      }
    },
    /**
     * Bruchstück löst sich vom Körper: eigene Kopie der Voxel, startet exakt an deren Stelle
     * (`matrixWorld` = Welt-Matrix des Voxel-Rasters), löst sich nach außen und treibt dann an der Kamera vorbei.
     * `body` = { center: Vector3, radius } – Hülle des restlichen Körpers (Welt), die das Stück nie durchdringt.
     */
    breakOff(voxels, matrixWorld, size, body) {
      const group = new THREE.Group();
      matrixWorld.decompose(group.position, group.quaternion, group.scale);
      const box = candyBox(size);
      const sharp = candyMaterial();
      const soft = candyMaterial({ transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.InstancedMesh(box, sharp, voxels.length);
      const center = new THREE.Vector3();
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      voxels.forEach((v, k) => {
        mesh.setMatrixAt(k, m.makeTranslation(v.x * size, v.y * size, v.z * size));
        mesh.setColorAt(k, voxelColor(v, c));
        center.add(new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(size / voxels.length));
      });
      // um den eigenen Schwerpunkt drehen: Inhalt verschieben, Gruppe an den Schwerpunkt setzen
      mesh.position.copy(center).negate();
      group.position.add(center.clone().applyQuaternion(group.quaternion).multiply(group.scale));
      // Unschärfe-Kopien teilen sich Geometrie, Matrizen und Farben mit dem scharfen Bruchstück
      const ghosts = DISK.map(() => {
        const ghost = new THREE.InstancedMesh(box, soft, voxels.length);
        ghost.instanceMatrix = mesh.instanceMatrix;
        ghost.instanceColor = mesh.instanceColor;
        ghost.visible = false;
        ghost.renderOrder = 2;
        group.add(ghost);
        return ghost;
      });
      group.add(mesh);
      root.add(group);

      const out = group.position.clone().sub(body.center).normalize();
      if (out.lengthSq() === 0) out.set(0, 1, 0);
      // Radius des Bruchstücks um seinen Schwerpunkt → Schutzkugel = Körper + Stück + Luft
      const local = center.clone().divideScalar(size);
      const reach = Math.max(...voxels.map(v => Math.hypot(v.x - local.x, v.y - local.y, v.z - local.z))) * size + size;
      // Kurs: vorne abgebrochen → an der Kamera vorbei (auf seiner Seite); sonst seitlich weg, nie nach hinten
      const side = Math.abs(out.x) > 0.05 ? Math.sign(out.x) : Math.random() < 0.5 ? -1 : 1;
      const toCamera = out.z >= TOWARD_CAMERA;
      // seitlich weg – nie nach unten (dort liegen Hangar und Schiffsauswahl) und nie nach hinten; bricht ein Stück
      // unten ab, schwenkt es zur Seite und leicht nach oben
      const awayDir = new THREE.Vector3(out.x, Math.max(0, out.y) * 0.6 + 0.2, Math.max(0, out.z));
      if (Math.hypot(awayDir.x, awayDir.z) < 0.5) awayDir.x += side;
      awayDir.normalize();
      chunks.push({
        group, mesh, ghosts, box, sharp, soft, age: 0, toCamera, awayDir,
        body: { center: body.center.clone(), radius: body.radius + reach + CLEARANCE },
        velocity: out.multiplyScalar(CHUNK_KICK),
        pass: new THREE.Vector3(side * PASS_SIDE, 0.8 + Math.random() * 0.6, 0),
        spin: new THREE.Vector3().randomDirection().multiplyScalar(0.6),
      });
    },
    /**
     * Spreng-Explosion am Spreng-Block: heller Blitz, Druckwelle, Funken und Würfeltrümmer in den Farben des
     * Bruchstücks – alles nach außen (`outward` = Weltrichtung weg vom Körper, mit Streuung).
     */
    explode(position, outward, colorIds, size) {
      const flash = new THREE.Mesh(flashGeometry, additive(0xffd6f5));
      flash.position.copy(position);
      const ring = new THREE.Mesh(ringGeometry, additive(BLAST_COLOR));
      ring.position.copy(position);
      ring.lookAt(camera.position);
      root.add(flash, ring);
      blasts.push({ flash, ring, life: 0, size });
      debrisGeometry ??= candyBox(size * 0.55);
      const direction = () => {
        // überwiegend nach außen: Zufallsrichtung, zur Außenrichtung gezogen
        const d = new THREE.Vector3().randomDirection().addScaledVector(outward, 1.3).normalize();
        return d;
      };
      const speed = ([a, b]) => a + Math.random() * (b - a);
      for (let k = 0; k < BLAST.sparks; k++) {
        const mesh = new THREE.Mesh(sparkGeometry, sparkMaterials[k % sparkMaterials.length]);
        mesh.position.copy(position);
        root.add(mesh);
        pieces.push({ mesh, velocity: direction().multiplyScalar(speed(BLAST.sparkSpeed)), life: 0, span: 0.45 + Math.random() * 0.45, scale: 1 + Math.random() });
      }
      for (let k = 0; k < BLAST.debris; k++) {
        const color = colorIds[k % colorIds.length];
        if (!debrisMaterials.has(color)) debrisMaterials.set(color, candyMaterial({ color: COLORS[color] }));
        const mesh = new THREE.Mesh(debrisGeometry, debrisMaterials.get(color));
        mesh.position.copy(position);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        root.add(mesh);
        pieces.push({
          mesh, velocity: direction().multiplyScalar(speed(BLAST.debrisSpeed)), life: 0, span: 1.1 + Math.random() * 0.8, scale: 0.6 + Math.random() * 0.7,
          spin: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 6),
        });
      }
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
      const target = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const control = new THREE.Vector3();
      const behind = new THREE.Vector3();
      const trailDir = new THREE.Vector3();
      const chunkGoal = new THREE.Vector3();
      const chunkWanted = new THREE.Vector3();
      const chunkQ = new THREE.Quaternion();
      const chunkAway = new THREE.Vector3();
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
      chunks = chunks.filter(ch => {
        ch.age += dt;
        const pos = ch.group.position;
        // Kurs: auf einen Punkt neben und hinter der Kamera zu, langsam los, dann schneller
        const goal = ch.toCamera
          ? chunkGoal.copy(camera.position).add(ch.pass).setZ(camera.position.z + 4)
          : chunkGoal.copy(pos).addScaledVector(ch.awayDir, 10);
        const speed = CHUNK_SPEED[0] + (CHUNK_SPEED[1] - CHUNK_SPEED[0]) * smoothstep(1, 5, ch.age);
        const wanted = chunkWanted.copy(goal).sub(pos).normalize();
        const away = chunkAway.copy(pos).sub(ch.body.center);
        const gap = away.length() - ch.body.radius;
        away.normalize();
        if (gap < 0) {
          // noch in der Schutzkugel: nur nach außen
          ch.velocity.copy(away).multiplyScalar(Math.max(CHUNK_KICK, ch.velocity.dot(away)));
        } else {
          // zeigt der Kurs in die Kugel hinein, nur den Anteil entlang ihrer Oberfläche nehmen (außen vorbeigleiten)
          const inward = wanted.dot(away);
          if (inward < 0) wanted.addScaledVector(away, -inward * Math.min(1, 1.5 - gap / ch.body.radius)).normalize();
          ch.velocity.lerp(wanted.multiplyScalar(speed), 1 - Math.exp(-CHUNK_ACCEL * dt));
        }
        pos.addScaledVector(ch.velocity, dt);
        ch.group.rotation.x += ch.spin.x * dt;
        ch.group.rotation.y += ch.spin.y * dt;
        ch.group.rotation.z += ch.spin.z * dt;

        // Unschärfe: scharf auf Höhe des Körpers (Fokus), zunehmend unscharf auf dem Weg zur Kamera
        const focus = camera.position.z;
        const distance = camera.position.z - pos.z;
        const blur = smoothstep(focus * 0.9, focus * 0.4, distance);
        ch.sharp.roughness = 0.38 + blur * 0.5;   // unscharf: keine knackigen Glanzlichter
        ch.soft.opacity = (blur * 0.9) / BLUR_COPIES;
        const inverse = chunkQ.copy(ch.group.quaternion).invert();
        ch.ghosts.forEach((ghost, k) => {
          ghost.visible = blur > 0.02;
          if (!ghost.visible) return;
          ghost.position.copy(DISK[k]).multiplyScalar(BLUR_RADIUS * blur).applyQuaternion(inverse).add(ch.mesh.position);
        });

        const gone = pos.z > camera.position.z + 1 || pos.distanceTo(ch.body.center) > AWAY_DISTANCE || ch.age > CHUNK_MAX_AGE;
        if (!gone) return true;
        root.remove(ch.group);
        ch.box.dispose();
        ch.sharp.dispose();
        ch.soft.dispose();
        ch.mesh.dispose();
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
      pieces = pieces.filter(p => {
        p.life += dt;
        p.velocity.multiplyScalar(Math.max(0, 1 - BLAST.drag * dt));
        p.mesh.position.addScaledVector(p.velocity, dt);
        if (p.spin) {
          p.mesh.rotation.x += p.spin.x * dt;
          p.mesh.rotation.y += p.spin.y * dt;
        }
        const left = 1 - p.life / p.span;
        p.mesh.scale.setScalar(Math.max(0.001, p.scale * Math.min(1, left / 0.35)));   // letztes Drittel: weich wegschrumpfen
        if (left > 0) return true;
        root.remove(p.mesh);
        return false;
      });
      particles = particles.filter(p => {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.rotation.x += dt * 6;
        p.mesh.scale.setScalar(Math.max(0, (p.size * 0.3 * p.life) / PARTICLE_LIFE));
        if (p.life > 0) return true;
        root.remove(p.mesh);
        return false;
      });
    },
    dispose() {
      for (const b of blasts) {
        b.flash.material.dispose();
        b.ring.material.dispose();
      }
      [flashGeometry, ringGeometry, sparkGeometry, debrisGeometry, ...sparkMaterials, ...debrisMaterials.values()].forEach(o => o?.dispose());
      for (const ch of chunks) {
        ch.box.dispose();
        ch.sharp.dispose();
        ch.soft.dispose();
      }
      scene.remove(root);
      shotGeometry.dispose();
      trailGeometry.dispose();
      for (const m of glow.values()) m.dispose();
      particleGeometry.dispose();
      for (const m of materials.values()) m.dispose();
    },
  };
}
