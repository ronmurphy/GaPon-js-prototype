-- GaPon — step 3 of cross-device saves: somewhere to put one.
--
-- Upload only. Nothing adopts anything yet, so this cannot affect a player who
-- never presses the button.
--
-- The payload is ciphertext. The server cannot read it, and neither can you
-- from the dashboard — see js/crypt.js. That is not paranoia about sticker
-- collections: a save carries `friends`, which holds OTHER people's friend
-- codes and display names. Encrypting retires that problem rather than
-- managing it with policy.
--
-- Safe to run more than once.

-- Twelve characters, same alphabet as gen_friend_code() — no I, L, O, 0 or 1,
-- because these get read off one screen and typed into another. About
-- 7.9e17 combinations.
create or replace function public.gen_recovery_code()
returns text
language plpgsql
as $function$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i int;
begin
  for i in 1..12 loop
    out_code := out_code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;
  return out_code;
end $function$;

create table if not exists public.saves (
  player_id     uuid primary key references public.players(id) on delete cascade,
  recovery_code text unique not null default public.gen_recovery_code(),
  payload       text not null,          -- base64( salt | iv | ciphertext+tag )
  updated_at    timestamptz not null default now()
);

alter table public.saves enable row level security;

-- Your own row only. There is deliberately no "read by recovery code" policy:
-- a device that does not own the row gets at it through adopt_device(), which
-- is added in the next step and is security definer.
drop policy if exists saves_own on public.saves;
create policy saves_own on public.saves
  for all to authenticated
  using (player_id = public.current_player_id())
  with check (player_id = public.current_player_id());

-- Keep updated_at honest — it is what the restore screen shows before it lets
-- anyone overwrite a collection.
create or replace function public.touch_save()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end $function$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before update on public.saves
  for each row execute function public.touch_save();
