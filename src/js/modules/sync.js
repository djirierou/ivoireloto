import { CONFIG } from './config.js';
import { parsePasteText } from './utils.js';

/**
 * Synchronisation avec proxy pour contourner CORS
 * Stratégie:
 * 1. Essaie /lonaci-proxy (Vite dev proxy -> https://lotobonheur.ci/resultats)
 * 2. Essaie /api/lonaci (serverless)
 * 3. Essaie proxy public allorigins
 * 4. Échec → demande collage manuel
 */

export async function fetchViaProxy(proxyUrl){
  const controller = new AbortController();
  const timeout = setTimeout(()=> controller.abort(), 12000);
  try{
    const res = await fetch(proxyUrl, {signal: controller.signal, headers:{'Accept':'text/html'}});
    clearTimeout(timeout);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if(!text || text.length<500) throw new Error('Contenu vide');
    return text;
  }catch(e){
    clearTimeout(timeout);
    throw e;
  }
}

export async function syncOfficial(){
  const attempts=[];
  for(const endpoint of CONFIG.PROXY_ENDPOINTS){
    try{
      console.log(`[sync] trying ${endpoint}`);
      const html = await fetchViaProxy(endpoint);
      const draws = parsePasteText(html);
      return {ok:true, draws, source:endpoint, htmlLength: html.length};
    }catch(e){
      attempts.push({endpoint, error:e.message});
      continue;
    }
  }
  return {ok:false, attempts};
}

// Serverless proxy example for Vercel/Netlify will be in /api/lonaci.js
// This client also supports direct fetch with user-provided HTML via paste

/**
 * Probabilité exacte d'obtenir au moins 2 bons numéros sur une grille de 5
 * dans un tirage 5/90 (loi hypergéométrique) :
 *   P(k) = C(5,k)*C(85,5-k) / C(90,5)
 *   P(>=2) = 1 - P(0) - P(1) = 1 - 0.746350 - 0.230355 = 0.023296
 */
export const RANDOM_HIT2_PCT = 2.3296;

/** P(exactement k bons numéros) pour une grille de 5 dans un tirage 5/90. */
export const HYPERGEO_5_90 = {
  0: 0.7463500,
  1: 0.2303550,
  2: 0.0224740,
  3: 0.0008120,
  4: 0.0000103,
  5: 0.0000000228
};

/**
 * ROI théorique (%) d'une grille jouée au hasard, selon la grille de gains.
 * /!\ Avant: l'écran Systèmes affichait `-${(100-(2/2000*100)).toFixed(0)}%`
 * soit toujours « -100% », une formule sans rapport avec les multiplicateurs.
 * @param {{2:number,3:number,4:number,5:number}} mult multiplicateurs de la mise
 */
export function theoreticalROI(mult){
  let ev=0;
  for(const k of [2,3,4,5]) ev += (HYPERGEO_5_90[k]||0) * (Number(mult?.[k])||0);
  return (ev - 1) * 100;
}

export function generateTransparencyReport(backtestResult, randomBaseline=null){
  // backtestResult: {hitRate, net, staked, maxDD, total, equity, etc}
  if(!backtestResult) return null;
  const {hitRate, net, staked, total, maxDD} = backtestResult;
  const roi = staked ? (net/staked*100) : 0;
  const expectedPerGame = total ? net/total : 0;
  const isProfitable = net>0;

  // Baseline hasard (loi hypergéométrique exacte, tirage 5/90)
  // /!\ Avant: 0.2306 était utilisé comme P(>=2/5). C'est faux: 23.04% est P(exactement 1/5).
  // La vraie P(>=2/5) = 1 - P(0) - P(1) = 2.3296%.
  const excessVsRandom = hitRate - RANDOM_HIT2_PCT;

  // Significativité statistique de l'écart au hasard.
  // /!\ Avant: le verdict ne dépendait que du ROI, sans tenir compte de la
  // taille de l'échantillon. Sur 16 tirages, UN SEUL coup de chance donne
  // 6,25% de hit et l'app annonçait « bat le hasard ». Il faut ici dépasser
  // ~9,7% pour que ce soit significatif à 95%.
  const p0 = RANDOM_HIT2_PCT/100;
  const stdErrPct = total>0 ? Math.sqrt(p0*(1-p0)/total)*100 : Infinity;
  const zScore = stdErrPct>0 && isFinite(stdErrPct) ? excessVsRandom/stdErrPct : 0;
  const isSignificant = total>=30 && Math.abs(zScore)>=1.96;
  // Nombre de tirages requis pour détecter l'écart observé (indicatif)
  const sampleAdvice = total<30
    ? "Échantillon trop faible (<30 tirages) : résultat non interprétable."
    : (!isSignificant ? "Écart non significatif statistiquement (95%) : compatible avec le hasard." : null);

  let verdict='Neutre';
  if(!isSignificant){
    // Sans significativité, on ne prétend jamais qu'une stratégie « marche »
    verdict = total<30 ? 'Indéterminé (échantillon insuffisant)' : 'Indistinguable du hasard';
  } else if(roi<-20) verdict='Perdante (érosion forte)';
  else if(roi<0) verdict='Perdante';
  else if(roi<20) verdict='Légèrement positive';
  else verdict='Rentable sur cet historique';

  return {
    total,
    net,
    staked,
    roi,
    hitRate,
    expectedPerGame,
    maxDD,
    isProfitable,
    verdict,
    excessVsRandom,
    zScore,
    isSignificant,
    sampleAdvice,
    disclaimer: "Résultats sur historique passé, ne garantissent pas le futur. Loto reste aléatoire. Jouez responsablement."
  };
}
