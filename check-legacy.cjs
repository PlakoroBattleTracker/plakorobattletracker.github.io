const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot(saved = new Map()) {
  const context = vm.createContext({
    console,
    window: { matchMedia: () => ({ matches: false }) },
    document: { getElementById: () => null },
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: key => saved.delete(key),
    },
    render() {}, renderBattle() {}, renderBuilder() {}, showImpact() {},
  });
  for (const file of ['data.js', 'plakorodb-source.js', 'domain.js', 'engine.js', 'league.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  return { run: source => vm.runInContext(source, context), saved };
}

const app = boot();
const run = app.run;
const codes = name => JSON.parse(run(`JSON.stringify(movesForPokemon(${JSON.stringify(name)}).map(m=>m.code).sort())`));
const original = codes('Pikachu');
assert.equal(original.length, 8);
run('chronicleMode=true');
const pikachu = codes('Pikachu');
const strong = codes('Strong Pikachu');
assert.deepEqual(pikachu, strong, 'Normal and Strong Pikachu share the entire pool in both directions');
assert.equal(pikachu.length, 42);
assert(pikachu.includes('OGW37-001'), 'Pikachu can use Strong Pikachu Bite');
assert(strong.includes('STW04-001'), 'Strong Pikachu can use modern Pikachu Gnaw');
assert(strong.includes('OGW01-001'), 'Strong Pikachu can use original Pikachu cards');
assert.equal(new Set(pikachu).size, pikachu.length, 'Shared cards appear once by stable card ID');
assert(!codes('Charmander').includes('OGW37-001'), 'Unrelated species remain separate');
assert(!codes('Charmeleon').includes('OGW05-001'), 'Evolution stages do not share species pools');
assert(run('movesForPokemon("Pikachu").find(m=>m.code==="OGW37-001")===ALL_MOVES.find(m=>m.code==="OGW37-001")'), 'Sharing preserves the source card object');

// Shared cards still resolve with their printed damage, type and effects.
run(`
  const normalFighter = freshFighter({pokemon:'Pikachu',moves:[],evolutionLoadouts:[]},0);
  const strongFighter = freshFighter({pokemon:'Strong Pikachu',moves:[],evolutionLoadouts:[]},0);
  const targetFighter = freshFighter({pokemon:'Squirtle',moves:[],evolutionLoadouts:[]},1);
  const strongBite = movesForPokemon('Pikachu').find(m=>m.code==='OGW37-001');
  const normalGnaw = movesForPokemon('Strong Pikachu').find(m=>m.code==='STW04-001');
`);
assert.equal(run('buildOutcome(normalFighter,targetFighter,strongBite,0).damage'), 30);
assert.equal(run('buildOutcome(normalFighter,targetFighter,strongBite,0).selfDamage'), 10);
assert.equal(run('buildOutcome(strongFighter,targetFighter,normalGnaw,0).damage'), 60);
assert.equal(run('strongBite.owner'), 'Strong Pikachu');

// Shared selections survive save/load and do not remain legal outside Legacy.
run(`
  players=[
    {pokemon:'Pikachu',moves:CHRONICLE_DB.movePools['Strong Pikachu'].slice(0,4),evolutionLoadouts:[]},
    {pokemon:'Strong Pikachu',moves:DATA.pokemon.Pikachu.moves.slice(0,4),evolutionLoadouts:[]}
  ];
  saveBuilds();
`);
const restored = boot(new Map(app.saved));
restored.run('loadBuilds()');
assert(restored.run('players.every(isComplete)'), 'Both shared loadouts remain ready after reload');
assert.equal(restored.run('players[0].moves[0].code'), 'OGW37-001');
assert.equal(restored.run('players[1].moves[0].code'), 'STW04-001');
restored.run('chronicleMode=false');
assert(!restored.run('players[0] && isComplete(players[0])'), 'Borrowed Chronicle cards cannot start a modern battle');
assert(!restored.run('players[1] && isComplete(players[1])'), 'Chronicle-only forms cannot start a modern battle');

// Future catalog additions use the same rules without hardcoded card lists.
run(`
  function fixturePool(owner, code, chronicle=true) {
    const card={...ALL_MOVES.find(m=>m.code==='STW04-001'),owner,code,image:code+'.png',chronicle};
    if(chronicle) CHRONICLE_DB.movePools[owner]=[card];
    else {DATA.order.push(owner);DATA.pokemon[owner]={pokemon:{name:owner},moves:[card]};}
    ALL_MOVES.push(card);
  }
  fixturePool('Legendary Pikachu','TEST-LEGENDARY');
  fixturePool('Surfing Pikachu','TEST-SURFING');
  fixturePool('Flying Pikachu','TEST-FLYING');
  fixturePool('Legendary Mew','TEST-MEW');
  fixturePool('Legendary Eevee','TEST-EEVEE');
  fixturePool('Strong Pikachu (Modern)','TEST-OTHER');
`);
for (const name of ['Pikachu', 'Strong Pikachu', 'Legendary Pikachu']) {
  assert(codes(name).includes('TEST-LEGENDARY'), `${name} can use Legendary Pikachu cards`);
  assert(codes(name).includes('OGW37-001'), `${name} can use Strong Pikachu cards`);
  assert(codes(name).includes('STW04-001'), `${name} can use normal Pikachu cards`);
  assert(!codes(name).includes('TEST-SURFING'), `${name} cannot use Surfing Pikachu cards`);
  assert(!codes(name).includes('TEST-FLYING'), 'Other exclusive forms do not enter the normal/Strong/Legendary pool');
}
const surfing = codes('Surfing Pikachu');
for (const code of ['STW04-001', 'OGW01-001', 'OGW37-001', 'TEST-LEGENDARY', 'TEST-FLYING', 'TEST-SURFING']) {
  assert(surfing.includes(code), `Surfing Pikachu can use ${code}`);
}
assert(!codes('Flying Pikachu').includes('TEST-SURFING'), 'Surfing moves stay exclusive even from other special Pikachu forms');
assert(!surfing.includes('TEST-MEW'), 'Surfing Pikachu cannot borrow unrelated Pokémon moves');
assert(codes('Mew').includes('TEST-MEW'), 'The Legendary rule applies to every species, not just Pikachu');
assert(codes('Eevee').includes('TEST-EEVEE'));
assert(!codes('Flareon').includes('TEST-EEVEE'));
assert(!run('movesForPokemon("Flareon").some(m=>m.action==="devolve")'));
assert(run('movesForPokemon("Flareon",true).some(m=>m.action==="devolve")'));
assert(run('sharesLegacyMoves("Pikachu","Pikachu (Strong)")'));
assert(run('sharesLegacyMoves("  LEGENDARY   Pikachu  ","Pikachu")'));
run('chronicleMode=false');
assert.deepEqual(codes('Pikachu'), original, 'Modern move selection remains unchanged');
run(`fixturePool('Legendary Pikachu','TEST-MODERN-LEGENDARY',false);players[0]={pokemon:'Pikachu',moves:[...DATA.pokemon.Pikachu.moves.slice(0,3),DATA.pokemon['Legendary Pikachu'].moves[0]],evolutionLoadouts:[]}`);
assert(!run('isComplete(players[0])'), 'Borrowed modern variant cards also require Legacy');
run('chronicleMode=true');
assert(codes('Pikachu').includes('TEST-MODERN-LEGENDARY'), 'New modern variant cards join the Legacy pool dynamically');

console.log('PASS: reciprocal normal/Strong/Legendary sharing, all Pikachu forms for Surfing, Surfing exclusivity, modern restrictions, evolution boundaries, save/reload and shared-card combat.');
