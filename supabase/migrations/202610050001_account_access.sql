begin;

create table public.account_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('sales', 'editor')),
  is_super boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.editor_scopes (
  user_id uuid not null references public.account_memberships(user_id) on delete cascade,
  education_level text not null check (education_level in ('SD', 'SMP', 'SMA', 'SMK')),
  primary key (user_id, education_level)
);

alter table public.account_memberships enable row level security;
alter table public.editor_scopes enable row level security;
revoke all on public.account_memberships, public.editor_scopes from anon, authenticated;
grant select on public.account_memberships, public.editor_scopes to authenticated;
grant all on public.account_memberships, public.editor_scopes to service_role;
create policy "Accounts read their membership" on public.account_memberships
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Editors read their scopes" on public.editor_scopes
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships
      where user_id = (select auth.uid()) and role = 'editor'
    )
  );

create function public.has_editor_scope(target_level text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_memberships as membership
    join public.editor_scopes as scope on scope.user_id = membership.user_id
    where membership.user_id = (select auth.uid())
      and membership.role = 'editor'
      and scope.education_level = target_level
  );
$$;
revoke all on function public.has_editor_scope(text) from public;
grant execute on function public.has_editor_scope(text) to authenticated;

-- Product policies stay unchanged. Super Editor uses the existing full admin membership.
-- Scoped Editor CRUD needs the separate versioned product identity/education-level migration.
commit;
