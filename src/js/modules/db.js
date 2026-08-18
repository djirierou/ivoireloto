import { openDB } from 'idb';
import { CONFIG, REAL_DATA_FALLBACK } from './config.js';
import { validateDraw, validateImportArray } from './validator.js';

const DB_VERSION = 3; // bumped for schema

let dbPromise = null;

function getDB(){
  if(dbPromise) return dbPromise;
  const opening = openDB(CONFIG.DB_NAME, DB_VERSION, {
    upgrade(db){
      if(!db.objectStoreNames.contains(CONFIG.STORE_DRAWS)){
        const store = db.createObjectStore(CONFIG.STORE_DRAWS, {keyPath: 'id'});
        store.createIndex('date', 'date');
        store.createIndex('session', 'session');
        store.createIndex('date_session', ['date','session'], {unique:false});
      }
      if(!db.objectStoreNames.contains(CONFIG.STORE_LOGS)){
        db.createObjectStore(CONFIG.STORE_LOGS, {keyPath: 'id', autoIncrement:true});
      }
      if(!db.objectStoreNames.contains(CONFIG.STORE_CFG)){
        db.createObjectStore(CONFIG.STORE_CFG, {keyPath: 'key'});
      }
    }
  }).catch(err=>{
    console.warn('IndexedDB unavailable, fallback to localStorage', err);
    return null;
  });
  const timeout = new Promise(resolve=> setTimeout(()=> resolve(null), 1500));
  dbPromise = Promise.race([opening, timeout]).then(db=>{
    if(!db) console.warn('IndexedDB timeout — mode mémoire');
    return db;
  });
  return dbPromise;
}

function lsGet(key, def){
  try{
    const v=localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  }catch{ return def; }
}
function lsSet(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ console.warn('LS set failed', e); }
}

