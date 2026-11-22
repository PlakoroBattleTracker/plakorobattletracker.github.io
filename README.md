# PlakoroBattleTracker

A free, community Plakoro battle tracker hosted on GitHub Pages.

Contact: dragongroupent@gmail.com

## Play

Choose Single, Double, Team Double, Royale, League Singles, or League Doubles. The tracker includes saved loadouts, Chronicle evolutions, original card images, and physical-dice battle resolution.

This release includes 184 original Legacy moves and 15 original Pokémon cards, plus the modern PlakoroDB catalog and the League SWITCH card. All 58 Legacy sets in the Chronicle Drive were checked on November 22, 2026. The refresh adds 46 moves and four original Pokémon cards, including Strong Charmander and Strong Squirtle. Original cards use their printed stats and artwork; modern mode retains the modern cards. Modern PlakoroDB cards update in the app; Chronicle cards are bundled with each release.

Saved battles and loadouts stay in the browser where they were created. Saves on another website origin are separate.

## Legacy move sharing

Enable Chronicle during setup for Legacy rules. Pikachu (2026) and Pikachu (1997) are separate choices with their respective artwork and printed stats. Both share the Pikachu move pool in Legacy. Existing Legacy Pikachu saves retain the 1997 card, while modern saves retain the 2026 card. Normal, Strong, and Legendary versions of the same Pokémon share move cards in both directions. Pikachu can select Strong Pikachu cards, and Strong Pikachu can select Pikachu cards. Cards retain their original artwork, names, effects, and identifiers.

Surfing Pikachu can use every other Pikachu version’s move cards, while Surfing Pikachu cards remain exclusive to Surfing Pikachu. Evolution stages remain separate, and Devolve remains restricted to evolution loadouts. Modern mode retains each Pokémon’s own modern move pool.

Run `python3 build-site.py`, `node check-card-refresh.cjs`, `node check-legacy.cjs`, `node check-pikachu-versions.cjs`, and `node check-league.mjs` to validate move sharing, form restrictions, saved loadouts, and shared-card battle effects.

## Hosting

GitHub Actions publishes the main branch to GitHub Pages automatically. The application source is at the repository root. Original card artwork is stored in the website-assets ZIP files to preserve its folder structure during browser uploads. The build-site.py script extracts and verifies every image against asset-manifest.json, applies verified card-update artwork archives, then assembles the static application in _site. No backend or account credentials are needed.

To preview locally, run python3 build-site.py, then python3 -m http.server --directory _site 8000.

## Credits

Modern card translations and artwork: Jollto / [PlakoroDB](https://github.com/Jollto/PlakoroDB), licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Chronicle cards come from the supplied Chronicle card collection. Pokémon and other game artwork belong to their respective owners.

The interface follows the supplied [PlakoroBattle reference](https://beymetchannel.github.io/PlakoroBattle/), with independently implemented application code.

## Refreshing the original cards

`chronicle-source.json` retains the checked original .koro fields, Drive file references, and source hashes. `python3 import-chronicle.py` rebuilds the Legacy catalog. Embedded editor images are omitted from that snapshot; original PNG artwork is retained byte-for-byte in the verified asset archives.
