/**
 * Tests de non-régression — bugs corrigés en v2.1.1
 * Lancer avec: npm test
 */
import { describe, it, expect } from 'vitest';
import { StatsEngine, invalidateCache } from '../stats.js';
import { validateDate, validateDraw, validateNumbers } from '../validator.js';
import { parseCSV, normalizeDate, detectDelimiter } from '../utils.js';
import { RANDOM_HIT2_PCT, theoreticalROI, generateTransparencyReport } from '../sync.js';
import { normalizeDraw, normalizeDraws } from '../db.js';

/** Générateur déterministe de tirages purement aléatoires. */
function makeRandomDraws(n, seed = 42) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const win = [];
    while (win.length < 5) { const x = Math.floor(rnd() * 90) + 1; if (!win.includes(x)) win.push(x); }
    out.push({
      id: i,
      date: new Date(2020, 0, 1 + i).toISOString().slice(0, 10),
      session: 'Midi',
      win: win.sort((a, b) => a - b),
      machine: []
    });
  }
  return out;
}

describe('backtest — look-ahead bias', () => {
  it('markov ne doit pas dépasser le hasard sur des données aléatoires', () => {
    // Avant correction: ~87% de hit rate (la matrice Markov était calculée sur
    // TOUT l'historique, futur inclus). Attendu: proche de 2,33%.
    const draws = makeRandomDraws(300, 7);
    const r = StatsEngine.backtest(draws, 'markov', 30, 200, { 2: 2, 3: 10, 4: 100, 5: 2000 });
    expect(r.hitRate).toBeLessThan(10);
  });

  it('aucune stratégie ne bat significativement le hasard sur du bruit', () => {
    const draws = makeRandomDraws(300, 11);
    for (const strat of ['hot', 'ecart', 'mix', 'markov', 'weighted', 'sim']) {
      const r = StatsEngine.backtest(draws, strat, 30, 200, { 2: 2, 3: 10, 4: 100, 5: 2000 });
      expect(r.hitRate, `stratégie ${strat}`).toBeLessThan(15);
    }
  });

  it('ne mute pas le tableau de tirages fourni', () => {
    const draws = makeRandomDraws(120, 3);
    const snapshot = JSON.stringify(draws);
    StatsEngine.backtest(draws, 'hot', 20, 200, { 2: 2, 3: 10, 4: 100, 5: 2000 });
    expect(JSON.stringify(draws)).toBe(snapshot);
  });
});

describe('baseline hasard', () => {
  it('P(>=2/5) vaut 2,33% et non 23%', () => {
    // 23,04% est P(exactement 1/5), pas P(>=2/5).
    expect(RANDOM_HIT2_PCT).toBeCloseTo(2.3296, 3);
  });

  it('le ROI théorique reflète les multiplicateurs', () => {
    expect(theoreticalROI({ 2: 2, 3: 10, 4: 100, 5: 2000 })).toBeCloseTo(-94.59, 1);
    // Une grille de gains très généreuse doit produire un ROI positif
    expect(theoreticalROI({ 2: 50, 3: 500, 4: 5000, 5: 100000 })).toBeGreaterThan(0);
  });

  it("le rapport de transparence compare au bon hasard", () => {
    const rep = generateTransparencyReport({ hitRate: 2.3296, net: 0, staked: 1000, total: 10, maxDD: 0 });
    expect(rep.excessVsRandom).toBeCloseTo(0, 3);
  });
});

describe('cache mémo des statistiques', () => {
  it('ne confond pas deux jeux de données de même longueur', () => {
    invalidateCache();
    const a = makeRandomDraws(50, 1);
    const b = a.map(d => ({ ...d, win: [1, 2, 3, 4, 5] }));
    const sa = StatsEngine.computeStats(a, 'all', 'win', 15, 15);
    const sb = StatsEngine.computeStats(b, 'all', 'win', 15, 15);
    expect(sb.freq[1]).toBe(50);
    expect(sa.freq[1]).not.toBe(sb.freq[1]);
  });
});

describe('validation', () => {
  it('rejette les dates calendaires impossibles', () => {
    expect(validateDate('2020-02-31')).toBe(false);
    expect(validateDate('2021-02-29')).toBe(false); // 2021 non bissextile
    expect(validateDate('2020-02-29')).toBe(true);  // 2020 bissextile
    expect(validateDate('2020-13-01')).toBe(false);
  });

  it('exige 5 numéros gagnants mais tolère une machine vide', () => {
    expect(validateNumbers([], 'Win', false).ok).toBe(false);
    expect(validateNumbers([], 'Machine', true).ok).toBe(true);
    const d = validateDraw({ date: '2020-01-01', session: 'Midi', win: [], machine: [] });
    expect(d.ok).toBe(false);
  });

  it('rejette les sessions contenant du HTML', () => {
    const d = validateDraw({ date: '2020-01-01', session: '<img src=x onerror=alert(1)>', win: [1, 2, 3, 4, 5], machine: [] });
    expect(d.ok).toBe(false);
  });
});

describe('parseCSV', () => {
  const rows = '2020-01-01,Midi,1,2,3,4,5,6,7,8,9,10';
  const header = 'date,session,win_1,win_2,win_3,win_4,win_5,machine_1,machine_2,machine_3,machine_4,machine_5';

  it('gère le séparateur point-virgule', () => {
    const csv = `${header};${''}`.replace(/,/g, ';') + '\n' + rows.replace(/,/g, ';');
    const r = parseCSV(csv);
    expect(r).toHaveLength(1);
    expect(r[0].win).toEqual([1, 2, 3, 4, 5]);
    expect(r[0].machine).toEqual([6, 7, 8, 9, 10]);
  });

  it('relit son propre export (colonnes groupées + guillemets)', () => {
    const csv = '"Date";"Session";"Win";"Machine";"Somme"\n"2020-01-01";"Midi";"1 2 3 4 5";"6 7 8 9 10";"15"';
    const r = parseCSV(csv);
    expect(r).toHaveLength(1);
    expect(r[0].win).toEqual([1, 2, 3, 4, 5]);
    expect(r[0].machine).toEqual([6, 7, 8, 9, 10]);
  });

  it('accepte les dates au format français et le BOM Excel', () => {
    expect(normalizeDate('01/03/2020')).toBe('2020-03-01');
    expect(normalizeDate('2020-03-01')).toBe('2020-03-01');
    const r = parseCSV('\ufeff' + header + '\n' + rows);
    expect(r).toHaveLength(1);
  });

  it('détecte correctement le délimiteur', () => {
    expect(detectDelimiter('a;b;c;d')).toBe(';');
    expect(detectDelimiter('a,b,c,d')).toBe(',');
  });
});

describe('robustesse des tirages sans machine', () => {
  const noMachine = [{ id: 1, date: '2020-01-01', session: 'Midi', win: [1, 2, 3, 4, 5] }];

  it('normalise le champ machine manquant', () => {
    expect(normalizeDraw({ win: [1] }).machine).toEqual([]);
    expect(normalizeDraws([{ win: [1] }, null])).toHaveLength(1);
  });

  it('ne plante pas sur le scope "both"', () => {
    expect(() => StatsEngine.computeStats(noMachine, 'all', 'both', 15, 15)).not.toThrow();
  });

  it('ne plante pas sur computeKeys', () => {
    expect(() => StatsEngine.computeKeys(noMachine)).not.toThrow();
    expect(StatsEngine.computeKeys(noMachine).length).toBeGreaterThan(0);
  });

  it('ne plante pas sur les co-occurrences croisées', () => {
    expect(() => StatsEngine.computeCooc(noMachine, 'all', 'cross')).not.toThrow();
  });
});
