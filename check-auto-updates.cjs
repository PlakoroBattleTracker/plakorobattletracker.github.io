/* No network: exercise real converters, update transactions and lifecycle hooks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {create,memoryStore,INTERVAL}=require('./card-updates.js');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YdAAAAAASUVORK5CYII=','base64');
function timers(){let id=0;const pending=new Map();return {pending,setTimeout:(fn,ms)=>{pending.set(++id,{fn,ms});return id;},clearTimeout:id=>pending.delete(id)};}
function boot(){
 const events=new EventTarget(),document=new EventTarget(),clock=timers(),records=new Map(),images=new Map(),saved=new Map();
 document.getElementById=()=>null;document.hidden=false;
 const context=vm.createContext({console,URL,Response,AbortController,Event,TextEncoder,Uint8Array,crypto:crypto.webcrypto,navigator:{onLine:true},document,...clock,
  addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),matchMedia:()=>({matches:false}),
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  btoa:s=>Buffer.from(s,'binary').toString('base64'),render(){},renderBuilder(){},renderBattle(){},showImpact(){},
 });context.window=context;
 context.CardCache={create:()=>({record:async(store,key,value)=>value===undefined?records.get(key):value===null?records.delete(key):records.set(key,plain(value)),image:async(key,value)=>value===undefined?images.get(key):images.set(key,value),load:async transform=>records.has('current')?transform(plain(records.get('current'))):null,save:async value=>records.set('current',plain(value)),prune:async()=>{}})};
 for(const f of ['data.js','plakorodb-source.js','domain.js','engine.js','league.js','chronicle-config.js','chronicle-bundle.js','chronicle-og.js','chronicle-source.js','chronicle-sync.js'])vm.runInContext(read(f),context,{filename:f});
 const app=read('app.js');vm.runInContext("let ui={modal:null},chronicleImages=new Map();"+app.slice(app.indexOf('function applyModernCatalog('),app.indexOf('function renderUpdateStatus(')),context);
 return {context,document,events,clock,records,images,saved,run:source=>vm.runInContext(source,context)};
}
async function chronicle(){
 const b=boot(),{context:c,run}=b;
 const original=plain(run('CHRONICLE_DB')),converted=plain(run('ChronicleBattle.catalogue(CHRONICLE_DATA,DATA.order)'));
 const strip=o=>{o=plain(o);for(const k of ['sourceUrl','sourcePath','imageSha'])delete o[k];return o;};
 for(const m of Object.values(original.movePools).flat())assert.deepEqual(strip(Object.values(converted.movePools).flat().find(x=>x.code===m.code)),strip(m),m.code);
 for(const [name,block]of Object.entries(original.pokemon))assert.deepEqual(strip(converted.pokemon[name].pokemon),strip(block.pokemon),name);
 const feed=plain(c.CHRONICLE_DATA);feed.revision='new-original-cards';feed.checkedAt='2026-11-24T00:00:00Z';
 const sha=crypto.createHash('sha256').update(png).digest('hex');
 for(const card of c.ChronicleSync.cards(feed)){card.image='drive:'+card.driveId;card.imageSha=card.driveId+':'+sha;}
 // A changed move and character must hydrate selected cards without storing
 // downloaded image bytes in localStorage or conflating the two editions.
 const changed=c.ChronicleSync.cards(feed).find(m=>m.code==='OGW06-001');changed.battle.fields.damage='7';
 run("chronicleMode=true;players[0]={pokemon:'Squirtle (1997)',moves:[ALL_MOVES.find(m=>m.code==='OGW06-001')],evolutionLoadouts:[]};ui.modal='moves'");
 let requests=0,broken=true;
 c.fetch=async url=>{const u=new URL(url);if(u.searchParams.get('action')==='sync')return Response.json(feed);requests++;return new Response(broken&&requests===2?'invalid image':png,{headers:{'content-type':'image/png'}});};
 await c.ChronicleSync.check(true);
 assert.match(c.ChronicleSync.status,/not a PNG/);assert.equal(run('CHRONICLE_DB.checked'),original.checked);assert(!b.records.has('current'),'partial snapshots never replace offline cards');
 assert.equal(b.images.size,1,'completed images survive an interrupted download');
 broken=false;requests=0;await c.ChronicleSync.check(true);
 assert(c.ChronicleSync.pending);assert(b.records.has('current'));assert.match(c.ChronicleSync.status,/loadout is closed/);
 assert.notEqual(run("players[0].moves[0].damage"),7);
 assert.equal(requests,199,'the completed image is reused when downloads resume');
 run('ui.modal=null');assert(c.ChronicleSync.maybeApply());
 assert.equal(run('players[0].moves[0].damage'),7);assert.equal(run('players[0].pokemon'),'Squirtle (1997)');
 assert.equal(run('allChronicleNames().length'),38);
 for(const name of ['Pikachu','Bulbasaur','Squirtle']){
  assert.equal(run(`pokemonLabel('${name}')`),name+' (2026)');
  assert(run(`allChronicleNames().includes('${name} (1997)')`));
  assert.match(run(`getPokemonBlock('${name}').pokemon.code`),/^STC/);
 }
 assert(![...b.saved.values()].some(value=>value.includes('data:image/')),'loadouts store stable image paths');
 assert.equal(run('chronicleImages.size'),200);
 const downloaded=await c.ChronicleSync.cache();assert(c.ChronicleSync.cards(downloaded).every(card=>card.image.startsWith('data:image/png;')));
 // A battle blocks both update sources even when its menu is open.
 run("battle={phase:'turn'};ui.modal='menu'");assert.equal(run('canApplyCardUpdates()'),false);
 run("battle=null;ui.modal=null");
 const newer=plain(feed);newer.revision='next-original-cards';
 c.fetch=async url=>new URL(url).searchParams.get('action')==='sync'?Response.json(newer):Promise.reject(Error('unchanged image redownloaded'));
 await c.ChronicleSync.check(true);assert.equal(c.CHRONICLE_DATA.revision,newer.revision);
 const foreign={...feed,source:'https://example.com/other-folder'};assert.throws(()=>c.ChronicleSync.validate(foreign),/different folder/);
 const partial={...feed,complete:false};assert.throws(()=>c.ChronicleSync.validate(partial),/incomplete/);
 const re=plain(feed);re.moves.push({...changed,id:'REW06-001',code:'REW06-001',edition:'RE'});assert(!c.ChronicleSync.cards(c.ChronicleSync.validate(re)).some(card=>card.edition==='RE'));
 // A corrupt revision cannot replace even one image in the saved snapshot.
 const corrupt=plain(feed);corrupt.revision='bad-revision';for(const card of c.ChronicleSync.cards(corrupt))card.imageSha=card.driveId+':'+('0'.repeat(64));
 c.fetch=async url=>new URL(url).searchParams.get('action')==='sync'?Response.json(corrupt):new Response(png,{headers:{'content-type':'image/png'}});
 await c.ChronicleSync.check(true);assert.match(c.ChronicleSync.status,/did not match/);assert.equal((await c.ChronicleSync.cache()).revision,newer.revision);
 console.log('PASS: all 184 battle conversions, 15 original Pokémon, OG-only feed, separate editions, selected-card hydration, stable saved paths, partial/corrupt download rollback and deferred application.');
}
async function modern(){
 let time=1000000,calls=0,fail=false;const events=new EventTarget(),document=new EventTarget(),clock=timers();document.hidden=false;
 const bundle={sha:'a'.repeat(40),syncedAt:1,characters:[],moves:[]};
 const source={REPO:'fixture/repo',assets:()=>[],validate:()=>{}};
 const updater=create({bundle,source,store:memoryStore(),now:()=>time,events,document,...clock,canApply:()=>true,apply(){},fetch:async()=>{calls++;if(fail)throw Error('Offline');return Response.json({sha:bundle.sha});}});
 await updater.start();assert.equal(calls,1);assert.equal([...clock.pending.values()][0].ms,INTERVAL);
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(clock.pending.size,0);
 time+=2000;document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(calls,2,'every return checks even within the 15 minute interval');
 time+=2000;events.dispatchEvent(new Event('online'));await settle();assert.equal(calls,3);
 time+=2000;fail=true;events.dispatchEvent(new Event('plakoro-app-open'));await settle();assert.equal([...clock.pending.values()][0].ms,60000);
 events.dispatchEvent(new Event('plakoro-app-close'));assert.equal(clock.pending.size,0);
 // Failure to write persistent storage must still allow this session to use
 // a fully downloaded update, without changing the previous durable copy.
 const bytes=Buffer.concat([png,Buffer.alloc(80)]),blobSha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
 const next={sha:'b'.repeat(40),characters:[{name:'Pikachu'}],moves:[{code:'STW04-001'}],syncedAt:time};
 const freshAsset={key:'moves/new.png',sha:blobSha,url:'https://fixture.test/new.png'};
 let allowed=false,applied=null;
 const quota=create({bundle,source:{...source,RAW:'https://fixture.test/',assets:c=>c.sha===next.sha?[freshAsset]:[],textPaths:()=>[],parse:()=>next},store:{persistent:true,read:async()=>null,image:async()=>null,commit:async()=>{throw Error('Quota exceeded');}},canApply:()=>allowed,apply:c=>applied=c,objectURL:()=> 'blob:test-card',fetch:async url=>url.includes('/commits/')?Response.json({sha:next.sha}):url.includes('/git/trees/')?Response.json({tree:[]}):new Response(bytes)});
 await quota.check();assert.equal(quota.state.persistent,false);assert(quota.pending);assert.equal(applied,null);
 allowed=true;assert(quota.maybeApply());assert.equal(applied.sha,next.sha);assert.equal(quota.asset(freshAsset.key),'blob:test-card');
 console.log('PASS: modern open/return/online/native lifecycle, hidden timer suspension, retry interval, safe application and offline quota fallback.');
}
(async()=>{await chronicle();await modern();})().catch(error=>{console.error(error);process.exitCode=1;});
