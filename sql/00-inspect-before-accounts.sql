-- Read-only. One result set, because the SQL editor only shows the last one.
-- Shows everything the account migration has to repoint. Changes nothing.

select 'policy' as section,
       tablename || '.' || policyname || '  [' || cmd || ']' as name,
       'USING ' || coalesce(qual, '-') || '   CHECK ' || coalesce(with_check, '-') as detail
from pg_policies where schemaname = 'public'

union all

select 'default',
       c.relname || '.' || a.attname,
       pg_get_expr(d.adbin, d.adrelid)
from pg_attrdef d
join pg_class c     on c.oid = d.adrelid
join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'

union all

select 'function',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

union all

select 'rls', relname, case when relrowsecurity then 'enabled' else 'DISABLED' end
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'

order by 1, 2;
