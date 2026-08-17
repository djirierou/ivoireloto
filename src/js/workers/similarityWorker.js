// Worker for heavy similarity and backtest operations
self.onmessage = (e) => {
  const {type, payload} = e.data;
  if(type==='similarity'){
    const {draws, scope, queryNums, min, filters} = payload;
    const N=draws.length;
    const M=new Uint8Array(N*91);
    draws.forEach((d,i)=>{
      const vals = scope==='both' ? [...new Set([...d.win,...(d.machine||[])])] : (scope==='win'?d.win:d.machine||d.win);
      vals.forEach(n=>{ if(n) M[i*91+n]=1; });
    });
    const q=new Uint8Array(91);
    queryNums.forEach(n=> q[n]=1);
    const scores=new Array(N).fill(0);
    for(let i=0;i<N;i++){
      let s=0;
      for(let n=1;n<=90;n++) s+= M[i*91+n]*q[n];
      scores[i]=s;
    }
    // profiles if filters active
    const profiles = filters ? draws.map(d=>{
      const arr = scope==='both' ? [...new Set([...d.win,...(d.machine||[])])] : (scope==='win'?d.win:d.machine);
      const s = arr.reduce((a,b)=>a+b,0);
      const even= arr.filter(n=>n%2===0).length;
      const tens=new Array(9).fill(0); arr.forEach(n=>tens[Math.floor((n-1)/10)]++);
      const so=[...arr].sort((a,b)=>a-b); let gap=0; for(let i=1;i<so.length;i++) gap+=so[i]-so[i-1]; gap/=(so.length-1||1);
      return {s,even,tens,gap};
    }) : null;

    let qProfile=null;
    if(filters){
      const arr=queryNums;
      const s=arr.reduce((a,b)=>a+b,0);
      const even=arr.filter(n=>n%2===0).length;
      const tens=new Array(9).fill(0); arr.forEach(n=>tens[Math.floor((n-1)/10)]++);
      const so=[...arr].sort((a,b)=>a-b); let gap=0; for(let i=1;i<so.length;i++) gap+=so[i]-so[i-1]; gap/=(so.length-1||1);
      qProfile={s,even,tens,gap};
    }

    const res=[];
    for(let i=0;i<N;i++){
      if(min && scores[i]<min) continue;
      if(filters && profiles){
        const p=profiles[i];
        if(filters.sum && Math.abs(p.s-qProfile.s)>0.05*qProfile.s) continue;
        if(filters.parity && Math.abs(p.even-qProfile.even)>1) continue;
        if(filters.tens && p.tens.reduce((a,v,k)=>a+Math.abs(v-qProfile.tens[k]),0)>2) continue;
        if(filters.gap && Math.abs(p.gap-qProfile.gap)>0.1*qProfile.gap) continue;
      }
      res.push({i, s:scores[i]});
    }
    res.sort((a,b)=>b.s-a.s);
    self.postMessage({type:'similarityResult', payload: res});
  }
};
