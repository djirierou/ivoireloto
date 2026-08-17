# v2.1 — Réponse aux améliorations demandées

Suite à l'analyse structurée des modules, implémentation des 5 axes demandés.

## 1. Sécurité / robustesse — FIXÉ

### XSS via innerHTML
- **Avant**: `innerHTML` avec `session` non échappé dans historique, dashboard, alertes
- **Après**: `escapeHTML()` systématique sur:
  - sessions, dates, messages logs, alertes, file names
  - Dans `utils.js`: `ball()` utilise escape, `toast()` escape
  - Dans `db.js`: `log()` tronque à 500 chars
  - Création `validator.js` qui rejette `<tag>` dans session

### Validation JSON stricte
- **Avant**: import JSON acceptait tout tableau, pas de borne 1-90 check parfois
- **Après**: `validator.js`:
  - `validateDate()`: regex YYYY-MM-DD, min 2012-07-17, future interdit, NaN check
  - `sanitizeSession()`: regex safe `[a-zA-Z0-9À-ÿ \-_:()\/]{1,60}` + rejet HTML
  - `validateNumbers()`: integer, 1-90, set size 5, longueur
  - `validateDraw()`: combine tout, retourne sanitized sorted
  - `validateImportArray()`: supporte tuple legacy et objet new, collecte valid/invalid
  - `importData()` retourne `{imported, skipped, invalid}` + affiche détail
  - Feedback utilisateur: toast indique nombre invalides rejetés + console.warn 10 premiers

## 2. Architecture / maintenabilité — FIXÉ

### Découpage modules
- Déjà fait v2.0, renforcé v2.1:
  - `config.js` → constantes + `DATA_URL` + `PROXY_ENDPOINTS` (plus de REAL_DATA dur)
  - `utils.js` → helpers purs + LRU + CSV robuste + paste parser
  - `validator.js` → **nouveau**, validation pure testable
  - `db.js` → IndexedDB v3 + fallback + validation avant put
  - `stats.js` → moteur stateless LRU
  - `charts.js` → wrapper Chart.js
  - `sync.js` → **nouveau**, proxy logic + transparency report
  - `workers/similarityWorker.js` → worker

### REAL_DATA déplacé JSON
- **Avant**: `REAL_DATA` tableau de tuples codé dur dans HTML (26 entrées)
- **Après**: `public/data/real_data.json` fichier séparé, structure `{date, session, win[], machine[]}`
  - Chargé via `fetch(CONFIG.DATA_URL)` au démarrage
  - Fallback `REAL_DATA_FALLBACK` si fetch échoue (offline)
  - `DataLayer.loadRealDataJson()` retourne draws + skipped + errors
  - Avantages: modifiable sans toucher JS, cacheable par SW, versionnable

## 3. Mode hors-ligne PWA — FIXÉ

### Service Worker
- **Avant v1**: `fetch(event.request)` seulement → pas de cache, pas offline
- **v2.0**: network-first nav, cache-first assets basique
- **v2.1**:
  - `CACHE_NAME = v2.1.0`
  - Precache core: `/`, `/index.html`, `/manifest.json`, `/data/real_data.json`
  - Stratégies:
    - `/lonaci-proxy` & `/api/*` → network-only avec fallback offline JSON 503
    - Navigation → network-first + cache.put + fallback `/index.html` si offline
    - Assets (JS/CSS/fonts) → stale-while-revalidate (serve cached immédiatement, update en arrière-plan)
    - Only cache same-origin + jsdelivr (évite cache tiers)
  - Message `SKIP_WAITING` support
  - Offline indicator: listeners `online/offline` → toast

### Manifest
- Statique `/public/manifest.json`, icône data URI, categories, lang fr-CI

## 4. Accessibilité — FIXÉ

- Skip link en haut page `<a href="#mainContent">`
- Sidebar `aria-label="Navigation principale"`
- Chaque `nav-btn` a `aria-label` explicite + `aria-current="page"` géré dynamiquement
- Live region `#a11yLive` aria-live polite pour annoncer changement vue
- Charts: `role="img"` + `aria-label` descriptif + `<p id="chartTopDesc">` alternative textuelle
- Inputs: `for` + `aria-label` sur numéros Win/Machine, `aria-label` sur pagination, `aria-valuenow/max` sur barres
- Import zone: `role="button"`, `tabindex=0`, `keydown Enter/Space` géré
- Toast container: `aria-live="polite" aria-atomic="true"` déjà présent
- Pagination: `role="navigation" aria-label="Pagination historique"` + `aria-label="Page X"` + `aria-current`
- Reduced-motion déjà dans CSS
- Focus-visible outline or

