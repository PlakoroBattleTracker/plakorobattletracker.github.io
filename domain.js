const CHRONICLE_KEY='plakoro-chronicle-mode-v1';
let chronicleMode=false;
Object.entries(CHRONICLE_DB.pokemon).forEach(([n,b])=>{if(!DATA.pokemon[n])DATA.pokemon[n]=b});
Object.entries(CHRONICLE_DB.pokemon).forEach(([n,b])=>{if(!POKEMON_META[n])POKEMON_META[n]={hp:b.pokemon.hp||120,type:b.pokemon.type||'normal',weakness:b.pokemon.weakness||''}});
function allChronicleNames(){return Array.from(new Set([...DATA.order,...CHRONICLE_DB.order]))}
function isChronicleOnlyPokemon(name){return CHRONICLE_DB.order.includes(name)}
function getPokemonBlock(name,legacy=chronicleMode){return (legacy?CHRONICLE_DB.pokemon[name]:null)||DATA.pokemon[name]||CHRONICLE_DB.pokemon[name]}
function pokemonMeta(name,legacy=chronicleMode){return (legacy?CHRONICLE_DB.pokemon[name]?.pokemon:null)||POKEMON_META[name]||{hp:120,type:'normal',weakness:''}}
function cleanMoveName(name){return name==null?name:String(name).replace(/[?？]/g,'').replace(/\s+/g,' ').trim()}
function hydrateMove(m){if(!m)return m;const found=ALL_MOVES.find(x=>(m.code&&x.code===m.code)||x.image===m.image)||m;found.name=cleanMoveName(found.name);return found}
function legacyNameKey(name){return String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()}
function legacySpeciesKey(name){return legacyNameKey(name).replace(/^(?:(?:normal|strong|legendary)\s+)+/,'').replace(/\s*\((?:normal|strong|legendary)\)$/,'')}
function sharesLegacyMoves(pokemon,owner){
 const target=legacyNameKey(pokemon),source=legacyNameKey(owner);
 // Surfing Pikachu may borrow from any Pikachu version. The reverse
 // permission is deliberately absent, including for other special forms.
 if(source==='surfing pikachu')return target==='surfing pikachu';
 if(target==='surfing pikachu')return /\bpikachu\b/.test(source);
 return legacySpeciesKey(pokemon)===legacySpeciesKey(owner);
}
function movesForPokemon(name,isEvolutionLoadout=false){
 const base=(DATA.pokemon[name]?.moves||[]).filter(m=>!m.chronicle);
 if(!chronicleMode)return base;
 const owners=[...new Set([name,...DATA.order,...Object.keys(CHRONICLE_DB.movePools)])].filter(owner=>sharesLegacyMoves(name,owner));
 const seen=new Set(),out=[];
 for(const owner of owners){
  const pool=[...(DATA.pokemon[owner]?.moves||[]).filter(m=>!m.chronicle),...(CHRONICLE_DB.movePools[owner]||[])];
  for(const move of pool){
   const id=move.code||move.image||`${owner}|${move.name}`;
   if(seen.has(id)||(!isEvolutionLoadout&&move.action==='devolve'))continue;
   seen.add(id);out.push(move);
  }
 }
 return out;
}
function hasTrigger(loadout){return (loadout?.moves||[]).map(hydrateMove).find(m=>m.action==='evolve')||null}
function eeveeEvolutionTargets(p){return p.pokemon==='Eevee'?(hasTrigger(p)?.targets||[]):[]}
function allowsEeveeAlternates(p){
 const targets=eeveeEvolutionTargets(p),loads=p.evolutionLoadouts||[];
 return targets.includes(loads[0]?.pokemon)&&loads.some(l=>targets.includes(l.pokemon)&&(l.moves||[]).some(m=>hydrateMove(m)?.action==='devolve'&&hydrateMove(m).targets?.includes('Eevee')));
}
function availableEeveeForms(p,l){
 const used=new Set((p.evolutionLoadouts||[]).filter(x=>x!==l).map(x=>x.pokemon));
 return eeveeEvolutionTargets(p).filter(name=>!used.has(name));
}
function addEeveeAlternate(){
 const p=cur();syncEvolutionLoadouts(p);
 if(!allowsEeveeAlternates(p)||p.evolutionLoadouts.length>=3)return;
 p.evolutionLoadouts.push({kind:'eevee-alternate',pokemon:null,moves:[]});
 const index=p.evolutionLoadouts.length-1;
 tableView=false;renderBuilder();
 const section=$('evolutionLoadout'+index);
 section?.focus({preventScroll:true});
 section?.scrollIntoView({behavior:'smooth',block:'start'});
}
function removeEeveeAlternate(index){
 const p=cur();if(p.evolutionLoadouts[index]?.kind!=='eevee-alternate')return;
 p.evolutionLoadouts.splice(index,1);renderBuilder();
}
function syncEvolutionLoadouts(p){
 if(!chronicleMode)return;
 const old=Array.isArray(p.evolutionLoadouts)?p.evolutionLoadouts:[],next=[];
 const eeveeTargets=eeveeEvolutionTargets(p);
 let src=p;
 for(let i=0;;i++){
  const trig=hasTrigger(src);if(!trig)break;
  const allowed=trig.targets||[];
  const l=old[i]||{pokemon:null,moves:[]};
  delete l.kind;l.moves=(l.moves||[]).map(hydrateMove).slice(0,4);
  if(!allowed.includes(l.pokemon)){l.pokemon=allowed.length===1?allowed[0]:null;l.moves=[]}
  next.push(l);src=l;
  if(eeveeTargets.length)break;
 }
 // A Devolve move reuses the original Eevee. Only the other evolution
 // forms may occupy optional slots; migrate old Eevee/branch chains too.
 if(eeveeTargets.length&&allowsEeveeAlternates({...p,evolutionLoadouts:[...next,...old.slice(1)]})){
  const used=new Set(next.map(l=>l.pokemon).filter(Boolean));
  for(const l of old.slice(1)){
   if(next.length>=3)break;
   if(l.kind!=='eevee-alternate'&&!eeveeTargets.includes(l.pokemon))continue;
   if(l.pokemon&&used.has(l.pokemon))continue;
   const remaining=eeveeTargets.filter(name=>!used.has(name));
   l.kind='eevee-alternate';l.moves=(l.moves||[]).map(hydrateMove).slice(0,4);
   if(!remaining.includes(l.pokemon)){l.pokemon=remaining.length===1?remaining[0]:null;l.moves=[]}
   if(l.pokemon)used.add(l.pokemon);
   next.push(l);
  }
 }
 p.evolutionLoadouts=next;
}
function isLoadoutComplete(l){return !!l?.pokemon&&Array.isArray(l.moves)&&l.moves.length===4&&l.moves.filter(m=>hydrateMove(m).special).length<=1}
function loadoutLabel(i,l){return `${l?.kind==='eevee-alternate'?'Alternate Evolution '+i:'Evolution Loadout '+(i+1)}${l?.pokemon?' · '+l.pokemon:''}`}
const BUILD_KEY='plakoro-multiplayer-builds-v3';
const BATTLE_KEY='plakoro-battle-state-v1';
const BATTLE_FORMATS = {
  single: {
    label:"Single Battle", summary:"Two players · one Pokémon each",
    rules:"Each trainer brings one Pokémon and four attacks. The opening trainer rolls two Enekoro on the first turn; later turns use three.",
    units:[
      {id:"a1",controller:"a",team:"A",label:"Trainer A",controllerLabel:"Trainer A"},
      {id:"b1",controller:"b",team:"B",label:"Trainer B",controllerLabel:"Trainer B"}
    ], turnOrder:["a","b"]
  },
  double: {
    label:"Double Battle", summary:"Two players · two Pokémon each",
    rules:"Each player brings two Pokémon and eight attacks. Choose one Pokémon to attack each turn, alternate Pokémon while both are able, roll that Pokémon’s Characoro and any three of your six Enekoro, and target either opposing Pokémon.",
    units:[
      {id:"a1",controller:"a",team:"A",label:"Player A · Pokémon 1",controllerLabel:"Player A"},
      {id:"a2",controller:"a",team:"A",label:"Player A · Pokémon 2",controllerLabel:"Player A"},
      {id:"b1",controller:"b",team:"B",label:"Player B · Pokémon 1",controllerLabel:"Player B"},
      {id:"b2",controller:"b",team:"B",label:"Player B · Pokémon 2",controllerLabel:"Player B"}
    ], turnOrder:["a","b"]
  },
  team: {
    label:"2v2 Team Battle", summary:"Two teams · two players per team",
    rules:"Each player brings one Pokémon and four attacks. Turn order is A1 → B1 → A2 → B2. Attack either opposing Pokémon. Teammates cannot use the same Pokémon.",
    units:[
      {id:"a1",controller:"a1c",team:"A",label:"Team A · Player 1",controllerLabel:"A1"},
      {id:"b1",controller:"b1c",team:"B",label:"Team B · Player 1",controllerLabel:"B1"},
      {id:"a2",controller:"a2c",team:"A",label:"Team A · Player 2",controllerLabel:"A2"},
      {id:"b2",controller:"b2c",team:"B",label:"Team B · Player 2",controllerLabel:"B2"}
    ], turnOrder:["a1c","b1c","a2c","b2c"]
  },
  royale3: {
    label:"3-Player Battle Royale", summary:"Three players · free-for-all",
    rules:"Each player brings one Pokémon and four attacks. Every player rolls two Enekoro on their first turn, then three. Target any surviving opponent, but the player targeted by the previous attack cannot be targeted again when another choice remains.",
    units:[
      {id:"p1",controller:"p1c",team:"P1",label:"Player 1",controllerLabel:"Player 1"},
      {id:"p2",controller:"p2c",team:"P2",label:"Player 2",controllerLabel:"Player 2"},
      {id:"p3",controller:"p3c",team:"P3",label:"Player 3",controllerLabel:"Player 3"}
    ], turnOrder:["p1c","p2c","p3c"]
  },
  royale4: {
    label:"4-Player Battle Royale", summary:"Four players · free-for-all",
    rules:"Each player brings one Pokémon and four attacks. Every player rolls two Enekoro on their first turn, then three. Target any surviving opponent, but the player targeted by the previous attack cannot be targeted again when another choice remains.",
    units:[
      {id:"p1",controller:"p1c",team:"P1",label:"Player 1",controllerLabel:"Player 1"},
      {id:"p2",controller:"p2c",team:"P2",label:"Player 2",controllerLabel:"Player 2"},
      {id:"p3",controller:"p3c",team:"P3",label:"Player 3",controllerLabel:"Player 3"},
      {id:"p4",controller:"p4c",team:"P4",label:"Player 4",controllerLabel:"Player 4"}
    ], turnOrder:["p1c","p2c","p3c","p4c"]
  }
};
let battleFormat='single',formatSetups={};
let players=[emptyBuild(),emptyBuild()],active=0,mode='formats';
let battle=null;
let tableView=null;
const landscapeQuery=window.matchMedia('(orientation:landscape) and (pointer:coarse)');
const $=id=>document.getElementById(id);
function cleanPlayer(p){const q={enekoroNotes:String(p?.enekoroNotes||'').slice(0,120),pokemon:p&&getPokemonBlock(p.pokemon)?p.pokemon:null,moves:Array.isArray(p&&p.moves)?p.moves.filter(m=>m&&m.name&&m.image).map(hydrateMove).slice(0,4):[],evolutionLoadouts:Array.isArray(p&&p.evolutionLoadouts)?p.evolutionLoadouts.map(l=>({kind:l?.kind==='eevee-alternate'?'eevee-alternate':undefined,pokemon:l&&getPokemonBlock(l.pokemon)?l.pokemon:null,moves:Array.isArray(l&&l.moves)?l.moves.filter(m=>m&&m.name&&m.image).map(hydrateMove).slice(0,4):[]})):[]};return q}
function emptyBuild(){return {pokemon:null,moves:[],evolutionLoadouts:[]}}
function inferFormat(count){return count===4?'royale4':count===3?'royale3':'single'}
function formatDefinition(format=battleFormat){return BATTLE_FORMATS[format]||BATTLE_FORMATS.single}
function slotLabel(index,format=battleFormat){return formatDefinition(format).units[index]?.label||`Player ${index+1}`}
function isRoyaleFormat(format=battleFormat){return format==='royale3'||format==='royale4'}
function fighterLabel(f){return f?.label||`Player ${(f?.playerIndex||0)+1}`}
function loadBuilds(){
 try{
  chronicleMode=localStorage.getItem(CHRONICLE_KEY)==='1';
  const saved=JSON.parse(localStorage.getItem(BUILD_KEY)||localStorage.getItem('plakoro-multiplayer-builds-v2')||'null');
  if(!saved||!Array.isArray(saved.players)||!saved.players.length)return;
  battleFormat=BATTLE_FORMATS[saved.battleFormat]?saved.battleFormat:inferFormat(saved.players.length);
  for(const [key,value] of Object.entries(saved.formatSetups||{}))if(BATTLE_FORMATS[key]&&Array.isArray(value?.players))formatSetups[key]=value;
  const count=formatDefinition().units.length;
  players=Array.from({length:count},(_,i)=>cleanPlayer(saved.players[i]||emptyBuild()));
  leagueSetup=restoreLeagueSetup(formatSetups[battleFormat]?.leagueSetup,true);
  active=Math.min(Math.max(+saved.active||0,0),players.length-1);players.forEach(syncEvolutionLoadouts);saveBuilds();
 }catch(e){}
}

