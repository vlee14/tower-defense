# Emberwell

Endless mobile-first tower defense along a molten rift. Baked basalt terrain, sculpted stone roads, elemental combos, roguelite Rift Relics, and active powers. Static PWA — works offline after first load.

## Play

- New runs open in **prep** — place towers freely anywhere off the road (rocks block builds), then tap **Start Wave**.
- Four towers: **Turret** (rapid DPS), **Mortar** (AoE blast), **Coil** (arc slow & anti-air), **Spire** (piercing rail).
- Tap any placed tower to set **targeting priority** (`First` / `Strong` / `Close` / `Weak`), **socket elements** (`Fire / Water / Earth / Wind / Arc / Frost`, max 2 — live combo previews show on the buttons), level up, or **Up All**.
- **Active Rift Powers**: unleash **Meteor** (tap battlefield to drop an explosive magma crater) and **Ember Surge** (+55% attack speed & bonus crit across all towers). Slaying enemies charges both abilities faster.
- **Rift Relics**: pick 1 of 3 run-defining roguelite relics after milestone waves (W3, W6, W10, W15, …) to forge wild synergies each run.
- **Call Next Wave Early**: tap the early-wave button between spawns for instant bonus scrap, and chain rapid kills for **Kill Streak** scrap bursts.
- Open the **Field Manual** (hub or pause) anytime to browse all 15 elemental combos, tower stats, and boss resistances/abilities.
- **Forge & Trees**: spend chips across 5 Forge lanes and per-tower trees, with 100% chip-refund **Respec** anytime.
- **Settings**: audio volume, ambient music, screen shake, visual FX toggles, haptics, Battery saver, Large tap targets, and **Reset All Progress** (with confirmation).
- **Daily Rift**: shared UTC date seed, harder layout & scaling, hard-stops at wave **100**.

## Offline & versioning

Service worker caches the shell and assets on first visit. No CDN/API calls at runtime.

**Bump on every deploy:** `./bump-version.sh x.y.z` (updates `version.js`, `sw.js`, `manifest.webmanifest`, and `index.html`).

## Stack

Vanilla HTML / CSS / Canvas. Hosted on GitHub Pages from `main` (site root).
