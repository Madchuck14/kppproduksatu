-- Read-only diagnostics. Run in the Supabase SQL Editor after the count migration.
-- Execution plans use anonymous RLS, rather than the SQL Editor owner's bypass.
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('products', 'account_memberships', 'editor_scopes');

begin;
set local role anon;
explain (analyze, buffers)
select education_level, count(*) from public.products
where published = true and education_level is not null group by education_level;

explain (analyze, buffers)
select subject, count(*) from public.products
where published = true and education_level = 'SD' and grade = 1
and subject is not null group by subject;

explain (analyze, buffers)
select id from public.products where published = true
order by created_at desc, id asc limit 15;

explain (analyze, buffers)
select id from public.products where published = true
and (title ilike '%matematika%' or author ilike '%matematika%'
or book_code ilike '%matematika%' or subject ilike '%matematika%')
order by created_at desc, id asc limit 15;
rollback;
