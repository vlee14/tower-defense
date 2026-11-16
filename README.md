# Emberwell

Endless mobile-first tower defense along a molten rift. Static PWA — works offline after first load.

## Play

- New runs open in **prep** — place towers freely, then tap **Start** (waves never auto-begin).
- Tap a tower (Turret / Mortar / Coil / Spire), then tap stone or a bend pad beside the rift.
- Higher difficulties shrink path length and tighten layout (sharper bends, less prep space, worse angles)—not HP alone.
- Select a placed tower to socket **Fire / Water / Earth / Wind / Arc / Frost** (max 2) for singles + combos — learn matchups in combat (△ weak · □ resist).
- Four towers: **Turret**, **Mortar**, **Coil**, **Spire** (pierce). Level one tower or **Up All**; per-tower level has a short cooldown.
- Use the **speed** control (1× → 1.5× → 2× → 3× → 5×) to pace runs; preference saves locally.
- **Settings** (hub or pause): volume + optional ambient music, screen shake Off/Low/Med/High (default Low), juice toggles, haptics, **Battery saver**, and **Large tap targets**. Mute and reduce-motion quiet feedback.
- **Place towers** on stone or bend pads beside the rift; harder difficulties open more spawn lanes.
- Waves advance on a short timer after spawning finishes — clearing the field is not required; overlaps are normal.
- Boss roster: **Behemoth**, **Emberwyrm**, **Shellwarden**, **Broodmother**, **Galeheart** (distinct silhouettes, resists, abilities). Decade packs can mix several.
- Survive endless waves, earn scrap in-run and chips between runs.
- Spend chips on per-tower upgrade trees in the hub.
- Unlock **Hard** (wave 10 on Normal) and **Nightmare** (wave 12 on Hard).
- **Daily Rift** uses a shared UTC date seed; milestones pay chips for wave goals.
- Toggle **damage numbers** in Settings. Pause anytime; progress saves locally.

## Offline & versioning

Service worker caches the shell and assets on first visit. No CDN/API calls at runtime. Chrome/Edge show an in-app **Install** banner when installable; iOS uses Share → Add to Home Screen. Updates toast `Updated to vX` after a SW reload.

**Bump on every deploy:** `./bump-version.sh x.y.z` (or edit `APP_VERSION` in `version.js` and matching `?v=` queries). The service worker names its cache `emberwell-<version>`, deletes older caches on activate, and uses network-first for navigations so updates install cleanly.

## Soft launch checklist

- [ ] Fresh load on phone: hub → New Run → place → socket → speed → pause → hub resume
- [ ] Offline: load once online, toggle airplane mode, reload still plays
- [ ] Install: Add to Home Screen / Install banner; opens standalone with icon
- [ ] Settings: Battery saver + Large taps persist; reduce-motion quiets shake/haptics
- [ ] Daily Rift seed stable for the UTC day; milestones claim chips
- [ ] Version badge shows current `APP_VERSION` on hub + Settings

## Procedural runs

Each run gets a seed that drives path layout, spawn timing, and enemy mixes. The seed is stored with mid-run saves so resume stays consistent.

## Stack

Vanilla HTML / CSS / Canvas. Hosted on GitHub Pages from `main` (site root).