function saveBuilds(){try{
 formatSetups[battleFormat]={players:players.map(cleanPlayer),active,chronicleMode,leagueSetup:isLeagueFormat()?clone(leagueSetup):undefined};
 localStorage.setItem(BUILD_KEY,JSON.stringify({players,active,battleFormat,formatSetups}));
 localStorage.setItem(CHRONICLE_KEY,chronicleMode?'1':'0');
}catch(e){}}
function chooseBattleFormat(format,resume=false){
 if(!BATTLE_FORMATS[format])return;
 saveBuilds();const saved=formatSetups[format];battleFormat=format;
 players=Array.from({length:formatDefinition().units.length},(_,i)=>cleanPlayer(saved?.players?.[i]||emptyBuild()));
 leagueSetup=restoreLeagueSetup(saved?.leagueSetup,true);
 active=Math.min(saved?.active||0,players.length-1);
 if(typeof saved?.chronicleMode==='boolean')chronicleMode=saved.chronicleMode;
 if(resume&&battle)chronicleMode=battle.chronicle;
 tableView=false;players.forEach(syncEvolutionLoadouts);
 setMode(resume?'battle':chronicleMode?'chronicle':'builder');
}
function resizeRoyale(count){
 if(!isRoyaleFormat()||![3,4].includes(count))return;
 const current=players.map(cleanPlayer);saveBuilds();battleFormat='royale'+count;
 const cached=formatSetups[battleFormat]?.players||[];
 players=Array.from({length:count},(_,i)=>cleanPlayer(current[i]||cached[i]||emptyBuild()));
 active=Math.min(active,count-1);tableView=false;renderBuilder();
}
function setupError(){
 if(isLeagueFormat())return leagueSetupError();
 if(players.length!==formatDefinition().units.length||!players.every(isComplete))return 'Complete each Pokémon and all of its four-move loadouts first.';
 if(battleFormat==='team'){
  for(const team of ['A','B']){
   const names=players.filter((_,i)=>formatDefinition().units[i].team===team).map(p=>p.pokemon);
   if(new Set(names).size!==names.length)return `Team ${team} cannot use the same Pokémon twice.`;
  }
 }
 return '';
}
function isComplete(p){if(!chronicleMode)return DATA.order.includes(p.pokemon)&&p.moves.length===4&&p.moves.every(m=>{const card=hydrateMove(m);return !card.chronicle&&(!card.owner||card.owner===p.pokemon)});syncEvolutionLoadouts(p);return isLoadoutComplete(p)&&(p.evolutionLoadouts||[]).every(isLoadoutComplete)}
function cur(){return players[active]}
function freshFighter(p,i,format=battleFormat,chronicle=chronicleMode){
 const meta=pokemonMeta(p.pokemon,chronicle);
 const loads=[{pokemon:p.pokemon,moves:p.moves.map(hydrateMove)},...(chronicle?p.evolutionLoadouts||[]:[]).map(l=>({pokemon:l.pokemon,moves:l.moves.map(hydrateMove)}))];
 return {...formatDefinition(format).units[i],playerIndex:i,chronicle:!!chronicle,pokemon:p.pokemon,moves:p.moves.map(m=>hydrateMove({...m})),loadouts:loads,loadoutIndex:0,turnsTaken:0,baseEnergyDice:null,hp:meta.hp,maxHp:meta.hp,lastMove:null,lastMoveFailed:false,energyMod:0,charBlocked:false,incomingMod:0,incomingSet:null,bannedMoves:[],ko:false};
}
function makeBattleState(fighters,format,chronicle){return {format,chronicle,phase:'chooseFirst',fighters,activeController:null,lastActiveUnits:{},lastTargetIndex:null,turnIndex:null,turnNumber:0,targetIndex:null,selectedMove:null,log:[],winner:null,winnerTeam:null,repeat:false,snapshot:null}}

