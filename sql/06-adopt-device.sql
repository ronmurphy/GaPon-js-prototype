-- GaPon — step 4, the last one: let a second device become the same player.
--
-- A restoring device is signed in as a DIFFERENT anonymous user, so RLS keyed
-- on the player would block it from ever seeing the row. Adoption therefore
-- goes through a security-definer function, the same shape as claim_trade.
--
-- It binds the device AND returns the payload in one trip, because you cannot
-- adopt without the code anyway — a second round trip would only be ceremony.
--
-- THE RECOVERY CODE IS THE ACCOUNT. Anyone holding it can bind their device
-- and become that player. That is the intended behaviour — it is the
-- credential — which is exactly why the Backup screen says, in those words,
-- that it is not a friend code.
--
-- Not enumerable: 12 characters from a 31-symbol alphabet is about 7.9e17,
-- and the function says nothing at all about a code it does not recognise.
--
-- Safe to run more than once.

create or replace function public.adopt_device(p_code text)
returns table (player_id uuid, payload text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_player  uuid;
  v_payload text;
  v_when    timestamptz;
begin
  select s.player_id, s.payload, s.updated_at
    into v_player, v_payload, v_when
    from public.saves s
   where s.recovery_code = upper(btrim(p_code));

  -- unknown code: return nothing, and volunteer nothing
  if v_player is null then
    return;
  end if;

  insert into public.player_devices (auth_id, player_id)
  values (auth.uid(), v_player)
  on conflict (auth_id) do update set player_id = excluded.player_id;

  return query select v_player, v_payload, v_when;
end
$function$;

grant execute on function public.adopt_device(text) to anon, authenticated;
