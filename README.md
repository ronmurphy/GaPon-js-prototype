# GaPon 🎰

**Free browser gacha machines that change every day. Pull capsules, fill your sticker album, chase the rares. No install, no money, just the fun part.**

▶️ **Play it here:** https://ronmurphy.github.io/GaPon-js-prototype/

## What is this?

A little capsule-toy machine game. You get coins every day you check in, and there are three gacha machines to spend them in — cheap, mid, and pricey, with better odds of rare stuff the more you spend. The machines swap out every day at midnight with different collections (stickers of space stuff, critters, snacks, and more), and everything you pull goes into your album. Dupes can be sold off for more coins, and if you finish a full set there's a bonus.

Heads up: **it's a prototype, so it's simple on purpose** — placeholder icons instead of real art, just the core game. I'm testing whether the *idea* is fun before building the fancy version.

## Playtesting?

If you like it, play for a few days, then send me a screenshot of the bottom of the screen — it counts your days and pulls, and that's how I'll know if this is worth building for real. Share the link with anyone who's into blind boxes or gacha stuff!

- Your save lives in your browser (localStorage), so play on the same device/browser to keep your streak.
- Every machine shows its odds, Japan-style. The chase items are supposed to hurt.

## For the curious

Plain HTML/CSS/JS — no build step, no frameworks, no dependencies beyond Google Fonts (Material Symbols are the placeholder sticker art). Canvas for the capsule piles, Web Animations API for the juice. All the game balance (collections, odds, prices, daily bonus) lives in [`js/data.js`](js/data.js).

Run it locally with any static server:

```
python -m http.server 8080
```

…then open http://localhost:8080. That's it.
