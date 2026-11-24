// 3D-Modell eines Schiffs im Candy-Look, in mehreren freischaltbaren Designs (SHIP_DESIGNS). Alle eigene Entwürfe:
//   classic – rundlicher Rumpf in der Spielfarbe, Glas-Cockpit, zwei gerundete Flügel, Triebwerk mit Flamme
//   gummy   – Weingummi-Flieger: glänzender, von innen leuchtender Gelee-Körper, runde Öhrchen, Kugel-Ärmchen als Flügel
//   ufo     – kleine Untertasse: flache Scheibe, Glaskuppel, Lichterkranz; die Flamme zeigt nach unten
//   paper   – gefalteter Papierflieger aus flachen Dreiecksfacetten, hellere Faltkante, kleine Flamme
//   rocket  – Retro-Rakete: hoher spitzer Rumpf, drei Flossen, rundes Bullauge, große Flamme
// Darunter jeweils eine Blase mit der Munition.
// Aufbau: group (Position, Größe) → bob (Schweben, Rückstoß) → hull (Ausrichtung zum Ziel: lokal +Y = Nase, die
// Mündung liegt bei (0, 0.6, 0)) → Teile. Jedes Design passt grob in dieselbe Box wie classic (≈ ±0.62 breit,
// Nase ≈ +0.6, Flammenende ≈ -1.1), damit Plattformen und Warteschlange ohne Sonderfälle passen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../core/colors.js';
import { candyMaterial } from './asteroid-view.js';

export const SHIP_DESIGNS = ['classic', 'gummy', 'ufo', 'paper', 'rocket'];

const LABEL_PX = 96;
const TRIM = 0.72;          // Zierteile: Spielfarbe abgedunkelt
const DIM = new THREE.Color(0x1a1d3a);
const WHITE = new THREE.Color(0xffffff);

// Geometrien teilen sich alle Schiffe (werden nie entsorgt – je Design einige hundert Dreiecke)
const BODY = new THREE.CapsuleGeometry(0.27, 0.5, 6, 14);
const NOSE = new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const COCKPIT = new THREE.SphereGeometry(0.16, 16, 12);
const WING = new RoundedBoxGeometry(0.55, 0.1, 0.3, 2, 0.05);
const FIN = new RoundedBoxGeometry(0.08, 0.26, 0.22, 2, 0.035);
const ENGINE = new THREE.CylinderGeometry(0.17, 0.2, 0.16, 16);
const FLAME = new THREE.ConeGeometry(0.15, 0.5, 12).rotateZ(Math.PI);
const FLAME_SMALL = new THREE.ConeGeometry(0.09, 0.3, 10).rotateZ(Math.PI);
const FLAME_BIG = new THREE.ConeGeometry(0.19, 0.66, 12).rotateZ(Math.PI);
const SPHERE = new THREE.SphereGeometry(1, 14, 10);      // Einheitskugel, per scale geformt
const SPHERE_LO = new THREE.SphereGeometry(1, 8, 6);     // für kleine Teile (Öhrchen, Füßchen)
const SPHERE_TINY = new THREE.SphereGeometry(1, 6, 4);   // winzige Punkte (Augen, Lichter)
const NOZZLE = new THREE.CylinderGeometry(0.1, 0.13, 0.12, 12);
const GLASS = candyMaterial({ color: 0xd8f1ff, roughness: 0.08, emissive: 0x4aa8ff, emissiveIntensity: 0.25 });
const METAL = candyMaterial({ color: 0x3b3f6e, roughness: 0.3, metalness: 0.4 });
const FIRE = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const LAMP = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
const EYE = candyMaterial({ color: 0x1b1d33, roughness: 0.15 });

/** Größe je Schiffsklasse (Munition); Spreng-Flieger etwas kräftiger */
const CLASS_SCALE = { 1: 1.05, 20: 0.85, 50: 1, 100: 1.16, 250: 1.38 };
const BOMB = new THREE.SphereGeometry(0.26, 16, 12);
const BOMB_MATERIAL = candyMaterial({ color: 0x2b2d4a, roughness: 0.3 });

// --- Design-Geometrien -----------------------------------------------------------------------------------------------

/** glatte Drehkörper-Kontur aus Stützpunkten (x = Radius, y = Höhe) */
const lathe = (points, segments, divisions = 14) =>
  new THREE.LatheGeometry(new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(divisions), segments);

