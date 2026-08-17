export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

export const TODAY = new Date();
export const iso = d => d.toISOString().slice(0,10);
export const fmtDate = s => {
  try {
    return new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
  } catch { return s; }
};
export const sum = a => a.reduce((x,y)=>x+y,0);
export const map90 = v => ((v-1)%90+90)%90+1;

export function escapeHTML(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function C(n,k){
  if(k<0||k>n) return 0;
  if(k>n-k) k=n-k;
  let r=1;
  for(let i=0;i<k;i++) r = r * (n - i) / (i + 1);
  return Math.round(r);
}

export function* combsIter(arr,k){
  const n=arr.length;
  if(k>n || k<=0) return;
  const indices = Array.from({length:k},(_,i)=>i);
  while(true){
    yield indices.map(i=>arr[i]);
    let i=k-1;
    while(i>=0 && indices[i]===n-k+i) i--;
    if(i<0) break;
    indices[i]++;
    for(let j=i+1;j<k;j++) indices[j]=indices[j-1]+1;
  }
}

export function combs(arr,k){
  if(k>arr.length) return [];
  if(C(arr.length,k) > 50000) {
    console.warn('combs: too many combinations, use iterator');
    return Array.from(combsIter(arr,k)).slice(0,50000);
  }
  const res=[];
  const rec=(st,cur)=>{
    if(cur.length===k){ res.push([...cur]); return; }
    for(let i=st;i<=arr.length-(k-cur.length);i++){
      cur.push(arr[i]); rec(i+1,cur); cur.pop();
    }
  };
  rec(0,[]);
  return res;
}

export function debounce(fn,wait=200){
  let t;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),wait); };
}

export function parseCSVLine(line, delim=','){
  // Handle quoted fields
  const res=[];
  let cur='', inQuote=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(inQuote && line[i+1]==='"'){ cur+='"'; i++; }
      else inQuote=!inQuote;
    } else if(c===delim && !inQuote){
      res.push(cur.trim()); cur='';
    } else cur+=c;
  }
  res.push(cur.trim());
  return res;
}

/**
 * Détecte le séparateur réel du CSV (`,` ou `;`).
 * /!\ Avant: le parser était câblé sur la virgule et le rattrapage `;` ne
 * se déclenchait jamais (il testait values.length===1 après un push de 1 champ
 * puis exigeait >=7 colonnes) — or l'app EXPORTE en `;`: un ré-import de son
 * propre export renvoyait 0 tirage.
 */
/**
 * Normalise une date CSV vers YYYY-MM-DD.
 * Accepte YYYY-MM-DD, DD/MM/YYYY et DD-MM-YYYY (formats produits par Excel FR).
 */
export function normalizeDate(v){
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    const [,d,mo,y]=m;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return s;
}

export function detectDelimiter(headerLine){
  const c=(headerLine.match(/,/g)||[]).length;
  const s=(headerLine.match(/;/g)||[]).length;
  return s>c ? ';' : ',';
}

export function parseCSV(text){
  // retire un éventuel BOM UTF-8 (Excel) qui casserait la détection d'en-tête
  const lines=text.replace(/^\ufeff/,'').split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length) return [];
  const delim=detectDelimiter(lines[0]);
  const header=parseCSVLine(lines[0], delim).map(h=>h.toLowerCase());
  const hasHeader=header[0].includes('date');
  const start=hasHeader?1:0;
  const draws=[];
  for(let i=start;i<lines.length;i++){
    const values=parseCSVLine(lines[i], delim);

    // Format « groupé » produit par l'export historique de l'app :
    // Date;Session;"1 2 3 4 5";"6 7 8 9 10";Somme
    if(values.length>=3 && /\d+[\s\-]+\d+/.test(values[2])){
      const g=s=>String(s||'').split(/[\s\-]+/).map(n=>parseInt(n,10)).filter(n=>!isNaN(n)&&n>=1&&n<=90);
      const win=g(values[2]);
      const machine=g(values[3]);
      if(win.length===5 && new Set(win).size===5){
        draws.push({date:normalizeDate(values[0]), session:values[1], win, machine:machine.length===5?machine:[]});
      }
      continue;
    }

    if(values.length<7) continue;
    const date=normalizeDate(values[0]);
    const session=values[1];
    const win=[2,3,4,5,6].map(idx=>parseInt(values[idx],10)).filter(n=>!isNaN(n));
    let machine=[];
    if(values.length>=12){
      machine=[7,8,9,10,11].map(idx=>parseInt(values[idx],10)).filter(n=>!isNaN(n) && n>=1 && n<=90);
      if(machine.length!==5) machine=[];
    }
    if(win.length===5 && win.every(n=>n>=1&&n<=90) && new Set(win).size===5){
      draws.push({date, session, win, machine});
    }
  }
  return draws;
}

