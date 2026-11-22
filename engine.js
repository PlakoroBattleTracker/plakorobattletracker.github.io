/* Resolution is transactional: physical-roll questions are answered before HP or
   status changes are committed. Card text comes from the retained databases. */
const clone=x=>JSON.parse(JSON.stringify(x));
function canonical(m){return hydrateMove(m)}
function moveId(m){return m.code||m.image}
function selectedBattleMove(){return battle.borrowedMove||canonical(battle.fighters[battle.turnIndex].moves[battle.selectedMove])}
function effectText(text){return text.replace(/charakoro|characcoro/gi,'characoro').replace(/Pokermon|poekmon/gi,'Pokemon').replace(/damag(?:e)?|damge/gi,'damage').replace(/thenumber/gi,'the number').replace(/incraes/gi,'increase').replace(/enekoro you rol\b/gi,'enekoro you roll').replace(/On you next/gi,'On your next').replace(/to yourself/gi,'to itself').replace(/\bopn\b/gi,'on').replace(/choose one of/gi,'Choose 1 of')
 .replace(/(increase|reduce) the number of enekoro you roll (?:(?:during|on) )?(?:(?:your|you) )?next turn by ((?:an additional )?\d+)/gi,'On your next turn, $1 the number of enekoro you roll by $2')
 .replace(/reduce the number of enekoro your opponent rolls? on their next turn by ((?:an additional )?\d+)/gi,"On your opponent's next turn, reduce the number of enekoro they roll by $1")
 .replace(/heals an additional (\d+)/gi,'heals $1 additional');}
