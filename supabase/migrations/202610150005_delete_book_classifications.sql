begin;

alter table public.book_classifications add column if not exists is_builtin boolean not null default false;
-- Only the original six divisions and canonical level/subject pairs are protected.
update public.book_classifications set is_builtin = true where kind = 'division'
  and code in ('sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto');
with subjects as (
  select level, unnest(array[
    'Pendidikan Agama dan Budi Pekerti', 'Pendidikan Pancasila', 'Bahasa Indonesia',
    'Matematika', 'Bahasa Inggris', 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)'
  ]) as name from unnest(array['SD', 'SMP', 'SMA', 'SMK']) as level
  union all
  select 'SD', unnest(array['Ilmu Pengetahuan Alam dan Sosial (IPAS)', 'Seni dan Budaya', 'Muatan Lokal (Bahasa Daerah)'])
  union all
  select 'SMP', unnest(array['Ilmu Pengetahuan Alam (IPA)', 'Ilmu Pengetahuan Sosial (IPS)', 'Informatika', 'Seni dan Prakarya', 'Muatan Lokal (Bahasa Daerah)'])
  union all
  select level, unnest(array['Sejarah', 'Seni dan Budaya', 'Informatika', 'Biologi', 'Fisika', 'Kimia', 'Matematika Lanjutan', 'Ekonomi', 'Sosiologi', 'Geografi', 'Antropologi', 'Bahasa dan Sastra Indonesia', 'Bahasa dan Sastra Inggris'])
  from unnest(array['SMA', 'SMK']) as level
)
update public.book_classifications c set is_builtin = true from subjects s
where c.kind = 'subject' and c.code = s.name and c.education_level = s.level;

-- No direct DELETE grant: this RPC alone checks all products, including hidden drafts.
-- The table lock serializes deletion with product writers so references cannot race.
create or replace function public.delete_book_classification(option_kind text, option_code text, option_level text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.book_classifications%rowtype;
begin
  if not exists (
    select 1 from public.account_memberships m where m.user_id = (select auth.uid())
      and m.role = 'editor' and (m.is_super or exists (
        select 1 from public.editor_scopes s where s.user_id = m.user_id
      ))
  ) or (option_kind = 'subject' and not public.has_editor_scope(option_level)) then
    raise exception 'classification_forbidden' using errcode = '42501';
  end if;
  lock table public.products in share row exclusive mode;
  select * into target from public.book_classifications
    where kind = option_kind and code = option_code and education_level = option_level for update;
  if not found then return false; end if;
  if target.is_builtin then raise exception 'classification_builtin' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.products p where
      (target.kind = 'division' and p.division_code = target.code)
      or (target.kind = 'subject' and p.subject = target.name and p.education_level = target.education_level)
      or (target.kind = 'curriculum' and lower(btrim(p.curriculum)) = lower(target.name))
  ) then raise exception 'classification_in_use' using errcode = 'P0001'; end if;
  delete from public.book_classifications
    where kind = target.kind and code = target.code and education_level = target.education_level;
  return true;
end;
$$;
revoke all on function public.delete_book_classification(text, text, text) from public, anon, authenticated;
grant execute on function public.delete_book_classification(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
