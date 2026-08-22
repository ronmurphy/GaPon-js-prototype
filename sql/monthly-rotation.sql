-- GaPon — the monthly rotation ritual. Run this on the 1st.
--
-- It tells you what people are actually hunting. You then hand-pick the ten
-- sets for the month and commit them to ROTATION in js/data.js. Do NOT wire
-- this into the game: the shop floor is seeded client-side so it works offline
-- and is identical for every player, and a server-derived pool breaks both.
--
-- Reading it:
--   • A set high on this list is wanted. Keep it in, or bring it back.
--   • A set that is OUT of rotation and still climbing is the strongest
--     possible signal to return it — those are people who cannot finish it.
--   • Popularity decides the ORDER, never whether a set comes back. Every set
--     returns within about three months regardless, or an unloved set leaves,
--     nobody new starts it, and it never comes back.
--   • Seasonal sets are exempt — they return on the calendar, once a year.
--
-- Item ids carry their set as a prefix, which is what makes this work:
--   sp=Cosmo Club  cr=Critter Pals  sn=Snack Attack  mu=Beat Box  oc=Tide Pool
--   gd=Bloom Crew  px=Pixel Party   rt=Road Trip     sb=Ball Game  wx=Sky Diary
--   ct=Cat Cafe

-- what people are hunting, by set
select
  split_part(item_id, '_', 1) as set_prefix,
  count(*)                    as wants,
  count(distinct player_id)   as hunters
from public.wants
group by 1
order by wants desc;

-- how many people are even around to hunt (see js/net.js — updated_at is
-- touched on every launch, so it means LAST SEEN)
select
  count(*) filter (where updated_at > now() - interval '7 days')  as active_7d,
  count(*) filter (where updated_at > now() - interval '30 days') as active_30d,
  count(*)                                                        as rows_total
from public.players;

-- Trades are a thinner signal than wants, but worth a glance for what is
-- actually moving between people.
--
-- `sealed` counts every capsule ever made that still has a row — a take-back
-- deletes its row, but a capsule nobody has opened yet is still counted. Only
-- `opened` means a sticker genuinely changed hands, so read that column.
select
  split_part(item_id, '_', 1)                     as set_prefix,
  count(*)                                        as sealed,
  count(*) filter (where claimed_by is not null)  as opened,
  count(*) filter (where foil)                    as foil,
  count(*) filter (where claimed_by is null)      as still_waiting
from public.trades
group by 1
order by opened desc, sealed desc;
