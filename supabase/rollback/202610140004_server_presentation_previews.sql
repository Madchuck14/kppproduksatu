begin;

-- Preserve generated paths and objects so rollback to the browser viewer loses no files.
alter table public.products
  drop constraint if exists products_product_knowledge_preview_status_valid;
alter table public.products
  drop column if exists product_knowledge_preview_error;
alter table public.products
  drop column if exists product_knowledge_preview_status;

comment on column public.products.product_knowledge_slide_paths is
  'Generated presentation previews retained for compatibility and later rollout.';

notify pgrst, 'reload schema';
commit;
