"""Assemble the static tracker and verify its bundled card artwork."""

from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "_site"
RUNTIME = (
    "index.html", "style.css", "data.js", "domain.js", "engine.js",
    "league.js", "plakorodb-source.js", "card-updates.js", "app.js",
)

def build():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    manifest = json.loads((ROOT / "asset-manifest.json").read_text())
    seen = set()
    archives = sorted(ROOT.glob("website-assets-*.zip")) + sorted(ROOT.glob("card-update-assets-*.zip"))
    # An update archive may replace a retained original image. Verify the final
    # version of every path, and reject duplicate entries within one archive.
    latest = {}
    for archive in archives:
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            if len(names) != len(set(names)):
                raise ValueError(f"Duplicate entry in {archive.name}")
            for name in names:
                if name in latest and not archive.name.startswith("card-update-assets-"):
                    raise ValueError(f"Duplicate base asset: {name}")
                latest[name] = archive
    for archive in archives:
        with zipfile.ZipFile(archive) as bundle:
            for entry in bundle.infolist():
                name = entry.filename
                if latest[name] != archive:
                    continue
                if name not in manifest or name in seen:
                    raise ValueError(f"Unexpected or duplicate asset: {name}")
                content = bundle.read(entry)
                if hashlib.sha256(content).hexdigest() != manifest[name]:
                    raise ValueError(f"Asset checksum mismatch: {name}")
                target = OUTPUT / name
                if not target.resolve().is_relative_to(OUTPUT.resolve()):
                    raise ValueError(f"Invalid asset path: {name}")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                seen.add(name)
    missing = set(manifest) - seen
    if missing:
        raise ValueError(f"Missing {len(missing)} assets: {sorted(missing)[:5]}")
    for name in RUNTIME:
        shutil.copy2(ROOT / name, OUTPUT / name)
    (OUTPUT / ".nojekyll").write_text("")
    print(f"Built tracker: {len(RUNTIME)} runtime files and {len(seen)} verified images.")

if __name__ == "__main__":
    build()
