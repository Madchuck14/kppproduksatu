begin;

-- Remove the count limit without changing existing contacts or RLS.
-- Preserve NULL fallback and all per-contact validation.
create or replace function public.valid_contact_phones(phones jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare entry jsonb;
begin
  if phones is null then return true; end if;
  if jsonb_typeof(phones) is distinct from 'array' then return false; end if;
  if jsonb_array_length(phones) < 1 then return false; end if;
  for entry in select * from jsonb_array_elements(phones) loop
    if jsonb_typeof(entry) is distinct from 'object' then return false; end if;
    if not entry ?& array['label','number'] or exists (
      select 1 from jsonb_object_keys(entry) as k(name) where name not in ('label','number')
    ) then return false; end if;
    if jsonb_typeof(entry -> 'label') is distinct from 'string'
      or char_length(btrim(entry ->> 'label')) not between 1 and 60
      or (entry ->> 'label') !~ '[^[:space:]]'
      or jsonb_typeof(entry -> 'number') is distinct from 'string'
      or char_length(btrim(entry ->> 'number')) not between 1 and 40
      or (entry ->> 'number') !~ '^[+0-9().[:space:]-]+$'
      or (entry ->> 'number') !~ '[0-9]' then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_contact_phones(jsonb) from public, anon;
grant execute on function public.valid_contact_phones(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
