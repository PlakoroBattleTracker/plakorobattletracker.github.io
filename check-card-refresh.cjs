const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const saved = new Map();
const context = vm.createContext({console,window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>null},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},render(){},renderBattle(){},renderBuilder(){},showImpact(){}});
for(const file of ['data.js','plakorodb-source.js','domain.js','engine.js','league.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
const run = source => vm.runInContext(source,context);
run(`
 function card(code){return ALL_MOVES.find(m=>m.code===code)}
 function fixture(name='Strong Charmander'){
  chronicleMode=true;battleFormat='single';
  players=[name,'Mew'].map(pokemon=>({pokemon,moves:movesForPokemon(pokemon).slice(0,4),evolutionLoadouts:[]}));
  battle=makeBattleState(players.map((p,i)=>freshFighter(p,i)),battleFormat,true);
  startControllerTurn('a');battle.turnIndex=0;battle.targetIndex=1;battle.phase='turn';
 }
 function result(code,i=-1){return buildOutcome(battle.fighters[0],battle.fighters[1],card(code),i)}
 function resolve(code,i=-1){const a=battle.fighters[battle.turnIndex];a.moves=[card(code),...a.moves.filter(m=>m.code!==code)];battle.selectedMove=0;battle.phase='resolve';chooseOutcome(i)}
`);
const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'chronicle-source.json')));
assert.equal(snapshot.cards.length,200);
assert.equal(run('Object.keys(CHRONICLE_DB.pokemon).length'),15);
assert.equal(run('Object.values(CHRONICLE_DB.movePools).flat().length'),184);
assert.equal(run('allChronicleNames().length'),38);
assert.equal(run('CHRONICLE_DB.checked'),'2026-11-22');
assert.equal(run('ALL_MOVES.filter(m=>/[?？]/.test(m.name)||/^RE/.test(m.code)).length'),0);
for(const item of snapshot.cards){
 const image=(item.code.startsWith('OC')?'custom/':'chronicle/')+item.code+'.png';
 assert(fs.existsSync(path.join(__dirname,'_site',image)),image);
 if(item.code.startsWith('OGW'))assert(run(`!!card(${JSON.stringify(item.code)})`),item.code);
}
run('chronicleMode=true');
for(const name of ['Charmander','Squirtle']){
 assert.equal(run(`JSON.stringify(movesForPokemon('${name}').map(m=>m.code).sort())`),run(`JSON.stringify(movesForPokemon('Strong ${name}').map(m=>m.code).sort())`));
 assert.equal(run(`getPokemonBlock('Strong ${name}').pokemon.type`),name==='Charmander'?'fire':'water');
}
assert.equal(run('getPokemonBlock("Squirtle (1997)").pokemon.code'),'OGC06-001');
assert.equal(run('pokemonMeta("Squirtle (1997)").weakness'),'');
assert.equal(run('pokemonMeta("Bulbasaur (1997)").species'),'Bulbasaur','Source spelling is matched to the existing species');
run('chronicleMode=false');
assert.equal(run('getPokemonBlock("Squirtle").pokemon.code'),'STC03-001');
assert.equal(run('pokemonMeta("Squirtle").weakness'),'lightning');
assert(!run('DATA.order.includes("Strong Squirtle")'));

// The added original cards require matching physical-dice prompts and effects.
run('fixture()');
assert.equal(run('result("OGW40-002",0).questions[0].kind'),'ban');
assert.equal(run('result("OGW40-011").questions[0].remaining'),1);
assert.equal(run('result("OGW40-011").selfEnergy'),-1);
assert.equal(run('result("OGW40-005",1).selfDamage'),30);
assert.equal(run('result("OGW40-005",0).selfDamage'),0);
assert.equal(run('result("OGW40-009",0).selfEnergy'),2);
run('resolve("OGW40-003",-1)');
assert.equal(run('battle.phase'),'resolve','Double Fire requires a second use');
assert.equal(run('battle.chain.hits'),1);
run('chooseOutcome(-1)');assert.equal(run('battle.turnNumber'),1);
assert.equal(run('battle.fighters[1].hp'),100);
run('undoBattle()');assert.equal(run('battle.fighters[1].hp'),120);

