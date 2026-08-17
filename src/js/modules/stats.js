import { LRUCache, sum, map90 } from './utils.js';

const cache = new LRUCache(200);

function memo(k, fn){
  if(cache.has(k)) return cache.get(k);
  const v=fn();
  cache.set(k,v);
  return v;
}
export function invalidateCache(){ cache.clear(); }

export const StatsEngine = {
  drawsInPeriod(draws, p, TODAY=new Date()){
    if(p==='all') return draws;
    const c=new Date(TODAY);
    c.setDate(c.getDate()-parseInt(p,10));
    const iso=d=>d.toISOString().slice(0,10);
    const cut=iso(c);
    return draws.filter(d=>d.date>=cut);
  },

  blocksOf(d,s){
    if(s==='win') return [d.win];
    if(s==='machine') return [d.machine];
    if(s==='both') return [[...d.win,...d.machine]];
    return [d.win,d.machine];
  },

  computeStats(draws, period, scope, cfgHot=15, cfgCold=15, TODAY=new Date()){
    const key=`st:${period}:${scope}:${cfgHot}:${cfgCold}:${draws.length}`;
    return memo(key, ()=>{
      const filtered = this.drawsInPeriod(draws, period, TODAY);
      const freq=new Array(91).fill(0), last=new Array(91).fill(-1);
      filtered.forEach(d=>{
        const seen=new Set();
        this.blocksOf(d,scope).forEach(b=> b.forEach(n=>{ if(n) seen.add(n); }));
        seen.forEach(n=>freq[n]++);
      });
      for(let i=filtered.length-1, idx=0;i>=0;i--, idx++){
        const seen=new Set();
        this.blocksOf(filtered[i],scope).forEach(b=> b.forEach(n=>{ if(n) seen.add(n); }));
        seen.forEach(n=>{ if(last[n]===-1) last[n]=idx; });
      }
      return {freq, ecart: last.map(v=> v===-1? filtered.length : v), count: filtered.length, draws: filtered};
    });
  },

  classifyAll(freq, hot, cold){
    const vals=[]; for(let n=1;n<=90;n++) vals.push(freq[n]);
    const mean=vals.reduce((a,b)=>a+b,0)/90 || 0;
    const hi=mean*(1+hot/100), lo=mean*(1-cold/100);
    const cls=new Array(91).fill('neutral');
    for(let n=1;n<=90;n++) cls[n]=freq[n]>=hi?'hot':freq[n]<=lo?'cold':'neutral';
    return {cls,mean};
  },

  lastDraw(draws){ return draws[draws.length-1]; },

  computeKeys(draws){
    const d=this.lastDraw(draws);
    if(!d) return [];
    const W=[...d.win].sort((a,b)=>a-b);
    const M=d.machine.length?[...d.machine].sort((a,b)=>a-b):null;
    const S=sum(W), SM=M?sum(M):0;
    const keys=[
      {name:'Somme de contrôle Win',fx:`${W.join(' + ')} = ${S} → mod 90`,nums:[map90(S)]},
      {name:'Additions de positions',fx:`P1+P5=${W[0]}+${W[4]} · P2+P4=${W[1]}+${W[3]}`,nums:[map90(W[0]+W[4]),map90(W[1]+W[3])]},
      {name:'Soustractions de positions',fx:`P5−P1=${W[4]}−${W[0]} · P4−P2=${W[3]}−${W[1]}`,nums:[map90(W[4]-W[0]),map90(W[3]-W[1])]}
    ];
    if(M){
      const ec=[];
      for(let i=0;i<5;i++){ const e=Math.abs(W[i]-M[i]); if(e>0) ec.push(map90(e)); }
      keys.push({name:'Écarts relatifs Win ↔ Machine',fx:'|Wi−Mi| (écarts nuls exclus)',nums:[...new Set(ec)]});
      keys.push({name:'Différentiel des sommes',fx:`ΣWin−ΣMachine = ${S}−${SM}`,nums:[map90(S-SM)]});
    }
    return keys;
  },

  markovTransition(draws, period='all', TODAY=new Date()){
    const key=`markov:${period}:${draws.length}`;
    return memo(key, ()=>{
      const filtered=this.drawsInPeriod(draws, period, TODAY);
      const trans=new Array(91).fill(null).map(()=>new Array(91).fill(0));
      const counts=new Array(91).fill(0);
      for(let i=1;i<filtered.length;i++){
        const prev=filtered[i-1].win;
        const curr=filtered[i].win;
        prev.forEach(p=>{ counts[p]++; curr.forEach(c=>{ trans[p][c]++; }); });
      }
      const probs=new Array(91).fill(null).map(()=>new Array(91).fill(0));
      for(let i=1;i<=90;i++){ if(counts[i]>0){ for(let j=1;j<=90;j++){ probs[i][j]=trans[i][j]/counts[i]; } } }
      return {trans,probs,counts, draws:filtered};
    });
  },

  weightedN1(draws, period='all', decay=0.95, TODAY=new Date()){
    const key=`weighted:${period}:${decay}:${draws.length}`;
    return memo(key, ()=>{
      const filtered=this.drawsInPeriod(draws, period, TODAY);
      const scores=new Array(91).fill(0);
      for(let i=filtered.length-1;i>=0;i--){
        const age=filtered.length-1-i;
        const weight=Math.pow(decay,age);
        filtered[i].win.forEach(n=>{ scores[n]+=weight; });
      }
      return scores.map((s,i)=>({num:i,score:s})).filter(x=>x.num>0).sort((a,b)=>b.score-a.score);
    });
  },

  // Co-occurrences with triplet support
  computeCooc(draws, period, mode, TODAY=new Date()){
    const key=`cooc:${period}:${mode}:${draws.length}`;
    return memo(key, ()=>{
      const filtered=this.drawsInPeriod(draws, period, TODAY);
      const pairMap=new Map();
      const tripMap=new Map();
      const getPairs = (b)=>{
        const out=[];
        for(let i=0;i<b.length;i++) for(let j=i+1;j<b.length;j++) out.push([b[i],b[j]]);
        return out;
      };
      const getTrips = (b)=>{
        const out=[];
        for(let i=0;i<b.length;i++) for(let j=i+1;j<b.length;j++) for(let k=j+1;k<b.length;k++) out.push([b[i],b[j],b[k]]);
        return out;
      };
      filtered.forEach(d=>{
        const blocks=[];
        if(mode==='win' || mode==='machine'){
          const b=mode==='win'?d.win:d.machine;
          if(b.length===5) blocks.push(b);
        } else if(d.machine.length){
          // cross: we still compute win pairs and machine pairs plus cross pairs
          if(d.win.length===5) blocks.push(d.win);
          if(d.machine.length===5) blocks.push(d.machine);
          d.win.forEach(w=> d.machine.forEach(m=> {
            const a=Math.min(w,m), b=Math.max(w,m);
            const k=`${a}-${b}`;
            pairMap.set(k, (pairMap.get(k)||0)+1);
          }));
        }
        // For win/machine internal pairs
        if(mode!=='cross'){
          blocks.forEach(b=>{
            getPairs(b).forEach(([a,b2])=>{
              const k=`${Math.min(a,b2)}-${Math.max(a,b2)}`;
              pairMap.set(k,(pairMap.get(k)||0)+1);
            });
            getTrips(b).forEach(([a,b2,c])=>{
              const sorted=[a,b2,c].sort((x,y)=>x-y);
              const k=`${sorted[0]}-${sorted[1]}-${sorted[2]}`;
              tripMap.set(k,(tripMap.get(k)||0)+1);
            });
          });
        } else {
          // for cross mode also compute triplets crossing? skip for simplicity, compute win triplets
          d.win && getTrips(d.win).forEach(([a,b2,c])=>{
            const sorted=[a,b2,c].sort((x,y)=>x-y);
            const k=`${sorted[0]}-${sorted[1]}-${sorted[2]}`;
            tripMap.set(k,(tripMap.get(k)||0)+1);
          });
        }
      });
      const pairs=[...pairMap.entries()].map(([k,c])=>{ const [a,b]=k.split('-').map(Number); return {a,b,c}; }).sort((x,y)=>y.c-x.c);
      const triplets=[...tripMap.entries()].map(([k,c])=>{ const [a,b,cc]=k.split('-').map(Number); return {a,b,c:cc,count:c}; }).sort((x,y)=>y.count-x.count);
      return {pairs, triplets, count:filtered.length};
    });
  },

  // Optimized backtest incremental version
  backtest(draws, strat, warm, stake, mult){
    const N=draws.length;
    if(N-warm<5) throw new Error('Historique insuffisant');
    // Incremental freq and lastSeen for hot/ecart/mix
    let freq=new Array(91).fill(0);
    let lastSeen=new Array(91).fill(-1);
    // Initialize for warm period
    for(let i=0;i<warm;i++){
      draws[i].win.forEach(n=> freq[n]++);
    }
    // Build lastSeen for warm
    for(let i=warm-1, idx=0;i>=0;i--,idx++){
      draws[i].win.forEach(n=>{ if(lastSeen[n]===-1) lastSeen[n]=idx; });
    }

    // Precompute markov if needed globally (still O(N) each time if used per idx, but we can approximate incremental? We'll compute global probs for simplicity per backtest, then adjust)
    let globalProbs=null;
    if(strat==='markov'){
      globalProbs=this.markovTransition(draws,'all').probs;
    }
    let weightedCache=null;
    if(strat==='weighted'){
      weightedCache=this.weightedN1(draws,'all',0.95);
    }

    const hitsCnt=[0,0,0,0,0,0];
    const equity=[0];
    let net=0, peak=0, maxDD=0, loseStreak=0, maxLose=0, winStreak=0, maxWin=0;

    for(let i=warm;i<N;i++){
      // predict based on current freq/lastSeen (state before i)
      let pred=[];
      if(strat==='hot' || strat==='ecart' || strat==='mix'){
        const byF=[...Array(90).keys()].map(x=>x+1).sort((a,b)=>freq[b]-freq[a]||a-b);
        const ecart=lastSeen.map(v=> v===-1? i : v);
        const byE=[...Array(90).keys()].map(x=>x+1).sort((a,b)=>ecart[b]-ecart[a]||a-b);
        if(strat==='hot') pred=byF.slice(0,5);
        else if(strat==='ecart') pred=byE.slice(0,5);
        else {
          const s=[];
          byF.forEach(n=>{ if(s.length<3) s.push(n); });
          byE.forEach(n=>{ if(s.length<5 && !s.includes(n)) s.push(n); });
          pred=s.slice(0,5);
        }
      } else if(strat==='markov'){
        const lastWin=draws[i-1].win;
        const scores=new Array(91).fill(0);
        lastWin.forEach(n=>{ for(let j=1;j<=90;j++) scores[j]+=globalProbs[n][j]; });
        pred=[...Array(90).keys()].map(x=>x+1).sort((a,b)=>scores[b]-scores[a]||freq[b]-freq[a]).slice(0,5);
      } else if(strat==='weighted'){
        // use top from weighted but weighted is based on all history; for incremental we recompute quickly decay weighted up to i
        // Use precomputed but truncated? For speed, use freq as proxy plus decay reweight of last 30
        const scores=new Array(91).fill(0);
        for(let k=Math.max(0,i-60);k<i;k++){
          const age=i-1-k;
          const w=Math.pow(0.95,age);
          draws[k].win.forEach(n=> scores[n]+=w);
        }
        pred=[...Array(90).keys()].map(x=>x+1).sort((a,b)=>scores[b]-scores[a]||freq[b]-freq[a]).slice(0,5);
      } else { // sim
        const q=draws[i-1].win;
        const counts=new Array(91).fill(0);
        let found=0;
        for(let j=0;j<i-1;j++){
          let sc=0; q.forEach(n=>{ if(draws[j].win.includes(n)) sc++; });
          if(sc>=3){ found++; const nx=j+1; if(nx<i) draws[nx].win.forEach(n=> counts[n]++); }
        }
        if(!found){
          const byF=[...Array(90).keys()].map(x=>x+1).sort((a,b)=>freq[b]-freq[a]||a-b);
          pred=byF.slice(0,5);
        } else {
          pred=[...Array(90).keys()].map(x=>x+1).sort((a,b)=>counts[b]-counts[a]||freq[b]-freq[a]).slice(0,5);
        }
      }

      const actual=new Set(draws[i].win);
      const hits=pred.filter(n=>actual.has(n)).length;
      hitsCnt[hits]++;
      const gain=hits>=2? stake*mult[Math.min(hits,5)] : 0;
      net+=gain-stake;
      equity.push(net);
      if(gain>0){ loseStreak=0; winStreak++; } else { winStreak=0; loseStreak++; }
      maxLose=Math.max(maxLose,loseStreak);
      maxWin=Math.max(maxWin,winStreak);
      peak=Math.max(peak,net);
      maxDD=Math.min(maxDD, net-peak);

      // Update structures with draws[i] for next iteration
      draws[i].win.forEach(n=> freq[n]++);
      // update lastSeen: shift
      for(let n=1;n<=90;n++){ if(lastSeen[n]!==-1) lastSeen[n]++; }
      draws[i].win.forEach(n=> lastSeen[n]=0);
    }

    const total=N-warm, staked=total*stake;
    const hitRate=((total-hitsCnt[0]-hitsCnt[1])/total*100);
    return {hitRate, net, staked, maxDD, maxLose, maxWin, equity, hitsCnt, total};
  }
};
