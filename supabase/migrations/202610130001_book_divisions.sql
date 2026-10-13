begin;

-- Expand only: existing books keep NULL until their division is confirmed.
alter table public.products add column if not exists division_code text;

alter table public.products drop constraint if exists products_division_code_valid;
alter table public.products add constraint products_division_code_valid check (
  division_code is null or division_code in (
    'sd-1-mipa',
    'sd-2-ips-bhs',
    'smp-sma-mipa',
    'smk',
    'phibeta',
    'intelecto'
  )
);

comment on column public.products.division_code is
  'Optional fixed book division code: sd-1-mipa (SD 1 MIPA), sd-2-ips-bhs (SD 2 IPS BHS), smp-sma-mipa (SMP/SMA MIPA), smk (SMK), phibeta (PHIBETA), intelecto (INTELECTO). One division per book; existing books remain NULL. Independent of education level and Editor authorization.';

commit;
