/* Independent interface implementation inspired by the supplied battle reference. */
const TYPE_COLORS={normal:'#E4DFD2',psychic:'#DCC4EC',fighting:'#FFC79A',fire:'#FFACAC',water:'#A8D4EA',grass:'#B8E6C0',steel:'#D3D6DA',dark:'#A3D9CE',flying:'#C6E6FA',lightning:'#FFE58A',dragon:'#C5B9ED'};
const TRAINER_COLORS=['#ffa4d4','#92cdf2','#a8d8a1','#ddbbf1'];
const PORTABLE_ASSETS=window.PLAKORO_ASSETS||{};
let cardUpdater=null,chronicleImages=new Map();
const asset=p=>chronicleImages.get(p)||cardUpdater?.asset(p)||PORTABLE_ASSETS[p]||(p?.startsWith('chronicle/')?p+'?v='+CHRONICLE_DB.checked:p);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ui={modal:null,loadout:-1,search:'',preview:null};
const clearedLoadouts=new WeakMap();
const stage=$('stage');
function fitStage(){
 const viewport=window.visualViewport,css=getComputedStyle(document.documentElement);
 const inset=side=>parseFloat(css.getPropertyValue('--safe-'+side))||0;
 const left=inset('left'),top=inset('top');
 const w=Math.max(1,(viewport?.width||window.innerWidth)-left-inset('right'));
 const h=Math.max(1,(viewport?.height||window.innerHeight)-top-inset('bottom'));
 const portrait=h>w,long=portrait?h:w,short=portrait?w:h;
 const scale=Math.min(long/960,short/540);
 // Expand the layout to the display's aspect ratio, then scale uniformly.
 // This fills wide phones and tablets without stretching or cropping cards.
 stage.style.width=`${long/scale}px`;stage.style.height=`${short/scale}px`;
 stage.style.left=`${(viewport?.offsetLeft||0)+left+w/2}px`;
 stage.style.top=`${(viewport?.offsetTop||0)+top+h/2}px`;
 stage.style.transform=`translate(-50%,-50%) rotate(${portrait?90:0}deg) scale(${scale})`;
}
window.addEventListener('resize',fitStage);
window.visualViewport?.addEventListener('resize',fitStage);
window.visualViewport?.addEventListener('scroll',fitStage);
function typeStyle(type,texture=false){return `--type:${TYPE_COLORS[type]||TYPE_COLORS.normal};${texture&&type!=='dragon'?`background-image:url('${asset('ui/back-'+type+'.png')}')`:''}`}
function icon(type,cls='type-icon'){return `<img class="${cls}" src="${asset('ui/type-'+type+(type==='dragon'?'.webp':'.png'))}" alt="${esc(type)}">`}
function orientations(os){return `<span class="effect-icons">${os.map(o=>`<img class="ori-icon" src="${asset('ui/'+o+'.png')}" alt="${esc(o)}">`).join('')}</span>`}
function art(name,cls=''){const path=getPokemonBlock(name,mode==='battle'&&battle?battle.chronicle:chronicleMode)?.pokemon.image||BUNDLED_POKEMON_ART[name];return `<img class="${cls} pokemon-card-image" src="${esc(asset(path))}" alt="${esc(pokemonLabel(name))} card" decoding="async">`}
function btn(action,label,cls='small-btn',extra=''){return `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`}
function rich(text){return esc(text).replace(/\{(st|hs|ba|do|s1|s2)\}/g,(_,o)=>({st:'Standing',hs:'Handstand',ba:'Back',do:'Down',s1:'Left',s2:'Right'}[o])).replace(/\{([RCLWGPFDMYN])\}/g,(_,t)=>({R:'Fire',C:'Normal',L:'Electric',W:'Water',G:'Grass',P:'Psychic',F:'Fighting',D:'Dark',M:'Steel',Y:'Flying',N:'Dragon'}[t]));}
function costs(m){return `<span class="move-cost">${(m.energy||[]).map(t=>icon(t,'cost-icon')).join('')}</span>`}
function moveCard(move,action,index,selected=false,combat=false){
 const m=canonical(move),a=combat?battle.fighters[battle.turnIndex]:null,t=combat?battle.fighters[battle.targetIndex]:null;
 const disabled=combat&&isMoveDisabled(a,m),damage=t?visibleDamage(a,t,m):m.baseDamage||0;
 const descriptionId=`card-${action}-${index}`,description=[m.owner,`${m.baseDamage||0} base damage`,(m.energy||[]).join(', '),m.effect,...(m.outcomes||[]).map(o=>o.orientations.join(' / ')+': '+o.text)].filter(Boolean).join('. ');
 return `<button class="move-card source-card ${selected?'selected':''}" data-action="${action}" data-index="${esc(index)}" aria-label="${esc(m.name)}${selected?', selected':''}" aria-describedby="${esc(descriptionId)}" ${disabled?'disabled':''}>
 <img class="source-card-image" src="${esc(asset(m.image))}" alt="${esc(m.name)} card" loading="${combat?'eager':'lazy'}" decoding="async">
 <span class="sr-only" id="${esc(descriptionId)}">${esc(description)}</span>${combat?`<span class="live-damage">Before Character Die: ${damage} damage</span>`:''}${selected?'<span class="selected-mark" aria-hidden="true">✓</span>':''}${disabled?'<span class="blocked-label">Unavailable this turn</span>':''}</button>`;
}
function footer(){return '<div class="footer">Card translations & artwork: Jollto / PlakoroDB · CC BY-NC 4.0 · Chronicle card database</div>'}
function toolbar(title,extra=''){return `<header class="topbar"><strong>${esc(title)}</strong>${extra}${btn('menu','☰ Menu')}</header>`}
function renderHome(){return toolbar('PLAKORO BATTLE')+`<section class="home"><h1>Choose your battle format</h1><p>Choose a standard battle or bring a six-Pokémon party to League Format.</p><div class="format-grid">${[
 ['single','2 PLAYERS','Single Battle','One Pokémon and four moves per trainer.'],['league-single','LEAGUE · 2 PLAYERS','League Singles','Reveal six. Secretly choose three. One active Pokémon.'],['league-double','LEAGUE · 2 PLAYERS','League Doubles','Reveal six. Secretly choose four. Two active Pokémon.'],['double','2 PLAYERS','Double Battle','Two Pokémon per trainer. Alternate each turn.'],['team','4 PLAYERS','Team Double Battle','Two teams of two trainers.'],['royale4','3–4 PLAYERS','Battle Royale','Every trainer for themselves.']
 ].map(([id,count,name,desc],i)=>`<button class="format" data-action="format" data-value="${id}" style="--accent:${TRAINER_COLORS[i%4]}"><span class="count">${count}</span><strong>${name}</strong><small>${desc}</small></button>`).join('')}</div><div class="home-actions">${players.some(p=>p.pokemon)?btn('continue','Continue setup','large-btn'):''}${battle?btn('resume','Resume battle','large-btn primary'):''}</div></section>`+footer()}
