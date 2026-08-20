-- GaPon — mark a sealed capsule as holding a foil.
--
-- COSMETIC ONLY. Foilness travels inside the trade code itself (a GF- prefix
-- folded into the checksum) and is parsed locally at redeem time, so trading
-- is already correct without this column. It exists purely so the recipient's
-- inbox can say "✨ Dashy is waiting" instead of "Dashy".
--
-- Deliberately NOT trusted for anything: never decide what a player receives
-- from this value. The code is the authority.
--
-- Existing rows default to false, which is correct — every trade sealed
-- before this shipped was a plain sticker.
--
-- Safe to run more than once.

alter table public.trades
  add column if not exists foil boolean not null default false;