// UFO: Untertasse (bauchige Scheibe), Kuppel, Lichterkranz-Ring
const SAUCER = lathe([[0.001, -0.1], [0.22, -0.1], [0.4, -0.05], [0.47, 0], [0.4, 0.05], [0.2, 0.09], [0.001, 0.1]], 24, 12);
const SAUCER_RING = new THREE.TorusGeometry(0.45, 0.035, 6, 28).rotateX(Math.PI / 2);
const DOME = new THREE.SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const UFO_LAMPS = 8;

// Rakete: bauchiger Rumpf, abgesetzte Spitze, geschwungene Flosse, Bullauge mit Rahmen
const ROCKET_BODY = lathe([[0.15, -0.42], [0.22, -0.3], [0.25, -0.08], [0.235, 0.12], [0.19, 0.28]], 16, 10);
const ROCKET_TIP = lathe([[0.19, 0.28], [0.15, 0.42], [0.08, 0.55], [0.001, 0.63]], 16, 6);
const ROCKET_FIN = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.quadraticCurveTo(0.2, -0.06, 0.23, -0.36);
  s.quadraticCurveTo(0.235, -0.47, 0.17, -0.46);
  s.quadraticCurveTo(0.1, -0.36, 0, -0.34);
  s.lineTo(0, 0.02);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 5 });
  return g.translate(0.14, 0, -0.02);   // Wurzel steckt im Rumpf
})();
const PORT_RIM = new THREE.TorusGeometry(0.095, 0.022, 6, 18);

// Papierflieger: flache Facetten (Pfeilform). Nase oben, Flügelspitzen heben sich zur Kamera (V-Form), Kiel nach hinten.
const facets = (...tris) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();   // nicht indiziert → je Dreieck eine Normale (flache Facetten)
  return g;
};
const P = { nose: [0, 0.62, 0], tail: [0, -0.42, 0], keel: [0, -0.3, -0.2] };
const wingTip = sx => [sx * 0.56, -0.44, 0.16];
const foldLine = sx => [sx * 0.15, -0.43, 0.035];
const PAPER_WINGS = facets([P.nose, wingTip(-1), foldLine(-1)], [P.nose, foldLine(1), wingTip(1)]);
const PAPER_FOLDS = facets([P.nose, foldLine(-1), P.tail], [P.nose, P.tail, foldLine(1)]);
const PAPER_KEEL = facets([P.nose, P.tail, P.keel]);

// --- Designs: bauen die Teile in hull, liefern die Flamme ------------------------------------------------------------
// kit.tint(factor | Color, options) legt ein eigenes Material in (abgewandelter) Spielfarbe an, das setDim abdunkelt
// und dispose wieder freigibt.

const mesh = (geometry, material, [x = 0, y = 0, z = 0] = [], [sx = 1, sy = sx, sz = sx] = [], [rx = 0, ry = 0, rz = 0] = []) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  return m;
};