function clearLoadoutButton(index){
 const p=players[index],keepPokemon=isLeagueFormat()&&leagueSetup.phase!=='party',undo=clearedLoadouts.has(p)&&(!p.pokemon||keepPokemon&&!p.moves.length),label=undo?'Undo clear':keepPokemon?'Clear moves':'Clear loadout';
 return btn(undo?'undo-clear-loadout':'clear-loadout',label,`small-btn ${undo?'undo-clear-loadout':'clear-loadout'}`,`data-index="${index}" aria-label="${label} for ${esc(slotLabel(index))}" title="${undo?'Restore the cleared loadout':keepPokemon?'Clear moves and evolution loadouts; keep the revealed Pokémon':'Clear this Pokémon, its moves, and all evolution loadouts'}" ${!p.pokemon&&!undo?'disabled':''}`);
}
function renderSetup(){
 if(isLeagueFormat()){players.forEach(syncEvolutionLoadouts);saveBuilds();return renderLeagueSetup();}
 players.forEach(syncEvolutionLoadouts);saveBuilds();const ready=!setupError();
 return toolbar(formatDefinition().label,`${btn('home','← Formats')}${isRoyaleFormat()?btn('royale-count',battleFormat==='royale3'?'3 players':'4 players'):''}${btn('chronicle',chronicleMode?'Chronicle: ON':'Chronicle: OFF',`small-btn ${chronicleMode?'amber':''}`)}`)+
 `<section class="setup-grid ${players.length>2?'multi':''}" style="--players:${players.length}">${players.map((p,i)=>`<article class="setup-card"><h2 class="trainer-label">${esc(slotLabel(i))}</h2><button class="select-mon" data-action="edit-player" data-index="${i}" aria-label="Choose Pokémon for ${esc(slotLabel(i))}">${p.pokemon?`<span class="selected-pokemon">${art(p.pokemon)}<strong>${isComplete(p)?'Edit loadout':'Finish loadout'}</strong></span>`:'<span class="ball" style="--trainer:#deded4"><span>Choose<br>Pokémon</span></span>'}</button><div class="ready">${p.pokemon?esc(pokemonLabel(p.pokemon))+' · '+p.moves.length+'/4 moves':''}${p.evolutionLoadouts?.length?' · '+p.evolutionLoadouts.length+' evolution'+(p.evolutionLoadouts.length>1?'s':''):''}</div>${clearLoadoutButton(i)}${btn('start-first','Start as first player',`large-btn ${i%2?'blue':'pink'}`,`data-index="${i}" ${ready?'':'disabled'}`)}</article>`).join('')}</section>`+footer();
}
function editLoadout(){return ui.loadout<0?cur():cur().evolutionLoadouts[ui.loadout]}
function pokemonOptions(){if(ui.loadout<0)return chronicleMode?allChronicleNames():DATA.order;const p=cur(),l=editLoadout();return l?.kind==='eevee-alternate'?availableEeveeForms(p,l):hasTrigger(ui.loadout===0?p:p.evolutionLoadouts[ui.loadout-1])?.targets||[]}
function loadoutStrip(){const p=cur();return `<div class="loadout-strip">${[{pokemon:p.pokemon,moves:p.moves},...(p.evolutionLoadouts||[])].map((l,i)=>btn('loadout',`${i===0?'Original':pokemonLabel(l.pokemon)||'Choose evolution'} · ${l.moves.length}/4`,`loadout-chip ${ui.loadout===i-1?'current':''}`,`data-index="${i-1}"`)).join('')}</div>`}
function renderPicker(){
 const l=editLoadout(),p=cur(),pickPokemon=ui.modal==='pokemon';
 const title=pickPokemon?'Choose a Pokémon':`${pokemonLabel(l.pokemon)} · Choose four moves`;
 const header=`<div class="overlay-head"><h2>${esc(title)}</h2>${pickPokemon?'<input class="picker-search" id="pokemonSearch" placeholder="Search Pokémon" value="'+esc(ui.search)+'" aria-label="Search Pokémon">':isLeagueFormat()&&leagueSetup.phase!=='party'?'':btn('change-pokemon','Change Pokémon')}${p.pokemon?clearLoadoutButton(active):''}${btn('close-picker','×','close-btn','aria-label="Close loadout"')}</div>`;
 let body;if(pickPokemon)body=`<div class="pokemon-grid">${pokemonOptions().filter(n=>pokemonLabel(n).toLowerCase().includes(ui.search.toLowerCase())).map(n=>{const m=pokemonMeta(n);return `<button class="pokemon-choice" data-action="pick-pokemon" data-value="${esc(n)}"><span class="pick-art source-pokemon">${art(n)}</span><strong>${esc(pokemonLabel(n))}</strong><small>HP ${m.hp} ${m.weakness?' · Weakness '+icon(m.weakness):''}</small></button>`}).join('')}</div>`;
 else body=`<div class="move-grid">${movesForPokemon(l.pokemon,ui.loadout>=0).map((m,i)=>moveCard(m,'pick-move',i,l.moves.some(x=>moveId(x)===moveId(m)))).join('')}</div>`;
 return `<section class="overlay" role="dialog" aria-modal="true" aria-label="${esc(title)}">${header}${p.evolutionLoadouts?.length?loadoutStrip():''}<div class="scroll" id="pickerScroll">${body}</div><footer class="sheet-foot"><p>${pickPokemon?esc(slotLabel(active)):l.moves.length+'/4 moves selected'}${ui.loadout>=0?' · Evolution loadout':''}</p>${ui.loadout>=1&&l?.kind==='eevee-alternate'?btn('remove-loadout','Remove this form'):''}${chronicleMode&&allowsEeveeAlternates(p)?btn('add-evolution','Add additional evolution loadout','small-btn amber',p.evolutionLoadouts.length>=3?'disabled':''):''}${!pickPokemon?btn('confirm-moves','Confirm selected moves','large-btn primary',l.moves.length===4?'':'disabled'):''}</footer></section>`;
}
function dice(f){const n=energyDiceFor(f);return `<div class="dice-row">${!f.charBlocked?`<img class="character" src="${asset('ui/character.png')}" alt="Character Die">`:''}${Array.from({length:Math.min(n,8)},(_,i)=>`<img src="${asset('ui/energy'+(i%6+1)+'.png')}" alt="Energy Die">`).join('')}${n>8?'<small>× '+n+'</small>':''}${!n?'<small>No Energy Dice</small>':''}${f.energyMultipliers?.fire?'<small>Each Fire symbol counts as '+f.energyMultipliers.fire+' Fire</small>':''}${f.chibiBlocked?'<small>No Chibi Characoro this turn</small>':''}${f.energySymbols?'<small>+'+f.energySymbols+' '+esc(f.symbolType)+' energy</small>':''}</div>`}
function fighterPanel(f,i){const m=fighterMeta(f);return `<button class="fighter ${i===battle.turnIndex?'active':''} ${i===battle.targetIndex&&battle.fighters.length>2?'targeted':''} ${f.ko?'ko':''}" style="${typeStyle(m.type)}" data-action="fighter" data-index="${i}" aria-label="${esc(fighterLabel(f)+' '+pokemonLabel(f.pokemon)+' HP '+f.hp)}">${art(f.pokemon,'fighter-art')}<span class="fighter-info"><span class="fighter-line">${icon(m.type)}<span class="fighter-name">${esc(pokemonLabel(f.pokemon))}</span><span class="weak">Weakness ${m.weakness?icon(m.weakness):'—'}</span></span><span class="hp-line"><span class="hp-number">${f.hp}</span><span class="hp-max">/ ${f.maxHp} HP</span><small>${esc(f.controllerLabel)}</small></span><span class="hp-bar"><span style="width:${Math.max(0,f.hp/f.maxHp*100)}%;background:${f.hp<=f.maxHp*.25?'#eb5c58':f.hp<=f.maxHp*.5?'#e7ba45':'#67bb61'}"></span></span></span></button>`}
function renderBoard(){
 if(battle.phase==='winner')return renderWinner();
 if(battle.phase==='chooseFirst')return renderFirst();
 if(isLeagueFormat(battle.format)&&['leagueReplace','leagueSwitch','leagueSwitchRoll'].includes(battle.phase))return renderLeagueBattlePrompt();
 const a=battle.fighters[battle.turnIndex];
 if(a&&battle.targetIndex===null){const targets=legalTargets();if(targets.length===1)battle.targetIndex=targets[0]}
 const field=fieldIndices(),head=`<section class="board-top ${field.length>2?'multi':''}" style="--players:${field.length}">${field.map(i=>fighterPanel(battle.fighters[i],i)).join('')}</section>`;
 if(battle.phase==='chooseAttacker')return head+`<section class="question"><div><h2>Choose your active Pokémon</h2><p>Alternate Pokémon while both can battle.</p><div class="option-grid">${availableAttackers().map(i=>btn('attacker',art(battle.fighters[i].pokemon)+`<strong>${esc(pokemonLabel(battle.fighters[i].pokemon))}</strong>`,'evolution-option',`data-index="${i}"`)).join('')}</div></div></section>`;
 const tools=`<div class="battle-tools"><strong>${esc(fighterLabel(a))} · Turn ${battle.turnNumber+1} · ${energyDiceFor(a)} Energy Dice${a.fixedOrientation?' · Character Die: '+esc(a.fixedOrientation):a.charBlocked?' · No Character Die':''}</strong>${leagueBattleTools()}${btn('undo','Undo','small-btn',battle.snapshot?'':'disabled')}${btn('menu','☰ Menu')}</div>`;
 const body=battle.targetIndex===null?`<section class="question"><div><h2>Choose your target</h2><div class="option-grid">${legalTargets().map(i=>btn('target',art(battle.fighters[i].pokemon)+`<strong>${esc(fighterLabel(battle.fighters[i]))}</strong>`,'evolution-option',`data-index="${i}"`)).join('')}</div></div></section>`:`<section class="move-grid battle-moves">${a.moves.map((m,i)=>moveCard(m,'attack',i,false,true)).join('')}</section>`;
 return head+tools+body+(battle.phase==='resolve'?renderAttack():battle.phase==='repeatChoice'?renderRepeatChoice():battle.phase==='borrowMove'?renderBorrowChoice():'');
}
function renderAttack(){
 const a=battle.fighters[battle.turnIndex],t=battle.fighters[battle.targetIndex],m=selectedBattleMove();
 if(battle.pending?.questions.length)return renderQuestion();
 return `<section class="overlay attack-overlay" role="dialog" aria-modal="true" aria-label="Resolve ${esc(m.name)}" style="${typeStyle(m.type)}"><header class="attack-head"><button class="attack-label source-attack" data-action="preview-attack" aria-label="View ${esc(m.name)} card"><img class="source-card-image" src="${esc(asset(m.image))}" alt="${esc(m.name)} card"></button><div class="roll-instruction">${dice(a)}<strong>${a.chooseOrientation?'Choose your Character Die position':'Let’s shake it!'}</strong><span class="dice-note">${a.rerolls?'You may reroll your Character Die '+a.rerolls+' time(s). ':''}${a.rerollEnergy?'Opponent chooses '+a.rerollEnergy+' Energy Dice for you to reroll. ':''}${battle.repeat?`Roll again · ${battle.chain?.hits||0} hit(s) · ${battle.chain?.total||0} damage`:battle.turnNumber===0?'First player’s first turn':a.charBlocked?'Character Die unavailable':a.fixedOrientation?'Character Die: '+esc(a.fixedOrientation):''}</span></div></header><div class="attack-columns"><section class="success-column"><h2 class="success-heading">Skill successful ▶ Character check</h2><div class="outcome-list"><button class="outcome-btn move-only" data-action="outcome" data-index="-1">${icon(m.type)}<span class="outcome-text">${m.requiredOrientations?'Character Die missed<br><small>(move failed)</small>':'Move only<br><small>(no Character Die effect)</small>'}</span><span class="damage-number">${m.requiredOrientations?'×':visibleDamage(a,t,m)}</span></button>${m.outcomes.map((o,i)=>`<button class="outcome-btn ${o.text.length>82?'long':''}" data-action="outcome" data-index="${i}" ${orientationAllowed(a,o.orientations)?'':'disabled'}>${orientations(o.orientations)}<span class="outcome-text">${rich(o.text)}</span></button>`).join('')}</div></section><aside class="failure-column"><section class="failure-box"><strong>Energy Shortage</strong>${btn('fail','Technique<br>failed','failure-btn')}</section>${btn('cancel-attack','Return','return-btn',battle.repeat?'disabled':'')}</aside></div></section>`;
}
function renderQuestion(){const q=battle.pending.questions[0],a=battle.fighters[battle.turnIndex],t=battle.fighters[battle.targetIndex];let options='';
 if(q.kind==='count')options=q.max<=16?`<div class="count-grid">${Array.from({length:q.max-q.min+1},(_,i)=>btn('answer',i+q.min,'count-btn',`data-value="${i+q.min}"`)).join('')}</div>`:`<div class="option-grid"><label>Successes <input id="effectCount" type="number" min="${q.min}" max="${q.max}" value="${q.min}" style="width:100px;font-size:30px"></label>${btn('answer-input','Apply roll result','large-btn primary')}</div>`;
 if(['orientation','barrier','side-shield'].includes(q.kind))options=`<div class="option-grid">${q.options.map(o=>btn('answer',orientations([o])+'<br>'+esc(o),'large-btn',`data-value="${o}"`)).join('')}</div>`;
 if(q.kind==='ban'||q.kind==='force-move')options=`<div class="move-grid">${q.options.map(id=>moveCard(t.moves.find(x=>moveId(x)===id),'answer',id)).join('')}</div>`;
 if(q.kind==='notice')options=btn('answer','Done','large-btn primary','data-value="done"');
 if(q.kind==='evolution')options=`<div class="option-grid">${q.options.map(i=>btn('answer',art(a.loadouts[i].pokemon)+`<strong>${esc(pokemonLabel(a.loadouts[i].pokemon))}</strong>`,'evolution-option',`data-value="${i}"`)).join('')}</div>`;
 return `<section class="overlay" role="dialog" aria-modal="true" aria-label="${esc(q.title)}"><header class="overlay-head">${btn('back-outcomes','← Character check')}</header><div class="scroll question"><div><h2>${esc(q.title)}</h2><p>${esc(q.detail||'')}</p>${options}</div></div></section>`;
}
function renderRepeatChoice(){return `<section class="overlay question"><div><h2>Use this move again?</h2><p>${battle.chain.hits} use(s) completed · ${battle.chain.total} total damage</p><div class="option-grid">${btn('repeat-yes','Roll again','large-btn primary')}${btn('repeat-no','Finish turn','large-btn')}</div></div></section>`}
function renderBorrowChoice(){return `<section class="overlay" role="dialog" aria-label="Metronome"><header class="overlay-head"><h2>Metronome · Choose an opponent’s move</h2>${btn('borrow-pass','Finish turn')}</header><div class="scroll"><p>Use your opponent’s Energy Dice${battle.borrowEnergy?' ('+(battle.borrowEnergy>0?'+':'')+battle.borrowEnergy+' dice)':''}.</p><div class="move-grid">${borrowedMoveChoices().map(m=>moveCard(m,'borrow-move',moveId(m))).join('')}</div></div></section>`}
function renderFirst(){const controllers=[...new Set(battle.fighters.map(f=>f.controller))];return toolbar('Who goes first?')+`<section class="question"><div><h2>Choose the first trainer</h2><div class="option-grid">${controllers.map(c=>{const i=battle.fighters.findIndex(f=>f.controller===c);return btn('battle-first',esc(battle.fighters[i].controllerLabel),'large-btn primary',`data-index="${i}"`)}).join('')}</div></div></section>`}
function renderWinner(){const f=battle.fighters[battle.winner];return `<section class="result" style="${typeStyle(f?fighterMeta(f).type:'normal',true)}"><p>BATTLE COMPLETE</p><h1>${esc(battleWinnerLabel())}</h1>${f?art(f.pokemon):''}<div class="actions">${btn('rematch','Rematch','large-btn primary')}${btn('home','Battle formats','large-btn')}${btn('undo','Undo last action','large-btn',battle.snapshot?'':'disabled')}</div></section>`}
function renderMenu(){return `<section class="overlay" role="dialog" aria-modal="true" aria-label="Battle menu"><header class="overlay-head"><h2>Battle menu</h2>${btn('close-menu','×','close-btn','aria-label="Close menu"')}</header><div class="menu-body"><div class="menu-actions">${btn('home','Battle formats','large-btn')}${battle?btn('resume','Resume battle','large-btn primary')+btn('rematch','Rematch','large-btn')+btn('end-battle','End battle','large-btn'):''}</div>${battle?`<h3>Adjust HP</h3>${battle.fighters.map((f,i)=>({f,i})).filter(({i})=>!isLeagueFormat(battle.format)||fieldIndices().includes(i)).map(({f,i})=>`<div class="hp-adjust"><strong>${esc(pokemonLabel(f.pokemon))}</strong>${btn('hp-minus','−10','small-btn',`data-index="${i}"`)}<output>${f.hp}</output>${btn('hp-plus','+10','small-btn',`data-index="${i}"`)}<small>Maximum ${f.maxHp}</small></div>`).join('')}<h3>Battle log</h3>${battle.log.map(t=>`<div class="log-item">${esc(t)}</div>`).join('')}`:''}${renderUpdateStatus()}<h3>Legacy format (Chronicle mode)</h3><p>Enable Chronicle during setup to use Legacy rules. Pikachu, Bulbasaur, and Squirtle each have separate 2026 and 1997 choices, with their own character cards and stats. Normal, Strong, and Legendary versions of the same Pokémon can use one another’s move cards. Surfing Pikachu can use every Pikachu version’s moves; Surfing Pikachu’s own moves stay exclusive to Surfing Pikachu.</p><h3>Card databases</h3><p>${cardUpdater?.catalog.moves.length||PLAKORO_BUNDLE.moves.length} modern moves from <a href="https://github.com/Jollto/PlakoroDB" target="_blank" rel="noopener">PlakoroDB</a> (Jollto, CC BY-NC 4.0), plus ${Object.values(CHRONICLE_DB.movePools).flat().length} Chronicle moves and ${Object.keys(CHRONICLE_DB.pokemon).length} original Pokémon cards from your <a href="https://drive.google.com/drive/folders/1g7KX3NYqRm6mVtbo_hIkir_6QT27E-tW" target="_blank" rel="noopener">Chronicle folder</a>. All card images are included for offline play. Chronicle effects use the supplied .koro files. The Legacy catalogue was checked on ${esc(CHRONICLE_DB.checked)} and now updates from Drive automatically.</p><p>Interface and turn flow inspired by <a href="https://beymetchannel.github.io/PlakoroBattle/" target="_blank" rel="noopener">PlakoroBattle</a>. Pokémon and move card images come directly from PlakoroDB and the Chronicle folder. Pokémon and associated artwork belong to their respective owners.</p><p>${esc(formatDefinition(battle?.format||battleFormat).rules)}</p></div></section>`}
function renderPreview(){const m=ui.preview;return `<section class="overlay" role="dialog" aria-label="${esc(m.name)} card"><header class="overlay-head"><h2>${esc(m.name)}</h2>${btn('close-preview','×','close-btn','aria-label="Close card"')}</header><div class="card-view"><img src="${asset(m.image)}" alt="${esc(m.name)} card"></div></section>`}
function render(){cardUpdater?.maybeApply();window.ChronicleSync?.maybeApply();stage.innerHTML=(mode==='formats'?renderHome():mode==='battle'&&battle?renderBoard():renderSetup())+(ui.modal==='menu'?renderMenu():ui.modal==='league-party'?renderLeagueParty():['pokemon','moves'].includes(ui.modal)?renderPicker():'')+(ui.preview?renderPreview():'');fitStage()}
function renderBuilder(){render()}
function renderBattle(){render()}
function setMode(m){mode=m;ui.modal=null;ui.preview=null;render()}
function showImpact(i,damage,failed){const el=document.createElement('div');el.className='impact'+(failed?' fail':'');el.innerHTML=`<span>${failed?'Technique failed':damage===0?'No damage':'−'+damage}</span>`;stage.appendChild(el);setTimeout(()=>el.remove(),820);$('announcement').textContent=failed?'Technique failed':`${damage} damage. ${pokemonLabel(battle.fighters[i].pokemon)} has ${battle.fighters[i].hp} HP.`}
function startFirst(index){battle=battle||newBattle();if(!battle)return;startControllerTurn(battle.fighters[index].controller);mode='battle';ui.modal=null;saveBattle();render();const a=battle.fighters[battle.turnIndex];if(a){const el=document.createElement('div');el.className='turn-banner';el.innerHTML=`<h2>${esc(fighterLabel(a))}</h2>${dice(a)}`;stage.appendChild(el);setTimeout(()=>el.remove(),1020)}}
stage.addEventListener('input',e=>{if(e.target.dataset.enekoroIndex!==undefined){const i=Number(e.target.dataset.enekoroIndex);if(isLeagueFormat()&&leagueCanEdit(i)){players[i].enekoroNotes=e.target.value.slice(0,120);saveBuilds();}return;}if(e.target.id==='pokemonSearch'){ui.search=e.target.value;const pos=e.target.selectionStart;render();const input=$('pokemonSearch');input.focus();input.setSelectionRange(pos,pos)}});
stage.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action,index=Number(b.dataset.index),value=b.dataset.value??b.dataset.index;
 if(handleLeagueAction(action,index,value))return;
 switch(action){
 case 'check-updates':cardUpdater?.check();window.ChronicleSync?.check(true);break;
 case 'format':ui.modal=null;chooseBattleFormat(value);break;
 case 'home':concealLeagueSetup();setMode('formats');break;
 case 'continue':setMode('builder');break;
 case 'chronicle':chronicleMode=!chronicleMode;saveBuilds();render();break;
 case 'royale-count':resizeRoyale(battleFormat==='royale3'?4:3);break;
 case 'edit-player':if(isLeagueFormat()&&!leagueCanEdit(index))break;active=index;ui.loadout=-1;ui.search='';ui.modal=isLeagueFormat()&&leagueSetup.phase==='party'?'pokemon':cur().pokemon?'moves':'pokemon';render();break;
 case 'clear-loadout':{
  const previous=players[index];if(!previous?.pokemon)break;
  const blank=emptyBuild();if(isLeagueFormat()&&leagueSetup.phase!=='party')blank.pokemon=previous.pokemon;blank.enekoroNotes=previous.enekoroNotes||'';clearedLoadouts.set(blank,clone(previous));players[index]=blank;active=index;
  ui={modal:null,loadout:-1,search:'',preview:null};saveBuilds();render();
  $('announcement').textContent=`${slotLabel(index)} loadout cleared.`;break;
 }
 case 'undo-clear-loadout':{
  const blank=players[index],previous=clearedLoadouts.get(blank);if(!previous||blank.pokemon&&!(isLeagueFormat()&&!blank.moves.length))break;
  players[index]=previous;clearedLoadouts.delete(blank);active=index;
  ui={modal:null,loadout:-1,search:'',preview:null};saveBuilds();render();
  $('announcement').textContent=`${slotLabel(index)} loadout restored.`;break;
 }
 case 'loadout':ui.loadout=index;ui.search='';ui.modal=editLoadout().pokemon?'moves':'pokemon';render();break;
 case 'change-pokemon':ui.modal='pokemon';ui.search='';render();break;
 case 'pick-pokemon':{const l=editLoadout();if(l.pokemon!==value){l.pokemon=value;l.moves=[]}syncEvolutionLoadouts(cur());ui.modal=isLeagueFormat()&&leagueSetup.phase==='party'?null:'moves';saveBuilds();render();break}
 case 'pick-move':{
  const p=cur(),l=editLoadout(),from=ui.loadout,m=movesForPokemon(l.pokemon,from>=0)[index],found=l.moves.findIndex(x=>moveId(x)===moveId(m));
  let added=false,y=$('pickerScroll').scrollTop;
  if(found>=0)l.moves.splice(found,1);else if(l.moves.length<4&&(!m.special||!l.moves.some(x=>canonical(x).special))){l.moves.push(m);added=true;}
  syncEvolutionLoadouts(p);
  if(added&&from>=0&&isEeveeDevolve(m)){
   const next=nextEeveeAlternate(p,from);
   if(next>=0){ui.loadout=next;ui.modal=editLoadout().pokemon?'moves':'pokemon';ui.search='';y=0;}
  }
  if(ui.loadout>=p.evolutionLoadouts.length){ui.loadout=p.evolutionLoadouts.length-1;ui.modal=editLoadout().pokemon?'moves':'pokemon';y=0;}
  saveBuilds();render();$('pickerScroll').scrollTop=y;break;
 }
 case 'confirm-moves':{syncEvolutionLoadouts(cur());const next=cur().evolutionLoadouts.findIndex(l=>!isLoadoutComplete(l));if(next>=0){ui.loadout=next;ui.modal=editLoadout().pokemon?'moves':'pokemon'}else ui.modal=null;saveBuilds();render();break}
 case 'add-evolution':{const next=appendEeveeAlternate(cur());if(next>=0){ui.loadout=next;ui.modal=editLoadout().pokemon?'moves':'pokemon';ui.search='';saveBuilds();render()}break}
 case 'remove-loadout':{if(editLoadout()?.kind==='eevee-alternate'){cur().evolutionLoadouts.splice(ui.loadout,1);ui.loadout=0;ui.modal='moves';saveBuilds();render()}break}
 case 'close-picker':ui.modal=null;saveBuilds();render();break;
 case 'start-first':if(!setupError()){battle=null;cardUpdater?.maybeApply();window.ChronicleSync?.maybeApply();battle=newBattle();startFirst(index)}break;
 case 'battle-first':startFirst(index);break;
 case 'attacker':if(availableAttackers().includes(index)){battle.turnIndex=index;battle.phase='turn';consumeSkippedTurn();saveBattle();render()}break;
 case 'borrow-move':borrowMove(value);break;
 case 'borrow-pass':finishBorrowedMove();break;
 case 'target':if(legalTargets().includes(index)){battle.targetIndex=index;saveBattle();render()}break;
 case 'fighter':if(battle.phase==='turn'&&legalTargets().includes(index)){battle.targetIndex=index;saveBattle();render()}break;
 case 'attack':selectAttack(index);break;
 case 'outcome':chooseOutcome(index);break;
 case 'fail':commitOutcome(true);break;
 case 'cancel-attack':if(!battle.repeat){battle.phase='turn';battle.selectedMove=null;battle.pending=null;saveBattle();render()}break;
 case 'back-outcomes':battle.pending=null;saveBattle();render();break;
 case 'answer':answerQuestion(value);break;
 case 'answer-input':answerQuestion($('effectCount').value);break;
 case 'repeat-yes':battle.phase='resolve';saveBattle();render();break;
 case 'repeat-no':finishRepeatedMove();break;
 case 'undo':undoBattle();break;
 case 'resume':ui.modal=null;mode='battle';render();break;
 case 'rematch':if(battle){ui.modal=null;mode='battle';rematchBattle()}break;
 case 'end-battle':battle=null;saveBattle();setMode('formats');break;
 case 'menu':ui.modal='menu';render();break;
 case 'close-menu':ui.modal=null;render();break;
 case 'preview-attack':ui.preview=selectedBattleMove();render();break;
 case 'close-preview':ui.preview=null;render();break;
 case 'hp-minus':case 'hp-plus':adjustHp(index,action==='hp-plus'?10:-10);break;
 }
});
loadBuilds();loadBattle();render();