export function parsePasteText(text){
  // Expected format from lotobonheur.ci copied
  // Try to extract dates like 01/08/2025 or 2025-08-01 and 5 numbers
  const draws=[];
  // Normalize
  const lines=text.split(/\n/).map(l=>l.trim()).filter(Boolean);
  let currentDate=null;
  let currentSession=null;

  const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}-\d{2}-\d{2})/;
  const sessionRegex = /(Special Weekend|Digital Reveil|Digital \d+h|Soutra|Diamant|Moaye|Afterwork|National|Benediction|Prestige|Awale|Espoir|Midi|Soir|Special)/i;
  const numbersRegex = /(\b\d{1,2}\b[\s\-]+){4,}\b\d{1,2}\b/g;

  for(const line of lines){
    const dMatch=line.match(dateRegex);
    if(dMatch){
      let d=dMatch[0];
      // convert dd/mm/yyyy to yyyy-mm-dd
      if(d.includes('/')){
        const [day,month,year]=d.split('/').map(Number);
        if(day&&month&&year){
          const yy=year<100?2000+year:year;
          currentDate=`${yy}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }
      } else if(d.match(/\d{2}-\d{2}-\d{4}/)){
        // dd-mm-yyyy
        const [day,month,year]=d.split('-').map(Number);
        currentDate=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      } else currentDate=d;
      const sMatch=line.match(sessionRegex);
      if(sMatch) currentSession=sMatch[0];
      continue;
    }
    const sMatch=line.match(sessionRegex);
    if(sMatch) currentSession=sMatch[0];

    // extract numbers groups
    const nums=(line.match(/\b\d{1,2}\b/g)||[]).map(Number).filter(n=>n>=1&&n<=90);
    if(nums.length>=5){
      // first 5 are win, next 5 machine if available
      const win=nums.slice(0,5);
      const machine=nums.length>=10 ? nums.slice(5,10) : [];
      if(currentDate && currentSession && new Set(win).size===5){
        draws.push({date:currentDate, session:currentSession, win, machine});
        currentSession=null; // reset to avoid duplication
      } else if(nums.length===5 && new Set(nums).size===5){
        // heuristic: if no context, use today and fallback session
        draws.push({date: iso(new Date()), session: 'Import', win:nums, machine:[]});
      }
    }
  }
  return draws;
}

export function toast(msg, type='success'){
  const container=document.getElementById('toasts');
  if(!container) return;
  const t=document.createElement('div');
  t.className='toast '+type;
  t.innerHTML=(type==='success'?'✅ ':type==='error'?'⛔ ':'ℹ️ ')+escapeHTML(msg);
  container.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{
    t.classList.remove('show');
    setTimeout(()=>t.remove(),320);
  }, type==='error'?5000:3400);
}

export function downloadCSV(name, rows){
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob=new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

export function ball(n, cls='win', hit=false){
  return `<span class="ball ${cls}${hit?' hit':''}">${escapeHTML(n)}</span>`;
}

// LRU cache
export class LRUCache{
  constructor(limit=100){
    this.limit=limit; this.map=new Map();
  }
  get(k){ if(!this.map.has(k)) return undefined; const v=this.map.get(k); this.map.delete(k); this.map.set(k,v); return v; }
  set(k,v){ if(this.map.has(k)) this.map.delete(k); else if(this.map.size>=this.limit){ const first=this.map.keys().next().value; this.map.delete(first); } this.map.set(k,v); }
  has(k){ return this.map.has(k); }
  clear(){ this.map.clear(); }
  delete(k){ this.map.delete(k); }
}
