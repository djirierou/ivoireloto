import { CONFIG } from './modules/config.js';
import { $, $$, iso, fmtDate, sum, escapeHTML, parseCSV, parsePasteText, toast, downloadCSV, ball, debounce, C, combsIter } from './modules/utils.js';
import { DataLayer } from './modules/db.js';
import { StatsEngine, invalidateCache } from './modules/stats.js';
import { createTopChart, createClassChart, createLineChart, createHorizBar, createEquityChart } from './modules/charts.js';
import { validateDraw } from './modules/validator.js';
import { syncOfficial, generateTransparencyReport } from './modules/sync.js';

const TODAY = new Date();
let charts = { top:null, cls:null, months:null, stats:null, bt:null };
let sysSel = new Set();
let lastSysGrids = [];
let lastPred = [];
let lastBacktestReport = null;

const TITLES = {
  dash:'Tableau de bord',
  data:'Données historiques',
  draws:'Gestion & intégrité des tirages',
  stats:'Moteur statistiques & indicateurs',
  cooc:'Matrice de corrélation & co-occurrences',
  sim:'Recherche par similitude avancée',
  back:'Backtesting rétrospectif — transparence',
  sys:'Systèmes, permutations & mises',
  pred:'Clefs empiriques & prédictions',
  alert:'Alertes & acquisition automatique',
  logs:'Journal des logs sécurisés'
};

let worker = null;
function getWorker(){
  if(worker) return worker;
  try{
    worker = new Worker(new URL('./workers/similarityWorker.js', import.meta.url), {type:'module'});
  }catch{
    worker = new Worker('/src/js/workers/similarityWorker.js');
  }
  return worker;
}