const DESIGNS = {
  classic(hull, kit) {
    const paint = kit.tint(1);
    const trim = kit.tint(TRIM);
    const body = new THREE.Mesh(BODY, paint);
    const nose = mesh(NOSE, paint, [0, 0.26, 0], [1, 0.9, 1]);   // nur damit die Spitze etwas voller wirkt
    const cockpit = mesh(COCKPIT, GLASS, [0, 0.2, 0.17], [1, 1.35, 0.85]);
    const wingL = mesh(WING, trim, [-0.36, -0.14, 0], [], [0, 0, 0.32]);
    const wingR = mesh(WING, trim, [0.36, -0.14, 0], [], [0, 0, -0.32]);
    const fin = mesh(FIN, trim, [0, -0.22, -0.2]);
    const engine = mesh(ENGINE, METAL, [0, -0.5, 0]);
    const flame = mesh(FLAME, FIRE, [0, -0.82, 0]);
    hull.add(body, nose, cockpit, wingL, wingR, fin, engine, flame);
    return { flame, bomb: [0, -0.1, -0.3] };
  },

  gummy(hull, kit) {
    // Gelee: sehr glatt + leuchtet von innen in der eigenen Farbe → wirkt durchscheinend, ohne Transparenz
    const jelly = kit.tint(1, { roughness: 0.1, emissiveFactor: 0.32 });
    const deep = kit.tint(0.8, { roughness: 0.12, emissiveFactor: 0.25 });
    const belly = kit.tint(WHITE, { roughness: 0.1, emissiveFactor: 0.2, mix: 0.4 });
    const body = mesh(SPHERE, jelly, [0, -0.14, 0], [0.27, 0.31, 0.24]);
    const tummy = mesh(SPHERE, belly, [0, -0.15, 0.17], [0.15, 0.17, 0.09]);
    const head = mesh(SPHERE, jelly, [0, 0.26, 0.02], [0.24, 0.22, 0.21]);
    const earL = mesh(SPHERE_LO, deep, [-0.17, 0.44, 0], [0.085, 0.085, 0.07]);
    const earR = mesh(SPHERE_LO, deep, [0.17, 0.44, 0], [0.085, 0.085, 0.07]);
    const snout = mesh(SPHERE_LO, belly, [0, 0.2, 0.19], [0.085, 0.06, 0.05]);
    const eyeL = mesh(SPHERE_TINY, EYE, [-0.085, 0.3, 0.2], [0.033, 0.04, 0.02]);
    const eyeR = mesh(SPHERE_TINY, EYE, [0.085, 0.3, 0.2], [0.033, 0.04, 0.02]);
    const nose = mesh(SPHERE_TINY, EYE, [0, 0.235, 0.235], [0.028, 0.02, 0.018]);
    // Ärmchen als runde Flügel, leicht nach oben geschwungen
    const armL = mesh(SPHERE, deep, [-0.33, -0.02, 0], [0.2, 0.11, 0.1], [0, 0, -0.45]);
    const armR = mesh(SPHERE, deep, [0.33, -0.02, 0], [0.2, 0.11, 0.1], [0, 0, 0.45]);
    const footL = mesh(SPHERE_LO, deep, [-0.14, -0.42, 0.04], [0.1, 0.07, 0.1]);
    const footR = mesh(SPHERE_LO, deep, [0.14, -0.42, 0.04], [0.1, 0.07, 0.1]);
    const engine = mesh(NOZZLE, METAL, [0, -0.45, -0.04]);
    const flame = mesh(FLAME, FIRE, [0, -0.73, -0.04], [0.85, 1, 0.85]);
    hull.add(body, tummy, head, earL, earR, snout, eyeL, eyeR, nose, armL, armR, footL, footR, engine, flame);
    return { flame, bomb: [0, -0.2, 0.25], bombSize: 0.62 };   // drückt die Bombe an den Bauch
  },

  ufo(hull, kit) {
    const paint = kit.tint(1, { roughness: 0.3 });
    const trim = kit.tint(TRIM);
    // Scheibe zur Kamera gekippt: Kuppel und Lichterkranz bleiben lesbar, auch wenn der Rumpf zielt
    const saucer = new THREE.Group();
    saucer.rotation.x = 0.55;
    saucer.position.y = 0.02;
    saucer.scale.setScalar(1.08);
    const disc = new THREE.Mesh(SAUCER, paint);
    const ring = new THREE.Mesh(SAUCER_RING, trim);
    const dome = mesh(DOME, GLASS, [0, 0.07, 0], [1, 1.1, 1]);
    const bottom = mesh(NOZZLE, METAL, [0, -0.13, 0], [1.2, 1, 1.2]);
    const flame = mesh(FLAME, FIRE, [0, -0.42, 0], [1.1, 1, 1.1]);
    saucer.add(disc, ring, dome, bottom, flame);
    for (let i = 0; i < UFO_LAMPS; i++) {
      const a = (i / UFO_LAMPS) * Math.PI * 2 + Math.PI / UFO_LAMPS;
      saucer.add(mesh(SPHERE_TINY, LAMP, [Math.sin(a) * 0.45, 0.025, Math.cos(a) * 0.45], [0.045]));
    }
    hull.add(saucer);
    return { flame, bomb: [0, 0.2, -0.22], bombSize: 0.8, bombParent: saucer };   // hinter der Kuppel
  },

  paper(hull, kit) {
    const paper = { flatShading: true, side: THREE.DoubleSide, roughness: 0.55 };
    const wings = new THREE.Mesh(PAPER_WINGS, kit.tint(1, paper));
    const folds = new THREE.Mesh(PAPER_FOLDS, kit.tint(WHITE, { ...paper, mix: 0.35 }));
    const keel = new THREE.Mesh(PAPER_KEEL, kit.tint(TRIM, paper));
    const engine = mesh(NOZZLE, METAL, [0, -0.43, -0.07], [0.7, 0.8, 0.7]);
    const flame = mesh(FLAME_SMALL, FIRE, [0, -0.63, -0.07]);
    hull.add(wings, folds, keel, engine, flame);
    return { flame, bomb: [0, -0.12, 0.2], bombSize: 0.75 };   // reitet obenauf, sonst verdeckt der Flieger sie
  },

  rocket(hull, kit) {
    const paint = kit.tint(1);
    const trim = kit.tint(TRIM);
    const body = new THREE.Mesh(ROCKET_BODY, paint);
    const tip = new THREE.Mesh(ROCKET_TIP, trim);
    // drei Flossen: eine zur Kamera, zwei schräg hinten links/rechts
    const fins = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6].map(a => mesh(ROCKET_FIN, trim, [0, -0.06, 0], [], [0, a, 0]));
    const port = mesh(SPHERE, GLASS, [0, 0.07, 0.225], [0.085, 0.085, 0.04]);
    const rim = mesh(PORT_RIM, METAL, [0, 0.07, 0.235], [], [-0.12, 0, 0]);
    const engine = mesh(NOZZLE, METAL, [0, -0.47, 0], [1.25, 1, 1.25]);
    const flame = mesh(FLAME_BIG, FIRE, [0, -0.86, 0]);
    hull.add(body, tip, ...fins, port, rim, engine, flame);
    return { flame, bomb: [0.3, -0.16, 0], bombSize: 0.62 };   // seitlich angeschnallt wie ein Zusatztank
  },
};

