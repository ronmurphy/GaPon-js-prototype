-- GaPon — addressed capsules.
--
-- A capsule can now name who it's for. That is DELIVERY, not permission:
-- claim_trade still accepts any valid code from anyone, so a capsule made
-- offline, pasted into a group chat, or passed along by hand keeps working
-- exactly as it always has. to_id only decides whose Trading Post shows it
-- waiting. If you make addressing a requirement later, offline trading dies.
--
-- Safe to run more than once.

alter table public.trades
  add column if not exists to_id uuid references public.players(id) on delete set null;

-- unclaimed-only: the inbox query is the only thing that reads this column
create index if not exists trades_to_id_idx
  on public.trades (to_id) where claimed_by is null;

-- let the addressee read the capsules waiting for them (and nothing else)
drop policy if exists trades_recipient_read on public.trades;
create policy trades_recipient_read on public.trades
  for select to authenticated
  using (to_id = auth.uid());
