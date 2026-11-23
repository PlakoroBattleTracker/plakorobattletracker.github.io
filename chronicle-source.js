/* Convert the same public Chronicle feed used by the Pokédex into battle cards. */
(function(root){
 'use strict';
 const SOURCE='https://drive.google.com/drive/folders/1g7KX3NYqRm6mVtbo_hIkir_6QT27E-tW';
 const TYPES=['grass','fire','water','lightning','psychic','fighting','dark','steel','flying','dragon','normal'];
 const FACINGS=['standing','handstand','back','down','left','right'];
 const SYMBOLS={st:'standing',hs:'handstand',ba:'back',do:'down',s1:'left',s2:'right'};
 const ENERGIES={grass:'grass',fire:'fire',water:'water',electric:'lightning',psychic:'psychic',fighting:'fighting',dark:'dark',steel:'steel',flying:'flying',dragon:'dragon',normal:'normal'};
 const clean=s=>String(s??'').replace(/[?？]/g,'').replace(/\s+/g,' ').trim();
 const name=s=>clean(s).replace(/^Bulbasuar$/,'Bulbasaur');
 const fail=message=>Object.assign(Error(message),{retryable:false});
 function fields(card){
  const d=card.battle?.fields;
  if(card.battle?.schema!==1||!d||typeof d!=='object'||!name(d.mon_name)||!TYPES[d.type])throw fail('Chronicle battle metadata is not ready. Keeping the current cards.');
  if(Object.values(d).some(v=>!['string','number','boolean'].includes(typeof v)))throw fail('Invalid Chronicle battle metadata.');
  return d;
 }
 function imagePath(card){
  const code=card.code||card.id;
  if(!/^(?:OG[CW]|OCW)\d+(?:-\d+)+$/.test(code))throw fail('Unexpected Chronicle card code.');
  return (code.startsWith('OC')?'custom/':'chronicle/')+code+'.png';
 }
 function move(card){
  const d=fields(card),effects=Array.from({length:4},(_,i)=>String(d['move_text_'+i]||'').trim()),costs={};
  for(const [source,target]of Object.entries(ENERGIES)){const n=Number(d[source+'_energy']||0);if(!Number.isInteger(n)||n<0||n>99)throw fail('Invalid Chronicle energy cost.');if(n)costs[target]=n;}
  const damage=typeof d.damage==='string'?Number(d.damage.trim()||0):0;
  if(!Number.isFinite(damage)||damage<0||!clean(d.move_name))throw fail('Invalid Chronicle move.');
  const m={name:clean(d.move_name),code:card.code,owner:name(d.mon_name),image:imagePath(card),imageSha:card.imageSha,source:String(card.year||1997),sourceUrl:card.sourceUrl||SOURCE,chronicle:true,damage,baseDamage:damage*10,type:TYPES[d.type],energyCost:costs,energy:Object.entries(costs).flatMap(([t,n])=>Array(n).fill(t)),effects,effect:'',outcomes:[],special:effects.some(e=>/special move/i.test(e))};
  if(/^(?:\{(?:st|hs|ba|do|s1|s2)\}\s*)+$/.test(effects[0])){
   const dirs=[...effects[0].matchAll(/\{(st|hs|ba|do|s1|s2)\}/g)].map(x=>SYMBOLS[x[1]]);
   m.requiredOrientations=dirs;m.outcomes=[{text:effects[1],orientations:dirs}];m.effect=effects.slice(2).filter(e=>e&&!e.startsWith('Special Move:')).join(' ');
  }else{
   const unconditional=effects[0]?[effects[0]]:[];
   for(let i=1;i<4;i++)if(effects[i]){const dirs=FACINGS.filter((_,j)=>d[`move_${i}_facing_${j}`]);if(dirs.length)m.outcomes.push({text:effects[i],orientations:dirs});else unconditional.push(effects[i]);}
   m.effect=unconditional.join(' ');
  }
  const text=effects.join(' '),failure=text.match(/If this moves? fails, this pokemon takes (\d+) damage/i);
  if(failure)m.failureDamage=Number(failure[1]);
  if(['Evolve','Devolve'].includes(m.name)){
   m.action=m.name.toLowerCase();const target=text.match(/(?:evolves?(?: it)?|evovles|Devolve this Pokemon) into ([^.]+)/i);
   if(!target)throw fail('Missing Chronicle evolution target.');
   m.targets=target[1].split(/,\s*its maximum/i)[0].split(/,\s*(?:or\s+)?|\s+or\s+/).filter(x=>x.trim()).map(name).sort();
   const hp=text.match(/Maximum HP becomes (\d+)/i),dice=text.match(/(?:Roll|rolls?) (\d+) enekoro/i);
   if(hp)m.maxHp=Number(hp[1]);m.energyDice=dice?Number(dice[1]):m.maxHp===160?4:3;
  }
  const hpGate=text.match(/can only be used if your \w+ has (\d+) HP or less/i),conditional=text.match(/If Evolve failed on your last turn, this pokemon evolves into ([^.]+)/i);
  if(hpGate)m.maxUserHp=Number(hpGate[1]);if(conditional)m.conditionalEvolution=name(conditional[1]);
  return m;
 }
 function catalogue(feed,modernNames=[]){
  if(feed.source!==SOURCE)throw fail('Unexpected Chronicle source.');
  const modern=new Set(modernNames),pokemon={},movePools={},seen=new Set(),choices=new Map();
  for(const card of feed.pokemon){
   if(!/^OGC/.test(card.code))continue;
   const d=fields(card),species=name(d.mon_name),choice=modern.has(species)?species+' (1997)':species;
   let hp=Number(String(d.hp).trim());if(hp<30)hp*=10;
   if(!Number.isFinite(hp)||hp<=0||seen.has(card.code)||pokemon[choice])throw fail('Invalid or duplicate Chronicle Pokémon.');
   seen.add(card.code);choices.set(species,choice);
   pokemon[choice]={pokemon:{name:choice,species,code:card.code,hp,type:TYPES[d.type],weakness:d.weakness_visible===false?'':TYPES[d.weakness]||'',image:imagePath(card),imageSha:card.imageSha,source:String(card.year||1997),sourceUrl:card.sourceUrl||SOURCE},moves:[]};
  }
  for(const card of [...feed.moves,...feed.pokemon.flatMap(p=>p.moves||[])]){
   if(!/^OGW/.test(card.code)||seen.has(card.code))continue;
   seen.add(card.code);const m=move(card);(movePools[m.owner]??=[]).push(m);
  }
  for(const pool of Object.values(movePools))for(const m of pool){if(m.targets)m.targets=m.targets.map(t=>choices.get(t)||t);if(m.conditionalEvolution)m.conditionalEvolution=choices.get(m.conditionalEvolution)||m.conditionalEvolution;}
  for(const block of Object.values(pokemon))block.moves=movePools[block.pokemon.species]||[];
  if(!Object.keys(pokemon).length||!Object.values(movePools).flat().length)throw fail('The Chronicle update contains no usable cards.');
  return {pokemon,movePools,order:Object.keys(pokemon).filter(n=>!modern.has(n)),driveFolder:SOURCE,checked:(feed.checkedAt||feed.snapshotDate||'').slice(0,10),revision:feed.revision,note:feed.sourceNote||'Updated from Chronicle Drive.'};
 }
 const api={SOURCE,TYPES,FACINGS,name,move,catalogue,imagePath};root.ChronicleBattle=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
