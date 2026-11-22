import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=import.meta.dirname;
function boot(saved=new Map()){
 const context=vm.createContext({console,window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>null},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},render(){},renderBattle(){},renderBuilder(){},showImpact(){},setMode(){}});
 for(const file of ['data.js','plakorodb-source.js','domain.js','engine.js','league.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 const run=s=>vm.runInContext(s,context);
 run(`function fixture(format='league-single'){
  chronicleMode=false;battleFormat=format;
  const names=['Pikachu','Charmander','Bulbasaur','Eevee','Mew','Squirtle'];
  players=Array.from({length:12},(_,i)=>({pokemon:names[i%6],moves:DATA.pokemon[names[i%6]].moves.slice(0,4),evolutionLoadouts:[],enekoroNotes:'Dice set '+i}));
  const n=leagueTeamSize();leagueSetup={phase:'ready',selected:{a:Array.from({length:n},(_,i)=>i),b:Array.from({length:n},(_,i)=>i+6)},locked:{a:true,b:true}};
  battle=newBattle();startControllerTurn('a');if(battle.turnIndex===null){battle.turnIndex=0;battle.phase='turn';}battle.targetIndex=legalTargets()[0];
 }
 function hit(damage=200,recoil=0){const a=battle.fighters[battle.turnIndex];a.moves=[{code:'TEST',name:'Fixture attack',image:'fixture.png',type:'normal',energy:[],baseDamage:damage,effect:recoil?'This Pokemon does '+recoil+' damage to itself.':'',outcomes:[]}];battle.selectedMove=0;battle.phase='resolve';chooseOutcome(-1);}
 `);
 return {run,saved};
}
const h=boot(),run=h.run;
assert.equal(run('ALL_MOVES.filter(m=>/[?？]/.test(m.name)).length'),0,'bundled names are clean');
assert.equal(run('cleanMoveName("  Electric ? Rush？？  ")'),'Electric Rush');
assert.equal(run('hydrateMove({name:"Future ? Move",image:"unknown.png"}).name'),'Future Move');
for(const format of ['league-single','league-double']){
 run(`fixture('${format}')`);const n=format==='league-single'?3:4;
 assert.equal(run('setupError()'),'');assert.equal(run('players.length'),12);assert.equal(run('battle.fighters.length'),n*2);assert.equal(run('fieldIndices().length'),format==='league-single'?2:4);
 assert.equal(run('leagueBench("a").length'),2);assert(run('battle.fighters.every(f=>f.moves.length===4&&!f.moves.some(m=>m.code==="OCW00-000"))'),'SWITCH never occupies a move slot');
 assert(run('legalTargets().every(i=>fieldIndices().includes(i))'),'reserve cannot be targeted');
 assert(run('availableAttackers().every(i=>fieldIndices().includes(i))'),'reserve cannot attack');
 run('leagueSetup.locked.b=false');assert(run('!!setupError()'),'incomplete private setup cannot start');
}
// Public party reveal precedes private picks; excessive / opposing picks are rejected.
run('fixture();leagueSetup=newLeagueSetup();handleLeagueAction("league-reveal");handleLeagueAction("league-begin")');assert.equal(run('leagueSetup.phase'),'handoff-a');
run('handleLeagueAction("league-open-private");[0,1,2,3,6].forEach(i=>handleLeagueAction("league-pick-team",i))');assert.equal(run('leagueSetup.selected.a.join(",")'),'0,1,2');
run('handleLeagueAction("league-confirm-team");saveBuilds()');
let restored=boot(new Map(h.saved));restored.run('loadBuilds()');assert.equal(restored.run('leagueSetup.phase'),'handoff-a','reload conceals private choices');assert.equal(restored.run('leagueSetup.resumePhase'),'moves-a');
run('handleLeagueAction("league-lock")');assert.equal(run('leagueSetup.phase'),'handoff-b');assert(run('leagueSetup.locked.a'));
// A KO does not end the match while healthy selected reserves remain.
run('fixture();hit()');assert.equal(run('battle.phase'),'leagueReplace');assert.equal(run('battle.turnNumber'),0);assert.equal(run('battle.winner'),null);
run('chooseLeagueReplacement(1)');assert.equal(run('battle.phase'),'leagueReplace','cannot replace with opponent');
run('chooseLeagueReplacement(4)');assert.equal(run('battle.league.active.b[0]'),4);assert.equal(run('battle.turnNumber'),1);assert.equal(run('battle.activeController'),'b');assert.equal(run('battle.fighters[3].hp'),0);
run('undoBattle()');assert.equal(run('battle.league.active.b[0]'),3);assert.equal(run('battle.fighters[3].hp'),120);assert.equal(run('battle.turnNumber'),0);
// Multiple KOs (including recoil) pause once and collect both replacements.
run('fixture();hit(200,200)');assert.equal(run('battle.phase'),'leagueReplace');run('chooseLeagueReplacement(1)');assert.equal(run('battle.phase'),'leagueReplace');run('chooseLeagueReplacement(4)');assert.equal(run('battle.activeController'),'b');assert.equal(run('battle.turnNumber'),1);assert.equal(run('fieldIndices().join(",")'),'1,4');
// All selected Pokémon, rather than just the active positions, determine victory.
run('fixture();[4,5].forEach(i=>{battle.fighters[i].hp=0;battle.fighters[i].ko=true});hit()');assert.equal(run('battle.phase'),'winner');assert.equal(run('battle.winnerTeam'),'A');
run('fixture("league-double");[5,6,7].forEach(i=>{battle.fighters[i].hp=0;battle.fighters[i].ko=true});hit()');assert.equal(run('battle.phase'),'winner');assert.equal(run('battle.winnerTeam'),'A');
// Doubles keeps one living active usable when there are no reserves left.
run('fixture("league-double");[6,7].forEach(i=>{battle.fighters[i].hp=0;battle.fighters[i].ko=true});hit()');assert.equal(run('battle.phase'),'turn');assert.equal(run('battle.turnIndex'),5);
// SWITCH retains health, move history, dice and evolution forms; only Standing attacks.
run('fixture();battle.fighters[0].hp=40;battle.fighters[1].hp=70;beginLeagueSwitch();chooseLeagueSwitch(1)');assert.equal(run('battle.phase'),'leagueSwitchRoll');assert.equal(run('battle.fighters[0].hp'),40);assert.equal(run('battle.fighters[1].hp'),70);assert.equal(run('battle.fighters[1].enekoroNotes'),'Dice set 1');
run('resolveLeagueSwitch("standing")');assert.equal(run('battle.phase'),'turn');assert.equal(run('battle.turnNumber'),0);assert(!run('canLeagueSwitch()'),'only one SWITCH per trainer turn');
run('saveBattle()');restored=boot(new Map(h.saved));restored.run('loadBattle()');assert.equal(restored.run('battle.fighters.length'),6);assert.equal(restored.run('battle.turnIndex'),1);assert.equal(restored.run('battle.fighters[0].hp'),40);assert(!restored.run('canLeagueSwitch()'));
run('undoBattle()');assert.equal(run('battle.turnIndex'),0);assert.equal(run('battle.league.active.a[0]'),0);assert(run('canLeagueSwitch()'));
run('beginLeagueSwitch();chooseLeagueSwitch(1);resolveLeagueSwitch("back")');assert.equal(run('battle.activeController'),'b');assert.equal(run('battle.turnNumber'),1);
run('fixture();battle.fighters[1].ko=true;battle.fighters[1].hp=0;beginLeagueSwitch();chooseLeagueSwitch(1)');assert.equal(run('battle.phase'),'leagueSwitch','KO’d reserve cannot enter');
run('fixture();beginLeagueSwitch();chooseLeagueSwitch(1);battle.fighters[1].fixedOrientation="down";resolveLeagueSwitch("standing")');assert.equal(run('battle.phase'),'leagueSwitchRoll','fixed orientations respected');run('resolveLeagueSwitch("down")');assert.equal(run('battle.activeController'),'b');
// Doubles alternates active positions after a switch and across KO replacements.
run('fixture("league-double");beginLeagueSwitch();chooseLeagueSwitch(2);resolveLeagueSwitch("standing");finishFormatTurn(2,4);battle.turnIndex=4;battle.phase="turn";finishFormatTurn(4,1)');assert.equal(run('battle.turnIndex'),1);
run('fixture("league-double");battle.lastActiveUnits.b=4;hit();chooseLeagueReplacement(6)');assert.equal(run('battle.turnIndex'),5,'replacement keeps the active-position alternation');
// Evolved Pokémon return with their current form, HP, learned moves and used specials.
run('fixture();battle.fighters[0].pokemon="Charizard";battle.fighters[0].hp=60;battle.fighters[0].maxHp=160;battle.fighters[0].loadoutIndex=2;battle.fighters[0].usedSpecialMoves=["used"];beginLeagueSwitch();chooseLeagueSwitch(1);resolveLeagueSwitch("back");finishFormatTurn(3,1);beginLeagueSwitch();chooseLeagueSwitch(0);resolveLeagueSwitch("standing")');
assert.equal(run('battle.fighters[0].pokemon'),'Charizard');assert.equal(run('battle.fighters[0].hp'),60);assert.equal(run('battle.fighters[0].loadoutIndex'),2);assert.equal(run('battle.fighters[0].usedSpecialMoves[0]'),'used');
// Saved replacement prompts survive restart; rematches start with fresh HP and all reserves.
run('fixture();hit();saveBattle()');restored=boot(new Map(h.saved));restored.run('loadBattle();chooseLeagueReplacement(4)');assert.equal(restored.run('battle.activeController'),'b');restored.run('rematchBattle()');assert.equal(restored.run('battle.phase'),'chooseFirst');assert.equal(restored.run('battle.league.active.b[0]'),3);assert(restored.run('battle.fighters.every(f=>f.hp===f.maxHp&&!f.ko)'));
run('fixture();adjustHp(3,-200)');assert.equal(run('battle.phase'),'leagueReplace');run('chooseLeagueReplacement(4)');assert.equal(run('battle.activeController'),'a','manual replacement does not consume the current turn');run('undoBattle()');assert.equal(run('battle.fighters[3].hp'),120);
console.log('PASS: League party reveal, secret 3/4 selection, save/reload privacy, reserves, SWITCH outcomes, KO replacement queues, doubles alternation, evolution persistence, wins, undo, rematches and move-name cleanup.');