## 5. Synchronisation réelle — FIXÉ

### Problème CORS
Direct `fetch('https://lotobonheur.ci/resultats')` bloqué navigateur.

### Solution proxy
- **Vite dev proxy**: `vite.config.js` server.proxy `/lonaci-proxy` → `https://lotobonheur.ci/resultats`, changeOrigin true
- **Serverless**: `api/lonaci.js` fonction Edge (Vercel) / Netlify :
  - Fetch upstream avec UA, cache 5 min, CORS `*`
  - Retourne HTML ou JSON error
- **Fallback public**: `allorigins.win/raw?url=` tentative last resort
- **Client**: `sync.js` `syncOfficial()` essaie endpoints dans ordre `CONFIG.PROXY_ENDPOINTS`, timeout 12s via AbortController, retourne `{ok, draws, source}` ou `{ok:false, attempts}`
- UI: bouton désactivé pendant sync, message source réussie, log détaillé échecs, ouvre panel collage si fail
- Documentation dans UI: `<code>/lonaci-proxy</code>` et `<code>/api/lonaci</code>` expliqués

Déploiement:
- Local dev: `npm run dev` proxy fonctionne automatiquement
- Prod Vercel/Netlify: déployer `api/lonaci.js` → route `/api/lonaci` active

## 6. Transparence des prédictions — FIXÉ

### Backtesting honnête
- **Avant**: affichage net + ROI mais pas comparé hasard, pas de verdict
- **Après**:
  - `sync.js` `generateTransparencyReport()`:
    - Calcule ROI, esperance par jeu, excess vs hasard (≈23% hit ≥2/5 théorique), verdict textuel
    - `isProfitable`, `verdict`: Perdante, Perdante érosion forte, Légèrement positive, Rentable historique
    - Disclaimer responsable
  - UI backtest:
    - KPIs montrent `vs hasard ~23%` + écart
    - `Espérance nette / jeu` mis en avant
    - `Verdict transparence` badge ok/err
    - Nouveau panel `#backtestTransparency`:
      - 3 key-cards: Rendement net, Esperance/mise ROI, Comparaison hasard
      - Badges ROI, Hit vs 23%, Drawdown
      - Disclaimer
    - Toast verdict: `Backtest terminé — Verdict — ROI X%`
  - Dashboard: carte transparence rappel
  - Systèmes: carte espérance théorique rappel `-97%` perte naturelle, renvoi vers backtest

## Fichiers modifiés / créés v2.1
- `public/data/real_data.json` (nouveau)
- `src/js/modules/validator.js` (nouveau)
- `src/js/modules/sync.js` (nouveau)
- `api/lonaci.js` (nouveau serverless proxy)
- `public/sw.js` (refonte complète stale-while-revalidate)
- `src/js/modules/config.js` (DATA_URL + PROXY_ENDPOINTS + REAL_DATA_FALLBACK)
- `src/js/modules/db.js` (v3, validation stricte, loadRealDataJson, import avec invalid count)
- `src/js/main.js` (a11y, skip link, live region, proxy sync, transparency report, escape partout, JSON externe)
- `index.html` (a11y labels, chart alt text, transparency card, skip link, proxy doc)
- `vite.config.js` (proxy)
- `package.json` version 2.1.0

## Tests manuels
- Import CSV avec `<script>alert(1)</script>` dans session → rejeté (validator)
- Import JSON avec win=[999] → rejeté, toast invalid count
- Offline: déconnecter réseau, reload → app chargée depuis SW cache, real_data.json servi, toast hors-ligne
- Sync: `npm run dev`, clic synchroniser → fetch `/lonaci-proxy` réussit si lotobonheur.ci accessible, sinon fallback collage
- Backtest: lance hot → affiche ROI, espérance, verdict, badge comparaison hasard

## Prochaines étapes
- Unit tests validator
- Backend proxy deploy Vercel
- PDF ticket
