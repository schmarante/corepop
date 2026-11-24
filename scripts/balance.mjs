// Schwierigkeitsgrad messen: spielt jedes Level mit beiden Bots (src/scripts/core/simulate.js) auf mehreren Seeds
// und zeigt die Gewinnquoten. Ziel der Kurve: der Zufalls-Bot gewinnt anfangs oft und später kaum noch, der schlaue Bot
// gewinnt jedes Level.
//   ddev exec node scripts/balance.mjs            alle Level, 8 Seeds
//   ddev exec node scripts/balance.mjs 3 10       nur Level 3, 10 Seeds
// Spalten rechts (schlauer Bot): Ø Spielzeit (nur gewonnene Spiele), Starts, heruntergefallene Schiffe, Fehlstarts,
// Sterne; dahinter die Verlustgründe beider Bots (jam = Hangar verstopft, ammo = unverzichtbares Schiff gefallen)
import { LEVELS } from '../src/scripts/core/levels.js';
import { DEFAULT_BELT_SPEED } from '../src/scripts/core/game.js';
import { simulate } from '../src/scripts/core/simulate.js';

const only = Number(process.argv[2]) || null;
const seeds = Number(process.argv[3]) || 8;
const pct = (n, total) => `${Math.round((100 * n) / total)}%`.padStart(5);
const avg = (list, key) => (list.reduce((s, r) => s + r[key], 0) / (list.length || 1)).toFixed(1);
const reasons = list => {
  const count = {};
  for (const r of list) if (!r.won) count[r.reason] = (count[r.reason] ?? 0) + 1;
  return Object.entries(count).map(([k, n]) => `${k}×${n}`).join(' ') || '–';
};

console.log('Level  Figur        Slots Band Shuffle | Zufall  Schlau  | Ø Zeit  Starts Fallen Fehlst. Sterne | verloren: zufällig / schlau');
for (const [i, level] of LEVELS.entries()) {
  if (only && only !== i + 1) continue;
  const runs = bot => Array.from({ length: seeds }, (_, k) => simulate(level, { bot, seed: `${level.seed}#${k}` }));
  const random = runs('random');
  const smart = runs('smart');
  const won = smart.filter(r => r.won);
  console.log(
    `${String(i + 1).padStart(5)}  ${level.model.type.padEnd(12)} ${String(level.slots).padStart(5)} ${String(level.belt ?? DEFAULT_BELT_SPEED).padStart(4)} ${String(level.shuffle ?? 0).padStart(7)} |` +
      ` ${pct(random.filter(r => r.won).length, seeds)}   ${pct(won.length, seeds)}   | ${String(Math.round(avg(won, 'time'))).padStart(4)} s ${avg(smart, 'launches').padStart(6)} ${avg(smart, 'drops').padStart(6)} ${avg(smart, 'misfires').padStart(7)} ${avg(won, 'stars').padStart(6)} |` +
      ` ${reasons(random)} / ${reasons(smart)}`,
  );
}
