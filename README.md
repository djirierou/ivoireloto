# Loto Bonheur Analytics Pro — LONACI — v2.2

Application d'analyse statistique du Loto Bonheur (LONACI Côte d'Ivoire) — historique officiel, prédictions, backtesting, systèmes.

> **v2.2** 853 tirages officiels intégrés (captures Facebook LONACI + lotobonheur.ci).  
> **v2.1** sécurité XSS, validation, PWA, proxy, transparence.  
> **v2.0** refonte complète: modulaire, IndexedDB, Workers.

## 🚀 Fonctionnalités
- **Dashboard**: KPIs, top pions, classification chaud/froid, tirages/jour
- **Données historiques**: **853 tirages officiels** livrés (27 sessions hebdo août 2025–fév. 2026 + août 2026), import CSV/JSON, drag&drop, IndexedDB
- **Gestion tirages**: CRUD avec validation, déduplication date+session
- **Statistiques**: fréquence, écart, grille 90, seuils configurables
- **Co-occurrences**: paires + triplets (nouveau), heatmap top12
- **Similitude avancée**: Worker Thread, filtres somme/parité/dizaines/écart, tendances N+1
- **Backtesting**: 6 stratégies (hot, écart, mix, sim, Markov, weighted), O(N) optimisé, courbe equity
- **Systèmes & Mises**: C(n,5), champ réduit, garde-fou anti-OOM 20k, iterator, export ticket
- **Clefs & Prédictions**: clefs empiriques, Markov, N+1 pondéré, générateur grilles avec co-occurrence
- **Alertes & Sync**: parser collage manuel robuste, tentative fetch + fallback CORS, alertes écart max & similitude
- **Logs**: journal traçabilité 250 max, rotation IndexedDB

## 📦 Stack
- Vanilla JS ES Modules (pas de framework)
- Vite 6 (dev/build)
- Chart.js 4.4.7 ESM
- idb 8.0.2 (IndexedDB wrapper)
- CSS custom (variables, responsive, a11y)
- PWA: manifest.json + sw.js offline

## 🛠️ Développement
```bash
npm install
npm run dev   # http://localhost:5173 (0.0.0.0)
npm run build
npm run preview
```

## 🔧 Structure
```
/public/manifest.json, sw.js
/src/css/main.css
/src/js/main.js (orchestrateur)
/src/js/modules/config.js, utils.js, db.js, stats.js, charts.js
/src/js/workers/similarityWorker.js
index.html (entrée)
AUDIT.md (analyse v1)
IMPROVEMENTS.md (plan v2)
```

## 🔒 Sécurité
- `escapeHTML` sur toutes insertions DOM
- Validation 1-90, unicité 5 numéros
- CSV parser supporte champs guillemetés + `;`
- Logs & sessions échappés

## ⚡ Performance
- Backtest: O(N) incrémental vs O(N²) avant
- Similarité: Worker non bloquant
- Pagination historique 50/page
- LRU cache 200
- Système: générateur iterator + garde-fou 20k + preview 40

## 📱 PWA
- Installable, offline avec cache hybride
- Service Worker network-first pour navigation, cache-first pour assets

## 📝 TODO
- [ ] Tests vitest
- [ ] Backend proxy lotobonheur.ci (CORS)
- [ ] Export PDF ticket
- [ ] CI GitHub Actions

## 📄 Licence MIT
Auteur: djirierou