function newBattle(){if(isLeagueFormat())return newLeagueBattle();if(setupError())return null;return makeBattleState(players.map((p,i)=>freshFighter(p,i)),battleFormat,chronicleMode)}
function rematchBattle(){
 if(isLeagueFormat(battle?.format)){rematchLeagueBattle();return;}
 const old=battle;
 battle=null;if(typeof cardUpdater!=='undefined')cardUpdater?.maybeApply();
 const fighters=old.fighters.map((f,i)=>freshFighter({...f.loadouts[0],evolutionLoadouts:f.loadouts.slice(1)},i,old.format,old.chronicle));
 battle=makeBattleState(fighters,old.format,old.chronicle);saveBattle();renderBattle();
}
function normalizeBattleFormat(b){
 if(isLeagueFormat(b.format))return normalizeLeagueBattle(b);
 if(!BATTLE_FORMATS[b.format]||formatDefinition(b.format).units.length!==b.fighters.length)b.format=inferFormat(b.fighters.length);
 if(typeof b.chronicle!=='boolean')b.chronicle=b.fighters.some(f=>f.loadouts?.length>1||f.moves.some(m=>m.chronicle));
 b.lastActiveUnits=b.lastActiveUnits||{};b.lastTargetIndex??=null;
 b.fighters.forEach((f,i)=>{Object.assign(f,formatDefinition(b.format).units[i]);f.turnsTaken??=f.lastMove?1:0});
 b.activeController??=b.fighters[b.turnIndex]?.controller||null;
 if(b.phase==='winner'&&b.winner!==null)b.winnerTeam=b.fighters[b.winner]?.team;
 return b;
}
function legalTargets(index=battle.turnIndex){
 const f=battle.fighters[index];if(!f)return [];
 const candidates=living().filter(i=>battle.fighters[i].team!==f.team);
 if(!isRoyaleFormat(battle.format)||battle.lastTargetIndex===null)return candidates;
 const other=candidates.filter(i=>i!==battle.lastTargetIndex);return other.length?other:candidates;
}
function availableAttackers(controller=battle.activeController){
 const candidates=living().filter(i=>battle.fighters[i].controller===controller);
 if(!isDoubleFormat(battle.format)||candidates.length<2)return candidates;
 return candidates.filter(i=>i!==battle.lastActiveUnits[controller]);
}
function nextController(controller){
 const order=formatDefinition(battle.format).turnOrder,start=order.indexOf(controller);
 for(let step=1;step<=order.length;step++){
  const id=order[(start+step)%order.length];
  if(living().some(i=>battle.fighters[i].controller===id))return id;
 }
 return null;
}
function startControllerTurn(controller){
 battle.activeController=controller;const choices=availableAttackers(controller);
 battle.turnIndex=choices.length===1?choices[0]:null;battle.phase=choices.length===1?'turn':'chooseAttacker';
 battle.targetIndex=null;battle.selectedMove=null;battle.transitionTarget=null;
 battle.borrowedMove=null;battle.borrowEnergy=null;battle.borrowDice=null;
 consumeSkippedTurn();
}
function consumeSkippedTurn(){
 const f=battle.fighters[battle.turnIndex];if(!f?.skipTurns)return false;
 f.skipTurns--;f.energyMod=0;f.energySymbols=0;f.energyMultipliers={};f.chibiBlocked=false;f.attackMod=0;f.charBlocked=false;f.fixedOrientation=null;f.chooseOrientation=false;f.failureOrientations=[];f.bannedMoves=[];f.forcedMove=null;f.rerolls=0;f.rerollEnergy=0;
 addLog(`${fighterLabel(f)} · ${f.pokemon} skips this turn.`);finishFormatTurn(battle.turnIndex,battle.lastTargetIndex);return true;
}
function finishFormatTurn(ai,ti){
 const f=battle.fighters[ai];f.turnsTaken++;
 battle.lastActiveUnits[f.controller]=ai;if(isRoyaleFormat(battle.format))battle.lastTargetIndex=ti;
 battle.turnNumber++;startControllerTurn(nextController(f.controller));
}
function energyDiceFor(f){
 if(battle.borrowedMove&&f===battle.fighters[battle.turnIndex])return Math.max(0,(battle.borrowDice??3)+(battle.borrowEnergy||0));
 const base=(battle.format==='single'||battle.format==='league-single')?(battle.turnNumber===0?2:3):isRoyaleFormat(battle.format)?(f.turnsTaken===0?2:3):3;
 return Math.max(0,(f.baseEnergyDice??base)+(f.energyMod||0));
}
function checkBattleWinner(){
 const alive=isLeagueFormat(battle.format)?leagueSurvivors():living(),teams=[...new Set(alive.map(i=>battle.fighters[i].team))];
 if(teams.length>1)return false;
 battle.phase='winner';battle.winner=alive.length?alive[0]:null;battle.winnerTeam=teams[0]||null;battle.repeat=false;return true;
}
function battleWinnerLabel(){
 if(battle.winner===null)return 'Battle Draw';
 if(battle.format==='team')return `Team ${battle.winnerTeam} Wins!`;
 const f=battle.fighters[battle.winner];return `${f.controllerLabel} Wins!`;
}

