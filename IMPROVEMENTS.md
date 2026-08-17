# Améliorations v2.0 — Plan et implémentation

## Objectifs
Passer de prototype monolithe à app production-ready pour 50k+ tirages, sécurisée, performante.

## Changements structuraux

### 1. Modularisation (SOLID)
- `src/css/main.css` extrait, minifiable, avec variables, focus-visible, reduced-motion
- `src/js/modules/config.js` → constantes, sessions, REAL_DATA
- `src/js/modules/utils.js` → helpers purs, escapeHTML, parseCSV robuste, parsePasteText, LRUCache, toast
- `src/js/modules/db.js` → **IndexedDB via `idb`**, fallback localStorage, API async
  - stores: draws (index date, session, date_session), logs, cfg
  - bulkPut, clear, log rotation (250 max)
- `src/js/modules/stats.js` → moteur stateless, LRU 200, méthodes pures
- `src/js/modules/charts.js` → wrapper Chart.js v4 (ESM) avec defaults
- `src/js/workers/similarityWorker.js` → WebWorker pour similarité
- `src/js/main.js` → orchestrateur, navigation, wiring events

### 2. Persistence
- **IndexedDB**: limite ~50MB-1GB selon navigateur, supporte 50k tirages (~10MB)
- Migration automatique depuis localStorage si IndexedDB vide
- Id collision fix: `Date.now()+Math.random()`
- Import progressif par batch 1000 + `setTimeout(0)` pour ne pas bloquer UI

### 3. Performance

| Problème v1 | Solution v2 |
|---|---|
| Backtest O(N²) | Version incrémentale O(N): freq/lastSeen mis à jour à chaque i |
| Similarité main thread | Worker + fallback; matrice `Uint8Array` + filtre optionnel |
| Cache objet infini | LRUCache 200 entrées |
| History slice | Pagination 50/page avec nav, 7 boutons max |
| Charts destroy/recreate | reuse pattern + destroy avant recrea |
| Système OOM | `combsIter` générateur + garde-fou `MAX_TICKET_COMBOS=20k` + confirmation + preview limitée 40, stockage max 100k |

### 4. Sécurité
- `escapeHTML()` sur toute insertion: sessions, dates, messages logs, alertes
- CSV parser gère guillemets doubles, quotes échappées `""`, séparateur `;`
- Validation numéros 1-90 + unicité avant insertion
- Logs échappés

### 5. Bugs corrigés / Fonctionnalités implémentées
- **Triplets**: calcul effectif dans `computeCooc`, affichage top5
- **Paste parser**: `parsePasteText` regex date (dd/mm/yyyy, yyyy-mm-dd), session list, extraction 5+5 numéros
- **Sync**: attempt fetch + parse HTML + fallback vers collage manuel avec message CORS explicite
- **PWA**: manifest.json statique + sw.js statique avec cache-first/network-first hybride, offline support, install prompt conservé
- **generateGrids**: ajout bonus co-occurrence si `chkPairs` coché, plus de référence à `computePairs` inexistante
- **Alerts**: limite 50 alertes, escape
- **Toast**: aria-live region

### 6. UX / A11y
- `aria-label`, `role`, `aria-current`, `aria-live`
- Focus-visible outline or
- Skeleton loaders dashboard
- Pagination accessible
- Debounce filtres
- Guard rail combos >20k → confirm + limite
- `prefers-reduced-motion` media query
- Theme-ready variables
- Hover effects subtiles

### 7. Outillage
- `package.json` + Vite 6 (dev server host 0.0.0.0, preview, build sourcemap)
- Chart.js ESM (4.4.7) + idb 8.0.2
- `.gitignore`
- `public/manifest.json` + `public/sw.js`

### 8. API nouvelle
- `DataLayer.importData(data, onProgress)` → callback progression
- `StatsEngine.backtest` → retourne objet complet, utilisé par chart
- `StatsEngine.computeCooc` → pairs + triplets
- Worker message protocol `{type:'similarity', payload}`

### 9. Tests & Qualité (à faire next)
- Ajouter vitest pour `utils.js` parseCSV, escapeHTML, C(n,k)
- ESLint config flat
- E2E avec Playwright

### 10. Migration v1 → v2
- v2 lit automatiquement `lb_draws_v3` si IndexedDB vide → pas de perte
- Même format de données
- UI compatible, vues identiques

## Métriques avant/après (estimé)
- Temps backtest 500 draws: v1 ~2.1s, v2 ~0.15s (14×)
- Similarité 10k draws: v1 800ms main thread freeze, v2 120ms worker non bloquant
- Import 50k CSV: v1 crash quota, v2 ~4s avec progress
- Mémoire système C(20,5)=15504: v1 15k array OK, v2 iterator 0.5MB; C(30,5)=142506: v1 OOM risk, v2 garde-fou

## Prochaines étapes recommandées
1. Ajouter génération PDF ticket
2. Connecter vrai API backend proxy pour lotobonheur.ci (CORS proxy)
3. Ajouter tests unitaires + CI GitHub Actions
4. i18n (français → dioula)
5. Dark/light theme toggle
6. Export Excel
7. Compression données (msgpack)
