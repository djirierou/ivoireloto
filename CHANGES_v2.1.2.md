# v2.1.2 — Points restants de l'audit

Traitement de tous les problèmes relevés lors de la revue précédente mais non
corrigés en v2.1.1. **11 correctifs**, 16 nouveaux tests (34 au total),
`npm run lint` réparé et sans aucune erreur.

---

## 🔴 Plantages

### 1. `RangeError` sur une période non numérique — vue blanche
`drawsInPeriod()` faisait `setDate(getDate() - parseInt(p))`. Une valeur non
numérique donnait `NaN` → `Invalid Date` → `toISOString()` levait
`RangeError: Invalid time value`. La vue restait blanche, sans message.
→ Garde sur `Number.isFinite` + date de référence invalide.

### 2. Décalage de date pour les fuseaux négatifs (diaspora)
`iso()` utilisait `toISOString()`, qui convertit en **UTC**. Un utilisateur en
UTC−4 saisissant un tirage à 21h locales voyait le champ pré-rempli avec la
date du **lendemain** — que le validateur rejetait ensuite comme « date
future ». Invisible depuis Abidjan (UTC+0), bloquant ailleurs.
→ Formatage sur les composants locaux (`getFullYear/getMonth/getDate`).

### 3. Collisions d'identifiants — tirages écrasés silencieusement
La clé primaire IndexedDB venait de `Date.now()` (ajout manuel) ou
`Date.now()+i+Math.random()` (import). Deux tirages enregistrés dans la même
milliseconde recevaient **la même clé** : le second écrasait le premier sans
erreur. → `nextId()`, compteur strictement croissant et borné par
`MAX_SAFE_INTEGER` (vérifié sur 200 000 identifiants).

---

## 🟠 Données

### 4. Collage : tirages fantômes et Machine perdue
Après avoir lu la ligne Win, `currentSession` était remis à `null` ; la ligne
suivante (les numéros Machine) tombait alors dans une branche « heuristique »
qui créait un **tirage fictif daté d'aujourd'hui**, intitulé « Import ».
Résultat : la Machine n'était jamais rattachée et la base se remplissait de
faux tirages. → Rattachement correct, et **plus aucune invention** de tirage
sans date ni session identifiées.

### 5. Synchronisation : le HTML était analysé comme du texte
`syncOfficial()` passe la page HTML brute à `parsePasteText()`. Les tailles
CSS (`12px`, `5px 7px 9px 11px`) et les nombres des `<script>` étaient lus
comme des numéros de loto. → Nettoyage préalable : scripts/styles/commentaires
supprimés, balises de **bloc** converties en sauts de ligne et balises
**inline** en espaces — sans quoi chaque `<span>16</span>` devenait une ligne
d'un seul chiffre et plus rien n'était détecté.

### 6. Sessions légitimes refusées
La liste blanche interdisait `&`, `'`, `.` et `,` : « Nuit&Jour » ou
« L'Espoir » étaient rejetés à l'import. → Caractères autorisés ; les chevrons
restent interdits et l'échappement HTML à l'affichage est inchangé.

---

## 🟡 Cohérence & honnêteté des chiffres

### 7. Verdict « rentable » sur un échantillon minuscule
Le verdict ne dépendait que du ROI, jamais de la taille de l'échantillon. Avec
26 tirages de démo, le backtest porte sur 16 tirages : **un seul coup de
chance** donne 6,25 % de réussite, soit « mieux que les 2,33 % du hasard ».
L'app annonçait une stratégie gagnante sur du bruit.
→ Test de significativité (z-score, seuil 95 %) : en dessous de 30 tirages ou
de 1,96 σ, le verdict devient « Indéterminé (échantillon insuffisant) » ou
« Indistinguable du hasard », avec badge z et message explicite.
Il faut dépasser ~9,7 % de hit sur 16 tirages pour que l'écart soit réel.

### 8. Systèmes : garde-fou incohérent et export tronqué en silence
`MAX_TICKET_COMBOS` annonce 20 000, mais le code matérialisait jusqu'à
**100 000** grilles (itération jusqu'à 200 000). L'export CSV contenait donc
une fraction du total affiché — 100 000 lignes pour « 43 949 268
combinaisons » — sans le signaler. → Plafond unique appliqué, bandeau
d'avertissement, et le nombre réellement exporté est indiqué.

### 9. Worker : chemin de repli inexistant en production
En cas d'échec, le repli chargeait `/src/js/workers/similarityWorker.js` — un
chemin qui n'existe **qu'en développement** (404 après build). → Bascule
propre sur le calcul synchrone, sans retenter un Worker cassé à chaque
recherche.

---

## 🧹 Qualité

### 10. `npm run lint` était cassé
Le script existait mais aucun fichier de configuration n'était présent :
ESLint 9 renvoyait une erreur de migration. → `eslint.config.js` (format
« flat ») avec les environnements navigateur / worker / tests / serverless,
et `@eslint/js` déclaré en dépendance de développement.

### 11. Code mort et signalements du linter
`lastBacktestReport` était assigné mais jamais lu ; échappements regex
inutiles ; paramètres inutilisés dans `api/lonaci.js`.
→ **0 erreur, 0 avertissement.**

---

## ✅ Vérifications

```
npm run lint   ✓ aucun problème
npm test       ✓ 34 tests (18 v2.1.1 + 16 nouveaux)
npm run build  ✓ 15 modules, 277 kB (96 kB gzip)
```

Boot complet, navigation dans les 11 vues, backtest des 6 stratégies, repli
sans Worker, ajouts rapprochés, filtres et exports : **aucune erreur console**.
