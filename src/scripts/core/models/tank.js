// Modell „Panzer“ (Boss, eigenes Comic-Design, eher Spielzeug als Kriegsgerät): niedrige, bauchige Wanne mit
// abgeschrägtem Bug, zwei dicke Ketten mit großen Laufrollen (stahlgraue Scheiben mit dunkler Nabe) und Stollen auf
// dem Kettenband, darüber Kotflügel. Oben ein übergroßer, runder Turm mit einem übertrieben langen Kanonenrohr nach
// vorn (+x, Mündungsbremse mit dunkler Öffnung), runder Einstiegsluke mit Griff, Nietenreihen, cremefarbenem Stern
// (eigene, schlichte Schablone – kein Hoheitszeichen) an den Turmseiten, zwei runden Scheinwerfern vorn als
// „Kulleraugen“ und einer Antenne mit rosa Wimpel. Tarnflecken in Dunkelgrün, Hellgrün und Braun.
// Der bunte Kern steckt in Wanne, Ketten und Turm (Rohr, Antenne und Wimpel sind nur Haut).
import { inCylinderY } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['e', 'l', 'u', 'k', 'z', 'n', 'c', 'h'];

/** @param {{ radius: number }} params  radius: halbe Länge (Kettenende bis Rohrmündung) in Voxeln */
export function tankModel({ radius: R }) {
  const s = R / 24;                      // alle Maße für R = 24 entworfen
  const shift = Math.round(6 * s);       // Modell vertikal zentrieren (Y = Modellhöhe, y = Rasterhöhe)

  // Ketten: Stadion-Form (zwei Halbkreise + gerades Band) in x/y, links und rechts (|z| zwischen in und out)
  const track = { x: 12 * s, y: -12 * s, r: 4.8 * s, in: 7 * s, out: 12 * s };
  const trackDist = (x, Y) => Math.hypot(Math.max(0, Math.abs(x) - track.x), Y - track.y);
  const inTrack = (x, Y, z) => Math.abs(z) >= track.in && Math.abs(z) <= track.out && trackDist(x, Y) <= track.r;
  const wheels = [-12, -4, 4, 12].map(k => Math.round(k * s));

  // Wanne: unten schmal zwischen den Ketten, oben breit über den Ketten (Kotflügel), Bug und Heck abgeschrägt
  const hull = { front: 18 * s, back: -17 * s, top: -3 * s, fender: -6.6 * s, bottom: -13 * s, half: 12.9 * s };
  const hullTopAt = x => hull.top - Math.max(0, x - (hull.front - 5 * s)) * 0.9 - Math.max(0, hull.back + 3 * s - x) * 0.9;
  /** Oberkante: zu den Seiten rund abfallend (bauchig) */
  const topAt = (x, z) => hullTopAt(x) - Math.max(0, Math.abs(z) - (hull.half - 3.5 * s)) ** 2 / (4 * s);
  const inHull = (x, Y, z) => {
    if (x < hull.back || x > hull.front || Y > topAt(x, z)) return false;
    if (Y >= hull.fender) return Math.abs(z) <= hull.half;
    // unten zwischen den Ketten, Bug schräg nach unten zurück
    const front = hull.front - (hull.fender - Y) * 0.8;
    return Y >= hull.bottom && Math.abs(z) < track.in && x <= front && x >= hull.back + (hull.fender - Y) * 0.6;
  };

  // Turm: dicke, oben abgeflachte Kuppel, kopflastig groß
  const turret = { x: -2 * s, y: hull.top + 2.5 * s, rx: 11 * s, ry: 9.6 * s, rz: 10 * s };
  const inTurret = (x, Y, z) => {
    if (Y < hull.top - 1.5) return false;
    const dy = Y - turret.y;
    const e = ((x - turret.x) / turret.rx) ** 2 + (dy / turret.ry) ** 2 + (z / turret.rz) ** 2;
    return e <= 1 && dy <= turret.ry * 0.78;   // flaches Dach
  };
  const turretTop = turret.y + turret.ry * 0.78;

  // Kanone: langes Rohr nach vorn, dicke Mündungsbremse, am Turm eine eckige Blende
  const gun = { y: turret.y + 2.2 * s, r: 1.7 * s, muzzle: 2.6 * s, tip: R, brake: R - 3.6 * s };
  const inGun = (x, Y, z) => {
    if (x < turret.x || x > gun.tip) return false;
    const d = Math.hypot(Y - gun.y, z);
    return d <= (x >= gun.brake ? gun.muzzle : gun.r);
  };
  const mantlet = { x0: turret.x + turret.rx - 3 * s, x1: turret.x + turret.rx + 1.5 * s };
  const inMantlet = (x, Y, z) => x >= mantlet.x0 && x <= mantlet.x1 && Math.abs(Y - gun.y) <= 3.2 * s && Math.abs(z) <= 4.2 * s;

  // Luke auf dem Turmdach mit Bügelgriff
  const hatch = { x: -5 * s, z: -3 * s, r: 3.6 * s };
  const inHatch = (x, Y, z) =>
    inCylinderY(x, Y, z, [hatch.x, hatch.z], hatch.r, turretTop - 1, turretTop + 1) ||
    (Math.abs(z - hatch.z) < 0.5 && Math.abs(x - hatch.x) <= 1.5 * s && Y > turretTop + 1 && Y <= turretTop + 2.5 &&
      (Math.abs(x - hatch.x) > 1.5 * s - 1 || Y > turretTop + 1.6));

  // Antenne hinten am Turm mit wehendem Wimpel (nach hinten, −x)
  const antenna = { x: Math.round(-9.5 * s), z: Math.round(5 * s), top: R - shift - 0.5 };
  const inAntenna = (x, Y, z) => Math.abs(x - antenna.x) < 0.5 && Math.abs(z - antenna.z) < 0.5 && Y > turretTop - 2 && Y <= antenna.top;
  const flag = { length: 7 * s, height: 5 * s };
  const inFlag = (x, Y, z) => {
    const t = (antenna.x - 0.5 - x) / flag.length;   // 0 an der Antenne … 1 am Ende
    if (t < 0 || t > 1) return false;
    const half = (flag.height / 2) * (1 - t * 0.55);
    const wave = Math.sin(t * Math.PI * 1.6) * 1.3 * t;
    return Math.abs(Y - (antenna.top - flag.height / 2 - t * 0.8)) <= half && Math.abs(z - antenna.z - wave) <= 0.55;
  };

  // Scheinwerfer: zwei kurze, dicke Zylinder vorn auf den Kotflügeln – von vorn wie Kulleraugen
  const lamp = { x0: hull.front - 5 * s, x1: hull.front + 1.5 * s, y: Math.round(hull.fender + 2.6 * s), z: Math.round(8.5 * s), r: 2.3 * s };
  const lampDist = (Y, z) => Math.hypot(Y - lamp.y, Math.abs(z) - lamp.z);
  const inLamp = (x, Y, z) => x >= lamp.x0 && x <= lamp.x1 && lampDist(Y, z) <= lamp.r;

  // Auspuff: zwei kurze Rohre hinten
  const inExhaust = (x, Y, z) => x < hull.back + 1 && x >= hull.back - 1.6 * s && [-1, 1].some(k => Math.hypot(Y - (hull.top - 2.2 * s), z - k * 7 * s) <= 1.2 * s);

  /** Tarnflecken: weiche Rauschfunktion aus Sinuswellen → große, runde Flecken (h < -0.5 braun, h > 0.55 hellgrün) */
  const camo = (x, Y, z) => {
    const h =
      Math.sin(x * 0.31 / s + z * 0.17 / s + 1.3) + Math.sin(z * 0.37 / s - Y * 0.21 / s + 0.4) + Math.sin(Y * 0.33 / s + x * 0.19 / s - 2.1) * 0.8;
    if (h > 0.95) return 'l';
    if (h < -1.15) return 'u';
    return 'e';
  };

  /** Stern (fünfzackig, Spitze oben) in 2D, Außenradius ro */
  const inStar = (u, v, ro) => {
    const ri = ro * 0.45;
    const a = Math.atan2(u, v);                       // 0 = oben
    const seg = (Math.PI * 2) / 5;
    const t = (((a % seg) + seg) % seg) / seg;        // 0 … 1 innerhalb eines Zackens
    const f = Math.abs(t - 0.5) * 2;                  // 1 an der Spitze, 0 in der Kerbe
    return Math.hypot(u, v) <= ri + (ro - ri) * f;
  };

  return {
    bounds: Math.ceil(R) + 1,
    solid(x, y, z) {
      const Y = y - shift;
      return (
        inTrack(x, Y, z) || inHull(x, Y, z) || inTurret(x, Y, z) || inGun(x, Y, z) || inMantlet(x, Y, z) ||
        inHatch(x, Y, z) || inAntenna(x, Y, z) || inFlag(x, Y, z) || inExhaust(x, Y, z) || inLamp(x, Y, z)
      );
    },
    skin(x, y, z) {
      const Y = y - shift;
      if (inFlag(x, Y, z) && !inAntenna(x, Y, z)) {
        const t = (antenna.x - 0.5 - x) / flag.length;
        return Math.abs(Y - (antenna.top - flag.height / 2 - t * 0.8)) < 0.6 ? 'c' : 'h';   // Streifen in der Mitte
      }
      if (inAntenna(x, Y, z)) return Y > antenna.top - 0.6 ? 'h' : 'n';
      if (inExhaust(x, Y, z) && !inHull(x, Y, z)) return x < hull.back - 0.8 * s && [-1, 1].some(k => Math.hypot(Y - (hull.top - 2.2 * s), z - k * 7 * s) < 0.6) ? 'n' : 'k';
      if (inLamp(x, Y, z)) {
        // Kulleraugen: cremefarbenes Glas mit dunkler Pupille (leicht nach innen-oben), Gehäuse stahlgrau
        if (x > lamp.x1 - 1) {
          const d = Math.hypot(Y - lamp.y - 0.6, Math.abs(z) - lamp.z + 0.6);
          return d < 0.9 ? 'n' : lampDist(Y, z) < lamp.r - 0.6 ? 'c' : 'z';
        }
        return 'z';
      }
      if (inHatch(x, Y, z) && !inTurret(x, Y, z)) {
        if (Y > turretTop + 1) return 'n';                                   // Griff
        return Math.abs(Math.hypot(x - hatch.x, z - hatch.z) - hatch.r) < 0.9 ? 'k' : 'z';
      }
      if (inGun(x, Y, z) && !inTurret(x, Y, z) && !inMantlet(x, Y, z)) {
        if (x > gun.tip - 0.6 && Math.hypot(Y - gun.y, z) < 1.3 * s) return 'n';   // Mündung
        if (x >= gun.brake && x < gun.brake + 1) return 'k';                     // Ring an der Mündungsbremse
        if (x < gun.brake && Math.abs(x - (gun.brake - 6 * s)) < 0.5) return 'k';  // Ring am Rohr
        return 'z';
      }
      if (inMantlet(x, Y, z) && !inTurret(x, Y, z)) {
        // Blende: dunkel, Nieten in den Ecken
        const corner = Math.abs(Math.abs(Y - gun.y) - 2.4 * s) < 0.5 && Math.abs(Math.abs(z) - 3.2 * s) < 0.5;
        return corner ? 'z' : 'k';
      }
      if (inTurret(x, Y, z)) {
        // Stern an beiden Turmseiten
        if (Math.abs(z) > turret.rz * 0.45 && inStar(x - (turret.x - 1 * s), Y - (turret.y + 1.8 * s), 5.4 * s)) return 'c';
        // Nietenreihe rund um den Turmfuß
        const a = Math.atan2(z, x - turret.x);
        if (Math.abs(Y - (hull.top + 1.5)) < 0.5 && Math.abs(((a / (Math.PI * 2)) * 36 + 36) % 2 - 1) > 0.7) return 'z';
        return camo(x, Y, z);
      }
      if (inTrack(x, Y, z) && !inHull(x, Y, z)) {
        const d = trackDist(x, Y);
        if (Math.abs(z) > track.out - 0.8 && d < track.r - 1.2) {
          // Außenseite: Laufrollen als Scheiben mit Nabe
          for (const wx of wheels) {
            const w = Math.hypot(x - wx, Y - track.y);
            if (w < 0.9) return 'n';                       // Nabe
            if (Math.abs(w - 2) < 0.45) return 'k';        // Zierring
            if (w <= 3.2 * s) return 'z';
          }
          return 'k';
        }
        if (d > track.r - 1.2) {
          // Kettenband: Stollen quer über das Band, gleichmäßig entlang des Umfangs
          const along = Math.abs(x) <= track.x ? x : Math.sign(x) * (track.x + Math.atan2(Math.abs(x) - track.x, track.y - Y + 1e-6) * track.r);
          const pos = Y > track.y ? along : -along;
          return ((Math.round(pos) % 3) + 3) % 3 === 0 ? 'n' : 'k';
        }
        return 'k';
      }
      if (inHull(x, Y, z)) {
        // Kotflügel-Kante dunkel, Nietenreihe darüber
        if (Y >= hull.fender && Y < hull.fender + 1 && Math.abs(z) > hull.half - 1.2) return 'k';
        if (Math.abs(z) > hull.half - 1 && Math.abs(Y - (hull.fender + 2.4 * s)) < 0.5 && ((Math.round(x) % 4) + 4) % 4 === 0) return 'z';
        if (Y < hull.fender) return 'k';                                    // Unterwanne im Schatten der Ketten
        return camo(x, Y, z);
      }
      return 'k';
    },
  };
}
