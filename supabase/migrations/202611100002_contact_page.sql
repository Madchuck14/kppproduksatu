begin;

-- Validate public content even when a trusted Editor writes through PostgREST.
create or replace function public.valid_contact_page(content jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  field text;
  limit_length integer;
  entry jsonb;
  keys text[] := array['heading','headingHighlight','description','officeName','address',
    'email','phone','fax','hotline','whatsapp','mapEmbedUrl','hoursHeading',
    'hoursHighlight','hoursDescription','hours'];
begin
  if jsonb_typeof(content) is distinct from 'object' then return false; end if;
  if not content ?& keys or exists (
    select 1 from jsonb_object_keys(content) as k(name) where not name = any(keys)
  ) then return false; end if;
  for field, limit_length in select * from (values
    ('heading',120),('headingHighlight',120),('description',600),('officeName',120),
    ('address',400),('email',254),('phone',40),('fax',40),('hotline',40),
    ('whatsapp',40),('mapEmbedUrl',3000),('hoursHeading',120),
    ('hoursHighlight',120),('hoursDescription',600)
  ) as limits(name,max_length) loop
    if jsonb_typeof(content -> field) is distinct from 'string'
      or char_length(btrim(content ->> field)) not between 1 and limit_length
      or (content ->> field) !~ '[^[:space:]]' then return false; end if;
  end loop;
  if (content ->> 'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (content ->> 'mapEmbedUrl') !~ '^https://www[.]google[.]com/maps/embed([?#][^[:space:]]*)?$'
    then return false; end if;
  foreach field in array array['phone','fax','hotline','whatsapp'] loop
    if (content ->> field) !~ '^[+0-9().[:space:]-]+$'
      or (content ->> field) !~ '[0-9]' then return false; end if;
  end loop;
  if char_length(regexp_replace(content ->> 'whatsapp','[^0-9]','','g')) not between 8 and 16
    then return false; end if;
  if jsonb_typeof(content -> 'hours') is distinct from 'array' then return false; end if;
  if jsonb_array_length(content -> 'hours') <> 2 then return false; end if;
  for entry in select * from jsonb_array_elements(content -> 'hours') loop
    if jsonb_typeof(entry) is distinct from 'object' then return false; end if;
    if not entry ?& array['day','time','note'] or exists (
      select 1 from jsonb_object_keys(entry) as k(name) where name not in ('day','time','note')
    ) then return false; end if;
    foreach field in array array['day','time','note'] loop
      limit_length := case when field = 'day' then 60 else 100 end;
      if jsonb_typeof(entry -> field) is distinct from 'string'
        or char_length(btrim(entry ->> field)) not between 1 and limit_length
        or (entry ->> field) !~ '[^[:space:]]' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_contact_page(jsonb) from public, anon;
grant execute on function public.valid_contact_page(jsonb) to authenticated, service_role;

create table if not exists public.contact_page (
  id boolean primary key default true check (id),
  content jsonb not null check (public.valid_contact_page(content))
);
insert into public.contact_page (id,content) values (true,$contact${
  "heading": "Berbagai cara untuk",
  "headingHighlight": "terhubung dengan kami",
  "description": "Pilih saluran komunikasi yang paling nyaman untuk Anda. Tim kami siap membantu pertanyaan seputar buku dan pemesanan.",
  "officeName": "Kantor Pusat Erlangga",
  "address": "Jl. H. Baping Raya No. 100, Ciracas, Jakarta Timur 13740",
  "email": "info@erlangga.co.id",
  "phone": "(021) 871 7006",
  "fax": "(021) 877 946 09",
  "hotline": "1500-885",
  "whatsapp": "08191-1500-885",
  "mapEmbedUrl": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.564382405313!2d106.86915197481105!3d-6.3208058618512855!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69ed0c8e2945cf%3A0x532ab84fc45f49c6!2sPenerbit%20Erlangga!5e0!3m2!1sen!2sid!4v1791865021196!5m2!1sen!2sid",
  "hoursHeading": "Kami siap melayani",
  "hoursHighlight": "setiap hari kerja",
  "hoursDescription": "Tim dukungan kami aktif menerima pertanyaan dan keluhan melalui berbagai saluran komunikasi yang tersedia.",
  "hours": [
    {
      "day": "Senin – Jumat",
      "time": "08.00 – 17.00 WIB",
      "note": "Siap melayani Anda"
    },
    {
      "day": "Sabtu",
      "time": "08.00 – 13.00 WIB",
      "note": "Siap melayani Anda"
    }
  ]
}$contact$::jsonb)
on conflict (id) do nothing;

alter table public.contact_page enable row level security;
revoke all on public.contact_page from public, anon, authenticated;
grant select on public.contact_page to anon, authenticated;
grant update (content) on public.contact_page to authenticated;
grant all on public.contact_page to service_role;
drop policy if exists contact_page_public_read on public.contact_page;
create policy contact_page_public_read on public.contact_page
  for select to anon, authenticated using (true);
drop policy if exists contact_page_super_update on public.contact_page;
create policy contact_page_super_update on public.contact_page
  for update to authenticated
  using (exists (select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor' and m.is_super))
  with check (exists (select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor' and m.is_super));

notify pgrst, 'reload schema';
commit;
