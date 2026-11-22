/* League format: six-member parties, private match selection and persistent benches. */
const LEAGUE_RULES='Each trainer prepares six Pokémon and three Enekoro for each. Reveal both parties, then secretly choose three Pokémon for Singles or four for Doubles. Choose four moves for each selected Pokémon. SWITCH is a separate player move: switch an active Pokémon with a healthy reserve, then roll the incoming Pokémon’s Charakoro; Standing lets it attack. At 0 HP a Pokémon is KO’d and must be replaced when a reserve remains. Defeat every Pokémon on the opponent’s selected team to win.';
const LEAGUE_SWITCH={code:'OCW00-000',name:'SWITCH',owner:'PLAYER',sourceUrl:'https://drive.google.com/file/d/1-ARLRQMGcnxVeoMfQO1KfAfkGdswpRxl/view',image:'custom/OCW00-000.png',energy:[],baseDamage:0,type:'normal',effect:'Switch your Active Pokemon with a Pokemon from your Party, then roll your charakoro.',outcomes:[{orientations:['standing'],text:'Your new active Pokemon may make an attack.'}]};
for(const kind of ['single','double'])BATTLE_FORMATS['league-'+kind]={
 label:'League '+(kind==='single'?'Single':'Double')+' Battle',summary:'Bring six · choose '+(kind==='single'?'three':'four'),rules:LEAGUE_RULES,
 units:['a','b'].flatMap(c=>Array.from({length:6},(_,i)=>({id:c+(i+1),controller:c,team:c.toUpperCase(),label:'Trainer '+c.toUpperCase()+' · Party '+(i+1),controllerLabel:'Trainer '+c.toUpperCase()}))),turnOrder:['a','b']
};
function isLeagueFormat(format=battleFormat){return format==='league-single'||format==='league-double'}
function isDoubleFormat(format=battleFormat){return format==='double'||format==='league-double'}
function leagueTeamSize(format=battleFormat){return format==='league-double'?4:3}
function leagueFieldSize(format=battleFormat){return format==='league-double'?2:1}
function newLeagueSetup(){return {phase:'party',selected:{a:[],b:[]},locked:{a:false,b:false}}}
let leagueSetup=newLeagueSetup();
function leaguePartyIndices(c){return Array.from({length:6},(_,i)=>(c==='b'?6:0)+i)}
function leagueSetupController(){return leagueSetup.phase.endsWith('-b')?'b':'a'}
function restoreLeagueSetup(s,conceal=false){
 const next=newLeagueSetup();if(!s||!isLeagueFormat())return next;
 const phases=['party','reveal','handoff-a','select-a','moves-a','handoff-b','select-b','moves-b','ready'];
 if(!phases.includes(s.phase))return next;
 for(const c of ['a','b']){next.selected[c]=[...new Set((s.selected?.[c]||[]).filter(i=>Number.isInteger(i)&&leaguePartyIndices(c).includes(i)))].slice(0,leagueTeamSize());next.locked[c]=!!s.locked?.[c];}
 next.phase=s.phase;next.resumePhase=s.resumePhase;
 if(conceal&&/^(select|moves)-/.test(next.phase)){next.resumePhase=next.phase;next.phase='handoff-'+next.phase.slice(-1);}
 return next;
}
function concealLeagueSetup(){if(isLeagueFormat()&&/^(select|moves)-/.test(leagueSetup.phase)){leagueSetup.resumePhase=leagueSetup.phase;leagueSetup.phase='handoff-'+leagueSetupController();saveBuilds();}}
function leaguePartyReady(){return players.length===12&&players.every(p=>p.pokemon&&(chronicleMode?allChronicleNames():DATA.order).includes(p.pokemon))}
function leagueSelectionComplete(c){const s=leagueSetup.selected[c];return s.length===leagueTeamSize()&&s.every(i=>isComplete(players[i]))}
function leagueSetupError(){return !leaguePartyReady()?'Prepare six Pokémon for each trainer.':leagueSetup.phase!=='ready'||!['a','b'].every(c=>leagueSetup.locked[c]&&leagueSelectionComplete(c))?'Both trainers must lock their selected Pokémon and moves.':''}
function leagueCanEdit(index){return leagueSetup.phase==='party'||leagueSetup.phase.startsWith('moves-')&&leagueSetup.selected[leagueSetupController()].includes(index)}
function newLeagueBattle(){
 if(leagueSetupError())return null;
 const selected=[...leagueSetup.selected.a,...leagueSetup.selected.b],n=leagueTeamSize(),field=leagueFieldSize();
 const fighters=selected.map(i=>({...freshFighter(players[i],i),sourcePartyIndex:i,enekoroNotes:players[i].enekoroNotes||''}));
 const b=makeBattleState(fighters,battleFormat,chronicleMode);
 b.league={active:{a:Array.from({length:field},(_,i)=>i),b:Array.from({length:field},(_,i)=>n+i)},startingBuilds:selected.map(i=>cleanPlayer(players[i])),sourceIndices:selected,switchUsedTurn:-1};
 return b;
}
function fieldIndices(b=battle){return isLeagueFormat(b?.format)?['a','b'].flatMap(c=>b.league.active[c]):(b?.fighters||[]).map((_,i)=>i)}
function leagueSurvivors(c,b=battle){return b.fighters.map((f,i)=>!f.ko&&f.hp>0&&(!c||f.controller===c)?i:null).filter(i=>i!==null)}
function leagueBench(c){const field=fieldIndices();return leagueSurvivors(c).filter(i=>!field.includes(i))}
function normalizeLeagueBattle(b){
 if(!b.league||!b.league.active||b.fighters.length!==leagueTeamSize(b.format)*2)throw Error('Invalid League battle');
 const all=new Set();
 for(const c of ['a','b']){
  if(!Array.isArray(b.league.active[c])||b.league.active[c].length!==leagueFieldSize(b.format))throw Error('Invalid League field');
  for(const i of b.league.active[c]){if(!Number.isInteger(i)||!b.fighters[i]||b.fighters[i].controller!==c||all.has(i))throw Error('Invalid League slot');all.add(i);}
 }
 b.lastActiveUnits??={};b.lastTargetIndex??=null;b.league.switchUsedTurn??=-1;
 for(const f of b.fighters){f.moves=f.moves.map(hydrateMove);f.lastMove=cleanMoveName(f.lastMove);f.bannedMoves=(f.bannedMoves||[]).map(cleanMoveName);f.loadouts?.forEach(l=>l.moves=l.moves.map(hydrateMove));}
 return b;
}
function rematchLeagueBattle(){
 const old=battle,lg=old.league,n=leagueTeamSize(old.format),field=leagueFieldSize(old.format);
 const fighters=lg.startingBuilds.map((p,i)=>({...freshFighter(p,lg.sourceIndices[i],old.format,old.chronicle),sourcePartyIndex:lg.sourceIndices[i],enekoroNotes:p.enekoroNotes||''}));
 battle=makeBattleState(fighters,old.format,old.chronicle);
 battle.league={active:{a:Array.from({length:field},(_,i)=>i),b:Array.from({length:field},(_,i)=>n+i)},startingBuilds:clone(lg.startingBuilds),sourceIndices:[...lg.sourceIndices],switchUsedTurn:-1};
 saveBattle();renderBattle();
}
function nextLeagueReplacement(){
 if(!isLeagueFormat(battle?.format))return null;
 for(const c of ['a','b'])for(let slot=0;slot<battle.league.active[c].length;slot++){
  const out=battle.league.active[c][slot],f=battle.fighters[out];
  if((f.ko||f.hp<=0)&&leagueBench(c).length)return {controller:c,slot,out};
 }
 return null;
}
function queueLeagueReplacements(continuation){
 const pending=nextLeagueReplacement();if(!pending)return false;
 battle.league.continuation=continuation;battle.league.replacement=pending;battle.phase='leagueReplace';battle.repeat=false;battle.chain=null;return true;
}
function putLeagueOnField(out,incoming){
 const c=battle.fighters[out].controller,slot=battle.league.active[c].indexOf(out);
 if(slot<0||!leagueBench(c).includes(incoming))return false;
 battle.league.active[c][slot]=incoming;
 if(battle.lastActiveUnits[c]===out)battle.lastActiveUnits[c]=incoming;
 if(battle.turnIndex===out)battle.turnIndex=incoming;
 if(battle.targetIndex===out)battle.targetIndex=incoming;
 const cont=battle.league.continuation;if(cont?.ai===out)cont.ai=incoming;if(cont?.ti===out)cont.ti=incoming;
 return true;
}
function chooseLeagueReplacement(index){
 if(battle?.phase!=='leagueReplace')return;
 const r=nextLeagueReplacement();if(!r||!putLeagueOnField(r.out,index))return;
 addLog(`${battle.fighters[index].controllerLabel} replaces KO’d ${battle.fighters[r.out].pokemon} with ${battle.fighters[index].pokemon}.`);
 const next=nextLeagueReplacement();battle.league.replacement=next;
 if(!next){
  const cont=battle.league.continuation;delete battle.league.continuation;
  if(!checkBattleWinner()){
   if(cont?.kind==='finish')finishFormatTurn(cont.ai,cont.ti);
   else if(cont?.kind==='resume'&&cont.phase==='turn'&&living().includes(battle.turnIndex)){battle.phase='turn';if(!legalTargets().includes(battle.targetIndex))battle.targetIndex=null;}
   else startControllerTurn(battle.activeController||'a');
  }
 }
 saveBattle();render();
}
function canLeagueSwitch(){const a=battle?.fighters[battle.turnIndex];return isLeagueFormat(battle?.format)&&battle.phase==='turn'&&a&&!a.ko&&!a.forcedMove&&battle.league.switchUsedTurn!==battle.turnNumber&&leagueBench(a.controller).length>0}
function beginLeagueSwitch(){if(!canLeagueSwitch())return;battle.phase='leagueSwitch';saveBattle();render()}
function chooseLeagueSwitch(index){
 if(battle?.phase!=='leagueSwitch')return;
 const out=battle.turnIndex,a=battle.fighters[out];if(!leagueBench(a.controller).includes(index))return;
 battle.snapshot=snapshotBattle();
 if(!putLeagueOnField(out,index))return;
 battle.league.switchUsedTurn=battle.turnNumber;battle.phase='leagueSwitchRoll';battle.selectedMove=null;battle.pending=null;battle.repeat=false;battle.chain=null;
 addLog(`${a.controllerLabel} uses SWITCH: ${a.pokemon} returns to the bench; ${battle.fighters[index].pokemon} enters with ${battle.fighters[index].hp} HP.`);
 saveBattle();render();
}
function resolveLeagueSwitch(orientation){
 if(battle?.phase!=='leagueSwitchRoll')return;
 const a=battle.fighters[battle.turnIndex],valid=['standing','handstand','back','down','left','right'];
 if(orientation==='blocked'){if(!a.charBlocked)return;}else if(!valid.includes(orientation)||!orientationAllowed(a,[orientation]))return;
 if(orientation==='standing'){
  battle.phase='turn';if(!legalTargets().includes(battle.targetIndex))battle.targetIndex=null;
  addLog(`${a.pokemon} rolled Standing after SWITCH and may attack.`);
  consumeSkippedTurn();
 }else{
  addLog(`${a.pokemon}: SWITCH completed; ${orientation==='blocked'?'no Character Die':orientation} ends this turn.`);
  // Next-turn offensive restrictions expire even when SWITCH grants no attack.
  a.energyMod=0;a.energySymbols=0;a.energyMultipliers={};a.chibiBlocked=false;a.attackMod=0;a.charBlocked=false;a.fixedOrientation=null;a.chooseOrientation=false;a.failureOrientations=[];a.bannedMoves=[];a.forcedMove=null;a.rerolls=0;a.rerollEnergy=0;
  if(a.skipTurns)a.skipTurns--;
  finishFormatTurn(battle.turnIndex,battle.targetIndex);
 }
 saveBattle();render();
}
function leagueExactSnapshot(){const s=clone(battle);s.snapshot=null;return s}
function adjustLeagueHp(index,delta){
 const f=battle.fighters[index];if(!f)return;
 battle.snapshot=leagueExactSnapshot();const phase=battle.phase;
 f.hp=Math.max(0,Math.min(f.maxHp,f.hp+delta));f.ko=f.hp===0;addLog(`${f.pokemon}: HP adjusted to ${f.hp}.`);
 if(!checkBattleWinner()){
  battle.winner=null;battle.winnerTeam=null;
  if(!queueLeagueReplacements({kind:'resume',phase})&&(phase==='winner'||battle.fighters[battle.turnIndex]?.ko))startControllerTurn(battle.activeController||'a');
 }
 saveBattle();render();
}

