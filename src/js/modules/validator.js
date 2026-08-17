/**
 * Validation stricte des tirages - sécurité & robustesse
 * Empêche XSS et données malformées
 */
const SESSION_SAFE_REGEX = /^[a-zA-Z0-9À-ÿ \-_:()\/]{1,60}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeSession(session){
  if(typeof session !== 'string') return null;
  const trimmed = session.trim().slice(0,60);
  if(!SESSION_SAFE_REGEX.test(trimmed)) return null;
  // Reject if contains HTML tags
  if(/<[^>]*>/g.test(trimmed)) return null;
  return trimmed;
}

export function validateDate(date){
  if(typeof date !== 'string') return false;
  if(!DATE_REGEX.test(date)) return false;
  const d = new Date(date+'T12:00:00');
  if(isNaN(d.getTime())) return false;
  // future check
  const today = new Date();
  today.setHours(23,59,59,999);
  if(d > today) return false;
  // min date 2012-07-17 (LONACI start)
  const min = new Date('2012-07-17T00:00:00');
  if(d < min) return false;
  return true;
}

export function validateNumbers(arr, label='win'){
  if(!Array.isArray(arr)) return {ok:false, reason:`${label} doit être tableau`};
  if(arr.length!==5 && arr.length!==0) return {ok:false, reason:`${label} doit avoir 5 numéros ou vide`};
  if(arr.length===0) return {ok:true};
  for(const n of arr){
    if(!Number.isInteger(n) || n<1 || n>90) return {ok:false, reason:`${label} numéro ${n} hors borne 1-90`};
  }
  if(new Set(arr).size!==5) return {ok:false, reason:`${label} doublon détecté`};
  return {ok:true};
}

export function validateDraw(obj){
  // obj: {date, session, win, machine}
  const errors=[];
  if(!obj || typeof obj !== 'object') return {ok:false, errors:['Objet invalide']};
  if(!validateDate(obj.date)) errors.push('Date invalide ou future (format YYYY-MM-DD, >=2012-07-17)');
  const sess = sanitizeSession(obj.session);
  if(!sess) errors.push('Session invalide (caractères autorisés alphanum + -_:/() )');
  const vWin = validateNumbers(obj.win, 'Win');
  if(!vWin.ok) errors.push(vWin.reason);
  const mach = obj.machine || [];
  const vMach = validateNumbers(mach, 'Machine');
  if(!vMach.ok) errors.push(vMach.reason);
  // Additional: win & machine should not share numbers? LONACI can? Allow but warn if overlap
  // No overlap check required per LONACI rules they are independent
  if(errors.length) return {ok:false, errors, sanitized:null};
  return {
    ok:true,
    errors:[],
    sanitized:{
      date: obj.date,
      session: sess,
      win: [...obj.win].sort((a,b)=>a-b),
      machine: mach.length? [...mach].sort((a,b)=>a-b) : []
    }
  };
}

export function validateImportArray(arr){
  const result={valid:[], invalid:[], errors:[]};
  if(!Array.isArray(arr)){
    result.errors.push('JSON racine doit être tableau');
    return result;
  }
  for(let i=0;i<arr.length;i++){
    const raw=arr[i];
    // Support both old format: [date, session, "numbers", "numbers"] and new [{date, session, win, machine}]
    let candidate=null;
    if(Array.isArray(raw)){
      // legacy REAL_DATA tuple
      if(raw.length>=3){
        const [date, session, ws, ms] = raw;
        const win = typeof ws === 'string' ? ws.split(/[ ,]+/).map(Number).filter(Boolean) : ws;
        const machine = typeof ms === 'string' ? ms.split(/[ ,]+/).map(Number).filter(Boolean) : (ms||[]);
        candidate={date, session, win, machine};
      }
    } else {
      candidate=raw;
    }
    if(!candidate){ result.invalid.push({index:i, raw, errors:['Format inconnu']}); continue; }
    const v=validateDraw(candidate);
    if(v.ok) result.valid.push(v.sanitized);
    else result.invalid.push({index:i, raw:candidate, errors:v.errors});
  }
  return result;
}
