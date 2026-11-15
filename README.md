# Emberwell

Endless mobile-first tower defense along a molten rift. Static PWA — works offline after first load.

## Play

- Tap a tower (Turret / Mortar / Coil), then tap stone beside the rift.
- Select a placed tower to socket **Fire / Water / Earth / Wind** (max 2) for singles + combos.
- Use the **speed** control (1× → 1.5× → 2× → 3× → 5×) to pace runs; preference saves locally.
- **Settings** (hub or pause): screen shake Off/Low/Med/High (default Low) plus toggles for particles, hit flash, damage flash, and combat FX rings.
- Open **Codex** in-run for tower/enemy/element tradeoffs and resists (square pip = resist, triangle = weak).
- Waves advance on a short timer after spawning finishes — clearing the field is not required; overlaps are normal. Decade waves can spawn multiple bosses (shared HP, spaced spawns).
- Survive endless waves, earn scrap in-run and chips between runs.
- Spend chips on per-tower upgrade trees in the hub.
- Unlock **Hard** (wave 12 on Normal) and **Nightmare** (wave 15 on Hard).
- Pause anytime; mid-run progress, meta unlocks, and settings save locally.

## Offline & versioning

Service worker caches the shell and assets on first visit. No CDN/API calls at runtime. Install via browser “Add to Home Screen” for a standalone app.

**Bump on every deploy:** edit `APP_VERSION` in `version.js` and keep the matching `?v=` query params in `index.html`. The service worker names its cache `emberwell-<version>`, deletes older caches on activate, and uses network-first for navigations so updates install cleanly.

## Procedural runs

Each run gets a seed that drives path layout, spawn timing, and enemy mixes. The seed is stored with mid-run saves so resume stays consistent.

## Stack

Vanilla HTML / CSS / Canvas. Hosted on GitHub Pages from `main` (site root).
