/* Public PlakoroDB sync. Download and validate first; commit one complete snapshot. */
(function(root){
 'use strict';
 const INTERVAL=30*60*1000;
 function memoryStore(){const images=new Map();let snapshot=null;return {persistent:false,read:async()=>snapshot,image:async sha=>images.get(sha),commit:async(s,items)=>{for(const [k,v] of items)images.set(k,v);snapshot=s}};}
 async function openStore(){
  if(!root.indexedDB)return memoryStore();
  try{
   const db=await new Promise((ok,no)=>{const r=root.indexedDB.open('plakoro-card-updates-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('images')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(Error('Storage busy'));});
   function get(store,key){return new Promise((ok,no)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
   return {persistent:true,read:()=>get('state','current'),image:sha=>get('images',sha),commit:(s,items)=>new Promise((ok,no)=>{const tx=db.transaction(['state','images'],'readwrite');for(const [k,v] of items)tx.objectStore('images').put(v,k);tx.objectStore('state').put(s,'current');tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error||Error('Storage write interrupted'));})};
  }catch{return memoryStore()}
 }
 function create(options){
  const source=options.source||root.PlakoroSource,fetcher=options.fetch||root.fetch.bind(root),now=options.now||Date.now;
  let store=options.store,active=options.bundle,pending=null,snapshot=null,busy=null,ready=false,loading=null;
  let activeImages=new Map(source.assets(active).map(a=>[a.key,a.sha]));
  const bundled=new Map(source.assets(options.bundle).map(a=>[a.key,a])),urls=new Map();
  const state={checking:false,message:'Checking for card updates…',lastChecked:null,lastUpdated:options.bundle.syncedAt,persistent:true,pending:false,counts:{pokemon:active.characters.length,moves:active.moves.length}};
  function emit(){options.onStatus?.({...state})}
  async function request(url,kind='json'){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
   try{const r=await fetcher(url,{signal:controller.signal,cache:'no-store',credentials:'omit'});if(!r.ok)throw Error(r.status===403||r.status===429?'GitHub is limiting update checks. Try again later.':'Card download unavailable ('+r.status+').');return await r[kind]();}finally{clearTimeout(timer)}
  }
  async function preload(c){
   const map=snapshot?.imageIndex||{};
   for(const a of source.assets(c)){
    if(bundled.get(a.key)?.sha===a.sha)continue;
    const blob=await store.image(a.sha);if(!blob)throw Error('Saved card image is missing');
    if(!urls.has(a.sha))urls.set(a.sha,options.objectURL?options.objectURL(blob):URL.createObjectURL(blob));
    map[a.key]=a.sha;
   }
   return map;
  }
  function maybeApply(){
   if(!pending||!options.canApply())return false;
   active=pending;activeImages=new Map(source.assets(active).map(a=>[a.key,a.sha]));pending=null;state.pending=false;state.lastUpdated=active.syncedAt;state.counts={pokemon:active.characters.length,moves:active.moves.length};
   options.apply(active);state.message=store.persistent?'PlakoroDB cards are up to date.':'Cards updated for this session; this browser could not save them offline.';emit();return true;
  }
  function load(){
   if(loading)return loading;
   loading=(async()=>{
   store=store||await openStore();state.persistent=store.persistent;
   try{snapshot=await store.read();if(snapshot?.catalog){source.validate(snapshot.catalog);if(snapshot.catalog.syncedAt>options.bundle.syncedAt&&snapshot.catalog.sha!==options.bundle.sha){await preload(snapshot.catalog);pending=snapshot.catalog;state.pending=true;maybeApply()}state.lastChecked=snapshot.lastChecked||null;}}
   catch{snapshot=null;state.message='Using the included cards. Saved updates could not be loaded.'}
   ready=true;emit();return api;
   })();return loading;
  }
  function asset(path){const sha=activeImages.get(path);return sha&&urls.get(sha)||null;}
  async function check(){
   if(busy)return busy;
   busy=(async()=>{
    if(!ready)await load();state.checking=true;state.message='Checking PlakoroDB…';emit();
    try{
     const commit=await request('https://api.github.com/repos/'+source.REPO+'/commits/main');
     if(!/^[a-f0-9]{40}$/.test(commit.sha))throw Error('Invalid repository version');
     const current=pending||active;
     if(commit.sha===current.sha){
      const next={...(snapshot||{}),catalog:current,lastChecked:now()};await store.commit(next,[]);snapshot=next;state.lastChecked=next.lastChecked;
      state.message=pending?'Update downloaded. It will apply after your battle or loadout is closed.':'PlakoroDB cards are up to date.';return;
     }
     const tree=await request('https://api.github.com/repos/'+source.REPO+'/git/trees/'+commit.sha+'?recursive=1');tree.sha=commit.sha;
     const paths=source.textPaths(tree),texts={};
     for(let i=0;i<paths.length;i+=4)await Promise.all(paths.slice(i,i+4).map(async p=>texts[p]=await request(source.RAW+commit.sha+'/'+p,'text')));
     const catalog=source.parse(tree,texts);catalog.syncedAt=now();
     const assets=source.assets(catalog),downloads=[];let completed=0;
     state.message='Downloading updated cards…';emit();
     for(let i=0;i<assets.length;i+=4){
      await Promise.all(assets.slice(i,i+4).map(async a=>{
       if(bundled.get(a.key)?.sha===a.sha||await store.image(a.sha))return;
       const blob=await request(a.url,'blob');if(blob.size<100||blob.size>15*1024*1024)throw Error('Incomplete card image');
       const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());if(signature.join(',')!=='137,80,78,71,13,10,26,10')throw Error('Invalid card image');
       if(root.crypto?.subtle){const bytes=new Uint8Array(await blob.arrayBuffer()),header=new TextEncoder().encode('blob '+bytes.length+'\0'),all=new Uint8Array(header.length+bytes.length);all.set(header);all.set(bytes,header.length);const hash=[...new Uint8Array(await root.crypto.subtle.digest('SHA-1',all))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==a.sha)throw Error('Card image verification failed');}
       downloads.push([a.sha,blob]);
      }));completed=Math.min(i+4,assets.length);state.message=`Downloading cards · ${completed}/${assets.length}`;emit();
     }
     const next={catalog,lastChecked:now(),imageIndex:{...(snapshot?.imageIndex||{})}};
     for(const a of assets)if(bundled.get(a.key)?.sha!==a.sha)next.imageIndex[a.key]=a.sha;else delete next.imageIndex[a.key];
     await store.commit(next,downloads);snapshot=next;await preload(catalog);pending=catalog;state.pending=true;state.lastChecked=next.lastChecked;
     if(!maybeApply())state.message='Update downloaded. It will apply after your battle or loadout is closed.';
    }catch(e){state.message=(root.navigator?.onLine===false?'Offline.':e.name==='AbortError'?'Update check timed out.':e.message||'Update check unavailable.')+' Your saved cards are still available.';}
    finally{state.checking=false;busy=null;emit()}
   })();return busy;
  }
  const api={state,load,check,maybeApply,asset,get catalog(){return active},get pending(){return pending}};return api;
 }
 const api={INTERVAL,create,openStore,memoryStore};root.PlakoroUpdates=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
