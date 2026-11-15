# Runway Defense

Endless mobile-first tower defense for [Vincent Lee](https://github.com/vlee14). Static PWA — works offline after first load (airplane-friendly).

## Play

- **Live:** https://vlee14.github.io/tower-defense/ (after Pages is enabled)
- Tap a tower (Turret / Mortar / Coil), then tap grass beside the runway.
- Select a placed tower to socket **Fire / Water / Earth / Wind** (max 2) for singles + combos.
- Open **Codex** in-run for tower/enemy/element tradeoffs.
- Survive endless waves, earn scrap in-run and chips between runs.
- Spend chips on per-tower upgrade trees in the hub.
- Unlock **Hard** (wave 12 on Normal) and **Nightmare** (wave 15 on Hard).
- Pause anytime; mid-run progress, meta unlocks, and settings save locally.

## Offline

Service worker caches the shell and assets on first visit. No CDN/API calls at runtime. Install via browser “Add to Home Screen” for a standalone app.

## Procedural runs

Each run gets a seed that drives path layout, spawn timing, and enemy mixes. The seed is stored with mid-run saves so resume stays consistent.

## Stack

Vanilla HTML / CSS / Canvas. Hosted on GitHub Pages from `main` (site root).
