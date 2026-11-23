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

// Every original/modern overlap must remain an independent character choice.
assert.equal(run('DATA.order.filter(n=>CHRONICLE_DB.pokemon[n]).length'),0);
for (const [name,modernCode,originalCode,weakness,evolutionCode,target] of [
  ['Bulbasaur','STC01-001','OGC07-001','fire','OGW51-001','Ivysaur'],
  ['Squirtle','STC03-001','OGC06-001','lightning','OGW50-001','Wartortle'],
]) {
  const original=name+' (1997)', originalJS=JSON.stringify(original), nameJS=JSON.stringify(name);
  const versionApp=boot(), check=versionApp.run;
  assert.equal(check(`pokemonLabel(${nameJS})`),name+' (2026)');
  assert.equal(check(`getPokemonBlock(${nameJS}).pokemon.code`),modernCode);
  assert(!check(`DATA.order.includes(${originalJS})`));
  check('chronicleMode=true');
  assert(check(`allChronicleNames().includes(${originalJS})&&allChronicleNames().includes(${nameJS})`));
  assert.equal(check(`getPokemonBlock(${nameJS}).pokemon.code`),modernCode);
  assert.equal(check(`getPokemonBlock(${originalJS}).pokemon.code`),originalCode);
  assert.equal(check(`pokemonMeta(${nameJS}).weakness`),weakness);
  assert.equal(check(`pokemonMeta(${originalJS}).weakness`),'');
  assert.equal(check(`JSON.stringify(movesForPokemon(${nameJS}).map(m=>m.code).sort())`),check(`JSON.stringify(movesForPokemon(${originalJS}).map(m=>m.code).sort())`));
  check(`
    players=[${nameJS},${originalJS}].map(pokemon=>({pokemon,moves:movesForPokemon(pokemon).filter(m=>!m.action&&!m.special).slice(0,4),evolutionLoadouts:[]}));
    battle=makeBattleState(players.map((p,i)=>freshFighter(p,i)),'single',true);
    const typeAttack=ALL_MOVES.find(m=>m.type===${JSON.stringify(weakness)}&&m.baseDamage>0&&!m.effect.includes("isn't affected by Weakness"));
    const attacker=freshFighter({pokemon:'Mew',moves:[],evolutionLoadouts:[]},0);
  `);
  assert(check('players.every(isComplete)'));
  assert.equal(check('baseAttackDamage(attacker,battle.fighters[0],typeAttack)-baseAttackDamage(attacker,battle.fighters[1],typeAttack)'),20,'Use the selected edition’s printed weakness in battle');
  for(const choice of [nameJS,originalJS]) {
    check(`var evolutionBuild={pokemon:${choice},moves:[ALL_MOVES.find(m=>m.code===${JSON.stringify(evolutionCode)})],evolutionLoadouts:[]};syncEvolutionLoadouts(evolutionBuild)`);
    assert.equal(check('evolutionBuild.evolutionLoadouts[0].pokemon'),target);
  }
  check('saveBuilds();saveBattle();applyModernCatalog(PLAKORO_BUNDLE)');
  assert.equal(check(`getPokemonBlock(${nameJS}).pokemon.code`),modernCode);
  assert.equal(check(`getPokemonBlock(${originalJS}).pokemon.code`),originalCode);
  const reload=boot(new Map(versionApp.saved));reload.run('loadBuilds();loadBattle()');
  assert.equal(reload.run('players[0].pokemon'),name);
  assert.equal(reload.run('players[1].pokemon'),original);
  assert.equal(reload.run('battle.fighters[0].pokemon'),name);
  assert.equal(reload.run('battle.fighters[1].loadouts[0].pokemon'),original);
  assert.equal(reload.run('fighterMeta(battle.fighters[0]).weakness'),weakness);
  assert.equal(reload.run('fighterMeta(battle.fighters[1]).weakness'),'');
}

// Version 1 already separated Pikachu; do not turn a selected 2026 Pikachu into 1997.
for (const version of [0,1]) {
  const legacy=boot();legacy.run(`
    chronicleMode=true;
    players=['Bulbasaur','Squirtle'].map(pokemon=>({pokemon,moves:movesForPokemon(pokemon).filter(m=>!m.action&&!m.special).slice(0,4),evolutionLoadouts:[]}));
    battle=makeBattleState(players.map((p,i)=>freshFighter(p,i)),'single',true);
    saveBuilds();saveBattle();
  `);
  const builds=JSON.parse(legacy.saved.get(buildKey));builds.pokemonChoicesVersion=version;
  builds.formatSetups.double={players:[{pokemon:'Pikachu',moves:[],evolutionLoadouts:[]},...structuredClone(builds.players)],chronicleMode:true};
  builds.formatSetups['league-single']={players:Array.from({length:12},(_,i)=>structuredClone(builds.players[i%2])),chronicleMode:true};
  builds.formatSetups['league-double']={players:structuredClone(builds.players),chronicleMode:false};
  legacy.saved.set(buildKey,JSON.stringify(builds));
  const combat=JSON.parse(legacy.saved.get(battleKey));combat.pokemonChoicesVersion=version;combat.snapshot=structuredClone(combat);
  legacy.saved.set(battleKey,JSON.stringify(combat));
  const migrated=boot(new Map(legacy.saved));migrated.run('loadBuilds();loadBattle()');
  assert.equal(migrated.run('players[0].pokemon'),'Bulbasaur (1997)');
  assert.equal(migrated.run('players[1].pokemon'),'Squirtle (1997)');
  assert.equal(migrated.run('formatSetups.double.players[0].pokemon'),version===0?'Pikachu (1997)':'Pikachu');
  assert(migrated.run('formatSetups["league-single"].players.every(p=>p.pokemon.endsWith(" (1997)"))'));
  assert.equal(migrated.run('formatSetups["league-double"].players[0].pokemon'),'Bulbasaur');
  migrated.run('undoBattle()');
  assert.equal(migrated.run('battle.fighters[0].loadouts[0].pokemon'),'Bulbasaur (1997)');
  assert.equal(migrated.run('battle.fighters[1].pokemon'),'Squirtle (1997)');
  migrated.run('players[0].pokemon="Bulbasaur";players[1].pokemon="Squirtle";saveBuilds()');
  const later=boot(new Map(migrated.saved));later.run('loadBuilds()');
  assert.equal(later.run('players[0].pokemon'),'Bulbasaur');
  assert.equal(later.run('players[1].pokemon'),'Squirtle');
  legacy.saved.set(run('CHRONICLE_KEY'),'0');combat.chronicle=false;combat.fighters.forEach(f=>f.chronicle=false);combat.snapshot=null;legacy.saved.set(battleKey,JSON.stringify(combat));
  const modern=boot(new Map(legacy.saved));modern.run('loadBuilds();loadBattle()');
  assert.equal(modern.run('players[0].pokemon'),'Bulbasaur');
  assert.equal(modern.run('battle.fighters[1].pokemon'),'Squirtle');
}
console.log('PASS: separate 2026/1997 Pikachu, Bulbasaur and Squirtle cards/stats; shared moves, evolution, automatic updates, save/reload, versioned migration and undo.');
