-- GaPon — step 1 of cross-device saves: one player, many devices.
--
-- SHIPS NOTHING VISIBLE. No new features, no client changes required. It only
-- makes "who am I" indirect, so a later step can point two devices at one
-- player. Run it, confirm the game behaves exactly as before, then move on.
--
-- Existing players need NO migration: see the coalesce in current_player_id().
--
-- Safe to run more than once.

-- ---------------------------------------------------------------- devices --

-- Which anonymous logins are the same person. Empty for now — every existing
-- player simply has no row here, which the coalesce below treats as "this
-- device is its own player", i.e. exactly today's behaviour.
create table if not exists public.player_devices (
  auth_id   uuid primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  added_at  timestamptz not null default now()
);

create index if not exists player_devices_player_idx
  on public.player_devices (player_id);

alter table public.player_devices enable row level security;

-- This table DEFINES the mapping, so its own policy must key on auth.uid()
-- directly. Using current_player_id() here would be circular.
drop policy if exists player_devices_read_own on public.player_devices;
create policy player_devices_read_own on public.player_devices
  for select to authenticated
  using (auth_id = auth.uid());

-- Writes happen only through adopt_device() (security definer, added later).
-- Deliberately no insert/update/delete policy: nothing writes here directly.

-- --------------------------------------------------------------- identity --

-- The whole account model is this one function.
--
-- SECURITY DEFINER so it can read player_devices past that table's own RLS —
-- which is also what stops the circularity. STABLE so policies can cache it
-- within a statement.
create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pd.player_id from public.player_devices pd where pd.auth_id = auth.uid()),
    auth.uid()
  );
$$;

grant execute on function public.current_player_id() to anon, authenticated;

-- ------------------------------------------------------- repointed policies --
-- Every policy that said auth.uid() now asks who the PLAYER is. For a device
-- with no mapping these are identical, which is why this ships invisibly.

drop policy if exists "insert own row" on public.players;
create policy "insert own row" on public.players
  for insert to authenticated
  with check (id = public.current_player_id());

drop policy if exists "update own row" on public.players;
create policy "update own row" on public.players
  for update to authenticated
  using (id = public.current_player_id())
  with check (id = public.current_player_id());

drop policy if exists "create own trade" on public.trades;
create policy "create own trade" on public.trades
  for insert to authenticated
  with check (from_id = public.current_player_id());

drop policy if exists "cancel own trade" on public.trades;
create policy "cancel own trade" on public.trades
  for delete to authenticated
  using (from_id = public.current_player_id() and claimed_by is null);

drop policy if exists trades_recipient_read on public.trades;
create policy trades_recipient_read on public.trades
  for select to authenticated
  using (to_id = public.current_player_id());

drop policy if exists "write own wants" on public.wants;
create policy "write own wants" on public.wants
  for all to authenticated
  using (player_id = public.current_player_id())
  with check (player_id = public.current_player_id());

-- The three "USING true" SELECT policies are deliberately left alone here.
-- players and wants are meant to be readable: that is how a friend code is
-- looked up and how matching works. `trades` is a different story and gets
-- dealt with in step 2 — see sql/02-trade-read-lockdown.sql.

-- ------------------------------------------------------------ claim_trade --
-- Same atomic conditional UPDATE, but it now asks who the PLAYER is. Without
-- this, redeeming your own capsule from a second device would no longer be
-- recognised as yours and the take-back path would misbehave.
--
-- Also pins search_path, which the original was missing — a security definer
-- function should never inherit the caller's.
create or replace function public.claim_trade(p_code text)
returns table(item_id text, from_name text)
language sql
security definer
set search_path = public
as $$
  update trades
     set claimed_by = public.current_player_id(), claimed_at = now()
   where code = p_code
     and claimed_by is null
     and from_id <> public.current_player_id()
  returning trades.item_id, trades.from_name;
$$;

grant execute on function public.claim_trade(text) to anon, authenticated;