run('fixture("Strong Squirtle")');
assert.equal(run('result("OGW42-003",0).selfEnergy'),2);
assert.equal(run('result("OGW42-006").enemyEnergy'),-1);
assert.equal(run('result("OGW42-006").questions[0].kind'),'ban');
assert.equal(run('result("OGW42-011",0).defense'),-30,'Shell Catch replacement is not added to the base shield');
assert.equal(run('result("OGW06-1-08",0).defense'),-60);
assert.equal(run('result("OGW06-1-04",1).damage'),10);
assert.equal(run('result("OGW06-002",0).questions[0].kind'),'ban');
assert.equal(run('result("OGW06-006",0).questions[0].title'),'Reroll your Enekoro');
run('resolve("OGW06-006",0);answerQuestion(2)');
assert.equal(run('battle.fighters[1].hp'),80,'Hydro Cannon: 20 plus two Water symbols');

run('fixture("Squirtle");resolve("OGW06-1-02",0)');
assert.equal(run('battle.pending.questions.length'),2);
assert.equal(run('battle.pending.questions[0].max'),6);
run('answerQuestion(3);answerQuestion(2)');
assert.equal(run('battle.fighters[0].energySymbols'),5);
assert.equal(run('battle.fighters[0].symbolType'),'water');
assert.equal(run('battle.fighters[0].hp'),120,'Rain Dance has no recoil');
run('fixture("Squirtle");resolve("OGW06-010",0)');
assert.equal(run('battle.fighters[0].incomingMultiplier'),2);
assert.equal(run('outcomeDamage({damage:30},battle.fighters[0])'),60);
run('battle.targetIndex=0;resolve("STW06-002",-1)');
assert.equal(run('battle.fighters[0].incomingMultiplier'),1,'Incoming multiplier expires after the next attack');
run('fixture("Charmander")');
assert(run('isMoveDisabled(battle.fighters[0],card("OGW05-1-08"))'));
run('battle.fighters[0].hp=40');
assert(!run('isMoveDisabled(battle.fighters[0],card("OGW05-1-08"))'));
run('resolve("OGW05-1-08",0)');
assert.equal(run('battle.pending.questions[0].max'),12);
assert.equal(run('battle.pending.questions[1].max'),6);
run('answerQuestion(1);answerQuestion(1)');
assert.equal(run('battle.fighters[1].hp'),50,'Flame of Rage: 30 plus two 20-damage successes');

// Light of Evolution uses the already-prepared Wartortle after Evolve fails.
run(`fixture('Strong Squirtle');
 players[0].moves=[card('OGW42-005'),card('OGW50-001'),card('OGW42-001'),card('OGW42-002')];
 syncEvolutionLoadouts(players[0]);
 players[0].evolutionLoadouts[0].moves=CHRONICLE_DB.movePools.Wartortle.slice(0,4);
 battle.fighters[0]=freshFighter(players[0],0);
`);
assert.equal(run('result("OGW42-005").transition'),null);
run('battle.fighters[0].lastMove="Evolve";battle.fighters[0].lastMoveFailed=true;resolve("OGW42-005",-1)');
assert.equal(run('battle.fighters[0].pokemon'),'Wartortle');
assert.equal(run('battle.fighters[0].maxHp'),140);
assert.equal(run('battle.fighters[0].hp'),120,'Conditional evolution does not invent Evolve healing');
run('saveBattle();battle=null;loadBattle()');
assert.equal(run('battle.fighters[0].pokemon'),'Wartortle');

// All imported outcomes produce finite values; card artwork is included above.
for(const m of JSON.parse(run('JSON.stringify(Object.values(CHRONICLE_DB.movePools).flat())'))){
 run(`fixture(${JSON.stringify(m.owner)})`);
 for(let i=-1;i<m.outcomes.length;i++){
  const r=JSON.parse(run(`JSON.stringify(result(${JSON.stringify(m.code)},${i}))`));
  for(const field of ['damage','selfDamage','heal','selfEnergy','enemyEnergy','defense'])assert(Number.isFinite(r[field]),m.code+':'+field);
  for(const q of r.questions)if(q.kind==='count'){assert(q.max>=q.min);assert(Number.isFinite(q.per));}
 }
}
console.log('PASS: all 200 source cards, 46 new moves, original Pokémon stats/artwork, shared Strong pools, new battle effects, evolution and saved battles.');
