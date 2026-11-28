'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const builder=require('./refresh-site-cards.cjs'),updates=require('./published-updates.js');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YdAAAAAASUVORK5CYII=','base64');
const digest=crypto.createHash('sha256').update(png).digest('hex'),plain=x=>JSON.parse(JSON.stringify(x));
const read=f=>fs.readFile(path.join(__dirname,f),'utf8');
function clock(){let id=0;const timers=new Map();return {timers,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};}
async function fixture(){
 const c=vm.createContext({window:{}});vm.runInContext(await read('data.js'),c);vm.runInContext(await read('chronicle-bundle.js'),c);
 const modern=plain(vm.runInContext('PLAKORO_BUNDLE',c)),chronicle=plain(c.window.CHRONICLE_DATA);
 for(const x of [...modern.characters,...modern.moves])x.imageSha=builder.blobHash(png);
 for(const x of updates.cards(chronicle)){x.image='drive:'+x.driveId;x.imageSha=x.driveId+':'+digest;}
 return {modern,chronicle};
}
async function appBoot(snapshot,saved){
 const timer=clock(),events=new EventTarget(),document=new EventTarget(),stage={style:{},innerHTML:'',addEventListener(){}},announcement={textContent:''};
 document.getElementById=id=>({stage,announcement})[id]||null;document.documentElement={};document.hidden=false;
 const c=vm.createContext({console,Event,AbortController,...timer,document,innerWidth:960,innerHeight:540,matchMedia:()=>({matches:false}),
  addEventListener:events.addEventListener.bind(events),getComputedStyle:()=>({getPropertyValue:()=>0}),
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  fetch:async url=>{assert(url.startsWith('published-catalogue.json?check='));return {ok:true,json:async()=>plain(snapshot)};},
 });c.window=c;
 for(const f of ['data.js','plakorodb-source.js','domain.js','engine.js','league.js','chronicle-source.js','published-updates.js'])vm.runInContext(await read(f),c,{filename:f});
 c.ChronicleSync={cards:updates.cards,maybeApply(){},start(){if(snapshot)throw Error('A visitor must not scan Drive');}};
 c.PlakoroUpdates={create:()=>({catalog:vm.runInContext('PLAKORO_BUNDLE',c),asset(){},maybeApply(){},start(){}})};
 c.PUBLISHED_CARDS=snapshot;
 vm.runInContext(await read('app.js'),c,{filename:'app.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {run:s=>vm.runInContext(s,c),stage};
}
async function main(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'plakoro-publish-'));
 try{
  const input=await fixture(),output=path.join(temp,'site');await fs.mkdir(output);const index=await read('index.html');await fs.writeFile(path.join(output,'index.html'),index);
  for(const [,file]of index.matchAll(/(?:src|href)="([A-Za-z0-9-]+\.(?:js|css))(?:\?[^" ]*)?"/g))await fs.writeFile(path.join(output,file),await read(file));
  const snapshot=await builder.build({...plain(input),output,cache:path.join(temp,'cache'),reportPath:path.join(temp,'report.json'),get:async(url,kind)=>{assert.equal(kind,'bytes');return png;}});
  assert.equal(snapshot.modern.characters.length,23);assert.equal(snapshot.chronicle.pokemon.length,15);
  assert(!JSON.stringify(snapshot).includes('drive:'));assert(!JSON.stringify(snapshot).includes('data:image'));
  for(const file of new Set(Object.values(snapshot.assets)))assert.deepEqual(await fs.readFile(path.join(output,file)),png);
  assert((await fs.readFile(path.join(output,'index.html'),'utf8')).includes('published-catalogue.js?v='));
  // Never accept corrupt artwork or incomplete uploads as a publication.
  assert.throws(()=>builder.verifyPNG(Buffer.from('not png'),digest));assert.throws(()=>builder.verifyPNG(png,'0'.repeat(64)));
  await assert.rejects(builder.chronicleCatalogue(async()=>({...plain(input.chronicle),complete:false})));
  let calls=0;const recovered=await builder.chronicleCatalogue(async()=>++calls===1?{source:input.chronicle.source,status:'scanning',phase:'cards',cards:2}:plain(input.chronicle),async()=>{});assert.equal(recovered.revision,input.chronicle.revision);
  const corrupt=plain(snapshot);delete corrupt.assets[corrupt.modern.characters[0].image];assert.throws(()=>updates.validate(corrupt));
  // Initial, resumed and long-running visitors only fetch the published file.
  const timer=clock(),events=new EventTarget(),doc=new EventTarget();doc.hidden=false;
  let incoming=plain(snapshot),allowed=false,applied=0,requests=0,offline=false;
  const updater=updates.create({bundle:snapshot,apply:()=>applied++,canApply:()=>allowed,events,doc,setTimer:timer.setTimeout,clearTimer:timer.clearTimeout,fetcher:async(url,opts)=>{requests++;assert(url.startsWith('published-catalogue.json?check='));assert.equal(opts.cache,'no-store');if(offline)throw Error('Offline');return {ok:true,json:async()=>plain(incoming)};}});
  await updater.check(true);assert.equal(applied,0);updater.start();assert([...timer.timers.values()].some(t=>t.ms===updates.INTERVAL));
  incoming.revision='1'.repeat(64);incoming.publishedAt=new Date(Date.parse(snapshot.publishedAt)+1000).toISOString();await updater.check();assert(updater.pending);assert.equal(updater.snapshot.revision,snapshot.revision);
  incoming=plain(snapshot);await updater.check();assert(updater.pending,'a delayed older response must not discard a pending update');
  allowed=true;assert(updater.maybeApply());assert.equal(applied,1);assert.equal(updater.snapshot.revision,'1'.repeat(64));
  incoming=corrupt;await updater.check();assert.equal(updater.snapshot.revision,'1'.repeat(64));offline=true;await updater.check();assert.equal(updater.snapshot.revision,'1'.repeat(64));
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timer.timers.size,0);const before=requests;doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setImmediate(r));assert(requests>before);
  // Installing a fresh catalogue before loading saved builds must not erase
  // localStorage, conflate editions, or start either old per-visitor updater.
  const saved=new Map(),old=await appBoot(null,saved);
  old.run("chronicleMode=true;players[0]={pokemon:'Eevee',moves:movesForPokemon('Eevee').filter(m=>!m.action).slice(0,4),evolutionLoadouts:[]};saveBuilds()");
  const oldCodes=old.run('JSON.stringify(players[0].moves.map(m=>m.code))');
  const fresh=await appBoot(snapshot,saved);
  assert.equal(fresh.run('players[0].pokemon'),'Eevee');assert.equal(fresh.run('JSON.stringify(players[0].moves.map(m=>m.code))'),oldCodes);
  assert(fresh.run("allChronicleNames().includes('Pikachu')&&allChronicleNames().includes('Pikachu (1997)')"));assert.equal(fresh.run('appReady'),true);
  assert.equal(fresh.run("asset(DATA.pokemon.Eevee.pokemon.image)"),'published-cards/'+digest+'.png');
  console.log('PASS: complete website publication, verified PNGs, first-visit freshness, deferred updates, stale/offline fallback, saved loadouts and edition separation.');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
