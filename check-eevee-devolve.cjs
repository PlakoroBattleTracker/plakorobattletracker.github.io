const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Run the actual app click handler and rendering without network requests.
function boot(root='Eevee',target='Eevee',saved=new Map()){
 const listeners={},stage={style:{},innerHTML:'',addEventListener:(name,fn)=>listeners[name]=fn},scroll={scrollTop:80},announcement={textContent:''};
 const context=vm.createContext({console,window:{innerWidth:960,innerHeight:540,matchMedia:()=>({matches:false}),addEventListener(){}},
  document:{getElementById:id=>({stage,pickerScroll:scroll,announcement})[id]||null,documentElement:{}},
  getComputedStyle:()=>({getPropertyValue:()=>0}),localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  ChronicleSync:{maybeApply(){},start(){}},
 });
 const run=code=>vm.runInContext(code,context),json=code=>JSON.parse(run('JSON.stringify('+code+')'));
 for(const f of ['data.js','plakorodb-source.js','domain.js','engine.js','league.js'])run(fs.readFileSync(path.join(__dirname,f),'utf8'));
 if(root==='Eevee (1997)'||target==='Eevee (1997)')run(`
  CHRONICLE_DB.pokemon['Eevee (1997)']={pokemon:{...DATA.pokemon.Eevee.pokemon,name:'Eevee (1997)',species:'Eevee'},moves:CHRONICLE_DB.movePools.Eevee};
  CHRONICLE_DB.order.push('Eevee (1997)');DATA.pokemon['Eevee (1997)']=CHRONICLE_DB.pokemon['Eevee (1997)'];
  for(const m of ALL_MOVES)if(m.action==='devolve'&&m.targets?.includes('Eevee'))m.targets=['Eevee (1997)'];
 `);
 run(`const PlakoroUpdates={create:()=>({catalog:PLAKORO_BUNDLE,asset(){},maybeApply(){},start(){}})};`);
 run(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'));
 function click(action,index,value){listeners.click({target:{closest:()=>({disabled:false,dataset:{action,index:String(index),...(value===undefined?{}:{value})}})}});}
 function pickDevolve(){click('pick-move',run("movesForPokemon(editLoadout().pokemon,true).findIndex(m=>m.action==='devolve')"));}
 function fillRegular(){while(run('editLoadout().moves.length')<3)click('pick-move',run("movesForPokemon(editLoadout().pokemon,true).findIndex(m=>!m.action&&!m.special&&!editLoadout().moves.some(x=>moveId(x)===moveId(m)))"));}
 function setup(form){run(`chronicleMode=true;mode='builder';players[0]={pokemon:${JSON.stringify(root)},moves:[movesForPokemon(${JSON.stringify(root)}).find(m=>m.action==='evolve'),...movesForPokemon(${JSON.stringify(root)}).filter(m=>!m.action&&!m.special).slice(0,3)],evolutionLoadouts:[{pokemon:${JSON.stringify(form)},moves:[]}]};active=0;ui={modal:'moves',loadout:0,search:'',preview:null};syncEvolutionLoadouts(cur());render();`);fillRegular();}
 return {run,json,click,pickDevolve,fillRegular,setup,saved,stage,scroll};
}

const forms=['Flareon','Jolteon','Vaporeon'];
for(const [root,target]of [['Eevee','Eevee'],['Eevee','Eevee (1997)'],['Eevee (1997)','Eevee (1997)']])for(const first of forms){
 const b=boot(root,target),{run,json,click}=b;b.setup(first);const rootMoves=json('cur().moves.map(m=>m.code)');
 assert(!run(`movesForPokemon('${first}').some(m=>m.action==='devolve')`));
 b.pickDevolve();
 assert.equal(run('ui.loadout'),1);assert.equal(run('ui.modal'),'pokemon');assert.equal(run('cur().evolutionLoadouts.length'),2);
 assert.equal(b.scroll.scrollTop,0);assert(b.stage.innerHTML.includes('aria-label="Choose a Pokémon"'));
 assert.equal(run('cur().evolutionLoadouts[0].moves.length'),4);
 assert.deepEqual(json('pokemonOptions()').sort(),forms.filter(n=>n!==first).sort());
 assert.deepEqual(json('cur().moves.map(m=>m.code)'),rootMoves);
 const second=forms.find(n=>n!==first);click('pick-pokemon',0,second);b.fillRegular();b.pickDevolve();
 const third=forms.find(n=>n!==first&&n!==second);
 assert.equal(run('ui.loadout'),2);assert.equal(run('ui.modal'),'moves');assert.equal(run('editLoadout().pokemon'),third);
 b.fillRegular();b.pickDevolve();assert.equal(run('ui.loadout'),2);assert.equal(run('cur().evolutionLoadouts.length'),3,'never create a fourth form');
 assert.equal(run('isComplete(cur())'),true);assert.equal(new Set(json('cur().evolutionLoadouts.map(l=>l.pokemon)')).size,3);
 click('add-evolution');assert.equal(run('cur().evolutionLoadouts.length'),3);
 run('saveBuilds()');const restored=boot(root,target,b.saved);
 assert.equal(restored.run('players[0].evolutionLoadouts.length'),3);assert.deepEqual(restored.json('players[0].moves.map(m=>m.code)'),rootMoves);
 // Evolve, Devolve and re-evolve through all three forms using the same
 // original Eevee loadout, including shared moves targeting its 1997 card.
 run("battle=makeBattleState([freshFighter(cur(),0),freshFighter(cur(),1)],'single',true);const f=battle.fighters[0],evolve=f.moves.find(m=>m.action==='evolve');");
 assert.deepEqual(json('transitionChoices(f,evolve)'),[1,2,3]);
 for(let i=1;i<=3;i++){
  assert(run(`applyChronicleTransition(f,evolve,${i})`));
  assert.deepEqual(json("transitionChoices(f,f.moves.find(m=>m.action==='devolve'))"),[0]);
  assert(run("applyChronicleTransition(f,f.moves.find(m=>m.action==='devolve'),0)"));
  assert.equal(run('f.pokemon'),root);assert.deepEqual(json('f.moves.map(m=>m.code)'),rootMoves);
 }
 run('saveBattle();battle=null;loadBattle()');assert.equal(run('battle.fighters[0].loadouts.length'),4);
}

// Searching for Eevee must not hide the evolution choices after confirmation.
const searched=boot();searched.setup('Flareon');searched.run("cur().evolutionLoadouts=[{pokemon:null,moves:[]}];ui.loadout=-1;ui.search='Eevee'");searched.click('confirm-moves');assert.equal(searched.run('ui.search'),'');assert(searched.stage.innerHTML.includes('data-value="Flareon"'));

// Full move slots must not create a form when Devolve was not accepted.
let b=boot();b.setup('Flareon');b.click('pick-move',b.run("movesForPokemon('Flareon',true).findIndex(m=>!m.action&&!m.special&&!editLoadout().moves.includes(m))"));b.pickDevolve();assert.equal(b.run('cur().evolutionLoadouts.length'),1);
// Reuse an unfinished alternate. Removing the last Devolve safely returns
// the picker to an existing loadout instead of leaving a broken modal.
b=boot();b.setup('Flareon');b.pickDevolve();b.click('pick-pokemon',0,'Jolteon');b.fillRegular();b.pickDevolve();
b.click('loadout',0);b.pickDevolve();b.click('loadout',1);b.pickDevolve();
assert.equal(b.run('cur().evolutionLoadouts.length'),1);assert.equal(b.run('ui.loadout'),0);assert.equal(b.run('ui.modal'),'moves');
b.pickDevolve();assert.equal(b.run('cur().evolutionLoadouts.length'),2);b.click('pick-pokemon',0,'Jolteon');b.pickDevolve();
assert.equal(b.run('cur().evolutionLoadouts.length'),3);b.click('loadout',0);b.pickDevolve();b.pickDevolve();
assert.equal(b.run('cur().evolutionLoadouts.length'),3);assert.equal(b.run('ui.loadout'),1,'reopen the unfinished alternate');
b.click('remove-loadout');assert.equal(b.run('cur().evolutionLoadouts.length'),2);b.click('add-evolution');assert.equal(b.run('cur().evolutionLoadouts.length'),3);assert.notEqual(b.run('ui.modal'),null);
console.log('PASS: Devolve clicks open all three Eevee evolution forms, both Eevee editions, remaining-form choices, two-extra-form limit, incomplete-form reuse, rejected selections, safe deselection, manual add/remove, save/reload and battle re-evolution.');
