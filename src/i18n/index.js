// UI-Texte. Nie Texte hart codieren – jeder Schlüssel steht in jeder Sprachdatei
// (tests/i18n.test.js prüft gleiche Schlüssel und Platzhalter in allen Sprachen).
// Neue Sprache: JSON anlegen, unten in LOCALES, LANGUAGES und SLUGS eintragen, Code in astro.config.mjs (i18n.locales).
import de from './de.json';
import en from './en.json';

export const LOCALES = { de, en };
export const DEFAULT_LOCALE = 'de';
/** Sprachmenü: Code + Name in der eigenen Sprache (Reihenfolge = Menü) */
export const LANGUAGES = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
];
export const OTHER_LOCALES = LANGUAGES.map(l => l.code).filter(c => c !== DEFAULT_LOCALE);
/** localStorage-Schlüssel der gewählten Sprache (Sprachmenü) */
export const LANG_STORAGE_KEY = 'corepop:lang';

/** Seiten-Ids ('' = Start) und ihr URL-Slug pro Sprache – nur ASCII, damit Links Messenger und Copy & Paste überleben. */
export const PAGES = ['play'];
export const SLUGS = {
  de: { play: 'spielen' },
  en: { play: 'play' },
};

/** t('game.level', { n: 2 }) → Text mit ausgefüllten {Platzhaltern}; fällt auf Deutsch zurück. */
export function useTranslations(locale = DEFAULT_LOCALE) {
  const lookup = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict);
  const plural = new Intl.PluralRules(locale);
  return (key, params = {}) => {
    let text = lookup(LOCALES[locale], key) ?? lookup(LOCALES[DEFAULT_LOCALE], key) ?? key;
    // Pluralformen: { one, few, many, other }, gewählt über params.count
    if (text && typeof text === 'object' && 'other' in text && typeof params.count === 'number') text = text[plural.select(params.count)] ?? text.other;
    return typeof text === 'string' ? text.replace(/\{(\w+)\}/g, (m, name) => params[name] ?? m) : text;
  };
}

/** Pfad einer Seite in einer Sprache, mit übersetztem Slug und Base-Pfad; Deutsch ohne Sprach-Präfix. */
export function localePath(locale, page = '') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const slug = page ? `${SLUGS[locale]?.[page] ?? page}/` : '';
  return `${base}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/${slug}`;
}

/** getStaticPaths für src/pages/[lang]/ (alle Sprachen außer der Standardsprache) */
export const otherLocalePaths = () => OTHER_LOCALES.map(lang => ({ params: { lang } }));

/** getStaticPaths für src/pages/[lang]/[slug]/: jede Seite in jeder anderen Sprache */
export const otherLocalePagePaths = () =>
  OTHER_LOCALES.flatMap(lang => PAGES.map(page => ({ params: { lang, slug: SLUGS[lang][page] }, props: { page } })));
