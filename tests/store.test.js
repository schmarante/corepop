import { describe, expect, it } from 'vitest';
import { decode, encode } from '../src/scripts/store/secure.js';

describe('Spielstand verwürfelt und signiert (secure.js)', () => {
  it('liest zurück, was geschrieben wurde – auch Umlaute', () => {
    const plain = JSON.stringify({ unlocked: 7, name: 'Würfel' });
    expect(decode('corepop:v1', encode('corepop:v1', plain))).toBe(plain);
  });

  it('derselbe Wert sieht nie zweimal gleich aus und steht nicht im Klartext da', () => {
    const a = encode('corepop:v1', '{"unlocked":7}');
    expect(a).not.toBe(encode('corepop:v1', '{"unlocked":7}'));
    expect(a).not.toContain('unlocked');
  });

  it('Klartext, veränderte und kopierte Werte werden ignoriert', () => {
    expect(decode('corepop:v1', '{"unlocked":12}')).toBeNull();
    // viele Durchläufe: jede Speicherung hat eine andere Nonce – der Test darf nicht vom Zufall abhängen
    for (let k = 0; k < 200; k++) {
      const stored = encode('corepop:v1', '{"unlocked":3}');
      const [prefix, nonce, mac, data] = stored.split('.');
      // erstes Zeichen ändern – es trägt immer echte Datenbits (die letzten können Base64-Auffüllung sein)
      const flipped = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
      expect(decode('corepop:v1', [prefix, nonce, mac, flipped].join('.'))).toBeNull();
    }
    const stored = encode('corepop:v1', '{"unlocked":3}');
    const [prefix, nonce, mac, data] = stored.split('.');
    expect(decode('corepop:v1', [prefix, nonce, mac.replace(/.$/, c => (c === '0' ? '1' : '0')), data].join('.'))).toBeNull();
    expect(decode('anderer:schluessel', stored)).toBeNull();
    expect(decode('corepop:v1', null)).toBeNull();
  });
});
