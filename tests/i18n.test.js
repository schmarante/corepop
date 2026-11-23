import { describe, expect, it } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, LANGUAGES, SLUGS, PAGES } from '../src/i18n/index.js';
import { COLORS } from '../src/scripts/core/colors.js';

/** alle Blatt-Schlüssel mit ihren Platzhaltern */
const leaves = (node, prefix = '') =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'object' && !('other' in v) ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, JSON.stringify(v).match(/\{\w+\}/g)?.sort().join() ?? '']],
  );

describe('Übersetzungen', () => {
  const reference = Object.fromEntries(leaves(LOCALES[DEFAULT_LOCALE]));
  it.each(LANGUAGES.map(l => l.code))('%s hat dieselben Schlüssel und Platzhalter wie Deutsch', code => {
    expect(Object.fromEntries(leaves(LOCALES[code]))).toEqual(reference);
  });
  it('jede Spielfarbe hat einen Namen', () => {
    for (const id of Object.keys(COLORS)) expect(reference[`colors.${id}`]).toBeDefined();
  });
  it.each(LANGUAGES.map(l => l.code))('%s hat einen ASCII-Slug für jede Seite', code => {
    for (const page of PAGES) expect(SLUGS[code][page]).toMatch(/^[a-z0-9-]+$/);
  });
});
