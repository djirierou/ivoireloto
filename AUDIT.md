# Audit — IvoireLoto Analytics Pro (v1)

Date: 2026-08-17
Source: `index.html` monolithe 94KB, 2288 lignes

## 1. Architecture & maintenabilité — Critique
- **Monolithe**: tout CSS + JS inline dans 1 fichier, pas de séparation responsabilités
- **Pas de build**: pas de `package.json`, dépendances CDN non versionnées sans SRI
- **Pollution globale**: variables globales (`DB`, `REAL_DATA`, `cache`), fonctions globales
- **Pas de modules**: impossible à tester unitairement
- **Font CDN multiple requêtes** au lieu d'un bundle

Score: 2/10

## 2. Persistence & Scalabilité — Critique
- **localStorage** limite ~5MB; 50k tirages ≈ 10MB => quota exceeded, perte données
- `Date.now()+imported` pour id → collisions si import rapide
- CSV parser `split(',')` naïf, pas de support guillemets, point-virgule
- Déduplication seulement sur date+session, pas d'update
- Données `REAL_DATA` = 26 entrées seulement, dates 2026 fictives, couvre 2 jours seulement (prétendu 2012-2026)

Score: 3/10

## 3. Performance — Mauvais
- Backtest `predictAt` recalcule freq depuis 0 à chaque itération → O(N²) pour N tirages; 50k => gel UI plusieurs minutes
- Similarité matrice `Uint8Array(N*91)` reconstruite à chaque appel main thread, boucle triple non optimisée
- Pas de Web Worker
- Historique seulement `slice(0,100)` sans pagination, mais count faux
- Charts détruits/recréés, pas de reuse
- Cache global objet jamais évicté

Score: 3/10

## 4. Sécurité & Robustesse — Moyen
- **XSS**: `innerHTML` avec `session` non échappé. Import CSV/JSON malveillant peut injecter `<img onerror=...>`.
- Pas de validation schema JSON (numéros hors 1-90 passent parfois)
- `localStorage.getItem` parse try/catch partiel, mais si corrompu -> fresh reset sans backup
- Confirm dialogs natifs peu UX
- Pas de sanitization du collage

Score: 4/10

## 5. Bugs fonctionnels
- Triplets: `$('#tripList').innerHTML = '<p...Calcul en cours...</p>'` jamais calculé
- `parseBtn` ne fait qu'un toast, pas de parsing
- `syncBtn` fetch CORS sans proxy => toujours erreur
- `computePairs` référencé dans `generateGrids` mais inexistant (`StatsModule.computePairs ? [] : []`)
- PWA: manifest via Blob URL → pas cacheable; SW via Blob → URL révocable, ne persiste pas, fetch handler = réseau seul → pas offline
- Système: `C(90,5)=43M` combos => `combs` array explosif OOM
- Alertes: boucle sur tous les draws pour similarity sans limite → lente

Score: 3/10

## 6. UX / A11y
- Pas de `aria` labels, pas de navigation clavier sidebar
- Responsive sidebar devient scroll horizontal mais pas de hamburger
- Pas de reduced-motion
- Toasts sans limite → overflow écran
- Pas de loading skeleton

Score: 5/10

## 7. Qualité & Outillage
- Pas de lint, pas de tests, pas de CI
- README vide
- Pas de versioning sémantique

Score: 1/10

## Synthèse
Projet fonctionnel pour démo <200 tirages mais **non scalable** à 14 ans (50k). Besoin refonte modulaire, IndexedDB, Workers, sécurité XSS, implémentation manquants.

## Risques majeurs
1. Perte données à 5k+ tirages (quota)
2. Freeze navigateur backtest
3. XSS via import
4. OOM système combinatoire
5. PWA non fonctionnelle offline

