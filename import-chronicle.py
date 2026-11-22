"""Rebuild the bundled original Legacy cards from the checked Drive snapshot.

The snapshot retains .koro fields and source hashes, without embedded artwork.
Card artwork is copied byte-for-byte from Drive into a verified overlay archive.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting',
         'dark', 'steel', 'flying', 'dragon', 'normal']
FACINGS = ['standing', 'handstand', 'back', 'down', 'left', 'right']
SYMBOLS = dict(st='standing', hs='handstand', ba='back', do='down', s1='left', s2='right')
ENERGIES = dict(grass='grass', fire='fire', water='water', electric='lightning',
                psychic='psychic', fighting='fighting', dark='dark', steel='steel',
                flying='flying', dragon='dragon', normal='normal')

def clean(text):
    return re.sub(r'\s+', ' ', str(text).replace('?', '').replace('？', '')).strip()

def name(text):
    text = clean(text)
    return {'Bulbasuar': 'Bulbasaur'}.get(text, text)

def convert(item):
    d, code = item['fields'], item['code']
    effects = [str(d.get(f'move_text_{i}', '')).strip() for i in range(4)]
    costs = {target: int(d.get(source + '_energy', 0)) for source, target in ENERGIES.items()
             if int(d.get(source + '_energy', 0)) > 0}
    # Current editor stores printed tens as strings. Numeric values in the
    # older .koro schema are hidden editor defaults, absent from the card art.
    damage = float(d.get('damage', '').strip() or 0) if isinstance(d.get('damage'), str) else 0
    out = dict(name=clean(d['move_name']), code=code, owner=name(d['mon_name']),
               image='chronicle/' + code + '.png', source='1997',
               sourceUrl=item['url'], sourcePath=item['path'], chronicle=True,
               damage=damage, baseDamage=damage * 10, type=TYPES[int(d['type'])],
               energyCost=costs, energy=[t for t, n in costs.items() for _ in range(n)],
               effects=effects, effect='', outcomes=[],
               special=any('special move' in e.lower() for e in effects))
    required = re.fullmatch(r'(?:\{(?:st|hs|ba|do|s1|s2)\}\s*)+', effects[0])
    if required:
        dirs = [SYMBOLS[s] for s in re.findall(r'\{(st|hs|ba|do|s1|s2)\}', effects[0])]
        out['requiredOrientations'] = dirs
        out['outcomes'] = [dict(text=effects[1], orientations=dirs)]
        out['effect'] = ' '.join(e for e in effects[2:] if e and not e.startswith('Special Move:'))
    else:
        unconditional = [effects[0]] if effects[0] else []
        for i in range(1, 4):
            if not effects[i]:
                continue
            dirs = [orientation for j, orientation in enumerate(FACINGS) if d.get(f'move_{i}_facing_{j}')]
            if dirs:
                out['outcomes'].append(dict(text=effects[i], orientations=dirs))
            else:
                unconditional.append(effects[i])
        out['effect'] = ' '.join(unconditional)
    text = ' '.join(effects)
    failure = re.search(r'If this moves? fails, this pokemon takes (\d+) damage', text, re.I)
    if failure:
        out['failureDamage'] = int(failure[1])
    if out['name'] in ['Evolve', 'Devolve']:
        out['action'] = out['name'].lower()
        target = re.search(r'(?:evolves?(?: it)?|evovles|Devolve this Pokemon) into ([^.]+)', text, re.I)
        if not target:
            raise ValueError('Missing evolution target: ' + code)
        target_text = re.split(r',\s*its maximum', target[1], flags=re.I)[0]
        out['targets'] = sorted(name(x) for x in re.split(r',\s*(?:or\s+)?|\s+or\s+', target_text) if x.strip())
        hp = re.search(r'Maximum HP becomes (\d+)', text, re.I)
        dice = re.search(r'(?:Roll|rolls?) (\d+) enekoro', text, re.I)
        if hp:
            out['maxHp'] = int(hp[1])
        out['energyDice'] = int(dice[1]) if dice else (4 if out.get('maxHp') == 160 else 3)
    hp_gate = re.search(r'can only be used if your \w+ has (\d+) HP or less', text, re.I)
    if hp_gate:
        out['maxUserHp'] = int(hp_gate[1])
    conditional = re.search(r'If Evolve failed on your last turn, this pokemon evolves into ([^.]+)', text, re.I)
    if conditional:
        out['conditionalEvolution'] = name(conditional[1])
    return out

def main():
    snapshot = json.loads((ROOT / 'chronicle-source.json').read_text())
    source = (ROOT / 'data.js').read_text()
    data = json.loads(re.search(r'^const DATA=(.*);$', source, re.M)[1])
    pools, characters = {}, {}
    for item in sorted(snapshot['cards'], key=lambda x: x['code']):
        code, d = item['code'], item['fields']
        if code.startswith('OGW'):
            move = convert(item)
            pools.setdefault(move['owner'], []).append(move)
        elif code.startswith('OGC'):
            hp = int(str(d['hp']).strip())
            if hp < 30:
                hp *= 10
            n = name(d['mon_name'])
            characters[n] = dict(pokemon=dict(name=n, code=code, hp=hp,
                type=TYPES[int(d['type'])], weakness=TYPES[int(d['weakness'])] if d.get('weakness_visible', True) else '',
                image='chronicle/' + code + '.png', source='1997', sourceUrl=item['url'], sourcePath=item['path']), moves=[])
    for n, block in characters.items():
        block['moves'] = pools.get(n, [])
    chronicle = dict(order=[n for n in characters if n not in data['order']], pokemon=characters,
        movePools=pools, driveFolder=snapshot['driveFolder'],
        syncedSets=len({x['path'].split('/')[1] for x in snapshot['cards'] if x['path'].startswith('1997/')}),
        checked=snapshot['checked'], note='All 58 original Legacy sets checked. Original OG cards only; empty folders contain no published cards.')
    source = re.sub(r'^const CHRONICLE_DB=.*;$', lambda _: 'const CHRONICLE_DB=' + json.dumps(chronicle, separators=(',', ':'), ensure_ascii=False) + ';', source, flags=re.M)
    (ROOT / 'data.js').write_text(source)
    print(f"Imported {len(characters)} original Pokémon cards and {sum(map(len, pools.values()))} Legacy moves.")

if __name__ == '__main__':
    main()