function orientationAllowed(f,os){return !f.charBlocked&&(!f.fixedOrientation||os.includes(f.fixedOrientation))}
function activeText(text,a,t){
 return text.replace(/If the opponent is a \{([A-Z])\} type, ([^.]+)\./gi,(_,type,e)=>fighterMeta(t).type===PlakoroSource.TYPES[type]?e+'.':'')
 .replace(/If this Pokémon was not damaged by an attack during your opponent's last turn, ([^.]+)\./gi,(_,e)=>a.lastAttackDamage===0?e+'.':'')
 .replace(/During your last turn, if this Pokémon's "([^"]+)" attack was successful, ([^.]+)\./gi,(_,n,e)=>cleanMoveName(a.lastMove)===cleanMoveName(n)&&!a.lastMoveFailed?e+'.':'')
 .replace(/If you successfully used "([^"]+)" (?:(?:during|on) your |)last turn, ([^.]+)\./gi,(_,n,e)=>cleanMoveName(a.lastMove)===cleanMoveName(n)&&!a.lastMoveFailed?e+'.':'')
 .replace(/If you used ([^.]+?) successfully on your last turn, ([^.]+)\./gi,(_,n,e)=>cleanMoveName(a.lastMove)===cleanMoveName(n)&&!a.lastMoveFailed?e+'.':'')
 .replace(/During your last turn, if your Enekoro roll failed, ([^.]+)\./gi,(_,e)=>a.lastMoveFailed?e+'.':'')
 .replace(/During your opponent's last turn, if their Enekoro roll failed, ([^.]+)\./gi,(_,e)=>t.lastMoveFailed?e+'.':'')
 .replace(/If this pokemon has (\d+) or less HP remaining, ([^.]+)\./gi,(_,hp,e)=>a.hp<=+hp?e+'.':'');
}
function baseAttackDamage(a,t,m){
 let d=m.baseDamage||0;
 if(/damage equal to the damage of the last attack/i.test(m.effect))d=t.lastBaseDamage||0;
 const weak=d>0&&m.type===fighterMeta(t).weakness&&!/isn't affected by Weakness/i.test(m.effect);
 return d+(weak?20:0)+(t.incomingMod||0)+(a.attackMod||0);
}
function visibleDamage(a,t,m){return t.incomingSet!=null?t.incomingSet:Math.max(0,baseAttackDamage(a,t,m))*(t.incomingMultiplier||1)}
function effectQuestion(r,title,detail,max,field,per=1,min=0){r.questions.push({kind:'count',title,detail,max,min,field,per})}
function chibiQuestion(r,f,title,detail,max,field,per=1){
 if(f.chibiBlocked){r.questions.push({kind:'notice',title:'Chibi Characoro unavailable',detail:`${pokemonLabel(f.pokemon)} cannot roll Chibi Characoro this turn. This roll contributes zero.`});return;}
 effectQuestion(r,title,detail,max,field,per);
}
function buildOutcome(a,t,m,outcome=-1){
 m=canonical(m);const ce=m.outcomes?.[outcome];
 const r={damage:baseAttackDamage(a,t,m),selfDamage:0,heal:0,selfEnergy:0,enemyEnergy:0,defense:0,nullify:false,blockChar:false,fixedEnemy:null,fixedSelf:null,attackBonus:0,repeat:false,questions:[],answers:[],ban:[],outcome,transition:null};
 r.weaknessPending=!m.baseDamage&&m.type===fighterMeta(t).weakness&&!/isn't affected by Weakness/i.test(m.effect);
 let text=effectText(activeText([m.effect,ce?.text].filter(Boolean).join(' '),a,t)).replace(/in crease/gi,'increase');
 // Variable effects each receive a physical-dice prompt. Remove those clauses
 // before parsing flat bonuses so they can never be applied twice.
 if(m.code==='OGW27-1-06'){
  effectQuestion(r,'Declare your number','Choose a number before rolling the 12 Chibi Characoro.',12,'prediction',1,1);
  chibiQuestion(r,a,'Roll 12 Chibi Characoro','How many landed Standing?',12,'prophecyRoll');
  r.prediction=0;r.prophecyRoll=0;r.prophecyRecoil=ce?10:0;text='';
 }
 if(m.code==='OGW05-1-04'){
  chibiQuestion(r,a,'Roll your 12 Chibi Characoro','How many of your rolls landed Standing?',12,'damage',20);
  chibiQuestion(r,t,'Opponent: roll 12 Chibi Characoro','How many of the opponent’s rolls landed Standing?',12,'selfDamage',10);
  text=text.replace(/Both players roll 12 chibi characoro,[^.]*\. This pokemon does 10 damage to itself for each \{st\} your opponent rolled\./i,'');
 }
 if(m.code==='OGW05-004'){
  effectQuestion(r,'Reroll your Enekoro','How many Fighting symbols did you roll? Count both symbols on double faces.',Math.max(24,energyDiceFor(a)*2),'damage',10);
  text=text.replace(/, then re-roll your enekoro and deal an additional 10 damage for each \{F\} rolled\./i,'.');
 }
 const replacement=text.match(/Roll (\d+) chibi characoro instead of/i);
 text=text.replace(/Rolls? (\d+)(?: more)? chibi characoro,\s*([^.]*(?:\.|$))/gi,(whole,num,clause)=>{
  const n=replacement?+replacement[1]:+num;
  let per=+(clause.match(/(?:does|heals?) (\d+)/i)?.[1]||1),field='damage';
  if(/reduce the number/i.test(clause)){field=/your opponent|opponent rolls/i.test(clause)?'enemyEnergy':'selfEnergy';per=-1}
  if(/increase the number/i.test(clause)){field='selfEnergy';per=1}
  if(/heals? \d+/i.test(clause))field='heal';
  const symbols=clause.match(/(?:gain|add) (\d+) \{([RCLWGPFDMYN])\}/i);
  if(symbols){field='energySymbols';per=+symbols[1];r.energySymbols??=0;r.symbolType=PlakoroSource.TYPES[symbols[2].toUpperCase()]}
  chibiQuestion(r,a,`Roll ${n} Chibi Characoro`,'How many landed Standing?',n,field,per);
  if(field==='energySymbols'&&/does (\d+) damage to itself/i.test(clause)&&!a.chibiBlocked&&!/does 0 damage to itself instead/i.test(text))r.questions.at(-1).also=[{field:'selfDamage',per:+clause.match(/does (\d+) damage to itself/i)[1]}];
  return '';
 });
 if(/for each \{[RCLWGPFDMY]\}/i.test(text)){
  const clause=text.match(/[^.]*for each \{[RCLWGPFDMY]\}[^.]*(?:\.|$)/i)?.[0]||'';
  const symbols=[...new Set([...clause.matchAll(/\{([RCLWGPFDMY])\}/g)].map(x=>x[1]))];
  const types={R:'Fire',C:'Normal',L:'Electric',W:'Water',G:'Grass',P:'Psychic',F:'Fighting',D:'Dark',M:'Steel',Y:'Flying'};
  const healing=/heals/i.test(clause),per=+(clause.match(/(?:does|heals) (\d+)/i)?.[1]||10);
  const multiplier=symbols.length===1?(a.energyMultipliers?.[PlakoroSource.TYPES[symbols[0]]]||1):1;
  effectQuestion(r,/re-?roll your enekoro/i.test(text)?'Reroll your Enekoro':'Count the energy symbols',`How many ${symbols.map(x=>types[x]).join(' and ')} symbols did you roll? Count both symbols on double faces.${multiplier>1?' Enter the printed symbols; Energy Burn doubles their value automatically.':''}`,Math.max(24,energyDiceFor(a)*2),healing?'heal':'damage',per*multiplier);
  if(/after the fifth/i.test(clause))r.questions.at(-1).offset=5;
  text=text.replace(clause,'');
 }
 if(/The opponent rolls (\d+) Enekoro/i.test(text)){
  const n=+(text.match(/opponent rolls (\d+)/i)[1]),per=+(text.match(/Add (\d+) damage/i)[1]);
  effectQuestion(r,`Opponent: roll ${n} Enekoro`,'Count the symbols of the energy type rolled most often.',n*2,'damage',per,1);
  text=text.replace(/The opponent rolls \d+ Enekoro\. Add \d+ damage[^.]*\./gi,'');
 }
 if(/Each time the Chara[ck]oro roll succeeds/i.test(text)){
  const n=+(m.effect.match(/Roll your Chara[ck]oro (\d+)/i)?.[1]||1),per=+(text.match(/Each time[^.]*does (\d+)/i)?.[1]||0);
  effectQuestion(r,`Roll your Characoro ${n} times`,'How many rolls matched this Character Die effect?',n,'damage',per);
  text=text.replace(/Each time the Chara[ck]oro[^.]*\./gi,'');
 }
 if(/Your opponent also rolls their Chara[ck]oro/i.test(text)){
  const n=+(text.match(/also rolls their Chara[ck]oro (\d+)/i)?.[1]||1),per=+(text.match(/(?:For each|On) \{[^.]*does (\d+)/i)?.[1]||0);
  const dirs=[...text.matchAll(/\{(hs|do|s1|s2|st|ba)\}/g)].map(x=>({hs:'Handstand',do:'Down',s1:'Left',s2:'Right',st:'Standing',ba:'Back'}[x[1]]));
  effectQuestion(r,`Opponent: roll Characoro ${n===1?'once':n+' times'}`,`How many landed ${[...new Set(dirs)].join(' / ')}?`,n,'damage',per);
  text=text.replace(/Your opponent also rolls[^.]*\. (?:For each|On)[^.]*\./gi,'');
 }
 if(/Reroll your Chara[ck]oro\. \(Can be repeated until it fails/i.test(text)){
  const per=+(text.match(/This attack does (\d+) more damage\. Reroll/i)?.[1]||30);
  effectQuestion(r,'Reroll until it fails','How many successes in total, including the first successful roll?',100,'damage',per,1);
  text=text.replace(/This attack does \d+ more damage\. Reroll[^.]*\. \(Can be repeated until it fails\.\)/gi,'');
 }
 if(/This attack does nothing/i.test(text))r.damage=0;
 for(const x of text.matchAll(/This (?:attack|move|Pok[eé]mon) does (?:an additional )?(\d+) (more |additional )?damage(?! for each| to itself)/gi)){
  const extra=/additional|more/i.test(x[0]);r.damage=extra?r.damage+(+x[1]):+x[1]+(m.type===fighterMeta(t).weakness&&!/isn't affected by Weakness/i.test(m.effect)?20:0)+(t.incomingMod||0)+(a.attackMod||0);
  if(extra&&+x[1]>0&&r.weaknessPending)r.damage+=20;
  if(+x[1]>0)r.weaknessPending=false;
 }
 if(/Damage dealt by this attack is doubled/i.test(text))r.damage*=2;
 for(const x of text.matchAll(/This (?:attack|move) does (\d+) less damage/gi))r.damage-=+x[1];
 for(const x of text.matchAll(/This (?:Pok[eé]mon|move) (?:also )?does (\d+) (?:additional )?damage to itself/gi))r.selfDamage+=+x[1];
 r.recoilEqualsDamage=/does the same amount of damage to itself that it did to the opponent/i.test(text);
 if(/Prevent the damage this move would do|Reduce the damage this move does to 0|does 0 damage to itself instead/i.test(text))r.selfDamage=0;
 for(const x of text.matchAll(/Heal (\d+)(?: more| additional)? damage (?:from|for) this Pok[eé]mon|(?:This (?:Pok[eé]mon|move)|it) heals (\d+)(?: additional| more)? (?:HP|damage)/gi))r.heal+=+(x[1]||x[2]);
 if(/heals (\d+) (?:damage|HP)[^.]*instead/i.test(text))r.heal=+text.match(/heals (\d+) (?:damage|HP)[^.]*instead/i)[1];
 for(const x of text.matchAll(/(?:On|During) (?:the |your |you )?opponent'?s?(?: next)? turn,? reduce the number (?:of )?enekoro(?: (?:they|you) roll)? by (?:an additional |another )?(\d+)/gi))r.enemyEnergy-=+x[1];
 for(const x of text.matchAll(/On your(?: next)? turn,? (increase|reduce) the number of enekoro (?:you )?roll by (?:an additional |another )?(\d+)/gi))r.selfEnergy+=(x[1].toLowerCase()==='increase'?1:-1)*+x[2];
 for(const x of text.matchAll(/takes (\d+) less damage|Reduce damage taken by an additional (\d+)|takes -(\d+) damage/gi))r.defense-=+(x[1]||x[2]||x[3]);
 const replacementDefense=text.match(/takes (\d+) less damage[^.]*instead/i);if(replacementDefense)r.defense=-Number(replacementDefense[1]);
 if(/takes double damage/i.test(text))r.incomingMultiplier=2;
 if(/doesn't take damage from attacks/i.test(text))r.nullify=true;
 if(/cannot roll their Chara[ck]oro/i.test(text))r.blockChar=true;
 if(/cannot roll their Chibi characoro/i.test(text))r.blockChibi=true;
 const energyMultiplier=text.match(/every \{([RCLWGPFDMYN])\} rolled counts as (\d+)\{\1\}/i);
 if(energyMultiplier)r.energyMultipliers={[PlakoroSource.TYPES[energyMultiplier[1]]]:+energyMultiplier[2]};
 const fixed=text.match(/set the direction of their Chara[ck]oro to \{(hs|do|ba|st|s1|s2)\}/i);if(fixed)r.fixedEnemy={hs:'handstand',do:'down',ba:'back',st:'standing',s1:'left',s2:'right'}[fixed[1]];
 if(/same direction it rolled with this move/i.test(text)){
  if(ce?.orientations.length===1)r.fixedSelf=ce.orientations[0];
  else r.questions.push({kind:'orientation',title:'Which way did your Characoro land?',options:ce?.orientations||[],field:'fixedSelf'});
 }
 const ban=text.match(/Choose (\d+) of (?:your opponent's|their) (?:attacks|moves)/i);
 if(ban){const force=/they use this attack/i.test(text),options=t.moves.filter(x=>force||x.name!==t.lastMove);if(options.length)r.questions.push({kind:force?'force-move':'ban',title:force?'Choose their attack for next turn':'Choose a move to disable next turn',options:options.map(moveId),remaining:+ban[1]})}
 if(/Use "Electric Rush" 1 more time/i.test(text))r.repeat=true;
 for(const x of text.matchAll(/all damage dealt is increased by (\d+)/gi))r.attackBonus=+x[1];
 const bonus=text.match(/your moves do (\d+) more damage/i);if(bonus)r.attackBonus=+bonus[1];
 if(/20 more damage instead of 10/i.test(text))r.attackBonus=20;
 if(m.action){
  const choices=transitionChoices(a,m);if(choices.length===1)r.transition=choices[0];
  else if(choices.length)r.questions.push({kind:'evolution',title:'Choose an evolution',options:choices});
  // Heal before changing the maximum. It is applied once below after transition.
 }
 if(m.conditionalEvolution&&a.lastMove==='Evolve'&&a.lastMoveFailed){
  const trigger=a.moves.map(canonical).find(x=>x.action==='evolve'&&x.targets.includes(m.conditionalEvolution));
  const choices=trigger?transitionChoices(a,trigger):[];
  if(choices.length===1){r.transition=choices[0];r.transitionMove=trigger;}
 }
 r.repeatRequired=/(?:use|perform) this move twice/i.test(m.effect);
 r.repeatLimit=r.repeatRequired||/up to twice|twice during/i.test(m.effect)?2:/3 times (?:per turn|during your turn)/i.test(m.effect)?3:0;
 r.skipEnemy=/Your opponent skips their next turn/i.test(text);
 r.skipSelf=/Skip your next turn/i.test(text);
 if(/their characoro lands on/i.test(text))r.barrier=['handstand','back','down'];
 r.chooseOrientation=/may choose the position/i.test(text);
 if(/Heal all damage/i.test(text))r.heal=a.maxHp;
 const shield=text.match(/prevent all damage[^.]*if that damage is (\d+) or less/i);if(shield)r.thresholdShield=+shield[1];
 if(/if the Characoro rolls \{s1\}\{s2\}, you do not take damage/i.test(text))r.sideShield=true;
 if(/can reroll your Characoro/i.test(text))r.rerolls=/reroll it twice/i.test(text)?2:1;
 const reroll=text.match(/choose (\d+) rolled Enekoro, and have them roll them again/i);if(reroll)r.rerollEnemy=+reroll[1];
 if(/swap out as many chips/i.test(text))r.questions.push({kind:'notice',title:'Swap Energy Die chips',detail:'Choose one of your Energy Dice and swap any of its chips using chips you already have.'});
 if(t.sideShield){const dirs=ce?.orientations||['standing','handstand','back','down','left','right'];if(dirs.every(d=>['left','right'].includes(d)))r.preventDamage=true;else if(dirs.some(d=>['left','right'].includes(d)))r.questions.unshift({kind:'side-shield',title:'Which way did your Character Die land?',detail:'Your opponent is protected from Sideways attacks this turn.',options:dirs});}
 if(m.code==='OGW27-004'){
  r.borrow=true;r.borrowEnergy=ce?(/increase/i.test(ce.text)?1:-1):0;
 }
 if(a.failureOrientations?.length){
  const dirs=ce?.orientations||m.requiredOrientations||['standing','handstand','back','down','left','right'];
  if(dirs.every(d=>a.failureOrientations.includes(d)))r.forcedFail=true;
  else if(dirs.some(d=>a.failureOrientations.includes(d)))r.questions.unshift({kind:'barrier',title:'Psycho Barrier · Which way did your Characoro land?',options:dirs});
 }

 return r;
}
function outcomeDamage(r,t){const d=t.incomingSet!=null?t.incomingSet:Math.max(0,r.damage)*(t.incomingMultiplier||1);return r.preventDamage||(t.incomingThreshold!=null&&d<=t.incomingThreshold)?0:d}
function selectAttack(index){
 const a=battle.fighters[battle.turnIndex],m=canonical(a.moves[index]);
 if(isMoveDisabled(a,m)||!legalTargets().includes(battle.targetIndex))return;
 battle.selectedMove=index;battle.borrowedMove=null;battle.phase='resolve';battle.pending=null;saveBattle();render();
}
function isMoveDisabled(f,m){if(m.maxUserHp!=null&&f.hp>m.maxUserHp)return true;if(f.forcedMove)return moveId(m)!==f.forcedMove;return (m.special&&(f.usedSpecialMoves||[]).includes(moveId(m)))||(!battle.repeat&&(f.lastMove===m.name||(f.bannedMoves||[]).some(v=>v===moveId(m)||v===m.name)))}
function chooseOutcome(index){
 if(battle.phase!=='resolve'||battle.pending)return;
 const a=battle.fighters[battle.turnIndex],t=battle.fighters[battle.targetIndex],m=selectedBattleMove();
 if(index<0&&m.requiredOrientations){commitOutcome(true);return}
 if(index>=0&&!orientationAllowed(a,m.outcomes[index]?.orientations||[]))return;
 if(m.action&&!transitionChoices(a,m).length)return;
 battle.pending=buildOutcome(a,t,m,index);saveBattle();continueResolution();
}
function continueResolution(){if(battle.pending.forcedFail)commitOutcome(true);else if(battle.pending.questions.length)render();else commitOutcome(false)}
function answerQuestion(value){
 const r=battle.pending,q=r?.questions[0];if(!q)return;
 if(q.kind==='count'){
  value=Number(value);if(!Number.isInteger(value)||value<q.min||value>q.max)return;
  const count=Math.max(0,value-(q.offset||0));r[q.field]+=count*q.per;
  if(q.field==='damage'&&count*q.per>0&&r.weaknessPending){r.damage+=20;r.weaknessPending=false}
  for(const extra of q.also||[])r[extra.field]+=count*extra.per;
 }else if(q.kind==='orientation'){if(!q.options.includes(value))return;r.fixedSelf=value}
 else if(q.kind==='ban'){if(!q.options.includes(value)||r.ban.includes(value))return;r.ban.push(value);q.remaining--;q.options=q.options.filter(x=>x!==value);if(q.remaining>0&&q.options.length){saveBattle();render();return}}
 else if(q.kind==='evolution'){value=Number(value);if(!q.options.includes(value))return;r.transition=value}
 else if(q.kind==='barrier'){if(!q.options.includes(value))return;if(battle.fighters[battle.turnIndex].failureOrientations.includes(value)){commitOutcome(true);return}}
 else if(q.kind==='force-move'){if(!q.options.includes(value))return;r.forceMove=value}
 else if(q.kind==='side-shield'){if(!q.options.includes(value))return;r.preventDamage=['left','right'].includes(value)}
 else if(q.kind==='notice'){if(value!=='done')return}
 r.questions.shift();saveBattle();continueResolution();
}
function snapshotBattle(){const s=clone(battle);s.snapshot=null;s.pending=null;s.phase='turn';s.selectedMove=null;s.repeat=false;s.chain=null;return s}
function commitOutcome(failed){
 if(!battle||battle.phase!=='resolve')return;
 const ai=battle.turnIndex,ti=battle.targetIndex,a=battle.fighters[ai],t=battle.fighters[ti],m=selectedBattleMove();
 const r=failed?null:battle.pending;if(!failed&&(!r||r.questions.length))return;
 if(r&&r.prophecyRoll!=null){const hit=r.prediction===r.prophecyRoll&&r.prophecyRoll>0;r.damage+=hit?r.prophecyRoll*20+(r.weaknessPending?20:0):0;r.selfDamage+=r.prophecyRoll*r.prophecyRecoil}
 if(!battle.repeat)battle.snapshot=snapshotBattle();
 const damage=failed?0:outcomeDamage(r,t),wasRepeat=!!battle.repeat;
 // Modifiers for the current attack expire before new card effects are added.
 if(!wasRepeat){a.energyMod=0;a.energySymbols=0;a.energyMultipliers={};a.charBlocked=false;a.chibiBlocked=false;a.fixedOrientation=null;a.chooseOrientation=false;a.failureOrientations=[];a.bannedMoves=[];a.attackMod=0;a.forcedMove=null;a.rerolls=0;a.rerollEnergy=0}
 t.incomingMod=0;t.incomingSet=null;t.incomingThreshold=null;t.incomingMultiplier=1;t.sideShield=false;t.lastAttackDamage=damage;
 a.lastMove=m.name;a.lastMoveCode=moveId(m);a.lastBaseDamage=m.baseDamage||0;a.lastMoveFailed=failed;
 if(m.special)a.usedSpecialMoves=[...new Set([...(a.usedSpecialMoves||[]),moveId(m)])];
 if(failed&&m.failureDamage)a.hp=Math.max(0,a.hp-m.failureDamage);
 if(r){
  if(r.recoilEqualsDamage)r.selfDamage+=damage;
  t.hp=Math.max(0,t.hp-damage);a.hp=Math.max(0,a.hp-r.selfDamage);
  if(m.action)applyChronicleTransition(a,m,r.transition);
  else if(r.transitionMove)applyChronicleTransition(a,r.transitionMove,r.transition);
  a.hp=Math.min(a.maxHp,a.hp+r.heal);
  a.energyMod=(a.energyMod||0)+r.selfEnergy;t.energyMod=(t.energyMod||0)+r.enemyEnergy;
  a.incomingMod=(a.incomingMod||0)+r.defense;if(r.nullify)a.incomingSet=0;
  if(r.incomingMultiplier)a.incomingMultiplier=r.incomingMultiplier;
  if(r.blockChar)t.charBlocked=true;if(r.fixedEnemy)t.fixedOrientation=r.fixedEnemy;if(r.fixedSelf)a.fixedOrientation=r.fixedSelf;
  if(r.blockChibi)t.chibiBlocked=true;if(r.energyMultipliers)a.energyMultipliers=r.energyMultipliers;
  a.attackMod=(a.attackMod||0)+r.attackBonus;t.bannedMoves=[...new Set([...(t.bannedMoves||[]),...r.ban])];
  if(r.skipEnemy)t.skipTurns=(t.skipTurns||0)+1;if(r.skipSelf)a.skipTurns=(a.skipTurns||0)+1;
  if(r.barrier)t.failureOrientations=r.barrier;if(r.chooseOrientation)a.chooseOrientation=true;
  if(r.energySymbols){a.energySymbols=(a.energySymbols||0)+r.energySymbols;a.symbolType=r.symbolType}
  if(r.thresholdShield!=null)a.incomingThreshold=r.thresholdShield;if(r.sideShield)a.sideShield=true;
  if(r.forceMove)t.forcedMove=r.forceMove;if(r.rerolls)a.rerolls=r.rerolls;if(r.rerollEnemy)t.rerollEnergy=r.rerollEnemy;
 }
 for(const f of battle.fighters)f.ko=f.hp<=0;
 const effectLabel=r?.outcome>=0?m.outcomes[r.outcome].orientations.join(' / '):'move only';
 addLog(`${fighterLabel(a)} · ${m.name}: ${failed?'Energy Shortage':damage+' damage · '+effectLabel}${r?.heal?' · healed '+r.heal:''}${r?.selfDamage?' · recoil '+r.selfDamage:''}.`);
 battle.pending=null;
 const hit=(battle.chain?.hits||0)+1;
 battle.chain={hits:hit,total:(battle.chain?.total||0)+damage};
 if(checkBattleWinner()){
  if(battle.winner===null&&battle.fighters.length===2){battle.winner=ti;battle.winnerTeam=t.team}
 }else if(isLeagueFormat(battle.format)&&queueLeagueReplacements({kind:'finish',ai,ti})){}
 else if(isLeagueFormat(battle.format)&&(a.ko||t.ko)){battle.repeat=false;battle.chain=null;finishFormatTurn(ai,ti)}
 else if(r?.borrow){battle.repeat=true;battle.phase='borrowMove';battle.borrowEnergy=r.borrowEnergy;battle.borrowDice=t.baseEnergyDice??3}
 else if(r?.repeat){battle.repeat=true;battle.phase='resolve'}
 else if(r?.repeatLimit&&hit<r.repeatLimit){battle.repeat=true;battle.phase=r.repeatRequired?'resolve':'repeatChoice'}
 else{battle.repeat=false;battle.chain=null;finishFormatTurn(ai,ti)}
 saveBattle();render();showImpact(ti,damage,failed);
}
function borrowedMoveChoices(){const a=battle.fighters[battle.turnIndex],t=battle.fighters[battle.targetIndex];return t.moves.map(canonical).filter(m=>!m.action&&m.code!=='OGW27-004'&&!(m.special&&(a.usedSpecialMoves||[]).includes(moveId(m))))}
function borrowMove(id){if(battle.phase!=='borrowMove')return;const m=borrowedMoveChoices().find(m=>moveId(m)===id);if(!m)return;battle.borrowedMove=m;battle.phase='resolve';battle.pending=null;saveBattle();render()}
function finishBorrowedMove(){if(battle.phase!=='borrowMove')return;const ai=battle.turnIndex,ti=battle.targetIndex;battle.repeat=false;battle.chain=null;finishFormatTurn(ai,ti);saveBattle();render()}
function finishRepeatedMove(){if(battle.phase!=='repeatChoice')return;const ai=battle.turnIndex,ti=battle.targetIndex;battle.repeat=false;battle.chain=null;finishFormatTurn(ai,ti);saveBattle();render()}
function undoBattle(){if(!battle?.snapshot)return;battle=normalizeBattleLoadouts(clone(battle.snapshot));battle.pending=null;saveBattle();render()}
function adjustHp(index,delta){
 if(isLeagueFormat(battle?.format)){adjustLeagueHp(index,delta);return;}
 if(!battle)return;battle.snapshot=snapshotBattle();const f=battle.fighters[index];
 f.hp=Math.max(0,Math.min(f.maxHp,f.hp+delta));f.ko=f.hp===0;
 addLog(`${pokemonLabel(f.pokemon)}: HP adjusted to ${f.hp}.`);
 if(!checkBattleWinner()&&(battle.phase==='winner'||battle.fighters[battle.turnIndex]?.ko)){
  battle.winner=null;battle.winnerTeam=null;startControllerTurn(nextController(battle.activeController));
 }
 saveBattle();render();
}
