# Repository guidance

## Project context

KPP Produk Satu is an Erlangga product katalogs. It uses
Nuxt 4, Vue 3, TypeScript, Nitro, Nuxt UI 4, Tailwind CSS 4, Zod 4, and Supabase
(PostgreSQL, Auth, and Storage). The storefront uses SSR; the admin interface is
currently a foundation without CRUD.

Read `README.md` and the relevant files in `docs/` before changing behavior:

- `docs/architecture.md`: current stack, data boundaries, and portability decisions.
- `docs/supabase.md`: database, storage, RLS, and admin setup.
- `docs/deploy.md`: Cloudflare staging and Node/Docker production deployment.
- `docs/roadmap.md`: planned features and implementation scope.

The root Shopify/SvelteKit concept document is historical feature reference;
`docs/architecture.md` defines the current architecture. Do not treat planned
commerce features as already implemented.

## Setup and commands

Use Node.js 22.12 or newer and npm with the committed `package-lock.json`. On
Windows PowerShell, use `npm.cmd` and `npx.cmd` to avoid execution-policy issues.
Use `npm` and `npx` on other platforms.

| Command                            | Purpose                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `npm.cmd ci`                       | Install dependencies from the lockfile; runs `nuxt prepare` |
| `npm.cmd run dev`                  | Start the local development server                          |
| `npm.cmd run typecheck`            | Check Nuxt/Vue/TypeScript types                             |
| `npm.cmd run lint`                 | Run ESLint                                                  |
| `npm.cmd run format:check`         | Check repository formatting                                 |
| `npx.cmd prettier --check <paths>` | Check formatting of changed files                           |
| `npx.cmd prettier --write <paths>` | Format specific changed files                               |
| `npm.cmd run build`                | Build the Node server                                       |
| `npm.cmd run preview`              | Preview the Node build                                      |
| `npm.cmd run start`                | Run `.output/server/index.mjs`                              |
| `npm.cmd run build:cloudflare`     | Build the Cloudflare Worker                                 |

Copy `.env.example` to `.env` only when `.env` does not already exist. The default
`NUXT_CATALOG_SOURCE=demo` uses local fixtures and needs no live Supabase project.
Use `docs/supabase.md` when configuring `NUXT_CATALOG_SOURCE=supabase`.

Both build targets replace `.output`; rebuild the Node target before using Node
`preview` or `start` after a Cloudflare build. `deploy:staging` publishes to
Cloudflare; run it only when deployment is part of the requested task.

## Code organization and conventions

- `app/`: pages, layouts, components, navigation middleware, and CSS.
- `shared/types/` and `shared/schemas/`: shared contracts and Zod validation.
- `server/api/`: public and admin Nitro endpoints.
- `server/repositories/`: catalog queries and mapping database rows to products.
- `server/utils/`: Supabase clients, storage URLs, and admin authorization.
- `server/data/`: demo fixtures.
- `supabase/migrations/`: versioned schema and RLS changes; add migrations for
  schema changes instead of relying on undocumented dashboard edits.
- `supabase/seed.sql`: example data.
- `public/`: static assets.

Follow existing Vue `<script setup lang="ts">` patterns, Nuxt auto-imports, and
`#shared` imports. Keep database queries in server repositories. Preserve SSR and
use Nuxt data-fetching patterns such as `useFetch` for catalog pages.

Use two-space indentation, UTF-8, LF, and a final newline. Prettier is configured
for single quotes, no semicolons, trailing commas, and a 100-character print width.
Prefer formatting changed files over repository-wide formatting churn. Keep
storefront text and user-facing errors in Indonesian; prices are integer rupiah.

Do not edit generated `.nuxt/`, `.output/`, dependency directories, or npm caches.
Keep the lockfile synchronized when intentionally changing dependencies.

## Data, authorization, and runtime constraints

- Validate API input with Zod and preserve shared response contracts.
- Keep catalog source selection explicit. Supabase failures must surface as
  errors, without silently falling back to demo fixtures.
- Public catalog queries must restrict results to `published=true`; preserve RLS
  as an additional database access boundary.
- Every admin endpoint must call `requireAdmin(event)`. Navigation middleware
  alone is insufficient. Verify users with server-side `auth.getUser()` and roles
  through `admin_memberships`, not editable user metadata.
- Store product image object paths in the database and resolve public URLs through
  the storage helper. The public product-images bucket is for public images.
- Keep secrets and service-role keys server-only; never put them in `PUBLIC`
  runtime configuration, browser code, or committed files. Do not expose local
  `.env` contents in logs or task summaries.
- Application logic must work on both Cloudflare Workers and Node. Avoid Node-only
  APIs and Cloudflare-specific data services in shared application paths.
- `/healthz` checks application liveness only; it does not verify the database.

## Verification and handoff

There is currently no automated test script. For application code changes, run
typecheck, lint, and formatting checks appropriate to the changed files. Run the
Node build for runtime/configuration changes and both builds for changes affecting
deployment portability. For documentation-only changes, check the changed Markdown.

Smoke-test affected routes when behavior changes: `/`, `/products`, product detail,
missing-product 404, `/api/products` (including search), `/api/products/:slug`, and
`/healthz`. Auth changes also need login and admin access checks with configured
Supabase. Demo mode cannot establish that live database, RLS, or auth behavior works.

Report what changed, what was verified, and any unavailable checks or pre-existing
failures. Update relevant docs when setup, configuration, API behavior, or deployment
steps change. Do not claim cloud deployment, Docker, or Supabase verification from
a local demo smoke test.
