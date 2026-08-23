-- GaPon — step 2c. Closes the trades read hole.
--
-- DO NOT RUN THIS until the client is using trade_status() — otherwise
-- redeeming a capsule addressed to nobody in particular stops working, since
-- the client can no longer see whether the code was already opened.
--
-- After this, you can read a trade row only if you are party to it: you made
-- it, or it was addressed to you. Everything else goes through the two
-- security-definer functions, which answer about a code you already hold.
--
-- Safe to run more than once.

drop policy if exists "read trades" on public.trades;
drop policy if exists trades_recipient_read on public.trades;

create policy trades_read_own on public.trades
  for select to authenticated
  using (
    from_id = public.current_player_id()
    or to_id = public.current_player_id()
  );

-- Note what is NOT restricted, and why:
--   players  — USING (true) stays. Looking up a friend by code needs it.
--   wants    — USING (true) stays. Friend matching needs it, and a wants list
--              is a list of cartoon stickers.
-- `trades` is different in kind: the code IS the bearer token for a sticker.
