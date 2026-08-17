# v2.1.3 — Déploiement GitHub Pages

## Problème constaté

GitHub Pages était **activé mais servait les sources brutes** de `main`
(mode « legacy », dossier racine). Le site ne pouvait pas fonctionner :

- `index.html` chargeait `/src/js/main.js`, qui contient
  `import { Chart } from 'chart.js'` — un *bare specifier* que le navigateur ne
  sait pas résoudre sans bundler. Erreur fatale au chargement.
- Les chemins étaient **absolus** (`/manifest.json`, `/src/css/main.css`) alors
  que le site est servi sous `/ivoireloto/` : 404 systématiques.
- Aucun workflow de build n'existait.

## Corrections

### Chemins relatifs à la base
- `vite.config.js` : option `base` pilotée par `BASE_PATH` (racine en local,
  `/ivoireloto/` en production).
- `index.html` : `/manifest.json` → `./manifest.json`, idem CSS et JS. Vite
  réécrit les chemins relatifs selon `base` ; les absolus, non.
- `config.js` : `DATA_URL` et `BASE_URL` dérivés de `import.meta.env.BASE_URL`.
- Enregistrement du Service Worker sur `BASE_URL + 'sw.js'` avec le bon `scope`.

### Service Worker compatible sous-répertoire
`sw.js` codait `/`, `/index.html`… en dur : le pré-cache échouait et le repli
hors-ligne renvoyait la racine du domaine. Les chemins sont maintenant dérivés
du scope réel du worker (`new URL('./', self.location)`).

### Workflow de déploiement
`.github/workflows/deploy.yml` : lint → tests → build → publication Pages.
- `enablement: true` fait basculer le dépôt du mode « legacy » vers un
  déploiement piloté par le workflow.
- `404.html` = copie de `index.html` (repli SPA au rechargement).
- Déclenchement sur `main` et manuellement (`workflow_dispatch`).

## Vérifications

Build servi sous `/ivoireloto/` puis **bundle de production exécuté** dans un
DOM simulé :

```
tirages chargés : 26        données lues sur /ivoireloto/data/real_data.json
navigation      : 11/11 vues
erreurs         : aucune
```

Pipeline CI rejoué à l'identique dans un dossier vierge
(`npm ci` → lint → tests → build) : **tout passe**.
