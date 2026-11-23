// Kopfzeile im Spiel: Level-Nummer und Fortschrittsbalken.
export function createHud(root, t) {
  const level = root.querySelector('[data-hud-level]');
  const bar = root.querySelector('[data-hud-bar]');
  const fill = root.querySelector('[data-hud-fill]');
  const count = root.querySelector('[data-hud-count]');
  return {
    update({ index, destroyed, total }) {
      level.textContent = t('game.level', { n: index + 1 });
      fill.style.width = `${(100 * destroyed) / total}%`;
      count.textContent = `${destroyed}/${total}`;
      bar.setAttribute('aria-valuenow', String(destroyed));
      bar.setAttribute('aria-valuemax', String(total));
    },
  };
}
