// Schwierigkeitsgrad messen: spielt jedes Level mit beiden Bots (src/scripts/core/simulate.js) auf mehreren Seeds
// und zeigt die Gewinnquoten. Ziel der Kurve: der Zufalls-Bot gewinnt anfangs oft und später kaum noch, der schlaue Bot
// gewinnt jedes Level.
//   ddev exec node scripts/balance.mjs            alle Level, 8 Seeds
//   ddev exec node scripts/balance.mjs 3 10       nur Level 3, 10 Seeds
// Spalten rechts: Ø Spielzeit, Starts und Schübe des schlauen Bots (nur gewonnene Spiele zählen für die Zeit)
import { LEVELS } from '../src/scripts/core/levels.js';
import { simulate } from '../src/scripts/core/simulate.js';

const only = Number(process.argv[2]) || null;
const seeds = Number(process.argv[3]) || 8;
const pct = (n, total) => `${Math.round((100 * n) / total)}%`.padStart(5);
const avg = (list, key) => Math.round(list.reduce((s, r) => s + r[key], 0) / (list.length || 1));

console.log('Level  Figur        Slots Shuffle Spin  | Zufall  Schlau  | Ø Zeit  Starts  Schübe (schlau)');
for (const [i, level] of LEVELS.entries()) {
  if (only && only !== i + 1) continue;
  const runs = bot => Array.from({ length: seeds }, (_, k) => simulate(level, { bot, seed: `${level.seed}#${k}` }));
  const random = runs('random');
  const smart = runs('smart');
  const won = smart.filter(r => r.won);
  console.log(
    `${String(i + 1).padStart(5)}  ${level.model.type.padEnd(12)} ${String(level.slots).padStart(5)} ${String(level.shuffle ?? 0).padStart(7)} ${String(level.spin).padStart(4)}  |` +
      ` ${pct(random.filter(r => r.won).length, seeds)}   ${pct(won.length, seeds)}   | ${String(avg(won, 'time')).padStart(4)} s ${String(avg(smart, 'launches')).padStart(6)} ${String(avg(smart, 'slides')).padStart(7)}`,
  );
}
