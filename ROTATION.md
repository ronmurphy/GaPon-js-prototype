# Adding a set / rotating the shop floor

Monthly checklist. Everything here is `js/data.js` and `js/tradeids.js` — there
is no build step, so a mistake ships instantly.

## 1. Art
Drop the PNGs in `assets/stickers/<FolderName>/`, named **exactly** by item id
(`ct_maneki.png`). Manus sometimes returns tool suffixes (`_birefnet`,
`_toonout`) — rename them, or the game silently falls back to glyphs with no
error. 256×256, transparent, white die-cut border (see [[art-pipeline]]).

## 2. The collection block — `js/data.js`
Append to `COLLECTIONS`, before the closing `];`. Every set is **6 common,
3 uncommon, 2 rare, 1 chase** — the odds tables assume that shape.

```js
{
  id: 'cats', name: 'Cat Cafe', color: '#a1887f', artDir: 'CatCafePngs',
  items: [ /* 12, in rarity order */ ],
},
```

`artDir` is the entire art wiring. `color` drives the binder tab and page.

## 3. The trade ledger — `js/tradeids.js`
**APPEND ONLY.** A trade code encodes the *index* into `TRADE_ID_LEDGER`, so
inserting or re-sorting silently re-points every unopened capsule in the wild —
a chase becomes a common. Add the twelve ids at the end, keep the index
comments going.

The pre-commit hook (`.githooks/pre-commit`, wired via `core.hooksPath`) blocks
a commit where `data.js` has a sticker the ledger lacks, and prints them ready
to paste. It also `node --check`s every staged `.js`.

Verify:
```sh
node -e "const f=require('fs');
eval(f.readFileSync('js/data.js','utf8').replace(/^const /gm,'global.'));
eval(f.readFileSync('js/tradeids.js','utf8').replace(/^const /gm,'global.'));
const k=new Set(TRADE_ID_LEDGER);
console.log('missing:', Object.keys(ITEMS_BY_ID).filter(i=>!k.has(i)).join(' ')||'none');
console.log('dupes:', TRADE_ID_LEDGER.length-k.size);
console.log('cr_bee still 0?', TRADE_ID_LEDGER.indexOf('cr_bee')===0);"
```

## 4. The rotation swap — `js/data.js`
`ROTATION` holds **ten** ids. One in, one out. Keeping it at ten is the point:
`getTodaysMachines()` stocks 5 of the pool each half-day, so a set in a pool of
10 shows up about once a day, and one in a pool of 20 shows up half as often.
Growing the pool thins every set in it.

Two rules:
- **Never rotate out a set less than two months old.** Somebody starting it on
  the 14th should not lose it on the 15th.
- **Let demand pick what returns.** A set that is OUT accumulates wants from
  people who cannot finish it — that is the signal:
  ```sql
  select split_part(item_id,'_',1) as set_prefix, count(*) as hunters
  from public.wants group by 1 order by hunters desc;
  ```

## What rotating OUT actually does — verified 27 Aug 2026
**Only two things respect `ROTATION`:** the shop floor, and an out-of-rotation
badge on the binder page. A set that leaves is still reachable through the
**Swap Shop / Fukubiki**, **Corinth**, and the **Special Pon**, which draws from
every sticker in the game.

**Confirmed live:** the parlour does not merely *reach* an out-of-rotation set,
it can feature a whole machine stocked with it — `corinth.js` picks its
collection from all of `COLLECTIONS`, ignoring rotation. Sky Diary appeared as a
dedicated 15-coin pusher the same evening it left the floor.

That is deliberate — rotation is a throttle, not a wall, which is what makes
"nothing is ever discontinued" true in code and not just in intent. It removes
the cheap, targeted route and leaves a slow one. Do not "fix" it without
deciding you want a wall instead.

It also gives the parlour a job — and since 27 Aug 2026 that is **deliberate,
not luck**. `corinthBoards()` sorts out-of-rotation sets to the FRONT of its
pool, so last season's sets are featured there first.

**Sorted, not filtered.** With only one set out, a strict filter would put it on
all three parlour machines, which is worse than the random room it replaces.
Priority-ordering degrades gracefully at one, and becomes a whole back-catalogue
room by itself once three or more sets have rotated out — no threshold to tune.

That room is deliberately optional and nothing points at it (a fourth stamp
track to force visits was considered and rejected). This gives it a reason
rather than a chore: **you go there because your unfinished set is in there.**
The `#parlour-tip` line says so when a rotated-out set is featured — *"the back
room keeps last season's sets in stock"* — and reverts to the normal Corinth tip
when nothing is out.

**So rotation now reads in both directions:** a set leaving the floor is a move,
not a subtraction. It is not gone, it is through the door.

Also unaffected by rotation: existing trade codes still redeem, the binder keeps
the page and your stickers, and wants still work for it.

## 5. Check before you push
- `node --check js/data.js js/tradeids.js`
- Load the page: the binder should show N+1 pages, art on every new pocket
- Mint a trade code for a new sticker and redeem it
- Mint one for an **old** sticker and confirm it still decodes to the same thing
