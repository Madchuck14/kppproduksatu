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
| `curriculum` | `text` |  Nullable |
| `isbn` | `text` |  Nullable |
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
| `product_knowledge_preview_path` | `text` |  Nullable |
| `subject` | `text` |  Nullable |
| `grade` | `int2` |  Nullable |
| `highlights` | `_text` |  |
| `division_code` | `text` |  Nullable |
| `synopsis` | `text` |  Nullable |
| `target_market` | `_text` |  |

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

## RLS Policies

### `admin_memberships`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Members can read their membership` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

### `products`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Editors delete scoped products` | DELETE | authenticated | PERMISSIVE | `can_manage_book_level(education_level)` | — |
| `Editors insert scoped products` | INSERT | authenticated | PERMISSIVE | — | `((book_code IS NOT NULL) AND (education_level IS NOT NULL) AND can_manage_book_level(education_level))` |
| `Editors read managed products` | SELECT | authenticated | PERMISSIVE | `can_manage_book_level(education_level)` | — |
| `Editors update scoped products` | UPDATE | authenticated | PERMISSIVE | `can_manage_book_level(education_level)` | `((book_code IS NOT NULL) AND (education_level IS NOT NULL) AND can_manage_book_level(education_level))` |
| `Published products` | SELECT | anon, authenticated | PERMISSIVE | `published` | — |

### `account_memberships`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Accounts read their membership` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

### `editor_scopes`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Editors read their scopes` | SELECT | authenticated | PERMISSIVE | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM account_memberships   WHERE ((account_memberships.user_id = ( SELECT auth.uid() AS uid)) AND (account_memberships.role = 'editor'::text)))))` | — |

### `product_favorites`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users favorite published books` | INSERT | authenticated | PERMISSIVE | — | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_favorites.product_id) AND (p.published = true)))))` |
| `Users read their favorites` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |
| `Users remove their favorites` | DELETE | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

### `product_access_stats`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public published book statistics` | SELECT | anon, authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_access_stats.product_id) AND (p.published = true))))` | — |