function saveBattle(){try{if(battle)localStorage.setItem(BATTLE_KEY,JSON.stringify(battle));else localStorage.removeItem(BATTLE_KEY)}catch(e){}}
function normalizeBattleLoadouts(b){
 normalizeBattleFormat(b);
 for(const f of b.fighters||[]){f.lastMove=cleanMoveName(f.lastMove);f.bannedMoves=(f.bannedMoves||[]).map(cleanMoveName);f.moves=f.moves.map(hydrateMove);f.loadouts?.forEach(l=>l.moves=l.moves.map(hydrateMove));}
 for(const f of b.fighters||[]){
  const root=f.loadouts?.[0];if(root?.pokemon!=='Eevee')continue;
  const allowed=hasTrigger(root)?.targets||[],seen=new Set(['Eevee']),loads=[root];
  for(const l of f.loadouts.slice(1)){
   if(!allowed.includes(l.pokemon)||seen.has(l.pokemon))continue;
   loads.push(l);seen.add(l.pokemon);
  }
  const index=loads.findIndex(l=>l.pokemon===f.pokemon);
  if(index<0)continue;
  const changed=loads.length!==f.loadouts.length;
  f.loadouts=loads;f.loadoutIndex=index;f.moves=loads[index].moves.map(hydrateMove);
  if(changed&&f.pokemon==='Eevee'&&b.turnIndex===f.playerIndex)b.selectedMove=null;
 }
 return b;
}
function loadBattle(){try{const b=JSON.parse(localStorage.getItem(BATTLE_KEY)||'null');if(b&&Array.isArray(b.fighters)&&b.fighters.length>=2&&(b.fighters.length<=4||isLeagueFormat(b.format)))battle=normalizeBattleLoadouts(b)}catch(e){}}
function living(){return fieldIndices().filter(i=>!battle.fighters[i].ko&&battle.fighters[i].hp>0)}
function nextLivingFrom(i){const n=battle.fighters.length;for(let k=1;k<=n;k++){const j=(i+k)%n;if(!battle.fighters[j].ko&&battle.fighters[j].hp>0)return j}return null}
function addLog(text){battle.log.unshift(text);battle.log=battle.log.slice(0,60)}
function fighterMeta(f){return pokemonMeta(f.pokemon,f.chronicle??battle?.chronicle??chronicleMode)}
function moveMeta(f,m){if(m&&m.chronicle){const ec=m.energyCost||{};const type=Object.keys(ec).find(k=>k!=='normal'&&Number(ec[k])>0)||fighterMeta(f).type;return{damage:(Number(m.damage)||0)*10,type}}return MOVE_META[f.pokemon+'|'+m.name]||{damage:0,type:fighterMeta(f).type}}
function transitionChoices(f,m){
 if(!m?.action||!Array.isArray(f.loadouts))return [];
 const matches=f.loadouts.map((l,i)=>({l,i})).filter(({l,i})=>i!==f.loadoutIndex&&m.targets?.includes(l.pokemon)&&isLoadoutComplete(l));
 if(m.action==='devolve')return matches.length?[matches[0].i]:[];
 if(f.pokemon==='Eevee'){
  const seen=new Set();return matches.filter(({l})=>{if(seen.has(l.pokemon))return false;seen.add(l.pokemon);return true}).map(({i})=>i);
 }
 const next=(f.loadoutIndex||0)+1;return matches.some(({i})=>i===next)?[next]:[];
}
function applyChronicleTransition(f,m,chosenIndex){
 const choices=transitionChoices(f,m),ni=choices.length===1?choices[0]:chosenIndex;
 if(!choices.includes(ni))return false;
 const n=f.loadouts[ni];f.loadoutIndex=ni;f.pokemon=n.pokemon;f.moves=n.moves.map(hydrateMove);
 const meta=fighterMeta(f);f.maxHp=m.maxHp||meta.hp||120;
 f.hp=Math.min(f.maxHp,f.hp);if(m.energyDice!=null)f.baseEnergyDice=m.energyDice;
 f.lastMove=null;f.bannedMoves=[];addLog(`${fighterLabel(f)} switched to ${f.pokemon} via ${m.name}.`);return true;
}