function go(view){
  $$('.view').forEach(x=>x.classList.remove('active'));
  const target = document.getElementById('view-'+view);
  if(target) target.classList.add('active');
  $$('.nav-btn').forEach(b=>{
    const isActive = b.dataset.view===view;
    b.classList.toggle('active', isActive);
    if(isActive) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  const titleEl=$('#topTitle');
  if(titleEl) titleEl.innerHTML=TITLES[view].replace('&','<em>&</em>');
  const map = {
    dash: renderDash,
    data: ()=>{},
    draws: renderHistory,
    stats: renderStats,
    cooc: renderCooc,
    sim: ()=>{},
    back: ()=>{},
    sys: renderSys,
    pred: renderPred,
    alert: renderAlerts,
    logs: renderLogs
  };
  (map[view]||(()=>{}))();
  // announce for screen readers
  const live = $('#a11yLive');
  if(live) live.textContent = `Vue ${TITLES[view]} affichée`;
}

function updateStatsUI(){
  const draws = DataLayer.cache.draws;
  const countEl=$('#dataCount'); if(countEl) countEl.textContent=draws.length;
  const totalEl=$('#statTotal'); if(totalEl) totalEl.textContent=draws.length;
  const yearsEl=$('#statYears'), daysEl=$('#statDays'), sessEl=$('#statSessions'), periodEl=$('#dataPeriod');
  if(!draws.length){
    if(yearsEl) yearsEl.textContent='0';
    if(daysEl) daysEl.textContent='0';
    if(sessEl) sessEl.textContent='0';
    if(periodEl) periodEl.textContent='—';
    return;
  }
  const dates=draws.map(d=>d.date);
  const years=[...new Set(dates.map(d=>d.split('-')[0]))];
  const days=[...new Set(dates)];
  const sessions=[...new Set(draws.map(d=>d.session))];
  if(yearsEl) yearsEl.textContent=years.length;
  if(daysEl) daysEl.textContent=days.length;
  if(sessEl) sessEl.textContent=sessions.length;
  const minDate=dates.reduce((a,b)=> a<b?a:b);
  const maxDate=dates.reduce((a,b)=> a>b?a:b);
  if(periodEl) periodEl.textContent=`${fmtDate(minDate)} → ${fmtDate(maxDate)}`;
}

function computeAlerts(){
  const draws=DataLayer.cache.draws;
  const alerts=[];
  if(!draws.length) return alerts;
  const st=StatsEngine.computeStats(draws,'all','win', DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold, TODAY);
  for(let n=1;n<=90;n++){
    const gaps=[]; let prev=-1;
    draws.forEach((d,i)=>{ if(d.win.includes(n)){ if(prev>=0) gaps.push(i-prev); prev=i; } });
    const histMax=Math.max(0,...gaps);
    if(st.ecart[n]>=Math.max(histMax,6) && st.ecart[n]>0){
      alerts.push({type:'ecart', msg:`⏰ Le pion ${n} a atteint son écart maximal historique : ${st.ecart[n]} tirages sans sortir.`});
    }
  }
  const last=StatsEngine.lastDraw(draws);
  if(last){
    const scores=draws.map(d=> d.win.filter(nn=> last.win.includes(nn)).length);
    for(let i=0;i<draws.length-1;i++){
      if(scores[i]>=4) alerts.push({type:'sim', msg:`🧬 Le dernier tirage partage ${scores[i]} pions avec le tirage du ${fmtDate(draws[i].date)} (${draws[i].session}).`});
    }
  }
  return alerts.slice(0,50);
}
function refreshBadge(){
  const a=computeAlerts();
  const b=$('#alertBadge');
  if(b){ b.textContent=a.length; b.style.display=a.length?'flex':'none'; b.setAttribute('aria-label', `${a.length} alertes`); }
  return a;
}

function renderDash(){
  const draws=DataLayer.cache.draws;
  if(!draws.length){ $('#dashKpis').innerHTML='<p class="muted">Aucune donnée. Importez un CSV/JSON ou restaurez les données officielles.</p>'; return; }
  const st=StatsEngine.computeStats(draws,'all','win', DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold, TODAY);
  const {cls}=StatsEngine.classifyAll(st.freq, DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold);
  let hotN=0,coldN=0,neuN=0; for(let n=1;n<=90;n++){ if(cls[n]==='hot') hotN++; else if(cls[n]==='cold') coldN++; else neuN++; }
  let topN=1,maxF=-1,maxE=-1,maxEN=1; for(let n=1;n<=90;n++){ if(st.freq[n]>maxF){maxF=st.freq[n]; topN=n;} if(st.ecart[n]>maxE){maxE=st.ecart[n]; maxEN=n;} }
  const last=StatsEngine.lastDraw(draws);
  $('#dashKpis').innerHTML=`
    <div class="kpi"><div class="lbl">Tirages totaux</div><div class="val">${draws.length}</div><div class="sub">Base IndexedDB</div></div>
    <div class="kpi"><div class="lbl">Dernier tirage</div><div class="val" style="font-size:13px">${last?escapeHTML(fmtDate(last.date))+' · '+escapeHTML(last.session):'—'}</div><div class="sub">${last?'Win '+escapeHTML(last.win.join('-')):''}</div></div>
    <div class="kpi"><div class="lbl">Pion le plus chaud</div><div class="val">${ball(topN,'win')} ${topN}</div><div class="sub">${maxF} sorties Win</div></div>
    <div class="kpi"><div class="lbl">Plus grand retard</div><div class="val">${ball(maxEN,'machine')} ${maxEN}</div><div class="sub">${maxE} tirages sans sortie</div></div>
  `;
  const top=[...Array(90).keys()].map(i=>i+1).sort((a,b)=>st.freq[b]-st.freq[a]).slice(0,10);
  if(charts.top) charts.top.destroy();
  charts.top=createTopChart($('#chartTop'), top, st.freq);
  if(charts.cls) charts.cls.destroy();
  charts.cls=createClassChart($('#chartClass'), hotN, neuN, coldN);
  const days={}; draws.forEach(d=>{days[d.date]=(days[d.date]||0)+1;});
  const dk=Object.keys(days).sort().slice(-30);
  if(charts.months) charts.months.destroy();
  charts.months=createLineChart($('#chartMonths'), dk.map(d=>fmtDate(d)), dk.map(d=>days[d]));
  $('#dashRecent').innerHTML=[...draws].reverse().slice(0,6).map(d=>
    `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">
      <div style="min-width:110px"><b style="font-size:12.5px">${escapeHTML(fmtDate(d.date))}</b><br><span class="muted" style="font-size:11px">${escapeHTML(d.session)}</span></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap" aria-label="Win ${escapeHTML(d.win.join(' '))}">${d.win.map(n=>ball(n,'win sm')).join('')}${d.machine.map(n=>ball(n,'machine sm')).join('')}</div>
    </div>`).join('');
  // transparency highlight
  const transCard = $('#transparencyCard');
  if(transCard){
    transCard.innerHTML = `
      <h4 style="margin-bottom:8px">🔎 Transparence</h4>
      <p class="muted" style="font-size:12px">Le backtesting ci-dessous montre l'espérance réelle. Aucun système ne garantit un gain futur. Probabilité théorique ≥2/5 ≈ 23%. Le tableau ci-dessus est descriptif.</p>
    `;
  }
}

let histPage=1; const HIST_PER_PAGE=50;
function filteredHistory(){
  let list=[...DataLayer.cache.draws].reverse();
  const from=$('#fFrom')?.value, to=$('#fTo')?.value, num=parseInt($('#fNum')?.value,10), scope=$('#fScope')?.value||'both', ses=$('#fSession')?.value;
  if(from) list=list.filter(d=>d.date>=from);
  if(to) list=list.filter(d=>d.date<=to);
  if(ses) list=list.filter(d=>d.session===ses);
  if(!isNaN(num)&&num>=1&&num<=90) list=list.filter(d=> scope==='win'?d.win.includes(num): scope==='machine'?d.machine.includes(num): (d.win.includes(num)||d.machine.includes(num)));
  return list;
}
function renderHistory(){
  const all=filteredHistory();
  const total=all.length;
  const pages=Math.max(1, Math.ceil(total / HIST_PER_PAGE));
  if(histPage>pages) histPage=pages;
  const list=all.slice((histPage-1)*HIST_PER_PAGE, histPage*HIST_PER_PAGE);
  const countEl=$('#histCount');
  if(countEl) countEl.textContent=`${total} tirage(s) — page ${histPage}/${pages} — ${HIST_PER_PAGE} par page`;
  const body=$('#histBody');
  if(!body) return;
  body.innerHTML=list.map(d=>
    `<tr><td><b>${escapeHTML(fmtDate(d.date))}</b></td><td>${escapeHTML(d.session)}</td><td><div style="display:flex;gap:5px;flex-wrap:wrap" aria-label="Win">${d.win.map(n=>ball(n,'win sm')).join('')}</div></td><td>${d.machine.length?`<div style="display:flex;gap:5px;flex-wrap:wrap" aria-label="Machine">${d.machine.map(n=>ball(n,'machine sm')).join('')}</div>`:'<span class="muted">—</span>'}</td><td class="muted">${sum(d.win)}</td></tr>`
  ).join('')||`<tr><td colspan="5" class="muted">Aucun résultat.</td></tr>`;

  let pag=$('#histPagination');
  if(!pag){
    pag=document.createElement('div'); pag.id='histPagination'; pag.className='pagination'; pag.setAttribute('role','navigation'); pag.setAttribute('aria-label','Pagination historique');
    body.closest('.card')?.appendChild(pag);
  }
  pag.innerHTML=`
    <button ${histPage<=1?'disabled':''} data-p="prev" aria-label="Page précédente">◀ Préc</button>
    ${Array.from({length:Math.min(pages,7)},(_,i)=>{
      let p;
      if(pages<=7) p=i+1;
      else if(histPage<=4) p=i+1;
      else if(histPage>=pages-3) p=pages-6+i;
      else p=histPage-3+i;
      return `<button class="${p===histPage?'active':''}" data-p="${p}" aria-label="Page ${p}" ${p===histPage?'aria-current="page"':''}>${p}</button>`;
    }).join('')}
    <button ${histPage>=pages?'disabled':''} data-p="next" aria-label="Page suivante">Suiv ▶</button>
  `;
  pag.querySelectorAll('button').forEach(b=> b.addEventListener('click',()=>{
    const v=b.dataset.p;
    if(v==='prev') histPage--; else if(v==='next') histPage++; else histPage=parseInt(v,10);
    renderHistory();
  }));
}

let stSort={key:'num'};
function renderStats(){
  const draws=DataLayer.cache.draws;
  const period=$('#stPeriod')?.value||'all', scope=$('#stScope')?.value||'win';
  const st=StatsEngine.computeStats(draws, period, scope, DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold, TODAY);
  const {cls,mean}=StatsEngine.classifyAll(st.freq, DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold);
  let topN=1,maxF=0,maxE=0,maxEN=1;
  for(let n=1;n<=90;n++){ if(st.freq[n]>maxF){maxF=st.freq[n];topN=n;} if(st.ecart[n]>maxE){maxE=st.ecart[n];maxEN=n;} }
  $('#stKpis').innerHTML=`
    <div class="kpi"><div class="lbl">Tirages analysés</div><div class="val">${st.count}</div></div>
    <div class="kpi"><div class="lbl">Fréq. moyenne</div><div class="val">${mean.toFixed(1)}</div><div class="sub">+${DataLayer.cache.cfg.hot}% / −${DataLayer.cache.cfg.cold}%</div></div>
    <div class="kpi"><div class="lbl">Chaud n°1</div><div class="val">${ball(topN,'win')} ${topN}</div></div>
    <div class="kpi"><div class="lbl">Max retard</div><div class="val">${ball(maxEN,'machine')} ${maxEN}</div></div>
  `;
  const top=[...Array(90).keys()].map(i=>i+1).sort((a,b)=>st.freq[b]-st.freq[a]).slice(0,15);
  if(charts.stats) charts.stats.destroy();
  charts.stats=createHorizBar($('#chartStats'), top.map(n=>'Pion '+n), top.map(n=>st.freq[n]), top.map(n=> cls[n]==='hot'?'#f97316':cls[n]==='cold'?'#38bdf8':'#f6b21b'));
  const nums=[...Array(90).keys()].map(i=>i+1);
  if(stSort.key==='freq') nums.sort((a,b)=>st.freq[b]-st.freq[a]||a-b);
  else if(stSort.key==='ecart') nums.sort((a,b)=>st.ecart[b]-st.ecart[a]||a-b);
  const grid=$('#grid90');
  if(grid) grid.innerHTML=nums.map(n=> `<div class="cell90 ${cls[n]}"><div class="n">${n}</div><div class="f">${st.freq[n]}× · écart ${st.ecart[n]}</div></div>`).join('');
}

function renderCooc(){
  const draws=DataLayer.cache.draws;
  const period=$('#coPeriod')?.value||'all', mode=$('#coMode')?.value||'win';
  const {pairs, triplets}=StatsEngine.computeCooc(draws, period, mode, TODAY);
  const maxP=pairs.length?pairs[0].c:1;
  $('#pairsList').innerHTML=pairs.slice(0,10).map(p=> `<div class="pair-row"><div class="nums">${ball(p.a,'win sm')}${ball(p.b,mode==='cross'?'machine sm':'win sm')}</div><div class="pair-bar" role="progressbar" aria-valuenow="${p.c}" aria-valuemax="${maxP}"><i style="width:${(p.c/maxP*100).toFixed(1)}%"></i></div><div class="cnt">${p.c}×</div></div>`).join('')||'<p class="muted">—</p>';
  const maxT=triplets.length?triplets[0].count:1;
  $('#tripList').innerHTML=triplets.slice(0,5).map(t=> `<div class="pair-row"><div class="nums" style="width:auto">${ball(t.a,'win sm')}${ball(t.b,'win sm')}${ball(t.c,'win sm')}</div><div class="pair-bar"><i style="width:${(t.count/maxT*100).toFixed(1)}%"></i></div><div class="cnt">${t.count}×</div></div>`).join('')||'<p class="muted">—</p>';

  const st=StatsEngine.computeStats(draws, period, mode==='machine'?'machine':'win', DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold, TODAY);
  const top12=[...Array(90).keys()].map(i=>i+1).sort((a,b)=>st.freq[b]-st.freq[a]).slice(0,12);
  const pmap=new Map(); pairs.forEach(p=>{ pmap.set(p.a+'-'+p.b,p.c); pmap.set(p.b+'-'+p.a,p.c); });
  const maxC=Math.max(1, ...top12.map(a=> Math.max(...top12.map(b=> a===b?0:(pmap.get(a+'-'+b)||0)))));
  let html=`<div class="heat" style="grid-template-columns:40px repeat(${top12.length},1fr)"><div class="hc hh"></div>`+top12.map(n=>`<div class="hc hh">${n}</div>`).join('');
  top12.forEach(a=>{
    html+=`<div class="hc hh">${a}</div>`;
    top12.forEach(b=>{
      const c=a===b?null:(pmap.get(a+'-'+b)||0);
      const al=c===null?0:c/maxC;
      html+=`<div class="hc" title="${a} & ${b} : ${c||0}" style="background:${c===null?'#101728':`rgba(246,178,27,${0.08+al*0.85})`};color:${al>0.5?'#3b2503':'#8fa0ba'}">${c===null?'·':(c||0)}</div>`;
    });
  });
  const heat=$('#heatGrid'); if(heat) heat.innerHTML=html+'</div>';
}

function nextOf(i){
  const draws=DataLayer.cache.draws;
  const ses=draws[i].session;
  for(let j=i+1;j<draws.length;j++) if(draws[j].session===ses) return j;
  return i+1<draws.length? i+1 : -1;
}

async function runSimilarity(){
  const draws=DataLayer.cache.draws;
  const scope=$('#simScope')?.value||'both';
  const min=parseInt($('#simMin')?.value||'3',10);
  const limit=parseInt($('#simLimit')?.value||'15',10);
  let q;
  if($('#simRef')?.value==='last'){
    const last=StatsEngine.lastDraw(draws);
    if(!last){ toast('Pas de dernier tirage','error'); return; }
    if(scope==='both') q=[...new Set([...last.win,...(last.machine||[])])];
    else if(scope==='machine') q=last.machine.length?last.machine:last.win;
    else q=last.win;
  } else {
    q=[];
    for(let i=1;i<=5;i++){ const v=parseInt($('#q'+i)?.value,10); if(isNaN(v)||v<1||v>90){ toast('Saisie manuelle invalide','error'); return; } if(q.includes(v)){ toast('Doublon','error'); return; } q.push(v); }
  }

  const useSum=$('#simSum')?.checked, usePar=$('#simParity')?.checked, useTens=$('#simTens')?.checked, useGap=$('#simGap')?.checked;
  const queryBox=$('#simQueryBox'); if(queryBox) queryBox.innerHTML=`<div class="skeleton" style="height:40px"></div>`;
  const resultsBox=$('#simResults'); if(resultsBox) resultsBox.innerHTML=`<div class="skeleton"></div><div class="skeleton" style="margin-top:8px"></div>`;

  const filters = (useSum||usePar||useTens||useGap) ? {sum:useSum, parity:usePar, tens:useTens, gap:useGap} : null;

  try{
    const w=getWorker();
    const promise=new Promise((resolve)=>{
      const handler=(e)=>{
        if(e.data.type==='similarityResult'){ w.removeEventListener('message',handler); resolve(e.data.payload); }
      };
      w.addEventListener('message',handler);
    });
    w.postMessage({type:'similarity', payload:{draws, scope, queryNums:q, min, filters}});
    const res=await promise;
    processSimilarityResults(res, q, scope, limit);
  }catch(err){
    console.warn('Worker failed, fallback',err);
    const qset=new Set(q);
    const res=[];
    draws.forEach((d,i)=>{
      if($('#simRef')?.value==='last' && i===draws.length-1) return;
      const arr=scope==='both'? [...new Set([...d.win,...(d.machine||[])])] : (scope==='win'?d.win:d.machine||d.win);
      const sc=arr.filter(x=>qset.has(x)).length;
      if(min && sc<min) return;
      res.push({i,s:sc});
    });
    res.sort((a,b)=>b.s-a.s);
    processSimilarityResults(res,q,scope,limit);
  }
}

function processSimilarityResults(res, q, scope, limit){
  const draws=DataLayer.cache.draws;
  const qDisplay=[...new Set(q)];
  $('#simQueryBox').innerHTML=`
    <div class="muted" style="font-size:12px;margin-bottom:6px">Requête (${escapeHTML(scope)}) :</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${qDisplay.map(n=>ball(n, scope==='machine'?'machine':'win')).join('')}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">Σ ${sum(qDisplay)} · ${qDisplay.filter(n=>n%2===0).length} pairs / ${qDisplay.filter(n=>n%2).length} impairs · ${res.length} correspondance(s)</div>`;
  const qset=new Set(q);
  $('#simResults').innerHTML=res.slice(0,limit).map(r=>{
    const d=draws[r.i]; const nx=nextOf(r.i);
    const winHits=d.win.filter(n=>qset.has(n)).length;
    const machHits=d.machine.length?d.machine.filter(n=>qset.has(n)).length:0;
    const totalHits=scope==='both'? winHits+machHits : r.s;
    return `<div class="sim-item"><div class="meta"><b>${escapeHTML(fmtDate(d.date))}</b><span class="muted">· ${escapeHTML(d.session)}</span><span class="badge ${totalHits>=4?'hot':'ok'}">${totalHits} communs</span>${scope==='both'?`<span class="muted" style="font-size:11px">(W:${winHits} M:${machHits})</span>`:''}</div><div style="display:flex;gap:4px;flex-wrap:wrap">${d.win.map(n=>ball(n,'win sm',qset.has(n))).join('')}${d.machine.length?d.machine.map(n=>ball(n,'machine sm',qset.has(n))).join(''):''}</div><div class="rowline">Σ ${sum(d.win)} · ${d.win.filter(n=>n%2===0).length}P/${d.win.filter(n=>n%2).length}I ${nx>=0?` · <b style="color:var(--green)">N+1 :</b> ${escapeHTML(draws[nx].win.join('-'))}`:''}</div></div>`;
  }).join('')||'<p class="muted">Aucun tirage similaire.</p>';

  const nextFreq=new Array(91).fill(0); let cnt=0;
  res.forEach(r=>{ const nx=nextOf(r.i); if(nx>=0){ cnt++; draws[nx].win.forEach(n=>nextFreq[n]++); } });
  const topN=[...Array(90).keys()].map(i=>i+1).filter(n=>nextFreq[n]>0).sort((a,b)=>nextFreq[b]-nextFreq[a]).slice(0,8);
  $('#simNext').innerHTML=cnt? topN.map(n=> `<div class="pair-row"><div class="nums">${ball(n,'win sm')}</div><div class="pair-bar"><i style="width:${(nextFreq[n]/cnt*100).toFixed(0)}%"></i></div><div class="cnt">${nextFreq[n]}×</div><div class="pct">${(nextFreq[n]/cnt*100).toFixed(0)}%</div></div>`).join('') : '<p class="muted">Pas de N+1 exploitables.</p>';
  DataLayer.log('succès',`Recherche similitude : ${res.length} correspondances`);
}

function runBacktest(){
  const draws=DataLayer.cache.draws;
  const strat=$('#btStrat')?.value||'hot';
  const warm=Math.max(10, parseInt($('#btWarm')?.value,10)||30);
  const stake=parseInt($('#btStake')?.value,10)||200;
  const mult={2:parseInt($('#btM2')?.value,10)||2,3:parseInt($('#btM3')?.value,10)||10,4:parseInt($('#btM4')?.value,10)||100,5:parseInt($('#btM5')?.value,10)||2000};
  try{
    const result=StatsEngine.backtest(draws, strat, warm, stake, mult);
    const transparency = generateTransparencyReport(result);
    lastBacktestReport = transparency;

    $('#btKpis').innerHTML=`
      <div class="kpi"><div class="lbl">Hit rate (≥2/5)</div><div class="val" style="color:${result.hitRate>=40?'var(--green)':'var(--orange)'}">${result.hitRate.toFixed(1)}% <span style="font-size:11px;color:var(--muted)">vs hasard ~23%</span></div><div class="sub">${result.total} tirages · écart vs hasard ${(transparency.excessVsRandom).toFixed(1)}%</div></div>
      <div class="kpi"><div class="lbl">Espérance nette / jeu</div><div class="val" style="color:${transparency.expectedPerGame>=0?'var(--green)':'var(--red)'}">${transparency.expectedPerGame>=0?'+':''}${transparency.expectedPerGame.toFixed(1)} F</div><div class="sub">Net ${transparency.net.toLocaleString('fr-FR')} F · ROI ${transparency.roi.toFixed(1)}%</div></div>
      <div class="kpi"><div class="lbl">Verdict transparence</div><div class="val" style="font-size:13px">${escapeHTML(transparency.verdict)}</div><div class="sub"><span class="badge ${transparency.isProfitable?'ok':'err'}">${transparency.isProfitable?'Rentable historique':'Perdante'}</span></div></div>
      <div class="kpi"><div class="lbl">Drawdown max</div><div class="val" style="color:var(--red)">${result.maxDD.toLocaleString('fr-FR')} F</div><div class="sub">Défaite max ${result.maxLose} · Victoire max ${result.maxWin}</div></div>
    `;

    if(charts.bt) charts.bt.destroy();
    charts.bt=createEquityChart($('#chartBt'), result.equity, result.net>=0);

    // Detailed transparency panel
    let panel = $('#backtestTransparency');
    if(!panel){
      panel=document.createElement('div');
      panel.id='backtestTransparency';
      panel.className='card';
      $('#view-back').appendChild(panel);
    }
    panel.innerHTML=`
      <h3>🔎 Transparence — Espérance de gain</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:8px">
        <div class="key-card"><h4>Rendement net</h4><div style="font-size:18px;font-weight:800;color:${transparency.net>=0?'var(--green)':'var(--red)'}">${transparency.net.toLocaleString('fr-FR')} F</div><div class="muted" style="font-size:12px">Sur ${transparency.total} tirages, mises ${transparency.staked.toLocaleString()} F</div></div>
        <div class="key-card"><h4>Espérance / mise</h4><div style="font-size:18px;font-weight:800">${transparency.roi.toFixed(2)}% ROI</div><div class="muted" style="font-size:12px">Gain moyen par jeu ${transparency.expectedPerGame.toFixed(2)} F</div></div>
        <div class="key-card"><h4>Comparaison hasard</h4><div style="font-size:18px;font-weight:800">${transparency.excessVsRandom>0?'+':''}${transparency.excessVsRandom.toFixed(1)}% hit rate</div><div class="muted" style="font-size:12px">Vs théorique hasard 23% pour ≥2/5</div></div>
      </div>
      <p class="muted" style="margin-top:12px;font-size:12px;border-top:1px solid var(--line);padding-top:10px">⚠️ ${escapeHTML(transparency.disclaimer)} Backtest sur historique uniquement.</p>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge ${transparency.roi>0?'ok':'err'}">ROI ${transparency.roi.toFixed(1)}%</span>
        <span class="badge ${transparency.hitRate>23?'ok':'neutral'}">Hit ${transparency.hitRate.toFixed(1)}% vs 23% hasard</span>
        <span class="badge warn">Drawdown ${transparency.maxDD.toLocaleString()} F</span>
      </div>
    `;

    DataLayer.log('succès',`Backtest [${strat}] : hit ${result.hitRate.toFixed(1)}% (${transparency.excessVsRandom>0?'+':''}${transparency.excessVsRandom.toFixed(1)} vs hasard), net ${result.net} F ROI ${transparency.roi.toFixed(1)}%`);
    toast(`Backtest terminé — ${transparency.verdict} — ROI ${transparency.roi.toFixed(1)}%`, transparency.isProfitable?'success':'info');
  }catch(e){
    toast(e.message||'Erreur backtest','error');
  }
}

function syncSys(){
  $$('#sysGrid .num-cell').forEach(b=> b.classList.toggle('on', sysSel.has(+b.dataset.n)));
  const arr=[...sysSel].sort((a,b)=>a-b);
  const countEl=$('#sysCount'); if(countEl) countEl.textContent=arr.length?`→ ${arr.length} pion(s) : ${arr.join(', ')}`:'Aucun pion sélectionné.';
  const opts='<option value="">—</option>'+arr.map(n=>`<option>${n}</option>`).join('');
  const b1=$('#sysB1'), b2=$('#sysB2'); if(b1) b1.innerHTML=opts; if(b2) b2.innerHTML=opts;
}
function renderSys(){ syncSys(); }

function generateGrids(){
  const draws=DataLayer.cache.draws;
  const period=$('#prPeriod')?.value||'all';
  const N=parseInt($('#prCount')?.value,10)||3;
  const st=StatsEngine.computeStats(draws, period,'win', DataLayer.cache.cfg.hot, DataLayer.cache.cfg.cold, TODAY);
  const maxF=Math.max(...st.freq.slice(1),1), maxE=Math.max(...st.ecart.slice(1),1);
  const keyNums=new Set();
  if($('#chkKeys')?.checked) StatsEngine.computeKeys(draws).forEach(k=>k.nums.forEach(n=>keyNums.add(n)));
  const markovScores=new Array(91).fill(0);
  if($('#chkMarkov')?.checked){
    const last=StatsEngine.lastDraw(draws);
    const {probs}=StatsEngine.markovTransition(draws, period, TODAY);
    if(last) last.win.forEach(n=>{ for(let i=1;i<=90;i++) markovScores[i]+=probs[n][i]; });
  }
  const weightedScores=new Array(91).fill(0);
  if($('#chkWeighted')?.checked){
    const weighted=StatsEngine.weightedN1(draws, period,0.95,TODAY);
    weighted.forEach(w=>{ weightedScores[w.num]=w.score; });
  }
  const scored=[];
  for(let n=1;n<=90;n++){
    let s=0;
    if($('#chkHot')?.checked) s+=(st.freq[n]/maxF)*3;
    if($('#chkEcart')?.checked) s+=(st.ecart[n]/maxE)*2;
    if($('#chkKeys')?.checked && keyNums.has(n)) s+=1.6;
    if($('#chkMarkov')?.checked) s+=markovScores[n]*2;
    if($('#chkWeighted')?.checked) s+=weightedScores[n]*1.5;
    if($('#chkPairs')?.checked){
      const {pairs}=StatsEngine.computeCooc(draws, period,'win',TODAY);
      const pairBonus=pairs.filter(p=>p.a===n||p.b===n).slice(0,3).reduce((a,p)=>a+p.c*0.01,0);
      s+=pairBonus;
    }
    scored.push({n,s});
  }
  scored.sort((a,b)=>b.s-a.s||a.n-b.n);
  const base=scored.slice(0,12).map(x=>x.n);
  lastPred=[];
  for(let g=0;g<N;g++){ const grid=[]; for(let i=0;i<5;i++) grid.push(base[(g*2+i)%12]); lastPred.push(grid.sort((a,b)=>a-b)); }
  return lastPred;
}
function renderPred(){
  const draws=DataLayer.cache.draws;
  const d=StatsEngine.lastDraw(draws);
  const lastBox=$('#lastDrawBox');
  if(lastBox) lastBox.innerHTML=d?`
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
      <div><div class="muted" style="font-size:12px;margin-bottom:6px"><b>${escapeHTML(fmtDate(d.date))} · ${escapeHTML(d.session)}</b> — WIN</div><div style="display:flex;gap:6px;flex-wrap:wrap">${d.win.map(n=>ball(n,'win')).join('')}</div></div>
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">MACHINE</div>${d.machine.length?`<div style="display:flex;gap:6px;flex-wrap:wrap">${d.machine.map(n=>ball(n,'machine')).join('')}</div>`:'<span class="badge neutral">Sans Machine</span>'}</div>
      <div class="muted" style="font-size:12px">Σ Win = <b style="color:var(--gold2)">${sum(d.win)}</b></div>
    </div>`:'—';
  const keysGrid=$('#keysGrid');
  if(keysGrid) keysGrid.innerHTML=StatsEngine.computeKeys(draws).map(k=> `<div class="key-card"><h4>🔑 ${escapeHTML(k.name)}</h4><div class="fx">${escapeHTML(k.fx)}</div><div style="display:flex;gap:5px;flex-wrap:wrap">${k.nums.length?k.nums.map(n=>ball(n,'win sm')).join(''):'<span class="muted">—</span>'}</div></div>`).join('');
  if(!draws.length) return;
  const markov=StatsEngine.markovTransition(draws,'all',TODAY);
  const lastWin=d.win;
  const markovScores=new Array(91).fill(0);
  lastWin.forEach(n=>{ for(let i=1;i<=90;i++) markovScores[i]+=markov.probs[n][i]; });
  const topMarkov=[...Array(90).keys()].map(i=>i+1).sort((a,b)=>markovScores[b]-markovScores[a]).slice(0,8);
  const mOut=$('#markovOut'); if(mOut) mOut.innerHTML=topMarkov.map(n=> `<div style="display:inline-flex;align-items:center;gap:6px;margin:4px">${ball(n,'win sm')}<span class="muted" style="font-size:11px">${(markovScores[n]*100).toFixed(1)}%</span></div>`).join('');
  const weighted=StatsEngine.weightedN1(draws,'all',0.95,TODAY).slice(0,8);
  const wOut=$('#weightedOut'); if(wOut) wOut.innerHTML=weighted.map(w=> `<div style="display:inline-flex;align-items:center;gap:6px;margin:4px">${ball(w.num,'win sm')}<span class="muted" style="font-size:11px">${w.score.toFixed(2)}</span></div>`).join('');
}

function renderAlerts(){
  const a=refreshBadge();
  const countEl=$('#alertCount'); if(countEl) countEl.textContent=`${a.length} alerte(s) active(s)`;
  const listEl=$('#alertList');
  if(listEl) listEl.innerHTML=a.map(x=> `<div class="alert-item"><div class="ic" style="background:${x.type==='ecart'?'rgba(56,189,248,.15)':'rgba(246,178,27,.15)'}">${x.type==='ecart'?'⏰':'🧬'}</div><div style="font-size:13px;line-height:1.5">${escapeHTML(x.msg)}</div></div>`).join('')||'<p class="muted">Aucune alerte.</p>';
  const last=StatsEngine.lastDraw(DataLayer.cache.draws);
  const syncInfo=$('#syncInfo'); if(syncInfo) syncInfo.textContent=`Base locale : ${DataLayer.cache.draws.length} tirages · dernier : ${last? escapeHTML(fmtDate(last.date))+' ('+escapeHTML(last.session)+')' : '—'}. Mode hors-ligne PWA actif.`;
}

function renderLogs(){
  const LBL={succès:'ok',erreur:'err',info:'warn',export:'ok'};
  const body=$('#logsBody');
  if(!body) return;
  body.innerHTML=DataLayer.cache.logs.map(l=> `<tr><td class="muted">${escapeHTML(l.ts)}</td><td><span class="badge ${LBL[l.type]||'warn'}">${escapeHTML(l.type)}</span></td><td>${escapeHTML(l.msg)}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">Vide.</td></tr>';
}

async function handleFiles(files){
  for(const file of files){
    const text=await file.text();
    let data=[];
    if(file.name.endsWith('.csv')){
      data=parseCSV(text);
    } else if(file.name.endsWith('.json')){
      try{
        const parsed=JSON.parse(text);
        if(Array.isArray(parsed)) data=parsed;
        else if(parsed.draws) data=parsed.draws;
        else data=[parsed];
      }catch(e){ toast('Fichier JSON invalide — schéma attendu tableau de tirages','error'); continue; }
    } else { toast('Format non supporté (CSV ou JSON)','error'); continue; }
    if(data.length>0){
      $('#importProgress').style.display='block';
      const result=await DataLayer.importData(data, (prog,imp,skip,invalid)=>{
        const pf=$('#progressFill'); if(pf){ pf.style.width=prog+'%'; pf.textContent=prog+'%'; }
        const st=$('#importStatus'); if(st) st.textContent=`${imp} importés, ${skip} rejetés/doublons...${invalid && invalid.length? ` (${invalid.length} invalides)` : ''}`;
      });
      updateStatsUI(); invalidateCache(); refreshBadge();
      const stEl=$('#importStatus'); if(stEl) stEl.textContent=`✅ Terminé : ${result.imported} importés, ${result.skipped} rejetés`;
      if(result.invalid && result.invalid.length){
        toast(`✅ ${result.imported} importés, ${result.invalid.length} invalides rejetés (sécurité)`, result.imported?'success':'error');
        console.warn('Invalid entries:', result.invalid.slice(0,10));
      } else {
        toast(`✅ ${result.imported} tirages importés depuis ${escapeHTML(file.name)}`);
      }
    } else {
      toast('Aucune donnée valide trouvée — vérifiez schéma','error');
    }
  }
}

function buildInputs(){
  const w=$('#winInputs'), m=$('#machInputs');
  if(!w||!m) return;
  w.innerHTML=''; m.innerHTML='';
  for(let i=1;i<=5;i++){
    w.insertAdjacentHTML('beforeend',`<div class="fld"><label for="w${i}">W${i}</label><input type="number" min="1" max="90" class="input num-in" id="w${i}" aria-label="Numéro gagnant ${i}"></div>`);
    m.insertAdjacentHTML('beforeend',`<div class="fld"><label for="m${i}">M${i}</label><input type="number" min="1" max="90" class="input num-in" id="m${i}" aria-label="Numéro machine ${i}"></div>`);
  }
  const sessions=[...new Set([...CONFIG.SESSION_LIST])].sort();
  const dfSession=$('#dfSession'); if(dfSession) dfSession.innerHTML=sessions.map(s=>`<option>${escapeHTML(s)}</option>`).join('');
  const fSession=$('#fSession'); if(fSession) fSession.innerHTML='<option value="">Toutes</option>'+sessions.map(s=>`<option>${escapeHTML(s)}</option>`).join('');
}

function buildSysGrid(){
  const g=$('#sysGrid'); if(!g) return;
  g.innerHTML='';
  for(let n=1;n<=90;n++){
    const b=document.createElement('button');
    b.type='button'; b.className='num-cell'; b.textContent=n; b.dataset.n=n;
    b.setAttribute('aria-label', `Pion ${n}, cliquer pour sélectionner`);
    b.addEventListener('click',()=>{ if(sysSel.has(n)) sysSel.delete(n); else sysSel.add(n); syncSys(); });
    g.appendChild(b);
  }
}

function wireEvents(){
  $$('.nav-btn').forEach(b=> b.addEventListener('click',()=> go(b.dataset.view)));
  const topDate=$('#topDate'); if(topDate) topDate.textContent=TODAY.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const roleSel=$('#roleSel');
  if(roleSel) roleSel.addEventListener('change',()=>{
    const admin=roleSel.value==='admin';
    const adminCard=$('#adminFormCard'); if(adminCard) adminCard.style.display=admin?'':'none';
    const resetBtn=$('#btnResetData'); if(resetBtn) resetBtn.style.display=admin?'':'none';
    DataLayer.log('info','Changement de rôle : '+(admin?'Administrateur':'Analyste'));
    toast('Session '+(admin?'Administrateur':'Analyste')+' active','info');
  });

  const dropZone=$('#dropZone'), fileInput=$('#importFile');
  if(dropZone && fileInput){
    dropZone.addEventListener('click',()=> fileInput.click());
    dropZone.addEventListener('keydown',(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); fileInput.click(); } });
    dropZone.addEventListener('dragover',(e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave',()=> dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop',(e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    const importBtn=$('#btnImportFile'); if(importBtn) importBtn.addEventListener('click',()=> fileInput.click());
    fileInput.addEventListener('change',(e)=> handleFiles(e.target.files));
  }
  const tplBtn=$('#btnDownloadTemplate');
  if(tplBtn) tplBtn.addEventListener('click',()=>{
    const csv=`date,session,win_1,win_2,win_3,win_4,win_5,machine_1,machine_2,machine_3,machine_4,machine_5\n2012-07-17,Midi,12,34,56,78,90,11,22,33,44,55\n2012-07-17,Soir,23,45,67,89,1,15,25,35,45,55`;
    const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='template_loto_bonheur.csv'; a.click(); URL.revokeObjectURL(url);
  });
  const sampleBtn=$('#btnLoadSample');
  if(sampleBtn) sampleBtn.addEventListener('click', async ()=>{
    // Load from public/data/real_data.json + generate demo
    try{
      const res = await fetch(CONFIG.DATA_URL);
      if(res.ok){
        const json = await res.json();
        $('#importProgress').style.display='block';
        const result=await DataLayer.importData(json, (p,i,s)=>{ const pf=$('#progressFill'); if(pf){ pf.style.width=p+'%'; pf.textContent=p+'%'; } const st=$('#importStatus'); if(st) st.textContent=`${i} importés...`; });
        updateStatsUI(); invalidateCache(); refreshBadge();
        toast(`✅ Données réelles chargées : ${result.imported} tirages`);
        return;
      }
    }catch(e){ console.warn(e); }
    // fallback generate random demo
    const sampleData=[]; const sessions=['Midi','Soir','Special','Digital 21h','Digital 22h'];
    for(let year=2012;year<=2026;year++){
      for(let month=1;month<=12;month++){
        const daysInMonth=new Date(year,month,0).getDate();
        for(let day=1;day<=daysInMonth;day+=7){
          const session=sessions[Math.floor(Math.random()*sessions.length)];
          const win=[]; while(win.length<5){ const n=Math.floor(Math.random()*90)+1; if(!win.includes(n)) win.push(n); }
          const machine=[]; while(machine.length<5){ const n=Math.floor(Math.random()*90)+1; if(!machine.includes(n)) machine.push(n); }
          sampleData.push({date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, session, win:win.sort((a,b)=>a-b), machine:machine.sort((a,b)=>a-b)});
        }
      }
    }
    $('#importProgress').style.display='block';
    const result=await DataLayer.importData(sampleData, (p,i,s)=>{ const pf=$('#progressFill'); if(pf){ pf.style.width=p+'%'; pf.textContent=p+'%'; } const st=$('#importStatus'); if(st) st.textContent=`${i} importés...`; });
    updateStatsUI(); invalidateCache(); refreshBadge();
    toast(`✅ Données de démonstration : ${result.imported} tirages`);
  });
  const exportAllBtn=$('#btnExportAll');
  if(exportAllBtn) exportAllBtn.addEventListener('click',()=>{
    const csv=['date,session,win_1,win_2,win_3,win_4,win_5,machine_1,machine_2,machine_3,machine_4,machine_5'];
    DataLayer.cache.draws.forEach(d=>{
      const mach=d.machine.length===5?d.machine:['','','','',''];
      csv.push(`${d.date},${d.session},${d.win.join(',')},${mach.join(',')}`);
    });
    downloadCSV('loto_bonheur_complet.csv', [csv.join('\n')]);
  });
  const clearAllBtn=$('#btnClearAll');
  if(clearAllBtn) clearAllBtn.addEventListener('click', async ()=>{
    if(!confirm('⚠️ Supprimer toutes les données ?')) return;
    await DataLayer.clearDraws(); updateStatsUI(); invalidateCache(); toast('Base vidée','info');
  });

  const dfDate=$('#dfDate'); if(dfDate) dfDate.value=iso(TODAY);
  const noMachChk=$('#dfNoMachine');
  if(noMachChk) noMachChk.addEventListener('change',e=>{
    const fieldset=$('#machFieldset'); if(fieldset) fieldset.style.opacity=e.target.checked?'.35':'1';
    $$('#machInputs input').forEach(i=> i.disabled=e.target.checked);
  });
  const clearFormBtn=$('#dfClear');
  if(clearFormBtn) clearFormBtn.addEventListener('click',()=>{ for(let i=1;i<=5;i++){ const w=$('#w'+i), m=$('#m'+i); if(w) w.value=''; if(m) m.value=''; } const err=$('#dfErr'); if(err) err.innerHTML=''; });
  const drawForm=$('#drawForm');
  if(drawForm) drawForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const errs=[];
    const date=$('#dfDate')?.value, session=$('#dfSession')?.value, noM=$('#dfNoMachine')?.checked;
    function readBlock(pre, skip){
      const arr=[];
      for(let i=1;i<=5;i++){
        const el=$('#'+pre+i), v=parseInt(el?.value,10);
        if(el) el.classList.remove('err');
        if(skip) continue;
        if(isNaN(v)||v<1||v>90){ if(el) el.classList.add('err'); errs.push(`${pre==='w'?'Win':'Machine'} ${i} hors limites.`); continue; }
        if(arr.includes(v)){ if(el) el.classList.add('err'); errs.push(`Doublon ${pre==='w'?'Win':'Machine'} (${v}).`); continue; }
        arr.push(v);
      }
      return arr.sort((a,b)=>a-b);
    }
    const win=readBlock('w',false), mach=readBlock('m',noM);
    // Validate via validator
    const candidate={date, session, win, machine: noM?[]:mach};
    const v=validateDraw(candidate);
    if(!v.ok) errs.push(...v.errors);
    if(date && DataLayer.cache.draws.some(d=>d.date===date && d.session===session)) errs.push(`Tirage « ${session} » déjà présent le ${fmtDate(date)}.`);
    const errBox=$('#dfErr'); if(errBox) errBox.innerHTML=errs.map(m=>`<div>⛔ ${escapeHTML(m)}</div>`).join('');
    if(errs.length){ errs.forEach(m=>DataLayer.log('erreur',m)); toast('Validation refusée.','error'); return; }
    try{
      await DataLayer.putDraw({...v.sanitized, id:Date.now()});
      updateStatsUI(); invalidateCache(); refreshBadge();
      DataLayer.log('succès',`Tirage ${session} du ${fmtDate(date)} enregistré — Win [${win.join(' ')}]`);
      toast('Tirage enregistré ✅');
      if(clearFormBtn) clearFormBtn.click();
      renderHistory();
    }catch(err){
      toast(err.message,'error');
    }
  });

  ['fFrom','fTo','fNum','fScope','fSession'].forEach(id=>{
    const el=$('#'+id); if(el) el.addEventListener('change',()=>{ histPage=1; renderHistory(); });
  });
  const fReset=$('#fReset');
  if(fReset) fReset.addEventListener('click',()=>{ ['fFrom','fTo','fNum'].forEach(id=>{ const el=$('#'+id); if(el) el.value=''; }); const s1=$('#fScope'); if(s1) s1.value='both'; const s2=$('#fSession'); if(s2) s2.value=''; histPage=1; renderHistory(); });
  const histCsv=$('#btnHistCsv');
  if(histCsv) histCsv.addEventListener('click',()=>{
    const list=filteredHistory();
    downloadCSV('historique_officiel_loto_bonheur.csv', [['Date','Session','Win','Machine','Somme'], ...list.map(d=>[d.date,d.session,d.win.join(' '),d.machine.join(' ')||'—',sum(d.win)])]);
    toast('Historique exporté ⬇');
  });

  const stApply=$('#stApply');
  if(stApply) stApply.addEventListener('click', async ()=>{
    DataLayer.cache.cfg.hot=Math.max(0, parseInt($('#stHot')?.value,10)||0);
    DataLayer.cache.cfg.cold=Math.max(0, parseInt($('#stCold')?.value,10)||0);
    await DataLayer.saveCfg(); invalidateCache(); renderStats(); DataLayer.log('info',`Seuils : +${DataLayer.cache.cfg.hot}% / −${DataLayer.cache.cfg.cold}%`); toast('Classification recalculée ✅');
  });
  [['sortNum','num'],['sortFreq','freq'],['sortEcart','ecart']].forEach(([id,key])=>{
    const el=$('#'+id); if(el) el.addEventListener('click',()=>{ stSort={key}; renderStats(); });
  });

  ['coPeriod','coMode'].forEach(id=>{ const el=$('#'+id); if(el) el.addEventListener('change', renderCooc); });

  const simRef=$('#simRef'); if(simRef) simRef.addEventListener('change',()=>{ const man=$('#simManual'); if(man) man.style.display=simRef.value==='manual'?'flex':'none'; });
  const simRun=$('#simRun'); if(simRun) simRun.addEventListener('click', runSimilarity);
  ['simScope','simMin','simLimit','simSum','simParity','simTens','simGap'].forEach(id=>{ const el=$('#'+id); if(el) el.addEventListener('change', debounce(()=>{ if($('#simResults')?.innerHTML.includes('sim-item')) runSimilarity(); },300)); });

  const btRun=$('#btRun'); if(btRun) btRun.addEventListener('click', runBacktest);

  buildSysGrid();
  const sysClear=$('#sysClear'); if(sysClear) sysClear.addEventListener('click',()=>{ sysSel.clear(); syncSys(); });
  const sysImport=$('#sysImport'); if(sysImport) sysImport.addEventListener('click',()=>{ if(!lastPred.length){ toast('Générez d\'abord une prédiction','error'); return; } lastPred[0].forEach(n=>sysSel.add(n)); syncSys(); toast('Prédiction importée'); });
  const sysCalc=$('#sysCalc');
  if(sysCalc) sysCalc.addEventListener('click',()=>{
    const arr=[...sysSel].sort((a,b)=>a-b); if(arr.length<5){ toast('Sélectionnez au moins 5 pions.','error'); return; }
    const mode=$('#sysMode')?.value||'perm', stake=parseInt($('#sysStake')?.value,10)||200;
    let bases=[];
    if(mode==='reduit'){
      const b1=parseInt($('#sysB1')?.value,10), b2=parseInt($('#sysB2')?.value,10);
      if(!isNaN(b1)) bases.push(b1); if(!isNaN(b2)&&b2!==b1) bases.push(b2);
      if(!bases.length){ toast('Choisissez au moins 1 base fixe.','error'); return; }
    }
    const b=bases.length, rest=arr.filter(x=>!bases.includes(x)), k=5-b;
    const combos=C(rest.length,k);
    if(combos>CONFIG.MAX_TICKET_COMBOS){
      if(!confirm(`⚠️ ${combos.toLocaleString('fr-FR')} combinaisons — coût ${(combos*stake).toLocaleString()} F. Confirmer ?`)) return;
    }
    lastSysGrids=[];
    let count=0;
    for(const c of combsIter(rest,k)){
      if(count<100000){
        lastSysGrids.push([...bases,...c].sort((a,b)=>a-b));
      }
      count++;
      if(count>=combos) break;
      if(count>200000) break;
    }
    const cost=combos*stake;
    const preview=lastSysGrids.slice(0,CONFIG.MAX_TICKET_PREVIEW);
    const out=$('#sysOut');
    if(out) out.innerHTML=`
      <div class="kpis" style="margin-bottom:12px">
        <div class="kpi"><div class="lbl">Formule</div><div class="val" style="font-size:16px">C(${rest.length},${k}) = ${combos.toLocaleString('fr-FR')}</div><div class="sub">${mode==='reduit'?`Champ réduit · ${b} base(s) [${bases.join(', ')}]`:'Permutation complète'}</div></div>
        <div class="kpi"><div class="lbl">Coût total</div><div class="val" style="color:var(--orange)">${cost.toLocaleString('fr-FR')} F</div><div class="sub">${combos} grilles × ${stake} F</div></div>
        <div class="kpi"><div class="lbl">Espérance théorique</div><div class="val" style="font-size:14px">ROI théorique -${(100- (2/2000*100)).toFixed(0)}%</div><div class="sub">Jeu aléatoire perdant par nature — voir backtest</div></div>
      </div>
      <p class="muted" style="margin:10px 0 6px">Aperçu (${preview.length} / ${combos}) :</p>
      <div class="ticket">${preview.map((g,i)=> String(i+1).padStart(3,'0')+'  '+g.map(x=>String(x).padStart(2,'0')).join(' - ')).join('\n')}${combos>CONFIG.MAX_TICKET_PREVIEW?'\n…':''}</div>
    `;
    DataLayer.log('succès',`Système calculé : ${combos} combinaisons, coût ${cost} FCFA.`);
    toast(`${combos.toLocaleString('fr-FR')} combinaisons 🎟`);
  });
  const sysCsv=$('#sysCsv');
  if(sysCsv) sysCsv.addEventListener('click',()=>{
    if(!lastSysGrids.length){ toast('Calculez d\'abord un système.','error'); return; }
    downloadCSV('ticket_systeme_loto_bonheur.csv', [['Grille','Numéros'], ...lastSysGrids.map((g,i)=>['G'+(i+1), g.join(' ')])]);
    toast('Ticket exporté ⬇');
  });

  const btnGen=$('#btnGen');
  if(btnGen) btnGen.addEventListener('click',()=>{
    const grids=generateGrids();
    const box=$('#predGrids'); if(box) box.innerHTML=grids.map((g,i)=> `<div class="pred-grid"><span class="gid">GRILLE ${i+1}</span>${g.map(n=>ball(n,'win')).join('')}<span class="muted" style="font-size:12px;margin-left:auto">Σ ${sum(g)}</span></div>`).join('');
    DataLayer.log('succès',`${grids.length} grille(s) générée(s).`); toast('Grilles générées 🎯');
  });
  const btnPrCsv=$('#btnPrCsv');
  if(btnPrCsv) btnPrCsv.addEventListener('click',()=>{
    if(!lastPred.length){ toast('Générez d\'abord des grilles.','error'); return; }
    downloadCSV('grilles_prediction.csv', [['Grille','Numéros','Somme'], ...lastPred.map((g,i)=>['G'+(i+1), g.join(' '), sum(g)])]);
    toast('Export CSV ⬇');
  });

  const pasteToggle=$('#pasteToggle'); if(pasteToggle) pasteToggle.addEventListener('click',()=>{ const p=$('#pastePanel'); if(p) p.style.display=p.style.display==='none'?'block':'none'; });
  const parseBtn=$('#parseBtn');
  if(parseBtn) parseBtn.addEventListener('click', async ()=>{
    const txt=$('#pasteArea')?.value||'';
    if(!txt.trim()){ toast('Collez d\'abord du texte','error'); return; }
    const parsed=parsePasteText(txt);
    if(!parsed.length){ toast('Aucun tirage détecté','error'); return; }
    const result=await DataLayer.importData(parsed);
    updateStatsUI(); invalidateCache(); refreshBadge(); renderHistory();
    toast(`✅ ${result.imported} intégrés, ${result.skipped} rejetés`);
  });
  const syncBtn=$('#syncBtn');
  if(syncBtn) syncBtn.addEventListener('click', async ()=>{
    toast('Connexion via proxy...','info');
    syncBtn.disabled=true;
    const result = await syncOfficial();
    syncBtn.disabled=false;
    if(result.ok){
      const importRes = await DataLayer.importData(result.draws);
      updateStatsUI(); invalidateCache(); refreshBadge(); renderHistory();
      toast(`✅ Synchro ${result.source}: ${importRes.imported} nouveaux`, 'success');
      DataLayer.log('succès', `Sync via ${result.source} : ${importRes.imported} nouveaux`);
    } else {
      console.warn('sync attempts', result.attempts);
      toast(`Échec CORS — proxy indisponible. Utilisez import fichier/collage. Détails console.`,'error');
      const pp=$('#pastePanel'); if(pp) pp.style.display='block';
      DataLayer.log('erreur', `Sync échouée : ${result.attempts.map(a=>a.endpoint+' '+a.error).join(' | ')}`);
    }
  });

  const clearLogs=$('#btnClearLogs');
  if(clearLogs) clearLogs.addEventListener('click', async ()=>{ await DataLayer.clearLogs(); renderLogs(); toast('Journal vidé','info'); });
  const resetData=$('#btnResetData');
  if(resetData) resetData.addEventListener('click', async ()=>{
    if(!confirm('Restaurer les données officielles depuis /data/real_data.json ?')) return;
    const {draws} = await DataLayer.loadRealDataJson();
    await DataLayer.clearDraws(); await DataLayer.bulkPutDraws(draws);
    updateStatsUI(); invalidateCache(); refreshBadge(); DataLayer.log('info','Données officielles restaurées depuis JSON.'); toast('Données restaurées ⟲','info'); go('dash');
  });
}

function initPWA(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').then(r=> {
      console.log('SW ok',r.scope);
      // check for updates
      r.addEventListener('updatefound', ()=> console.log('SW update found'));
    }).catch(err=> console.log('SW fail',err));
  }
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; const btn=$('#pwaInstall'); if(btn) btn.style.display='block'; });
  const installBtn=$('#pwaInstall');
  if(installBtn) installBtn.addEventListener('click', async ()=>{
    if(deferredPrompt){ deferredPrompt.prompt(); const {outcome}=await deferredPrompt.userChoice; if(outcome==='accepted'){ installBtn.style.display='none'; } deferredPrompt=null; }
  });
  // offline indicator
  window.addEventListener('online',()=> toast('Connexion rétablie — mode online','info'));
  window.addEventListener('offline',()=> toast('Hors-ligne — PWA cache actif','info'));
}

async function init(){
  buildInputs();
  buildSysGrid();
  wireEvents();
  await DataLayer.init();
  if(!DataLayer.cache.draws.length){
    // try load JSON first
    const {draws} = await DataLayer.loadRealDataJson();
    if(draws.length){
      await DataLayer.bulkPutDraws(draws);
      await DataLayer.log('info',`Import officiel JSON : ${draws.length} tirages.`);
    } else {
      const fallback = DataLayer.parseRealFallback();
      await DataLayer.bulkPutDraws(fallback.draws);
    }
  }
  DataLayer.cache.draws.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.id-b.id);
  const hotEl=$('#stHot'), coldEl=$('#stCold');
  if(hotEl) hotEl.value=DataLayer.cache.cfg.hot;
  if(coldEl) coldEl.value=DataLayer.cache.cfg.cold;
  updateStatsUI();
  const bootAlerts=refreshBadge();
  if(bootAlerts.length) setTimeout(()=> toast(`${bootAlerts.length} alerte(s) — voir Alertes & Sync 🔔`,'info'),800);
  renderDash();
  initPWA();

  // a11y live region
  if(!$('#a11yLive')){
    const live=document.createElement('div');
    live.id='a11yLive';
    live.setAttribute('aria-live','polite');
    live.setAttribute('aria-atomic','true');
    live.style.position='absolute'; live.style.left='-10000px'; live.style.top='auto'; live.style.width='1px'; live.style.height='1px'; live.style.overflow='hidden';
    document.body.appendChild(live);
  }
}

init();
