/* Shared website snapshots: visitors read one completed publication, never scan Drive. */
(function(root){
 'use strict';
 const INTERVAL=5*60*1000;
 const cards=d=>[...d.pokemon.flatMap(p=>[p,...Object.values(p.editions||{}),...(p.moves||[])]),...d.moves,...[d.rules?.basic,d.rules?.howTo,d.rules?.switch].filter(Boolean)];
 function validate(c){
  if(c?.schema!==1||!/^[a-f0-9]{64}$/.test(c.revision)||!Number.isFinite(Date.parse(c.publishedAt))||!c.assets)throw Error('Invalid published catalogue');
  root.PlakoroSource.validate(c.modern);
  if(c.chronicle?.complete===false||c.chronicle?.source!==root.ChronicleBattle.SOURCE)throw Error('Incomplete Chronicle publication');
  root.ChronicleBattle.catalogue(c.chronicle,c.modern.characters.map(p=>p.name));
  const path=p=>typeof p==='string'&&/^published-cards\/[a-f0-9]{64}\.png$/.test(p);
  for(const a of root.PlakoroSource.assets(c.modern))if(!path(c.assets[a.key]))throw Error('Missing published modern image');
  for(const card of cards(c.chronicle)){
   if(!path(card.image))throw Error('Missing published Chronicle image');
   if(/^(?:OG[CW]|OCW)\d+(?:-\d+)+$/.test(card.code||card.id||'')&&c.assets[root.ChronicleBattle.imagePath(card)]!==card.image)throw Error('Mismatched published Chronicle image');
  }
  return c;
 }
 function create({bundle,apply,canApply=()=>true,onStatus=()=>{},fetcher=root.fetch?.bind(root),events=root,doc=root.document,setTimer=root.setTimeout,clearTimer=root.clearTimeout}){
  let current=validate(bundle),pending=null,busy=false,started=false,timer=null,lastOpen=-Infinity;
  const state={checking:false,lastChecked:null,message:'Using the latest published cards.'};
  const say=message=>{state.message=message;state.checking=busy;onStatus(state)};
  function maybeApply(){
   if(!pending||!canApply())return false;
   const next=pending;pending=null;current=next;apply(next);state.message='Cards updated to the latest website publication.';return true;
  }
  function schedule(ms=INTERVAL){clearTimer(timer);if(started&&!doc?.hidden)timer=setTimer(()=>check(),ms);}
  async function check(initial=false){
   if(busy)return current;
   busy=true;say('Checking the website’s published cards…');
   const controller=new AbortController(),timeout=setTimer(()=>controller.abort(),10000);
   try{
    const response=await fetcher('published-catalogue.json?check='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw Error('HTTP '+response.status);
    const next=validate(await response.json());state.lastChecked=Date.now();
    // A delayed CDN response must never replace a newer publication.
    if(Date.parse(next.publishedAt)>=Date.parse((pending||current).publishedAt)){
     if(initial){current=next;pending=null;}
     else if(next.revision!==current.revision){pending=next;maybeApply();}
     else {current=next;pending=null;}
    }
    say(pending?'New cards are ready. They will apply after your battle or loadout is closed.':'Cards are up to date with the website’s latest publication.');
   }catch(error){say('The update check is unavailable. Your current cards are still ready to play.');}
   finally{clearTimer(timeout);busy=false;state.checking=false;onStatus(state);schedule();}
   return current;
  }
  function opened(){if(doc?.hidden||Date.now()-lastOpen<1000)return;lastOpen=Date.now();return check();}
  function start(){if(started)return;started=true;events?.addEventListener('online',opened);events?.addEventListener('pageshow',opened);events?.addEventListener('plakoro-app-open',opened);doc?.addEventListener('visibilitychange',()=>doc.hidden?clearTimer(timer):opened());schedule();}
  return {state,get catalog(){return current.modern},get snapshot(){return current},get pending(){return pending},asset:path=>current.assets[path],check,start,maybeApply};
 }
 const api={INTERVAL,cards,validate,create};root.PublishedUpdates=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
