// Spielstand auf diesem Gerät: höchstes freigeschaltetes Level (0-basiert).
import { LEVELS } from '../core/levels.js';

const KEY = 'corepop:unlocked';

export function unlockedLevel() {
  try {
    const n = Number.parseInt(localStorage.getItem(KEY) ?? '0', 10);
    return Math.min(LEVELS.length - 1, Math.max(0, Number.isFinite(n) ? n : 0));
  } catch {
    return 0;
  }
}

/** schaltet Level `index` frei (nie zurück) */
export function unlockLevel(index) {
  if (index <= unlockedLevel() || index >= LEVELS.length) return;
  try {
    localStorage.setItem(KEY, String(index));
  } catch {
    /* nicht gespeichert – Spiel läuft trotzdem */
  }
}
