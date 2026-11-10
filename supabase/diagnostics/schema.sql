## Table `admin_memberships`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `created_at` | `timestamptz` |  |

## Table `products`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `slug` | `text` |  Unique |
| `title` | `text` |  |
| `author` | `text` |  |
| `price` | `int4` |  |
| `image_path` | `text` |  Nullable |
| `featured` | `bool` |  |
| `published` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `book_code` | `text` |  Nullable |
| `education_level` | `text` |  Nullable |
| `publication_year` | `int2` |  Nullable |
| `flyer_path` | `text` |  Nullable |
| `dummy_book_path` | `text` |  Nullable |
| `product_knowledge_path` | `text` |  Nullable |
| `subject` | `text` |  Nullable |
| `grade` | `int2` |  Nullable |
| `highlights` | `_text` |  |
| `division_code` | `text` |  Nullable |
| `synopsis` | `text` |  Nullable |
| `target_market` | `_text` |  |
| `curriculum` | `text` |  Nullable |
| `isbn` | `text` |  Nullable |
| `product_knowledge_preview_path` | `text` |  Nullable |

## Table `account_memberships`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `role` | `text` |  |
| `is_super` | `bool` |  |
| `created_at` | `timestamptz` |  |

## Table `editor_scopes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `education_level` | `text` | Primary |

## Table `product_favorites`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `product_id` | `uuid` | Primary |
| `created_at` | `timestamptz` |  |

## Table `product_access_days`

Private deduplication ledger: one published book access per browser identifier per UTC day. Not a verified unique-person count.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `product_id` | `uuid` | Primary |
| `visitor_id` | `uuid` | Primary |
| `access_day` | `date` | Primary |

## Table `product_access_stats`

Lifetime deduplicated browser-day accesses. Updated atomically by record_product_access only.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `product_id` | `uuid` | Primary |
| `access_count` | `int8` |  |

## Table `book_classifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `kind` | `text` | Primary |
| `code` | `text` | Primary |
| `name` | `text` |  |
| `education_level` | `text` | Primary |
| `position` | `int8` |  Identity |
| `is_builtin` | `bool` |  |

## Table `landing_hero`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `bool` | Primary |
| `heading` | `text` |  |
| `body` | `text` |  |

## Table `employee_registry`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `nip` | `text` | Primary |
| `role` | `text` |  |
| `education_level` | `text` |  Nullable |
| `user_id` | `uuid` |  Nullable Unique |
| `created_at` | `timestamptz` |  |

## RLS Policies

### `admin_memberships`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Members can read their membership` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

### `products`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Published products` | SELECT | anon, authenticated | PERMISSIVE | `published` | — |
| `Editors read managed products` | SELECT | authenticated | PERMISSIVE | `can_manage_book_level(education_level)` | — |
| `Editors insert scoped products` | INSERT | authenticated | PERMISSIVE | — | `((book_code IS NOT NULL) AND (education_level IS NOT NULL) AND can_manage_book_level(education_level))` |
| `Editors update scoped products` | UPDATE | authenticated | PERMISSIVE | `can_manage_book_level(education_level)` | `((book_code IS NOT NULL) AND (education_level IS NOT NULL) AND can_manage_book_level(education_level))` |
| `Editors delete scoped products` | DELETE | authenticated | PERMISSIVE | `can_manage_book_level(education_level)` | — |

### `editor_scopes`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Editors read their scopes` | SELECT | authenticated | PERMISSIVE | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM account_memberships   WHERE ((account_memberships.user_id = ( SELECT auth.uid() AS uid)) AND (account_memberships.role = 'editor'::text)))))` | — |

### `product_access_stats`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public published book statistics` | SELECT | anon, authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_access_stats.product_id) AND (p.published = true))))` | — |

### `book_classifications`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `classifications_public_read` | SELECT | anon, authenticated | PERMISSIVE | `true` | — |
| `classifications_super_insert` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM account_memberships m   WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'editor'::text) AND m.is_super)))` |

### `landing_hero`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `landing_hero_public_read` | SELECT | anon, authenticated | PERMISSIVE | `true` | — |

### `account_memberships`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Accounts read their membership` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

### `product_favorites`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Accounts read their favorites` | SELECT | authenticated | PERMISSIVE | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM account_memberships m   WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['sales'::text, 'editor'::text]))))))` | — |
| `Accounts favorite published books` | INSERT | authenticated | PERMISSIVE | — | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM account_memberships m   WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['sales'::text, 'editor'::text]))))) AND (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_favorites.product_id) AND (p.published = true)))))` |
| `Accounts remove their favorites` | DELETE | authenticated | PERMISSIVE | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM account_memberships m   WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['sales'::text, 'editor'::text]))))))` | — |

### `employee_registry`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `employee_reads_own_nip` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

