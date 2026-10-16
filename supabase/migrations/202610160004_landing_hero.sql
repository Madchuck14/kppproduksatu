begin;

create table if not exists public.landing_hero (
  id boolean primary key default true check (id),
  heading text not null check (heading ~ '[^[:space:]]' and char_length(btrim(heading)) between 1 and 100),
  body text not null check (body ~ '[^[:space:]]' and char_length(btrim(body)) between 1 and 400)
);

insert into public.landing_hero (heading, body) values (
  'Temukan Buku Pilihanmu',
  'Jelajahi berbagai koleksi buku pelajaran untuk menemani rasa ingin tahu dan setiap langkah perjalananmu.'
) on conflict (id) do nothing;

alter table public.landing_hero enable row level security;
revoke all on public.landing_hero from public, anon, authenticated;
grant select on public.landing_hero to anon, authenticated;
drop policy if exists landing_hero_public_read on public.landing_hero;
create policy landing_hero_public_read on public.landing_hero
  for select to anon, authenticated using (true);

-- Save global copy and scoped featured books in one transaction. No direct client writes.
create or replace function public.set_featured_books_with_hero(
  selected_book_ids uuid[], hero_heading text, hero_body text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
begin
  -- Existing RPC verifies Editor membership, level scope, uniqueness, and the eight-book limit.
  selected_count := public.set_featured_books(selected_book_ids);
  if hero_heading is null or hero_heading !~ '[^[:space:]]'
    or char_length(btrim(hero_heading)) not between 1 and 100
    or hero_body is null or hero_body !~ '[^[:space:]]'
    or char_length(btrim(hero_body)) not between 1 and 400 then
    raise exception using errcode = '22023', message = 'invalid_landing_hero';
  end if;
  update public.landing_hero
    set heading = btrim(hero_heading), body = btrim(hero_body)
    where id = true;
  if not found then
    raise exception using errcode = 'P0001', message = 'landing_hero_missing';
  end if;
  return selected_count;
end;
$$;

revoke all on function public.set_featured_books_with_hero(uuid[], text, text) from public, anon;
grant execute on function public.set_featured_books_with_hero(uuid[], text, text) to authenticated;

commit;
