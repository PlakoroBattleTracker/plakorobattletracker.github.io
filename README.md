# PlakoroBattleTracker

A free, community Plakoro battle tracker hosted on GitHub Pages.

Contact: dragongroupent@gmail.com

## Play

Choose Single, Double, Team Double, Royale, League Singles, or League Doubles. The tracker includes saved loadouts, Chronicle evolutions, original card images, and physical-dice battle resolution.

This release includes 184 original Legacy moves and 15 original Pokémon cards, plus the modern PlakoroDB catalog and the League SWITCH card. All 58 Legacy sets in the Chronicle Drive were checked on November 22, 2026. The refresh adds 46 moves and four original Pokémon cards, including Strong Charmander and Strong Squirtle. Original cards use their printed stats and artwork; modern mode retains the modern cards. Both sources update automatically in the app, with this verified bundle as the offline starting point.

Saved battles and loadouts stay in the browser where they were created. Saves on another website origin are separate.

## Legacy move sharing

Enable Chronicle during setup for Legacy rules. Pikachu, Bulbasaur, and Squirtle each have separate 2026 and 1997 choices with their respective artwork and printed stats. Each species shares its move pool across both editions in Legacy. Saves made before a species was split retain the card they previously used; later saves preserve the selected edition. Normal, Strong, and Legendary versions of the same Pokémon share move cards in both directions. Pikachu can select Strong Pikachu cards, and Strong Pikachu can select Pikachu cards. Cards retain their original artwork, names, effects, and identifiers.

Surfing Pikachu can use every other Pikachu version’s move cards, while Surfing Pikachu cards remain exclusive to Surfing Pikachu. Evolution stages remain separate, and Devolve remains restricted to evolution loadouts. Selecting Devolve for Flareon, Jolteon, or Vaporeon in an Eevee build opens the next evolution loadout automatically, with up to three different evolution forms total. An unfinished alternate is reopened instead of duplicated, and Devolve returns to the original Eevee and its selected moves. Both 2026 and 1997 Eevee choices are supported. Modern mode retains each Pokémon’s own modern move pool.

Run `node check-eevee-devolve.cjs` to validate automatic alternate loadout opening, Eevee edition compatibility, saved builds and battle transitions.

Run `python3 build-site.py`, `node check-card-refresh.cjs`, `node check-legacy.cjs`, `node check-pikachu-versions.cjs`, and `node check-league.mjs` to validate move sharing, form restrictions, saved loadouts, and shared-card battle effects.

## Automatic card updates

The website refreshes both PlakoroDB and the public Chronicle Drive feed in GitHub Actions every 30 minutes (at :07 and :37 UTC), on source pushes, and on manual workflow runs. GitHub may delay scheduled jobs. Visitors receive one complete published catalogue and its original PNG images; they do not need to keep a browser open to scan Drive. The menu shows the current publication time and card totals.

`refresh-site-cards.cjs` pins PlakoroDB to a commit, finishes the resumable Chronicle scan, validates typed battle metadata, and verifies every original PNG against its source checksum. Only OG Chronicle cards are published. A failed source check or incomplete upload stops deployment, leaving the last successful website online. Verified images are reused through the Actions cache; image URLs contain their content hash, and older verified images remain available for already-open battles.

Each visit checks the same-origin `published-catalogue.json` without browser caching before loading saved builds. A versioned bootstrap snapshot is the fallback if the network check fails. Open sessions check the publication every five minutes and when returning/reconnecting. New snapshots wait until an active battle or loadout closes. Saved loadouts keep stable card identifiers, and 2026/1997 choices remain separate.

The workflow has read-only access to repository contents and permission to publish Pages. GitHub can disable scheduled workflows after 60 days without repository activity; re-enable the workflow in Actions if that happens. Source revisions, check time and card counts are recorded in the build log and published catalogue. Visitors need no account credentials.

Run `node check-published-updates.cjs` for publication validation, first-visit freshness, deferred updates, offline/stale-response fallback, saved builds, and edition separation. `node check-auto-updates.cjs` covers the original portable/offline updater and Chronicle conversion parity. Portable builds without a published catalogue retain their own source checks and IndexedDB storage.

## Hosting

GitHub Actions builds and publishes the main branch to GitHub Pages. `python3 build-site.py` extracts the verified offline asset archives into `_site`; `node refresh-site-cards.cjs` then prepares the current shared card publication. Deployment happens only after the complete catalogue and all images pass validation. Run both commands for a production build. Running only the first builds the bundled portable version.

## Credits

Modern card translations and artwork: Jollto / [PlakoroDB](https://github.com/Jollto/PlakoroDB), licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Chronicle cards come from the supplied Chronicle card collection. Pokémon and other game artwork belong to their respective owners.

The interface follows the supplied [PlakoroBattle reference](https://beymetchannel.github.io/PlakoroBattle/), with independently implemented application code.

## Refreshing the original cards

`chronicle-source.json` retains the checked original .koro fields, Drive file references, and source hashes. `python3 import-chronicle.py` rebuilds the Legacy catalog. `chronicle-images.json` maps card codes to their original PNG Drive IDs; `python3 build-chronicle-bundle.py` rebuilds the matching feed-shaped offline metadata bundle. Embedded editor images are omitted from that snapshot; original PNG artwork is retained byte-for-byte in the verified asset archives.
