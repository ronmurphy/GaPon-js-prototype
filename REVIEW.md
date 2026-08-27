# GaPon — review notes

A living document, not a one-off. Split by **seam**, not by file: the bugs this
project actually hits live *between* subsystems, and a file-by-file read walks
straight past them. `netEnsurePlayer` looked fine on its own for three days.

**Capture everything, filter at triage.** Write down observations whatever the
severity — the "is this important enough" judgement is the one you're least
able to make while deep in a single section.

---

## The pattern

Every bug found between Aug 23–26 was the same shape: **an assumption that was
true when written and quietly stopped being true.** Not rot, not carelessness —
new capability, old code with no way to find out.

| invariant | true until | broke |
|---|---|---|
| a device *is* a player | Aug 23, cross-device accounts | local name always winning; friend names cached forever; **wants sync (still open)** |
| every machine holds 10 capsules | Aug 24, coin-normalised stock | golden-ticket rate, capsule sizing, `pullsDone`, claw grab reach |
| capsules are circles | Aug 25, per-tier shapes | dome draw, chute, reveal, pusher shelf |
| the shop scene is CSS | Aug 24, illustrated props | door hover, omikuji ready-glow |

**When adding a capability, write down which invariant it just broke.** That
list is what makes the next audit cheap.

---

## Invariant audit — 26 Aug 2026

### FIXED 26 Aug · HIGH — `netSyncWants()` deleted the shared wants list on every boot
`js/net.js` — `delete().eq('player_id', …)` then re-insert, run from `netInit`.
`wants` is keyed by `player_id`, which is now **shared across a player's
devices**. Star three stickers on the phone, open the PC, and the PC wipes them
and publishes its own stale list. Fails silently: friends simply stop seeing
what you're hunting. Same root cause as the name ping-pong.

**Fixed:** boot-time sync now MERGES — wants are additive, and `pruneWants()` stops the
merged list growing forever. Explicit un-starring goes through `netWant()` surgically, so
a deliberate removal is never resurrected by the next merge.

### FIXED 26 Aug · LOW — `state.nameAsked` was dead
Declared in `defaultState()` with a comment implying it still gates the name
prompt. Nothing reads it (replaced by `nameDeclined`, whose rename *was* the
migration). Still written into every new save.

**Fixed:** removed from `defaultState()` in favour of `nameDeclined`, with a note on why
`nameSynced` is deliberately left undeclared (`undefined` is load-bearing).

### FIXED 26 Aug · LOW — outgoing trades were per-device
`state.trades` is local, so a capsule minted on the phone is invisible on the
PC and cannot be taken back from there. Cosmetic; the trade itself is safe
because `claim_trade` is atomic server-side.

**Fixed:** `netAdoptOwnTrades()` pulls your unclaimed capsules at boot. Foil is read back
out of the CODE, never the row's column — the code is what decides what a capsule holds,
and trusting the column here would be the one place that rule is not obeyed.

### CLEAN — capsule stock
`ECON.machineStock` fully removed; everything routes through `stockFor` /
`stockLeft` / `stockMax`. The one literal `10` (`game.js:120`) is the
documented migration constant for pre-per-tier saves.

### CLEAN — capsule shape
The only remaining `arc()` calls are the intended round branch of
`MachineSim.shapePath`, the sticker wall's die-cut circle, and **Capsule Pong's
ball** — which is correctly round: shape encodes a machine's *price band*, and
a pong ball has no price. Do not "fix" it.

### CLEAN — illustrated props
21 `props-on` rules, and no JS reaches into a CSS child that art now replaces.
`PROPS.dir = null` remains a true one-line revert.

### CLEAN — redeemed codes
`state.redeemed` is per-device by design and safe: the inbox query filters on
`claimed_by is null`, so a code opened on one device never resurfaces on
another. The local list is display-side only.

---

## Seams for the full sweep

1. **Identity** — who is this player, and which copy of their data wins
2. **The pull path** — coin to sticker, across all seven machines
3. **Persistence** — what's in the save, who writes it, what survives a restore or a merge
4. **Rendering assumptions** — anything hardcoding a size, count, or shape

## Tooling note
`/code-review ultra` reviews the **diff between the branch and main**, not a
whole codebase — useless on a clean `main`. Save the three free runs for a real
feature branch. Cat Café is the right candidate: a wrong `TRADE_ID_LEDGER`
entry silently breaks every unopened trade code in the wild.
