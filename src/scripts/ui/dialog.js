// Ergebnis-Dialog (gewonnen / verloren) über dem Spiel – <dialog> mit showModal(): Fokus und Escape vom Browser.
export function createDialog(el) {
  const title = el.querySelector('[data-dialog-title]');
  const text = el.querySelector('[data-dialog-text]');
  const action = el.querySelector('[data-dialog-action]');
  let onAction = null;
  action.addEventListener('click', () => {
    el.close();
    onAction?.();
  });
  // Escape schließt nicht: ohne Entscheidung ginge es nicht weiter
  el.addEventListener('cancel', e => e.preventDefault());
  return {
    show({ heading, body = '', label, run }) {
      title.textContent = heading;
      text.textContent = body;
      text.hidden = !body;
      action.textContent = label;
      onAction = run;
      el.showModal();
    },
    hide() {
      if (el.open) el.close();
    },
  };
}
