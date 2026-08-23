-- GaPon — step 2a of closing the trades read hole. ADDITIVE ONLY.
--
-- Right now `trades` has a SELECT policy of USING (true), so any anonymous
-- user holding the publishable key — which is in js/net.js and meant to be
-- public — can run:
--
--     select code from trades where claimed_by is null
--
-- and receive every outstanding capsule code in the game. Each one is a free
-- sticker to whoever redeems it first. RLS was supposed to be the protection.
--
-- The client currently needs that open read for exactly one question: "has
-- this code already been opened?", asked about a code the player is holding.
-- This function answers that and nothing else, so the policy can be closed in
-- step 2c without breaking redemption.
--
--   true  = someone has opened it
--   false = it exists and is still sealed
--   NULL  = no such code (an offline capsule the server never saw)
--
-- Not enumerable: you must already know the code, and codes carry a checksum
-- and a random nonce. Returns no item, no sender, no owner — the least it can
-- say while still being useful.
--
-- Safe to run more than once. Run this BEFORE the client change.

create or replace function public.trade_status(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select t.claimed_by is not null
  from trades t
  where t.code = upper(btrim(p_code));
$$;

grant execute on function public.trade_status(text) to anon, authenticated;
