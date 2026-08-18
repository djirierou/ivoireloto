/**
 * Tests de non-régression — bugs corrigés en v2.1.2
 * Lancer avec: npm test
 */
import { describe, it, expect } from 'vitest';
import { StatsEngine } from '../stats.js';
import { sanitizeSession } from '../validator.js';
import { iso, parsePasteText } from '../utils.js';
import { generateTransparencyReport } from '../sync.js';
import { nextId } from '../db.js';

describe('drawsInPeriod — robustesse', () => {
  const draws = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(2024, 5, 1 + i);
    return { date: iso(d), session: 'Midi', win: [1, 2, 3, 4, 5], machine: [] };
  });

  it('ne lève pas RangeError sur une période non numérique', () => {
    // Avant: parseInt('abc') = NaN -> setDate(NaN) -> Invalid Date
    // -> toISOString() levait RangeError et la vue restait blanche.
    expect(() => StatsEngine.drawsInPeriod(draws, 'abc')).not.toThrow();
    expect(StatsEngine.drawsInPeriod(draws, 'abc')).toHaveLength(40);
  });

  it('ne lève pas sur une date de référence invalide', () => {
    expect(() => StatsEngine.drawsInPeriod(draws, '30', new Date('nope'))).not.toThrow();
  });

  it('filtre correctement une période valide', () => {
    const ref = new Date(2024, 6, 10);
    expect(StatsEngine.drawsInPeriod(draws, '7', ref).length).toBeLessThan(40);
    expect(StatsEngine.drawsInPeriod(draws, 'all', ref)).toHaveLength(40);
  });
});

describe('iso() — fuseau horaire local', () => {
  it('ne décale pas la date en fin de journée', () => {
    // Avant: toISOString() convertissait en UTC. Pour un utilisateur en UTC-4,
    // saisir à 21h locales pré-remplissait la date du LENDEMAIN, que le
    // validateur rejetait ensuite comme « date future ».
    const d = new Date(2026, 7, 17, 23, 30, 0); // 17 août, 23h30 locales
    expect(iso(d)).toBe('2026-08-17');
  });

  it('renvoie une chaîne vide sur une date invalide', () => {
    expect(iso(new Date('invalide'))).toBe('');
  });
});

describe('parsePasteText', () => {
  it('rattache la ligne Machine au tirage plutôt que créer un tirage fantôme', () => {
    const paste = '01/08/2026\nDigital 21h\n16 79 40 4 18\n69 82 65 67 7';
    const r = parsePasteText(paste);
    expect(r).toHaveLength(1);
    expect(r[0].win).toEqual([16, 79, 40, 4, 18]);
    expect(r[0].machine).toEqual([69, 82, 65, 67, 7]);
  });

  it("n'invente aucun tirage sans date ni session", () => {
    // Avant: une ligne de 5 nombres isolée créait un tirage daté d'aujourd'hui
    // intitulé « Import ».
    expect(parsePasteText('12 34 56 78 90')).toHaveLength(0);
  });

  it('analyse du HTML sans confondre les valeurs CSS avec des numéros', () => {
    const html = `<html><head><style>.x{width:12px;margin:5px 7px 9px 11px}</style></head><body>
      <table><tr><td>01/08/2026</td><td>Digital 21h</td></tr>
      <tr><td><span>16</span><span>79</span><span>40</span><span>4</span><span>18</span></td></tr>
      </table></body></html>`;
    const r = parsePasteText(html);
    expect(r).toHaveLength(1);
    expect(r[0].win).toEqual([16, 79, 40, 4, 18]);
  });

  it('gère une entrée vide sans planter', () => {
    expect(parsePasteText('')).toEqual([]);
    expect(parsePasteText(null)).toEqual([]);
  });
});

describe('sanitizeSession', () => {
  it('accepte les noms de sessions légitimes', () => {
    for (const s of ['Nuit&Jour', "L'Espoir", '18h30', 'Bénédiction', 'Awalé']) {
      expect(sanitizeSession(s), s).toBe(s);
    }
  });

  it('rejette toujours le HTML', () => {
    for (const s of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>']) {
      expect(sanitizeSession(s), s).toBeNull();
    }
  });
});

describe('transparence — significativité statistique', () => {
  it('ne déclare pas « rentable » sur un échantillon minuscule', () => {
    // 1 succès sur 16 = 6,25% : au-dessus des 2,33% du hasard, mais
    // statistiquement insignifiant. Avant, le verdict se basait sur le seul ROI.
    const rep = generateTransparencyReport({ hitRate: 6.25, net: 5000, staked: 3200, total: 16, maxDD: -800 });
    expect(rep.isSignificant).toBe(false);
    expect(rep.verdict).toMatch(/insuffisant|Indistinguable/i);
    expect(rep.sampleAdvice).toBeTruthy();
  });

  it('reconnaît un écart réellement significatif', () => {
    const rep = generateTransparencyReport({ hitRate: 12, net: 500000, staked: 400000, total: 2000, maxDD: -5000 });
    expect(rep.isSignificant).toBe(true);
    expect(rep.zScore).toBeGreaterThan(1.96);
  });

  it('reste stable si total vaut zéro', () => {
    expect(() => generateTransparencyReport({ hitRate: 0, net: 0, staked: 0, total: 0, maxDD: 0 })).not.toThrow();
  });
});

describe('nextId — unicité des clés IndexedDB', () => {
  it('ne produit jamais deux fois le même identifiant', () => {
    // Avant: `Date.now()` seul -> deux tirages enregistrés dans la même
    // milliseconde partageaient la clé, le second écrasait le premier.
    const ids = Array.from({ length: 50000 }, () => nextId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produit des identifiants strictement croissants et sûrs', () => {
    const a = nextId(), b = nextId();
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