function applyModernCatalog(c){
 for(const m of c.moves)m.name=cleanMoveName(m.name);
 const freshNames=new Set(c.characters.map(p=>p.name));
 for(const p of c.characters){DATA.pokemon[p.name]={pokemon:p,moves:c.moves.filter(m=>m.owner===p.name)};POKEMON_META[p.name]={hp:p.hp,type:p.type,weakness:p.weakness};}
 DATA.order=c.characters.map(p=>p.name);
 const old=ALL_MOVES.filter(m=>!m.chronicle&&!c.moves.some(x=>x.code===m.code));
 ALL_MOVES.splice(0,ALL_MOVES.length,...c.moves,...Object.values(CHRONICLE_DB.movePools).flat(),...old);
 CHRONICLE_DB.order=Object.keys(CHRONICLE_DB.pokemon).filter(n=>!freshNames.has(n));
 if(window.CHRONICLE_DATA)applyChronicleCatalog(window.CHRONICLE_DATA);
 players=players.map(cleanPlayer);players.forEach(syncEvolutionLoadouts);saveBuilds();
}
function canApplyCardUpdates(){return !['pokemon','moves'].includes(ui.modal)&&(!isLeagueFormat()||leagueSetup.phase==='party'||battle?.phase==='winner')&&(!battle||battle.phase==='winner')}
function applyChronicleCatalog(c){
 const next=ChronicleBattle.catalogue(c,DATA.order),modern=new Set(DATA.order),byCode=new Map(Object.entries(next.pokemon).map(([n,b])=>[b.pokemon.code,n])),aliases=new Map();
 const images=new Map(ChronicleSync.cards(c).filter(x=>/^(?:OG[CW]|OCW)\d+(?:-\d+)+$/.test(x.code||x.id||'')).map(x=>[ChronicleBattle.imagePath(x),x.image]));
 for(const [n,b]of Object.entries(CHRONICLE_DB.pokemon)){const key=byCode.get(b.pokemon.code);if(key&&key!==n)aliases.set(n,key);}
 function rename(p){if(!p)return;if(aliases.has(p.pokemon))p.pokemon=aliases.get(p.pokemon);for(const l of [...(p.evolutionLoadouts||[]),...(p.loadouts||[])])rename(l);}
 if(chronicleMode)players.forEach(rename);
 for(const setup of Object.values(formatSetups))if(setup.chronicleMode)setup.players?.forEach(rename);
 function renameBattle(b){if(!b)return;if(b.chronicle)b.fighters?.forEach(rename);renameBattle(b.snapshot);}
 renameBattle(battle);
 for(const n of Object.keys(CHRONICLE_DB.pokemon))if(!modern.has(n)){delete DATA.pokemon[n];delete POKEMON_META[n];}
 Object.assign(CHRONICLE_DB,next);
 for(const [n,b]of Object.entries(next.pokemon)){if(!modern.has(n))DATA.pokemon[n]=b;POKEMON_META[n]={hp:b.pokemon.hp,type:b.pokemon.type,weakness:b.pokemon.weakness};}
 const moves=Object.values(next.movePools).flat(),fresh=new Set(moves.map(m=>m.code));
 const retained=ALL_MOVES.filter(m=>!/^RE[CW]/.test(m.code||'')&&(!m.chronicle||!fresh.has(m.code)));
 ALL_MOVES.splice(0,ALL_MOVES.length,...moves,...retained);chronicleImages=images;
 players=players.map(cleanPlayer);players.forEach(syncEvolutionLoadouts);saveBuilds();if(battle)saveBattle();
}
function renderUpdateStatus(){
 const s=cardUpdater?.state,c=window.ChronicleSync,checking=s?.checking||c?.checking;
 return `<section class="update-status"><h3>Automatic card updates</h3><p>PlakoroDB and Chronicle Drive are checked when you open or return to the tracker and when your connection returns. While open, PlakoroDB is checked every 15 minutes and Chronicle Drive every 30 minutes. Downloaded cards are saved for offline use. Updates wait until your battle or loadout is closed.</p><h4>PlakoroDB · 2026 cards</h4><p role="status">${esc(s?.message||'Starting update checks…')}</p><p>${s?.lastChecked?'Last checked: '+esc(new Date(s.lastChecked).toLocaleString()):'Using the included modern cards'} · ${DATA.order.length} modern Pokémon</p><h4>Chronicle Drive · OG cards only</h4><p id="chronicle-status" role="status">${esc(c?.status||'Starting Chronicle updates…')}</p><p>${c?.lastChecked?'Last checked: '+esc(new Date(c.lastChecked).toLocaleString()):'Included Legacy cards: '+esc(CHRONICLE_DB.checked)} · ${Object.keys(CHRONICLE_DB.pokemon).length} original Pokémon · ${Object.values(CHRONICLE_DB.movePools).flat().length} moves</p>${btn('check-updates',checking?'Checking…':'Check for updates now','large-btn',checking?'disabled':'')}</section>`;
}
cardUpdater=PlakoroUpdates.create({bundle:PLAKORO_BUNDLE,canApply:canApplyCardUpdates,apply:applyModernCatalog,onStatus:()=>{if(ui.modal==='menu')render();else if(!ui.modal&&mode!=='battle')render()}});
window.addEventListener('chronicle-updated',()=>render());
window.addEventListener('chronicle-status',()=>{if(ui.modal==='menu')render()});
cardUpdater.start();
ChronicleSync.start();
