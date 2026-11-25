// Spielstand auf diesem Gerät (localStorage, nie irgendwohin gesendet): freigeschaltete Level, Sterne je Level,
// gewähltes Flieger-Design. Verwürfelt und signiert gespeichert (secure.js) – in den Entwicklerwerkzeugen lässt er
// sich nicht einfach ändern. Jeder Zugriff abgefangen: ein blockierter Speicher darf das Spiel nie kaputt machen.
//
// Freischalten:
//   Specials (je Levelversuch einmal einsetzbar) nach erreichtem Level – SPECIALS; die Supernova hat dazu eine Ladung,
//   die über Level hinweg bleibt (novaCharge – einsetzen oder für den Boss aufheben)
//   Flieger-Designs nach gesammelten Sternen – DESIGNS
import { LEVELS } from '../core/levels.js';
import { secureGet, secureSet } from './secure.js';

const KEY = 'corepop:v1';

/** Specials: ab welchem Level (0-basiert, „erreicht“ = freigeschaltet) */
export const SPECIALS = [
  { id: 'pad', from: 2 },      // Plattform +1 – ab Level 3
  { id: 'nova', from: 3 },     // Supernova – ab Level 4: sofort einsetzen oder für den ersten Boss (Level 5) aufheben
  { id: 'recolor', from: 4 },  // Farbwechsel – ab Level 5
  { id: 'recall', from: 7 },   // Zurückziehen – ab Level 8 (Flieger vom Deck zurück aufs Band)
];
/** Supernova: so viele Level Fortschritt (zerstörte Blöcke ÷ Blöcke des Levels) braucht eine volle Ladung */
export const NOVA_RECHARGE = 2;

/** Flieger-Designs: ab wie vielen Sternen insgesamt (Reihenfolge = Menü) */
export const DESIGNS = [
  { id: 'classic', stars: 0 },
  { id: 'paper', stars: 6 },
  { id: 'gummy', stars: 16 },
  { id: 'rocket', stars: 30 },
  { id: 'ufo', stars: 45 },
];

function load() {
  try {
    return JSON.parse(secureGet(KEY)) ?? {};
  } catch {
    return {};
  }
}

const save = data => secureSet(KEY, JSON.stringify(data));

export function unlockedLevel() {
  const n = Number(load().unlocked ?? 0);
  return Math.min(LEVELS.length - 1, Math.max(0, Number.isInteger(n) ? n : 0));
}

/** schaltet Level `index` frei (nie zurück) */
export function unlockLevel(index) {
  if (index <= unlockedLevel() || index >= LEVELS.length) return;
  save({ ...load(), unlocked: index });
}

/** beste Sterne eines Levels (0 = noch nicht geschafft) */
export function levelStars(index) {
  const n = Number(load().stars?.[index] ?? 0);
  return Number.isInteger(n) ? Math.min(3, Math.max(0, n)) : 0;
}

export function totalStars() {
  return LEVELS.reduce((sum, _, i) => sum + levelStars(i), 0);
}

/**
 * Sterne eintragen (nur, wenn mehr als bisher). @returns {{ designs: string[] }}  Designs, die dadurch neu frei sind
 */
export function recordStars(index, stars) {
  const before = totalStars();
  if (stars <= levelStars(index)) return { designs: [] };
  const data = load();
  data.stars = { ...data.stars, [index]: stars };
  save(data);
  const after = totalStars();
  return { designs: DESIGNS.filter(d => d.stars > before && d.stars <= after).map(d => d.id) };
}

/** Ladung der Supernova 0 … 1 – bleibt über Level und Sitzungen; noch nie gespeichert = voll (frisch freigeschaltet) */
export function novaCharge() {
  const n = Number(load().nova ?? 1);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

export function setNovaCharge(value) {
  const n = Math.min(1, Math.max(0, value));
  if (Math.abs(n - novaCharge()) < 1e-4) return;
  save({ ...load(), nova: n });
}

/** ist dieses Special freigeschaltet? (nach erreichtem Level) */
export const specialUnlocked = id => unlockedLevel() >= (SPECIALS.find(s => s.id === id)?.from ?? Infinity);

export const designUnlocked = id => totalStars() >= (DESIGNS.find(d => d.id === id)?.stars ?? Infinity);

/** gewähltes Flieger-Design (nur ein freigeschaltetes, sonst klassisch) */
export function shipDesign() {
  const id = load().design;
  return designUnlocked(id) ? id : 'classic';
}

export function setShipDesign(id) {
  if (!designUnlocked(id)) return;
  save({ ...load(), design: id });
}

/** Test-Hilfe (Taste P, nur Debug-Builds): alle Level frei, überall drei Sterne */
export function unlockEverything() {
  save({ ...load(), unlocked: LEVELS.length - 1, stars: Object.fromEntries(LEVELS.map((_, i) => [i, 3])) });
}
