# v2.2 — Historique officiel depuis les captures LONACI + API

## Données
- **1187 tirages officiels** dans `public/data/real_data.json` et `src/js/data/officialDraws.js`
- **27 tableaux** extraits des captures Facebook *Loto Bonheur Lonaci Officiel* (25 derniers tirages par session, 19 août 2025 → 9 février 2026)
- **API officielle** `https://lotobonheur.ci/api/results?monthYear=juillet 2026` : mois de juillet 2026 complet, **ordre de sortie conservé** (1er→5ème Win, 86ème→90ème Machine)
- **Résultats lotobonheur.ci** du 1er au 18 août 2026 (Digital, Afterwork, Special Weekend, Awale…)
- 37 sessions : Reveil, Etoile, Akwaba, Monday Special, La Matinale, Emergence, Sika, Lucky Tuesday, Premiere Heure, Fortune, Baraka, Midweek, Kado, Privilege, Monni, Fortune Thursday, Cash, Solution, Wari, Friday Bonanza, Soutra, Diamant, Moaye, National, Benediction, Prestige, Awale, Espoir, Special Weekend 1h/3h, Digital 7h/8h/21h/22h/23h, Afterwork, Day Off
- Sessions sans machine : Lucky Tuesday, Midweek, Fortune Thursday, Friday Bonanza, National, Monday Special
- Date anormale conservée : Baraka n°348 « 10 novembre 2021 »

## Trous encore ouverts
- 10 février 2026 → 30 juin 2026
- Avant août 2025 (sauf 1 Baraka 2021)
L’API officielle accepte `?monthYear=juin 2026` (et tous les mois depuis octobre 2020). Relancer le scrape mois par mois pour combler.

## App
- `DATA_REVISION = 202608182` : l’historique officiel est forcé au démarrage
- Ordre de sortie non trié (saisie manuelle comprise)
- Cache SW `loto-bonheur-v2.2.2`

## Reconstruction
```bash
python3 scripts/build_real_data.py
```