/**
 * @param {{ capacity?: number, special?: string, design?: string }} [kind]  Schiffsklasse / Spreng-Flieger / Design
 *   (SHIP_DESIGNS, unbekannt → 'classic')
 */
export function createShipModel(colorId, ammo, { capacity = 20, special, design = 'classic' } = {}) {
  const base = new THREE.Color(COLORS[colorId]);

  // eigene Materialien in (abgewandelter) Spielfarbe: werden abgedunkelt (setDim) und entsorgt (dispose)
  const tinted = [];
  const tint = (shade, { emissiveFactor = 0, mix = 0, ...options } = {}) => {
    const color = shade instanceof THREE.Color ? base.clone().lerp(shade, mix) : base.clone().multiplyScalar(shade);
    const material = candyMaterial({ ...options, color, ...(emissiveFactor ? { emissive: color, emissiveIntensity: emissiveFactor } : {}) });
    tinted.push({ material, color: color.clone(), glow: emissiveFactor });
    return material;
  };

  const group = new THREE.Group();
  const bob = new THREE.Group();
  const hull = new THREE.Group();
  const built = (DESIGNS[design] ?? DESIGNS.classic)(hull, { tint });
  const { flame } = built;
  if (special === 'bomber') {
    // Bombe am Rumpf (Platz je Design)
    const bomb = new THREE.Mesh(BOMB, BOMB_MATERIAL);
    bomb.position.fromArray(built.bomb);
    bomb.scale.setScalar(built.bombSize ?? 1);
    (built.bombParent ?? hull).add(bomb);
  }
  bob.add(hull);
  bob.scale.setScalar(CLASS_SCALE[special === 'bomber' ? 1 : capacity] ?? 1);

  // Munitions-Blase: weiße Zahl auf dunkler Kugel mit Rand in der Schiffsfarbe
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LABEL_PX;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  label.scale.set(0.72, 0.72, 1);
  label.position.y = -1.15;
  label.renderOrder = 10;
  group.add(bob, label);

  const css = `#${base.getHexString()}`;
  let shown = null;
  const setAmmo = n => {
    if (n === shown) return;
    shown = n;
    const ctx = canvas.getContext('2d');
    const c = LABEL_PX / 2;
    ctx.clearRect(0, 0, LABEL_PX, LABEL_PX);
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(17,20,42,.85)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = css;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 44px "Sour Gummy", ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), c, c + 3);
    texture.needsUpdate = true;
  };
  setAmmo(ammo);

  let dimmed = 0;
  /** Abdunkeln (0 … 1) – wartende Schiffe in der Warteschlange, Schiffe vor belegter Plattform */
  const setDim = k => {
    if (Math.abs(k - dimmed) < 0.004) return;
    dimmed = k;
    for (const { material, color, glow } of tinted) {
      material.color.copy(color).lerp(DIM, k * 0.6);
      if (glow) material.emissiveIntensity = glow * (1 - k * 0.6);
    }
  };

  return {
    group,
    bob,
    hull,
    flame,
    label,
    setAmmo,
    setDim,
    dispose() {
      for (const { material } of tinted) material.dispose();
      label.material.dispose();
      texture.dispose();
    },
  };
}
