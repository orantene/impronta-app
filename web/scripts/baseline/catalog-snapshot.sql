-- Catalog snapshot query for gen-baseline.mjs (option B). READ-ONLY: SELECT on pg_catalog only.
-- Run against the ISOLATED qa-journeys project only, via the Supabase MCP execute_sql
-- (or psql by someone with credentials). Save the single json cell to a file.
-- Scope: schema `public`. only_tables = NULL snapshots every table; set an array to sample.
with params as (select null::text[] as only_tables),
t as (
  select c.oid, c.relname, c.relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace, params p
  where n.nspname = 'public' and c.relkind in ('r','p')
    and (p.only_tables is null or c.relname = any(p.only_tables))
),
cols as (
  select t.relname,
    json_agg(json_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull,
      'default', case when a.attgenerated = '' then pg_get_expr(d.adbin, d.adrelid) end,
      'generated', case when a.attgenerated = 's' then pg_get_expr(d.adbin, d.adrelid) end,
      'identity', nullif(a.attidentity::text, '')
    ) order by a.attnum) as cols
  from t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  group by t.relname
),
cons as (
  select t.relname,
    json_agg(json_build_object('name', co.conname, 'type', co.contype::text,
      'def', pg_get_constraintdef(co.oid)) order by co.contype, co.conname) as cons
  from t join pg_constraint co on co.conrelid = t.oid and co.contype in ('p','u','f')
  group by t.relname
),
idx as (
  select t.relname,
    json_agg(json_build_object('name', ic.relname, 'def', pg_get_indexdef(i.indexrelid))
      order by ic.relname) as idx
  from t
  join pg_index i on i.indrelid = t.oid
  join pg_class ic on ic.oid = i.indexrelid
  where not exists (select 1 from pg_constraint co where co.conindid = i.indexrelid)
  group by t.relname
)
select json_build_object(
  'extensions', (select coalesce(json_agg(json_build_object('name', e.extname,
      'schema', n.nspname) order by e.extname), '[]') from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql'),
  'enums', (select coalesce(json_agg(json_build_object('name', ty.typname,
      'labels', (select json_agg(en.enumlabel order by en.enumsortorder)
                 from pg_enum en where en.enumtypid = ty.oid)) order by ty.typname), '[]')
      from pg_type ty join pg_namespace n on n.oid = ty.typnamespace
      where n.nspname = 'public' and ty.typtype = 'e'),
  'tables', (select coalesce(json_agg(json_build_object('name', t.relname,
      'columns', cols.cols, 'constraints', coalesce(cons.cons, '[]'),
      'indexes', coalesce(idx.idx, '[]')) order by t.relname), '[]')
      from t join cols using (relname)
      left join cons using (relname) left join idx using (relname))
) as snapshot;
