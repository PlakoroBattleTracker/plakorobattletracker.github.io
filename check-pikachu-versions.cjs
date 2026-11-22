const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot(saved = new Map()) {
  const context = vm.createContext({
    console, window: {matchMedia: () => ({matches: false})},
    document: {getElementById: () => null},
    localStorage: {getItem: k => saved.get(k) || null, setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k)},
    render() {}, renderBuilder() {}, renderBattle() {}, showImpact() {}, setMode() {},
  });
  for (const file of ['data.js','plakorodb-source.js','domain.js','engine.js','league.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
  }
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  vm.runInContext(app.slice(app.indexOf('function applyModernCatalog('),app.indexOf('function renderUpdateStatus(')),context);
  return {saved,run: code => vm.runInContext(code,context)};
}
const app = boot(), run = app.run;
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
assert.equal(run('pokemonLabel("Pikachu")'),'Pikachu (2026)');
assert.equal(run('pokemonLabel("Pikachu (1997)")'),'Pikachu (1997)');
assert.equal(run('movesForPokemon("Pikachu").length'),8);
assert(!run('DATA.order.includes("Pikachu (1997)")'));
run('chronicleMode=true');
assert.equal(run('allChronicleNames().filter(n=>n==="Pikachu"||n==="Pikachu (1997)").length'),2);
assert.equal(run('getPokemonBlock("Pikachu").pokemon.code'),'STC04-001');
assert.equal(run('getPokemonBlock("Pikachu (1997)").pokemon.code'),'OGC01-001');
assert.notEqual(run('getPokemonBlock("Pikachu").pokemon.image'),run('getPokemonBlock("Pikachu (1997)").pokemon.image'));
assert.equal(run('pokemonMeta("Pikachu").weakness'),'fighting');
assert.equal(run('pokemonMeta("Pikachu (1997)").weakness'),'');
const modernMoves = json('movesForPokemon("Pikachu").map(m=>m.code).sort()');
assert.equal(modernMoves.length,42);
for (const name of ['Pikachu (1997)','Strong Pikachu']) {
  assert.deepEqual(json(`movesForPokemon(${JSON.stringify(name)}).map(m=>m.code).sort()`),modernMoves);
}
assert(run('sharesLegacyMoves("Surfing Pikachu","Pikachu (1997)")'));
assert(run('sharesLegacyMoves("Surfing Pikachu","Pikachu (2026)")'));
assert(!run('sharesLegacyMoves("Pikachu (1997)","Surfing Pikachu")'));
assert(!run('sharesLegacyMoves("Pikachu","Surfing Pikachu")'));
run(`
  players=['Pikachu','Pikachu (1997)'].map(pokemon=>({pokemon,moves:movesForPokemon(pokemon).slice(0,4),evolutionLoadouts:[]}));
  battle=makeBattleState(players.map((p,i)=>freshFighter(p,i)),'single',true);
  const gnaw=ALL_MOVES.find(m=>m.code==='STW04-001');
  const target=freshFighter({pokemon:'Mew',moves:[],evolutionLoadouts:[]},1);
`);
assert(run('players.every(isComplete)'));
assert.equal(run('buildOutcome(battle.fighters[0],target,gnaw).damage'),run('buildOutcome(battle.fighters[1],target,gnaw).damage'));
run('saveBuilds();saveBattle()');
let restored = boot(new Map(app.saved));
restored.run('loadBuilds();loadBattle();saveBuilds();saveBattle()');
assert.equal(restored.run('players[0].pokemon'),'Pikachu');
assert.equal(restored.run('players[1].pokemon'),'Pikachu (1997)');
assert.equal(restored.run('battle.fighters[0].pokemon'),'Pikachu');
assert.equal(restored.run('battle.fighters[1].loadouts[0].pokemon'),'Pikachu (1997)');
assert.equal(restored.run('fighterMeta(battle.fighters[0]).weakness'),'fighting');
assert.equal(restored.run('fighterMeta(battle.fighters[1]).weakness'),'');

// Current catalog refreshes leave both selected identities and original artwork intact.
run('applyModernCatalog(PLAKORO_BUNDLE)');
assert.equal(run('getPokemonBlock("Pikachu").pokemon.code'),'STC04-001');
assert.equal(run('getPokemonBlock("Pikachu (1997)").pokemon.code'),'OGC01-001');
assert(run('CHRONICLE_DB.order.includes("Pikachu (1997)")'));
assert.equal(run('players[0].pokemon'),'Pikachu');
assert.equal(run('players[1].pokemon'),'Pikachu (1997)');

// Pre-split saves displayed the original card only in Legacy; migrate once per format.
const oldSaves = new Map(app.saved);
const buildKey=run('BUILD_KEY'), battleKey=run('BATTLE_KEY');
const oldBuilds=JSON.parse(oldSaves.get(buildKey));
delete oldBuilds.pokemonChoicesVersion;
oldBuilds.players.forEach(p=>p.pokemon='Pikachu');
oldBuilds.formatSetups={
  single:{players:structuredClone(oldBuilds.players),chronicleMode:true},
  double:{players:structuredClone(oldBuilds.players),chronicleMode:false},
  'league-single':{players:Array.from({length:12},()=>structuredClone(oldBuilds.players[0])),chronicleMode:true},
};
oldSaves.set(buildKey,JSON.stringify(oldBuilds));
const oldBattle=JSON.parse(oldSaves.get(battleKey));
delete oldBattle.pokemonChoicesVersion;
oldBattle.fighters.forEach(f=>{f.pokemon='Pikachu';f.loadouts[0].pokemon='Pikachu'});
oldBattle.snapshot=structuredClone(oldBattle);
oldSaves.set(battleKey,JSON.stringify(oldBattle));
restored=boot(oldSaves);
restored.run('loadBuilds();loadBattle()');
assert(restored.run('players.every(p=>p.pokemon==="Pikachu (1997)")'));
assert(restored.run('formatSetups.double.players.every(p=>p.pokemon==="Pikachu")'));
assert(restored.run('formatSetups["league-single"].players.every(p=>p.pokemon==="Pikachu (1997)")'));
assert(restored.run('battle.fighters.every(f=>f.pokemon==="Pikachu (1997)"&&f.loadouts[0].pokemon==="Pikachu (1997)")'));
restored.run('undoBattle()');
assert(restored.run('battle.fighters.every(f=>f.pokemon==="Pikachu (1997)")'));
restored.run('players[0].pokemon="Pikachu";saveBuilds()');
const again=boot(new Map(restored.saved));again.run('loadBuilds()');
assert.equal(again.run('players[0].pokemon'),'Pikachu','A newly chosen 2026 card must not migrate on later reloads');
oldSaves.set(run('CHRONICLE_KEY'),'0');
oldSaves.set(buildKey,JSON.stringify(oldBuilds));
oldBattle.chronicle=false;oldBattle.fighters.forEach(f=>f.chronicle=false);oldBattle.snapshot=null;
oldSaves.set(battleKey,JSON.stringify(oldBattle));
const oldModern=boot(oldSaves);oldModern.run('loadBuilds();loadBattle()');
assert(oldModern.run('players.every(p=>p.pokemon==="Pikachu")'));
assert(oldModern.run('battle.fighters.every(f=>f.pokemon==="Pikachu")'));
console.log('PASS: distinct 2026/1997 Pikachu cards and stats, 42 shared Legacy moves, Surfing exclusivity, catalog refresh, saves, per-format migration and undo.');
