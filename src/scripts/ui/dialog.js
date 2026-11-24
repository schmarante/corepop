// Ergebnis-Dialog (gewonnen / verloren) über dem Spiel – <dialog> mit showModal(): Fokus und Escape vom Browser.
export function createDialog(el) {
  const title = el.querySelector('[data-dialog-title]');
  const text = el.querySelector('[data-dialog-text]');
  const action = el.querySelector('[data-dialog-action]');
  const starRow = el.querySelector('[data-dialog-stars]');
  const stars = [...el.querySelectorAll('[data-star]')];
  let timers = [];
  let onAction = null;
  action.addEventListener('click', () => {
    el.close();
    onAction?.();
  });
  // Escape schließt nicht: ohne Entscheidung ginge es nicht weiter
  el.addEventListener('cancel', e => e.preventDefault());
  return {
    /** `stars` (0 … 3, optional): Sterne leuchten nacheinander auf (`onStar(k)` je Stern – für den Klang) */
    show({ heading, body = '', label, run, stars: count = null, starsLabel = '', onStar = () => {} }) {
      title.textContent = heading;
      for (const timer of timers) clearTimeout(timer);
      timers = [];
      if (starRow) {
        starRow.hidden = count === null;
        starRow.setAttribute('aria-label', starsLabel);
        stars.forEach((star, k) => {
          star.classList.remove('is-on');
          if (count !== null && k < count) timers.push(setTimeout(() => {
            star.classList.add('is-on');
            onStar(k);
          }, 350 + k * 280));
        });
      }
      text.textContent = body;
      text.hidden = !body;
      action.textContent = label;
      onAction = run;
      el.showModal();
    },
    hide() {
      if (el.open) el.close();
    },
    get open() {
      return el.open;
    },
  };
}
