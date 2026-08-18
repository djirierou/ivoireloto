# v2.1.1 — Chasse aux bugs

Revue de code complète + tests d'exécution de chaque vue dans un DOM simulé
(11 vues, formulaires, filtres, exports). **11 bugs corrigés**, 18 tests de
non-régression ajoutés (`npm test`).

---

## 🔴 Critiques

### 1. Look-ahead bias dans le backtest (résultats faussés)
La stratégie `markov` appelait `markovTransition(draws, 'all')`, calculée sur
**tout l'historique — futur compris**. Chaque prédiction du tirage `i`
connaissait donc déjà les tirages `i..N`.

**Preuve** : sur des tirages 100 % aléatoires, la stratégie affichait
**87,4 % de réussite** (le hasard donne 2,33 %) et un gain net de +3 735 600 F.
L'application annonçait donc une martingale gagnante là où il n'y avait que
la fuite de données.

**Correctif** : matrice de transition construite de façon incrémentale ; la
transition `i-1 → i` n'est intégrée qu'**après** l'évaluation du tirage `i`.
→ Résultat sur bruit aléatoire : **2,2 %**, conforme à la théorie.

### 2. Baseline « hasard » fausse (23 % au lieu de 2,33 %)
`theoreticalHit2 = 0.2306` était présenté comme P(≥2/5). C'est en réalité
P(exactement 1/5). La vraie valeur, par la loi hypergéométrique :

```
P(≥2/5) = 1 − P(0) − P(1) = 1 − 0,746350 − 0,230355 = 2,3296 %
```

Conséquence : toute stratégie correcte était affichée comme « pire que le
hasard » (écart de −20 points), et le badge « rentable » ne s'allumait jamais.
→ Constante `RANDOM_HIT2_PCT` exportée et utilisée partout (KPI, badges, textes).

### 3. Collision du cache de statistiques
Les clés mémo n'utilisaient que `draws.length` :
`st:all:win:15:15:${draws.length}`. Deux jeux de données **différents mais de
même taille** renvoyaient donc les stats du premier — après un import ou une
correction de tirage, l'écran affichait des chiffres périmés.
→ Ajout d'une signature (taille + date/session/numéros des bornes et du milieu).

---

## 🟠 Fonctionnels

### 4. « Exporter toute la base » plantait
`downloadCSV(name, [csv.join('\n')])` passait un tableau de chaînes alors que
la fonction attend un tableau de lignes → `TypeError: r.map is not a function`.
Le bouton ne produisait aucun fichier. → Corrigé + garde sur base vide.

### 5. CSV à point-virgule jamais reconnu
Le parser était câblé sur la virgule ; le rattrapage `;` était inatteignable.
Or l'app **exporte** en `;` : réimporter son propre export donnait 0 tirage.
→ Détection automatique du délimiteur, support du format groupé
(`"1 2 3 4 5"`), du BOM Excel et des dates `JJ/MM/AAAA`.

### 6. Dates calendaires impossibles acceptées
`2020-02-31` était validée (JavaScript la décale silencieusement au 2 mars).
→ Vérification que la date reconstruite correspond aux composants saisis.

### 7. Tirages sans numéros gagnants acceptés
`win: []` passait la validation → tirages fantômes faussant les fréquences.
→ `win` obligatoire (5 numéros) ; seul `machine` peut rester vide.

### 8. Crash sur les tirages sans champ `machine`
`d.machine.length` / `.map` sur des données venant d'un JSON externe ou d'une
ancienne base → `TypeError`, vue blanche. → Normalisation centralisée
(`normalizeDraw`) + gardes dans `blocksOf`, `computeKeys`, `computeCooc`.

### 9. Alertes noyées dans le bruit
**59 alertes sur 90 numéros** avec le jeu de données courant : tout numéro
jamais sorti (`histMax = 0`) déclenchait « a atteint son écart maximal
historique ». → Exige ≥3 sorties et un dépassement **strict** du record, tri
par sévérité. Résultat : **4 alertes** pertinentes. Calcul en une seule passe
au lieu de 90 balayages (0,5 ms sur 2 000 tirages).

### 10. « ROI théorique -100 % » codé en dur
L'écran Systèmes affichait `-${(100-(2/2000*100)).toFixed(0)}%`, soit toujours
−100 %, sans lien avec les multiplicateurs. → `theoreticalROI(mult)` basé sur
la loi hypergéométrique (−94,6 % avec les gains par défaut) + perte moyenne
attendue en francs.

### 11. Recherche par similitude : blocage et auto-correspondance
- Si le Worker échouait, la promesse restait *pending* → l'écran restait figé
  sur les squelettes de chargement. → `onerror` + timeout 15 s + repli.
- Le tirage de référence apparaissait dans ses propres résultats (5/5 communs).
  → Exclu dans les deux chemins (Worker et repli).

---

## ⚡ Performance & confort

- **Génération de grilles** : `computeCooc()` était appelé **dans** la boucle
  des 90 numéros, avec un `filter` sur toutes les paires à chaque tour.
  → Précalculé une fois ; lecture des cases à cocher sortie de la boucle.
- **Service Worker en développement** : il servait le JS/CSS depuis le cache,
  donc les modifications n'apparaissaient plus et le HMR de Vite était cassé.
  → Enregistré uniquement en production ; désinscription auto en dev.
- **Aperçu / tunnels** : `allowedHosts: true` dans `vite.config.js` (sinon Vite
  renvoie « Blocked request » et l'aperçu reste blanc).

---

## ✅ Vérifications

```
npm test     18 tests de non-régression — tous verts
npm run build  ✓ 15 modules, 275 kB (95 kB gzip)
```

Boot complet + navigation dans les 11 vues, backtest des 6 stratégies, ajout de
tirage, refus de doublon, filtres, pagination et exports : **aucune erreur
console**.