export const DataLayer = {
  useIDB: true,
  cache: { draws: [], logs: [], cfg: {hot:15,cold:15} },

  async init(){
    const db = await getDB();
    if(!db){
      this.useIDB=false;
      const draws = lsGet(CONFIG.LS_FALLBACK.draws, null);
      const logs = lsGet(CONFIG.LS_FALLBACK.logs, []);
      const cfg = lsGet(CONFIG.LS_FALLBACK.cfg, {hot:15,cold:15});
      if(draws && draws.length){
        this.cache.draws = draws;
        this.cache.logs = logs;
        this.cache.cfg = cfg;
      }
      return null;
    }

    const tx = db.transaction([CONFIG.STORE_DRAWS, CONFIG.STORE_LOGS, CONFIG.STORE_CFG], 'readonly');
    const draws = await tx.objectStore(CONFIG.STORE_DRAWS).getAll();
    let logs = [];
    let cfg = {hot:15,cold:15};
    try{
      logs = await db.getAll(CONFIG.STORE_LOGS);
      logs = logs.sort((a,b)=> b.ts - a.ts).slice(0,250);
      const cfgRec = await db.get(CONFIG.STORE_CFG, 'main');
      if(cfgRec) cfg = cfgRec.value;
    }catch{}
    this.cache.draws = draws.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.id-b.id);
    this.cache.logs = logs.map(l=> ({ts: new Date(l.ts).toLocaleString('fr-FR'), type:l.type, msg:l.msg})).slice(0,250);
    this.cache.cfg = cfg;

    if(!draws.length){
      const lsDraws = lsGet(CONFIG.LS_FALLBACK.draws, null);
      if(lsDraws && lsDraws.length){
        await this.bulkPutDraws(lsDraws);
        this.cache.draws = lsDraws;
      }
    }
    return db;
  },

  async bulkPutDraws(draws){
    const db = await getDB();
    if(!db || !this.useIDB){
      lsSet(CONFIG.LS_FALLBACK.draws, draws);
      this.cache.draws = draws;
      return;
    }
    const tx = db.transaction(CONFIG.STORE_DRAWS, 'readwrite');
    for(const d of draws) await tx.store.put(d);
    await tx.done;
    this.cache.draws = [...draws].sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.id-b.id);
  },

  async saveDraws(){
    const db = await getDB();
    if(!db || !this.useIDB){
      lsSet(CONFIG.LS_FALLBACK.draws, this.cache.draws);
      return;
    }
    const tx = db.transaction(CONFIG.STORE_DRAWS, 'readwrite');
    await tx.store.clear();
    for(const d of this.cache.draws) await tx.store.put(d);
    await tx.done;
  },

  async putDraw(draw){
    // validate before
    const v = validateDraw(draw);
    if(!v.ok) throw new Error(v.errors.join('; '));
    const sanitized = {...v.sanitized, id: draw.id || Date.now()+Math.random()};
    const db = await getDB();
    this.cache.draws.push(sanitized);
    this.cache.draws.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.id-b.id);
    if(!db || !this.useIDB){ lsSet(CONFIG.LS_FALLBACK.draws, this.cache.draws); return sanitized; }
    await db.put(CONFIG.STORE_DRAWS, sanitized);
    return sanitized;
  },

  async saveCfg(){
    const db = await getDB();
    if(!db || !this.useIDB){ lsSet(CONFIG.LS_FALLBACK.cfg, this.cache.cfg); return; }
    await db.put(CONFIG.STORE_CFG, {key:'main', value:this.cache.cfg});
  },

  async log(type, msg){
    // sanitize msg
    const safeMsg = String(msg).slice(0,500);
    const entry={ts: Date.now(), type, msg:safeMsg};
    this.cache.logs.unshift({ts: new Date(entry.ts).toLocaleString('fr-FR'), type, msg:safeMsg});
    if(this.cache.logs.length>250) this.cache.logs.length=250;
    const db = await getDB();
    if(!db || !this.useIDB){ lsSet(CONFIG.LS_FALLBACK.logs, this.cache.logs); return; }
    try{
      await db.add(CONFIG.STORE_LOGS, entry);
      const all=await db.getAll(CONFIG.STORE_LOGS);
      if(all.length>300){
        const toDelete = all.sort((a,b)=>a.ts-b.ts).slice(0, all.length-250);
        const tx=db.transaction(CONFIG.STORE_LOGS,'readwrite');
        for(const r of toDelete) await tx.store.delete(r.id);
        await tx.done;
      }
    }catch{}
  },

  async clearLogs(){
    this.cache.logs=[];
    const db=await getDB();
    if(!db || !this.useIDB){ lsSet(CONFIG.LS_FALLBACK.logs, []); return; }
    await db.clear(CONFIG.STORE_LOGS);
  },

  async clearDraws(){
    this.cache.draws=[];
    const db=await getDB();
    if(!db || !this.useIDB){ lsSet(CONFIG.LS_FALLBACK.draws, []); return; }
    await db.clear(CONFIG.STORE_DRAWS);
  },

  parseRealFallback(){
    const out=[]; let skipped=0;
    REAL_DATA_FALLBACK.forEach((r,i)=>{
      const [date,session,ws,ms]=r;
      const win=ws.split(' ').map(Number).filter(n=>!isNaN(n));
      const mach=ms?ms.split(' ').map(Number).filter(n=>!isNaN(n)):[];
      const cand={date, session, win, machine:mach};
      const v=validateDraw(cand);
      if(v.ok) out.push({id:i+1, ...v.sanitized}); else skipped++;
    });
    return {draws:out,skipped};
  },

  async loadRealDataJson(){
    try{
      const res = await fetch(CONFIG.DATA_URL, {cache:'no-cache'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const json = await res.json();
      const validation = validateImportArray(json);
      // add ids
      const draws = validation.valid.map((d,i)=> ({id: Date.now()+i+Math.random(), ...d}));
      return {draws, skipped: validation.invalid.length, errors: validation.invalid.slice(0,5)};
    }catch(e){
      console.warn('loadRealDataJson failed, fallback', e);
      return this.parseRealFallback();
    }
  },

  async importData(data, onProgress){
    // data can be raw array or already validated; we validate strictly
    const validation = validateImportArray(data);
    const toImport = validation.valid;
    const BATCH_SIZE=1000;
    let imported=0;
    const skippedInitial = validation.invalid.length;
    let skippedDup=0;
    const existing=new Set(this.cache.draws.map(d=> d.date+'|'+d.session));
    const newDraws=[];
    for(let i=0;i<toImport.length;i+=BATCH_SIZE){
      const batch=toImport.slice(i,i+BATCH_SIZE);
      for(const d of batch){
        const key=d.date+'|'+d.session;
        if(!existing.has(key)){
          newDraws.push({id: Date.now()+imported+Math.random(), ...d});
          existing.add(key);
          imported++;
        } else skippedDup++;
      }
      if(onProgress) onProgress(Math.round((i+batch.length)/toImport.length*100), imported, skippedInitial+skippedDup, validation.invalid);
      await new Promise(r=>setTimeout(r,0));
    }
    if(newDraws.length){
      this.cache.draws.push(...newDraws);
      this.cache.draws.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.id-b.id);
      await this.saveDraws();
    }
    if(imported) await this.log('succès', `Import : ${imported} tirages ajoutés, ${skippedInitial+skippedDup} rejetés/doublons`);
    return {imported, skipped: skippedInitial+skippedDup, invalid: validation.invalid};
  }
};
