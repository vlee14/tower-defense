# Emberwell

Endless mobile-first tower defense along a molten rift. Baked basalt terrain, sculpted stone roads, elemental combos, roguelite Rift Relics, and active powers. Static PWA — works offline after first load.

## Play

- New runs open in **prep** — place towers freely anywhere off the road (rocks block builds), check the **Wave Intel** pill, then tap **Start Wave**.
- Four towers: **Turret** (rapid DPS), **Mortar** (AoE blast), **Coil** (arc slow & anti-air), **Spire** (piercing rail).
- Tap any placed tower to inspect live **DMG & Kills** (top damage tower earns an **MVP Crown**), set **targeting priority** (`First` / `Strong` / `Close` / `Weak`), **socket elements** (`Fire / Water / Earth / Wind / Arc / Frost`, max 2 — live combo previews show on the buttons), level up, **Up All**, **Move** (free during prep, 15 scrap mid-wave), or **Sell** (70% refund of total invested scrap).
- **Active Rift Powers**: unleash **Meteor** (tap battlefield to drop an explosive magma crater), **Ember Surge** (+55% attack speed & +22% crit across all towers), and **Cryo Nova** (global frost shockwave that chills, freezes, and applies brittle). Slaying enemies charges abilities faster.
- **Wave Mutators & Boss Bounties**: starting Wave 4, waves roll tactical modifiers (**Sky Raid**, **Iron Phalanx**, **Swarm**, **Hasted**, **Carapace**, **Regenerating**, **Unstoppable**, **Bounty**). Bosses display a razor-slim top **Boss Health Bar** with shield meter and weaknesses, awarding bonus scrap (+1 HP on Normal).
- **Rift Relics**: pick 1 of 3 Common/Rare/Epic relics after milestone waves (W3, W6, W10, W15, …) with live synergy callouts, **Reroll** (1st free), **Salvage** for scrap, and a compact clickable **Relic Badge**.
- **Economy & Skill Rewards**: earn **Scrap Interest** (+5% banked scrap per wave, up to +28), **Flawless Wave** bonuses (+12% scrap, +1 HP every 5 flawless waves on Normal/Hard), **Send Next Wave Anytime** (even mid-wave to stack waves for risk-reward rush bonus scrap — never wait!), optional **Auto-send waves** (`[G]` or Settings), and **Kill Streak** scrap bursts.
- **Desktop Keyboard Shortcuts**: `1–4` towers, `Q / W / E` powers, `Space` start/send next wave anytime, `F` speed, `G` auto-send waves, `P` pause, `M` mute, `U / A / T / V / X` inspector upgrade / up-all / target / move / sell, `Esc` cancel/close.
- Open the **Field Manual** (hub or pause) anytime to browse all 15 elemental combos, tower stats, and boss resistances/abilities.
- **Forge, Trees & Rift Mastery**: spend chips across 5 Forge lanes and per-tower trees, then pour surplus chips into infinite **Rift Mastery** infusions (`×1`/`×5`/`Max` bulk buy, earning **Ascension** tiers) and repeatable **Rift Blessings** (start your next non-Daily run with 1–3 Rift Relic drafts in Prep), with 100% chip-refund **Respec** anytime.
- **Infinite Nightmare ×N**: maxing all 5 skill trees unlocks **Nightmare ×2** (`+65%` exponential enemy HP per tier, faster tempo, extra bosses, higher chip payouts). Reach **Wave 20** on your highest Nightmare tier to keep unlocking **Nightmare ×3, ×4, ×5, …** indefinitely!
- **Settings**: audio volume, ambient music, screen shake, visual FX toggles, haptics, Battery saver, Large tap targets, **Auto-send waves**, and **Reset All Progress** (with confirmation).
- **Daily Rift**: shared UTC date seed, harder layout & scaling, hard-stops at wave **100**.

## Offline & versioning

Service worker caches the shell and assets on first visit. No CDN/API calls at runtime.

**Bump on every deploy:** `./bump-version.sh x.y.z` (updates `version.js`, `sw.js`, `manifest.webmanifest`, and `index.html`).

## Stack

Vanilla HTML / CSS / Canvas. Hosted on GitHub Pages from `main` (site root).
