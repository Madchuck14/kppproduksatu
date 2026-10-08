begin;

-- Expand the allowed SMK subjects without changing existing product rows.
-- Names and level mapping match daftarmapel.md and shared/utils/book-subjects.ts.
alter table public.products drop constraint if exists products_subject_level_valid;
alter table public.products add constraint products_subject_level_valid check (
  subject is null or (
    education_level is not null and (
      (education_level = 'SD' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        'Seni dan Budaya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Bahasa Inggris',
        'Muatan Lokal (Bahasa Daerah)'
      )) or
      (education_level = 'SMP' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Ilmu Pengetahuan Alam (IPA)',
        'Ilmu Pengetahuan Sosial (IPS)',
        'Bahasa Inggris',
        'Informatika',
        'Seni dan Prakarya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Muatan Lokal (Bahasa Daerah)'
      )) or
      (education_level in ('SMA', 'SMK') and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Bahasa Inggris',
        'Sejarah',
        'Seni dan Budaya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Informatika',
        'Biologi',
        'Fisika',
        'Kimia',
        'Matematika Lanjutan',
        'Ekonomi',
        'Sosiologi',
        'Geografi',
        'Antropologi',
        'Bahasa dan Sastra Indonesia',
        'Bahasa dan Sastra Inggris'
      ))
    )
  )
);
comment on column public.products.subject is 'Optional subject category from daftarmapel.md, validated by education level. NULL preserves legacy books; SMK uses the same subject list as SMA.';

-- Existing published-only and Editor level scope RLS policies remain in force.
commit;