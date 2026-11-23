"""Package verified original card metadata for the public feed's offline fallback."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent

def build():
    source = json.loads((ROOT / 'chronicle-source.json').read_text())
    images = json.loads((ROOT / 'chronicle-images.json').read_text())
    hashes = json.loads((ROOT / 'asset-manifest.json').read_text())
    pokemon, moves, rules = [], [], {}
    types = ['Grass','Fire','Water','Electric','Psychic','Fighting','Darkness','Metal','Flying','Dragon','Normal']
    for item in source['cards']:
        code, d = item['code'], item['fields']
        image = ('custom/' if code.startswith('OC') else 'chronicle/') + code + '.png'
        raw = {k:v for k,v in d.items() if re.fullmatch(r'mon_name|hp|type|weakness|weakness_visible|move_name|damage|(?:grass|fire|water|electric|psychic|fighting|dark|steel|dragon|flying|normal)_energy|move_text_[0-3]|move_[1-3]_facing_[0-5]',k)}
        base = dict(id=code,code=code,year=1997,edition='OG',image=image,
                    imageSha=images[code]+':'+hashes[image],driveId=images[code],sourceUrl=item['url'],battle=dict(schema=1,fields=raw))
        if code.startswith('OGC'):
            hp = int(str(d['hp']).strip())
            base.update(name=d['mon_name'],hp=hp*10 if hp<30 else hp,type=types[int(d['type'])],weakness='None' if d.get('weakness_visible') is False else types[int(d['weakness'])])
            base['editions'] = {'OG':base.copy()}
            base['moves'] = []
            pokemon.append(base)
        elif code.startswith('OGW'):
            base.update(name=d['move_name'],owner=d['mon_name'])
            moves.append(base)
        elif code == 'OCW00-000':
            base.update(name='SWITCH',owner='PLAYER')
            rules['switch'] = base
    for p in pokemon:
        p['moves'] = [m for m in moves if m['owner'] == p['name']]
    data = dict(version=1,revision='bundle-'+hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest(),snapshotDate=source['checked'],checkedAt=max(x['modified'] for x in source['cards']),source=source['driveFolder'],status='bundled',complete=True,pokemon=pokemon,moves=[m for m in moves if not any(p['name']==m['owner'] for p in pokemon)],rules=rules,cardPolicy='og-only')
    (ROOT / 'chronicle-bundle.js').write_text('/* Verified original Drive cards included for offline startup. */\nwindow.CHRONICLE_DATA='+json.dumps(data,separators=(',',':'),ensure_ascii=False)+';\n')
    print(f'Bundled {len(pokemon)} original Pokémon and {len(moves)} moves.')

if __name__ == '__main__':
    build()
