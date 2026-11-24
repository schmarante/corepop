// Automatische Grafik-Stufe: Ist das Gerät zu langsam für GAME_FPS, schaltet die Bühne schrittweise herunter.
// Gemessen in stage.js (Abstand der Bilder), gemerkt in store/quality.js. Starke Geräte behalten den vollen Look.
//
// Was kostet (Stand 2026-11-24): Jeder Würfel ist eine RoundedBox mit 300 Dreiecken, Boss-Level zeichnen ~4 500 Würfel
// = 1,4 Mio. Dreiecke, mit Schattendurchlauf fast 3 Mio. pro Bild. Dazu Pixel-Ratio 2 mit PBR-Material und Kantenglättung.
//   Stufe 0  alles an
//   Stufe 1  ohne Sonnenschatten (zweiter Geometrie-Durchlauf + Schattenfilter je Pixel fallen weg)
//   Stufe 2  Pixel-Ratio 1,5 und gröber gerundete Würfel (108 statt 300 Dreiecke – gilt ab dem nächsten Level)
//   Stufe 3  Pixel-Ratio 1
// Standard ist Stufe 3 (DEFAULT_TIER, Wunsch des Users: flüssig auf allen Handys) – die Automatik kann von dort nur
// noch nicht weiter herunter, greift also erst, wenn der Standard höher gesetzt wird.
// Zum Testen: `?quality=0…3` in der Adresse setzt die Stufe fest (keine Automatik).
import { storedTier, storeTier } from '../store/quality.js';
import { loopInterval } from './frame-loop.js';

export const TIERS = [
  { shadows: true, pixelRatio: 2, segments: 2 },
  { shadows: false, pixelRatio: 2, segments: 2 },
  { shadows: false, pixelRatio: 1.5, segments: 1 },
  { shadows: false, pixelRatio: 1, segments: 1 },
];

const forced = (() => {
  try {
    const value = new URLSearchParams(location.search).get('quality');
    return value === null ? null : Math.min(TIERS.length - 1, Math.max(0, Math.round(Number(value)) || 0));
  } catch {
    return null;
  }
})();

const DEFAULT_TIER = 3;
// gemerkte Stufe gilt nur, wenn sie niedriger (schneller) ist als der Standard
let tier = forced ?? Math.min(TIERS.length - 1, Math.max(DEFAULT_TIER, storedTier()));
const listeners = new Set();

/** aktuelle Einstellungen */
export const quality = () => TIERS[tier];

/** Rückruf bei jeder Änderung; liefert eine Abmelde-Funktion */
export function onQualityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** eine Stufe herunter (false, wenn schon ganz unten oder von Hand festgelegt) */
export function lowerQuality() {
  if (forced !== null || tier >= TIERS.length - 1) return false;
  tier++;
  storeTier(tier);
  for (const fn of listeners) fn(TIERS[tier]);
  return true;
}

// Messung: Fenster von WINDOW s; erreicht der Schnitt nicht MIN_SHARE der möglichen Bildrate, zählt das Fenster als
// langsam. Erst SLOW_WINDOWS langsame Fenster hintereinander senken die Stufe – ein einzelner Hänger (Shader übersetzen,
// Explosion) nicht. Fenster mit einer langen Pause (Tab im Hintergrund, Level laden) zählen nicht.
// „Möglich“ hängt vom Display ab: 60/120 Hz → 60 fps, 90 Hz → 45 fps (jedes 2. Bild), Energiesparmodus (30 Hz) → 30.
// Die Bildwiederholrate ist der kürzeste je gemessene Abstand zweier Display-Bilder (beim Hineinwachsen eines Levels
// ist wenig zu zeichnen, da erreicht auch ein schwaches Gerät die volle Rate), höchstens aber MAX_REFRESH – sonst hielte
// ein Gerät, das nie schneller kann, seine eigene langsame Rate für die des Displays.
const WINDOW = 2;
const MIN_SHARE = 0.8;
const SLOW_WINDOWS = 2;
const HITCH = 1;       // s – längere Pause zwischen zwei Bildern (Tab im Hintergrund, Laden): Fenster verwerfen
const SETTLE = 1.5;    // s – nach dem Start und nach jeder Änderung erst einschwingen
const MIN_REFRESH = 5; // ms – kürzere Abstände sind Messrauschen
const MAX_REFRESH = 1000 / 30;   // ms – langsamer läuft kein Display (Energiesparmodus: 30 Hz)

/** Bildzeit-Messung für eine Schleife mit `fps`: `tick()` bei jedem Display-Bild, `frame()` je gezeichnetem Bild */
export function createQualityMeter(fps) {
  let refresh = MAX_REFRESH;
  let lastTick = 0;
  let last = 0;
  let settle = SETTLE;
  let time = 0;
  let frames = 0;
  let hitch = false;
  let slow = 0;
  return {
    tick(now = performance.now()) {
      const dt = now - lastTick;
      lastTick = now;
      if (dt >= MIN_REFRESH) refresh = Math.min(refresh, dt);
    },
    frame(now = performance.now()) {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (forced !== null || tier >= TIERS.length - 1) return;
      if (settle > 0) {
        settle -= Math.min(dt, HITCH);
        return;
      }
      if (dt > HITCH) hitch = true;
      time += dt;
      frames++;
      if (time < WINDOW) return;
      const possible = 1000 / loopInterval(fps, refresh);
      if (!hitch) slow = frames / time < possible * MIN_SHARE ? slow + 1 : 0;
      time = 0;
      frames = 0;
      hitch = false;
      if (slow >= SLOW_WINDOWS && lowerQuality()) {
        slow = 0;
        settle = SETTLE;
      }
    },
  };
}
