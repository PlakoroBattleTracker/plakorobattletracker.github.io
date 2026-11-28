/* Build-time, unattended refresh. Only a complete, verified artifact is deployed. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const modernSource=require('./plakorodb-source.js'),battleSource=require('./chronicle-source.js'),published=require('./published-updates.js');
const ROOT=__dirname,FEED='https://plakoro-public-card-feed.rusty-grass1.chatgpt.site/api/chronicle';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const blobHash=b=>crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function verifyPNG(bytes,digest,git=false){
 if(!Buffer.from([137,80,78,71,13,10,26,10]).equals(bytes.subarray(0,8))||(git?blobHash(bytes):hash(bytes))!==digest)throw Error('Card PNG checksum mismatch');
 return bytes;
}
async function request(url,kind='json'){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const headers={};if(url.startsWith('https://api.github.com/')&&process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
   const r=await fetch(url,{headers,signal:AbortSignal.timeout(90000)});
   if(!r.ok)throw Object.assign(Error('Source returned HTTP '+r.status),{retry:r.status===429||r.status>=500});
   return kind==='bytes'?Buffer.from(await r.arrayBuffer()):kind==='text'?await r.text():await r.json();
  }catch(e){if(attempt===2||e.retry===false)throw e;await sleep(1000*(attempt+1));}
 }
}
async function pool(items,workers,job){let next=0;const results=await Promise.allSettled(Array.from({length:Math.min(workers,items.length)},async()=>{while(next<items.length)await job(items[next++]);}));const failed=results.find(x=>x.status==='rejected');if(failed)throw failed.reason;}
async function modernCatalogue(get=request){
 const commit=await get('https://api.github.com/repos/'+modernSource.REPO+'/commits/main');
 if(!/^[a-f0-9]{40}$/.test(commit.sha))throw Error('Invalid PlakoroDB commit');
 const tree=await get('https://api.github.com/repos/'+modernSource.REPO+'/git/trees/'+commit.sha+'?recursive=1');tree.sha=commit.sha;
 const texts={};await pool(modernSource.textPaths(tree),4,async p=>{texts[p]=await get(modernSource.RAW+commit.sha+'/'+p,'text');});
 return modernSource.parse(tree,texts);
}
async function chronicleCatalogue(get=request,pause=sleep,now=Date.now){
 const deadline=now()+18*60*1000;let previous='',stalled=0;
 while(now()<deadline){
  const d=await get(FEED+'?action=sync');
  if(d.source!==battleSource.SOURCE)throw Error('Unexpected Chronicle source folder');
  if(d.status!=='scanning'){
   if(d.version!==1||!d.revision||d.complete===false)throw Error('Chronicle uploads are incomplete');
   const sandbox={window:{}};vm.runInNewContext(await fs.readFile(path.join(ROOT,'chronicle-og.js'),'utf8'),sandbox);
   const og=sandbox.window.ChronicleOG.catalogue(d);battleSource.catalogue(og);return og;
  }
  const progress=JSON.stringify([d.phase,d.folders,d.remainingFolders,d.cards]);stalled=progress===previous?stalled+1:0;previous=progress;
  if(stalled>30)throw Error('Chronicle scan stopped progressing');
  console.log('Chronicle scan:',d.phase,'folders',d.folders,'cards',d.cards,'of',d.totalCards);
  await pause(Math.min(3000,Math.max(100,Number(d.retryAfterMs)||100)));
 }
 throw Error('Chronicle scan exceeded the publication time limit');
}
async function build({output=path.join(ROOT,'_site'),cache=path.join(ROOT,'.card-cache'),reportPath=path.join(ROOT,'card-sync-status.json'),get=request,modern,chronicle}={}){
 if(!modern||!chronicle){const fetched=await Promise.all([modernCatalogue(get),chronicleCatalogue(get)]);[modern,chronicle]=fetched;}
 modernSource.validate(modern);battleSource.catalogue(chronicle,modern.characters.map(p=>p.name));
 const assets={},unique=new Map(),directory=path.join(output,'published-cards');await fs.mkdir(directory,{recursive:true});await fs.mkdir(cache,{recursive:true});
 // Keep previously published image URLs valid for already-open battles.
 for(const file of await fs.readdir(cache)){
  const match=/^(git|sha256)-([a-f0-9]+)\.png$/.exec(file);if(!match)continue;
  try{const bytes=verifyPNG(await fs.readFile(path.join(cache,file)),match[2],match[1]==='git');await fs.writeFile(path.join(directory,hash(bytes)+'.png'),bytes);}catch{}
 }
 async function image(key,digest,url,git=false){
  const cacheFile=path.join(cache,(git?'git-':'sha256-')+digest+'.png');let bytes;
  for(const file of [cacheFile,path.join(output,key)]){try{bytes=verifyPNG(await fs.readFile(file),digest,git);break;}catch{}}
  if(!bytes)bytes=verifyPNG(await get(url,'bytes'),digest,git);
  const name=hash(bytes)+'.png';await fs.writeFile(path.join(directory,name),bytes);await fs.writeFile(cacheFile,bytes);return 'published-cards/'+name;
 }
 await pool(modernSource.assets(modern),4,async a=>{assets[a.key]=await image(a.key,a.sha,a.url,true);});
 for(const c of published.cards(chronicle)){
  if(!/^drive:[A-Za-z0-9_-]+$/.test(c.image)||c.image!=='drive:'+c.driveId||!new RegExp('^'+c.driveId+':[a-f0-9]{64}$').test(c.imageSha))throw Error('Invalid Chronicle image reference');
  if(!unique.has(c.imageSha))unique.set(c.imageSha,[]);unique.get(c.imageSha).push(c);
 }
 await pool([...unique.values()],2,async targets=>{
  const c=targets[0],digest=c.imageSha.slice(c.driveId.length+1),key=/^(?:OG[CW]|OCW)\d+(?:-\d+)+$/.test(c.code||c.id||'')?battleSource.imagePath(c):'chronicle-cards/'+c.driveId+'.png';
  const result=await image(key,digest,FEED+'?action=asset&format=png&id='+encodeURIComponent(c.driveId)+'&revision='+digest);
  for(const card of targets){card.image=result;if(/^(?:OG[CW]|OCW)\d+(?:-\d+)+$/.test(card.code||card.id||''))assets[battleSource.imagePath(card)]=result;}
 });
 const revision=hash(JSON.stringify([modern.sha,chronicle.revision,Object.entries(assets).sort(([a],[b])=>a.localeCompare(b))]));
 const snapshot=published.validate({schema:1,revision,publishedAt:new Date().toISOString(),modern,chronicle,assets});
 await fs.writeFile(path.join(output,'published-catalogue.json'),JSON.stringify(snapshot));
 await fs.writeFile(path.join(output,'published-catalogue.js'),'window.PUBLISHED_CARDS='+JSON.stringify(snapshot).replace(/</g,'\\u003c')+';\n');
 // Version every runtime file, including the bootstrap snapshot. The fresh
 // same-origin JSON check also handles an old index served by a browser/CDN.
 const index=await fs.readFile(path.join(output,'index.html'),'utf8'),versions={};
 for(const [,file]of index.matchAll(/(?:src|href)="([A-Za-z0-9-]+\.(?:js|css))(?:\?[^" ]*)?"/g))versions[file]=hash(await fs.readFile(path.join(output,file))).slice(0,16);
 await fs.writeFile(path.join(output,'index.html'),index.replace(/(src|href)="([A-Za-z0-9-]+\.(?:js|css))(?:\?[^" ]*)?"/g,(_,attr,file)=>`${attr}="${file}?v=${versions[file]}"`));
 const report={date:snapshot.publishedAt.slice(0,10),modernRevision:modern.sha,chronicleRevision:chronicle.revision,modernPokemon:modern.characters.length,modernMoves:modern.moves.length,chroniclePokemon:chronicle.pokemon.length,chronicleMoves:Object.values(battleSource.catalogue(chronicle).movePools).flat().length,verifiedImages:new Set(Object.values(assets)).size};
 await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log('Verified website publication:',JSON.stringify(report));return snapshot;
}
module.exports={build,verifyPNG,blobHash,modernCatalogue,chronicleCatalogue,pool};
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1;});