/* The shared-device screens never render the other trainer's private choices. */
function leaguePartyCard(i,action,extra=''){
 const p=players[i],s=leagueSetup.selected[leagueSetupController()],rank=s.indexOf(i),privatePick=leagueSetup.phase.startsWith('select-');
 return `<button class="league-card ${privatePick&&rank>=0?'selected':''}" data-action="${action}" data-index="${i}" ${action?'':'disabled'} aria-label="Party ${i%6+1}: ${esc(p.pokemon||'Choose Pokémon')}">${p.pokemon?art(p.pokemon):'<span class="empty-party">＋</span>'}<strong>${i%6+1}. ${esc(p.pokemon||'Choose Pokémon')}</strong><small>${privatePick&&rank>=0?`Pick ${rank+1} · ${rank<leagueFieldSize()?'Starts active':'Reserve'}`:extra||'3 Enekoro'}</small></button>`;
}
function leagueSetupToolbar(){return toolbar(formatDefinition().label,btn('home','← Formats')+(leagueSetup.phase==='party'?btn('chronicle',chronicleMode?'Chronicle: ON':'Chronicle: OFF',`small-btn ${chronicleMode?'amber':''}`):''))}
function renderLeagueSetup(){
 const phase=leagueSetup.phase,c=leagueSetupController(),name='Trainer '+c.toUpperCase(),n=leagueTeamSize();
 const top=leagueSetupToolbar();
 if(phase==='party'||phase==='reveal')return top+`<section class="league-setup"><div class="league-intro"><h1>${phase==='party'?'Prepare your parties':'Reveal both parties'}</h1><p>${phase==='party'?'Choose six Pokémon per trainer. Prepare three Enekoro for each Pokémon. Moves are chosen after your secret match selection.':`Both trainers review these six-member parties. Each will privately choose ${n} Pokémon for this match.`}</p></div><div class="league-parties">${['a','b'].map(t=>`<section><h2>Trainer ${t.toUpperCase()}</h2><div class="league-party-grid">${leaguePartyIndices(t).map(i=>leaguePartyCard(i,phase==='party'?'edit-player':'')).join('')}</div></section>`).join('')}</div><footer class="sheet-foot"><p>${phase==='party'?players.filter(p=>p.pokemon).length+'/12 Pokémon prepared':'Keep your selected team private until the battle starts.'}</p>${phase==='reveal'?btn('league-edit-parties','Edit parties'):''}${btn(phase==='party'?'league-reveal':'league-begin',phase==='party'?'Reveal parties':'Begin secret selection','large-btn primary',leaguePartyReady()?'':'disabled')}</footer></section>`;
 if(phase.startsWith('handoff-'))return top+`<section class="league-handoff"><h1>Pass the device to ${name}</h1><p>The other trainer should look away. Select your team and moves privately.</p>${btn('league-open-private','I’m '+name,'large-btn primary')}<small>Selections are hidden on this screen.</small></section>`;
 if(phase.startsWith('select-'))return top+`<section class="league-setup"><div class="league-intro"><h1>${name} · Secret selection</h1><p>Choose ${n} Pokémon in order. Your first ${leagueFieldSize()===1?'pick starts':'two picks start'} active; the rest begin on the bench.</p></div><div class="league-private-grid">${leaguePartyIndices(c).map(i=>leaguePartyCard(i,'league-pick-team')).join('')}</div><footer class="sheet-foot"><p>${leagueSetup.selected[c].length}/${n} selected · Tap a selected Pokémon to remove it.</p>${btn('league-confirm-team','Choose moves','large-btn primary',leagueSetup.selected[c].length===n?'':'disabled')}</footer></section>`;
 if(phase.startsWith('moves-'))return top+`<section class="league-setup"><div class="league-intro"><h1>${name} · Prepare selected Pokémon</h1><p>Choose four moves for each Pokémon and complete its evolution loadouts. SWITCH is provided separately.</p></div><div class="league-loadouts">${leagueSetup.selected[c].map((i,k)=>`<article>${leaguePartyCard(i,'edit-player',`${k<leagueFieldSize()?'Starts active':'Reserve'} · ${players[i].moves.length}/4 moves${isComplete(players[i])?' · Ready':''}`)}<label>3 Enekoro · dice notes<input maxlength="120" data-enekoro-index="${i}" value="${esc(players[i].enekoroNotes||'')}" placeholder="Optional: identify this Pokémon’s three dice"></label>${clearLoadoutButton(i)}</article>`).join('')}</div><footer class="sheet-foot"><p>HP, moves and dice stay with each Pokémon during the match.</p>${btn('league-reselect','Reselect team')}${btn('league-lock',`Lock ${name}’s team`,'large-btn primary',leagueSelectionComplete(c)?'':'disabled')}</footer></section>`;
 return top+`<section class="league-handoff"><h1>Both teams are locked</h1><p>Choose who starts. Each trainer brings ${n} selected Pokémon; ${leagueFieldSize()} per trainer ${leagueFieldSize()===1?'starts':'start'} active.</p><div class="option-grid">${['a','b'].map((t,i)=>btn('start-first','Trainer '+t.toUpperCase()+' starts',`large-btn ${i?'blue':'pink'}`,`data-index="${i*n}" ${leagueSetupError()?'disabled':''}`)).join('')}</div>${btn('league-restart-selection','Choose teams again')}<small>Your private selections remain hidden until battle.</small></section>`;
}
function leagueBattleTools(){if(!isLeagueFormat(battle?.format))return '';const a=battle.fighters[battle.turnIndex];return `${a?`<span class="league-remaining">A ${leagueSurvivors('a').length} · B ${leagueSurvivors('b').length} left</span>`:''}${btn('league-party','Party','small-btn',a?'':'disabled')}${btn('league-switch','SWITCH','small-btn amber',canLeagueSwitch()?'':'disabled')}`}
function leagueReserveButton(i,action){const f=battle.fighters[i];return btn(action,art(f.pokemon)+`<strong>${esc(f.pokemon)}</strong><small>${f.hp}/${f.maxHp} HP · 3 Enekoro${f.enekoroNotes?' · '+esc(f.enekoroNotes):''}</small>`,'evolution-option league-reserve',`data-index="${i}"`)}
function renderLeagueBattlePrompt(){
 const phase=battle.phase;
 if(phase==='leagueSwitchRoll'){
  const a=battle.fighters[battle.turnIndex];return `<section class="overlay league-roll"><header class="overlay-head"><h2>SWITCH · ${esc(a.pokemon)}</h2>${btn('undo','Undo switch','small-btn',battle.snapshot?'':'disabled')}</header><div class="scroll question"><div><img class="switch-card" src="${asset(LEAGUE_SWITCH.image)}" alt="SWITCH player move"><h2>Roll the incoming Pokémon’s Charakoro</h2><p>Standing allows an attack this turn. Any other result ends the turn.</p><div class="option-grid">${a.charBlocked?btn('league-switch-roll','No Character Die · Finish turn','large-btn','data-value="blocked"'):['standing','handstand','back','down','left','right'].map(o=>btn('league-switch-roll',orientations([o])+`<span>${o==='standing'?'Standing · Attack':o+' · Finish'}</span>`,'large-btn roll-choice',`data-value="${o}" ${orientationAllowed(a,[o])?'':'disabled'}`)).join('')}</div></div></div></section>`;
 }
 const forced=phase==='leagueReplace',r=forced?nextLeagueReplacement():null,c=r?.controller||battle.activeController;
 return `<section class="overlay" role="dialog" aria-modal="true"><header class="overlay-head"><h2>${forced?'KO · Trainer '+c.toUpperCase()+' chooses a replacement':'SWITCH · Choose a reserve'}</h2>${forced?btn('undo','Undo last action','small-btn',battle.snapshot?'':'disabled'):btn('league-cancel-switch','Cancel')}</header><div class="scroll question"><div><p>${forced?'Send a healthy reserve into the open active position. This does not use SWITCH or consume a turn.':'Choose one of your selected reserves. Its HP, moves and evolution form are retained.'}</p><div class="option-grid">${leagueBench(c).map(i=>leagueReserveButton(i,forced?'league-replace':'league-switch-pick')).join('')}</div></div></div></section>`;
}
function renderLeagueParty(){
 const c=battle.activeController;return `<section class="overlay" role="dialog" aria-modal="true" aria-label="Your selected team"><header class="overlay-head"><h2>Trainer ${c.toUpperCase()} · Selected team</h2>${btn('close-menu','Close')}</header><div class="scroll"><div class="league-battle-party">${battle.fighters.map((f,i)=>({f,i})).filter(({f})=>f.controller===c).map(({f,i})=>`<article class="league-party-status ${f.ko?'ko':''}">${art(f.pokemon)}<h3>${esc(f.pokemon)}</h3><p>${f.hp}/${f.maxHp} HP · ${f.ko?'KO':fieldIndices().includes(i)?'Active':'Reserve'}</p><p>3 Enekoro${f.enekoroNotes?' · '+esc(f.enekoroNotes):''}</p><p>${f.moves.map(m=>esc(canonical(m).name)).join(' · ')}</p></article>`).join('')}</div></div></section>`;
}
function handleLeagueAction(action,index,value){
 if(!action.startsWith('league-'))return false;
 const c=leagueSetupController();
 switch(action){
 case 'league-reveal':if(leagueSetup.phase==='party'&&leaguePartyReady())leagueSetup.phase='reveal';break;
 case 'league-edit-parties':leagueSetup=newLeagueSetup();break;
 case 'league-begin':if(leagueSetup.phase==='reveal'&&leaguePartyReady())leagueSetup.phase='handoff-a';break;
 case 'league-open-private':if(leagueSetup.phase.startsWith('handoff-')){leagueSetup.phase=leagueSetup.resumePhase||'select-'+c;delete leagueSetup.resumePhase;}break;
 case 'league-pick-team':if(leagueSetup.phase.startsWith('select-')&&leaguePartyIndices(c).includes(index)){const s=leagueSetup.selected[c],at=s.indexOf(index);if(at>=0)s.splice(at,1);else if(s.length<leagueTeamSize())s.push(index);}break;
 case 'league-confirm-team':if(leagueSetup.phase.startsWith('select-')&&leagueSetup.selected[c].length===leagueTeamSize())leagueSetup.phase='moves-'+c;break;
 case 'league-reselect':if(leagueSetup.phase.startsWith('moves-'))leagueSetup.phase='select-'+c;break;
 case 'league-lock':if(leagueSetup.phase.startsWith('moves-')&&leagueSelectionComplete(c)){leagueSetup.locked[c]=true;leagueSetup.phase=c==='a'?'handoff-b':'ready';}break;
 case 'league-restart-selection':leagueSetup=newLeagueSetup();leagueSetup.phase='reveal';break;
 case 'league-switch':beginLeagueSwitch();return true;
 case 'league-switch-pick':chooseLeagueSwitch(index);return true;
 case 'league-switch-roll':resolveLeagueSwitch(value);return true;
 case 'league-cancel-switch':if(battle?.phase==='leagueSwitch')battle.phase='turn';saveBattle();break;
 case 'league-replace':chooseLeagueReplacement(index);return true;
 case 'league-party':if(isLeagueFormat(battle?.format)&&battle.activeController)ui.modal='league-party';break;
 default:return false;
 }
 saveBuilds();render();return true;
}
