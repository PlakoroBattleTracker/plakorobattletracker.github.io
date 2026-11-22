/* Shared by the bundled snapshot builder and the live updater. Data only. */
(function(root){
 'use strict';
 const REPO='Jollto/PlakoroDB', RAW='https://raw.githubusercontent.com/'+REPO+'/';
 const TYPES={G:'grass',R:'fire',W:'water',L:'lightning',P:'psychic',F:'fighting',D:'dark',M:'steel',N:'dragon',Y:'flying',C:'normal'};
 const type=s=>s==='Electric'?'lightning':String(s||'normal').toLowerCase();
 const orientations=['Standing','Handstand','Back','Down','Sideways'];
 function rows(s){const o={};for(const l of s.split(/\r?\n/)){const m=l.match(/^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/);if(m&&!/^[-: ]+$/.test(m[1]))o[m[1].trim()]=m[2].trim();}return o;}
 function required(value,label){if(!value)throw Error('Missing '+label+' in PlakoroDB');return value;}
 function files(tree){if(tree.truncated||!Array.isArray(tree.tree)||!/^[a-f0-9]{40}$/.test(tree.sha))throw Error('Incomplete PlakoroDB file listing');return tree.tree.filter(x=>x.type==='blob');}
 function textPaths(tree){return files(tree).filter(x=>x.path==='database/text/characards.md'||/^database\/text\/wazacards\/.*\.md$/.test(x.path)).map(x=>x.path);}
 function parse(tree,texts){
  const all=files(tree),images=all.filter(x=>/^database\/cards\/(chara|waza)cards\/.*\.png$/.test(x.path));
  const imageFor=code=>required(images.find(x=>x.path.split('/').pop().match(new RegExp('^'+code+'(?:_|\\.png$)'))),'image for '+code);
  const chars=[];for(const section of required(texts['database/text/characards.md'],'character text').split(/^###\s+/m).slice(1)){
   const f=rows(section);if(!f.Code||!f.Name)continue;const im=imageFor(f.Code);
   chars.push({code:f.Code,name:f.Name,type:type(f.Type),weakness:f.Weakness?type(f.Weakness):'',hp:Number(f.HP),image:'cards/'+im.path.slice('database/cards/'.length),imagePath:im.path,imageSha:im.sha});
  }
  const moves=[];for(const path of textPaths(tree).filter(p=>p.includes('/wazacards/'))){
   for(const section of required(texts[path],path).split(/^####\s+/m).slice(1)){
    const f=rows(section);if(!f.Code||!f.Name||!f['Pokémon'])continue;const im=imageFor(f.Code),groups=new Map();
    for(const o of orientations)if(f[o]){if(!groups.has(f[o]))groups.set(f[o],[]);groups.get(f[o]).push(...(o==='Sideways'?['left','right']:[o.toLowerCase()]));}
    const energy=[...(f.Energy||'').matchAll(/\{([A-Z])\}/g)].map(m=>required(TYPES[m[1]],'energy '+m[1]));
    moves.push({code:f.Code,name:f.Name.replace(/[?？]/g,'').replace(/\s+/g,' ').trim(),owner:f['Pokémon'],japanese:f.Japanese||'',type:type(f.Type),energy,baseDamage:Number(f.Damage)||0,effect:f.Effect||'',outcomes:[...groups].map(([text,orientations])=>({text,orientations})),image:'cards/'+im.path.slice('database/cards/'.length),imagePath:im.path,imageSha:im.sha,source:'2026',sourceUrl:'https://github.com/'+REPO+'/blob/'+tree.sha+'/'+path});
   }
  }
  const catalog={schema:1,sha:tree.sha,syncedAt:Date.now(),characters:chars,moves};validate(catalog);return catalog;
 }
 function validate(c){
  if(c?.schema!==1||!Array.isArray(c.characters)||!c.characters.length||!Array.isArray(c.moves)||!c.moves.length||!/^[a-f0-9]{40}$/.test(c.sha))throw Error('Invalid PlakoroDB snapshot');
  const names=new Set(),codes=new Set(),allowed=new Set(Object.values(TYPES));
  for(const p of c.characters){if(!p.name||names.has(p.name)||!Number.isFinite(p.hp)||p.hp<=0||!allowed.has(p.type)||(p.weakness&&!allowed.has(p.weakness)))throw Error('Invalid Pokémon record');names.add(p.name);}
  for(const x of [...c.characters,...c.moves]){
   if(!/^[A-Z]+\d+-[\d-]+$/.test(x.code)||codes.has(x.code)||!/^database\/cards\/(chara|waza)cards\/[A-Za-z0-9_\-/]+\.png$/.test(x.imagePath)||x.image!=='cards/'+x.imagePath.slice('database/cards/'.length)||!/^[a-f0-9]{40}$/.test(x.imageSha))throw Error('Invalid or duplicate card '+x.code);codes.add(x.code);
  }
  for(const m of c.moves){if(!names.has(m.owner)||!m.name||!allowed.has(m.type)||!Number.isFinite(m.baseDamage)||m.baseDamage<0||!Array.isArray(m.energy)||m.energy.some(t=>!allowed.has(t))||!Array.isArray(m.outcomes)||m.outcomes.some(o=>!o.text||!o.orientations.length||o.orientations.some(d=>!['standing','handstand','back','down','left','right'].includes(d))))throw Error('Invalid move '+m.code);}
  for(const n of names)if(!c.moves.some(m=>m.owner===n))throw Error('No moves for '+n);
  return c;
 }
 function assets(c){return [...c.characters,...c.moves].map(x=>({path:x.imagePath,key:x.image,sha:x.imageSha,url:RAW+c.sha+'/'+x.imagePath}));}
 const api={REPO,RAW,TYPES,parse,validate,textPaths,assets};root.PlakoroSource=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
