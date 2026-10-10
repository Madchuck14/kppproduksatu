begin;

alter table public.products add column if not exists grade smallint;

alter table public.products drop constraint if exists products_grade_matches_level;
alter table public.products add constraint products_grade_matches_level check (
  grade is null or (
    education_level is not null and (
      (education_level = 'SD' and grade between 1 and 6) or
      (education_level = 'SMP' and grade between 7 and 9) or
      (education_level in ('SMA', 'SMK') and grade between 10 and 12)
    )
  )
);

create index if not exists products_published_level_grade_idx
  on public.products (education_level, grade) where published = true;

comment on column public.products.grade is
  'Optional school grade: SD 1-6, SMP 7-9, SMA/SMK 10-12. Existing books remain NULL.';

commit;
