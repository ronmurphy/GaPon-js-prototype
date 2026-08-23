-- Read-only. Did the lockdown actually take effect, or is the result just
-- inconclusive because every trade in the database happens to be yours?

-- 1. the policy that is actually in force now
select policyname, cmd, coalesce(qual, '-') as using_expr
from pg_policies
where schemaname = 'public' and tablename = 'trades'
order by cmd, policyname;

-- 2. total trades vs how many either of your two accounts is party to.
--    Run as owner, so RLS does not apply — this is ground truth.
select
  (select count(*) from public.trades) as trades_total,
  (select count(*) from public.trades
     where from_id in ('bf6809ef-e212-4a5e-84c9-cd5c022359e4',
                       'df271bc1-7cc0-4423-a545-15c1561e2e0b')
        or to_id   in ('bf6809ef-e212-4a5e-84c9-cd5c022359e4',
                       'df271bc1-7cc0-4423-a545-15c1561e2e0b')) as yours,
  (select count(*) from public.trades
     where claimed_by is null) as still_unclaimed;
