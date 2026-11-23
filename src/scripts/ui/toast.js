// Kurze Meldung über der Bühne („Bruchstück abgesprengt!“), verschwindet von selbst. Auch für Screenreader (aria-live).
const VISIBLE_MS = 1600;

export function createToast(el) {
  let timer = 0;
  return {
    show(text) {
      el.textContent = text;
      el.classList.remove('toast-in');
      void el.offsetWidth;   // Animation neu starten
      el.classList.add('toast-in');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('toast-in'), VISIBLE_MS);
    },
  };
}
