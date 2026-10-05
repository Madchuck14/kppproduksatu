# Repository guidance

## Project context

KPP Produk Satu is an Erlangga product katalogs. It uses
Nuxt 4, Vue 3, TypeScript, Nitro, Nuxt UI 4, Tailwind CSS 4, Zod 4, and Supabase
(PostgreSQL, Auth, and Storage). The storefront uses SSR. The current starter has
public catalog pages and admin login/authorization foundations, but not public
registration, sales features, or catalog CRUD.

Read `README.md` and the relevant files in `docs/` before changing behavior:

- `docs/architecture.md`: current stack, data boundaries, and portability decisions.
- `docs/supabase.md`: database, storage, RLS, and admin setup.
- `docs/deploy.md`: Cloudflare staging and Node/Docker production deployment.
- `docs/roadmap.md`: planned features and implementation scope.

The root Shopify/SvelteKit concept document is historical feature reference;
`docs/architecture.md` defines the current architecture. Do not treat planned
commerce features as already implemented.

## Product goals and planned pages

This site is a book catalog that helps sales representatives present products
to customers. Treat the following as product requirements for future work, not
as features that already exist:

- **Landing/catalog:** Keep catalog browsing public. Show frequently accessed
  books when an access-counting approach has been defined, and provide entry
  points for SD, SMP, SMA, and SMK. Search by book title or book code and filter
  by education level; preserve the existing catalog API and SSR data-fetching
  patterns.
- **Book detail:** Show public catalog information such as cover, title, price,
  book code, and education level. Product Knowledge, flyers, and dummy files
  require login. If an anonymous visitor selects locked content, explain that
  login is required and offer login without losing the destination they wanted
  to open.
- **Login and registration:** Provide sign-in and registration for Sales and
  Editor accounts. Any selected role and education-level scope must be checked
  and assigned by trusted server-side logic; never grant Editor access based
  only on client-submitted role data. Define the Editor enrollment/approval
  policy before enabling self-service Editor registration.
- **Editor dashboard:** Evolve the existing `/admin` foundation rather than
  creating a competing admin area without a clear need. Editors can manage only
  catalogs for education levels they are authorized to manage: list, add,
  edit, and delete books. Include validated forms, upload feedback, and delete
  confirmation. Enforce this scope in server endpoints and database policies,
  not only in navigation or UI.
- **Connected flows:** Keep catalog search and level selection reflected in
  navigable catalog URLs where practical; link book cards to their detail pages;
  provide clear login, logout, access-denied, and not-found states. Add only
  pages needed to complete these catalog, account, and editor workflows.

Book code is the intended unique catalog identifier and must be searchable.
The current database instead uses a generated UUID `products.id` primary key
and has no book-code or education-level columns. Before schema work, reconcile
that existing model with the requested book-code identity using a versioned
migration, preserving existing references and documenting whether book code
becomes the actual primary key or a unique business key. Do not imply these
fields or flows are already implemented.

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
- Every protected endpoint must authenticate and authorize on the server;
  navigation middleware alone is insufficient. Verify sessions with
  server-side `auth.getUser()`. The current `requireAdmin(event)` guard and
  `admin_memberships` table support the existing admin foundation; do not treat
  them as a complete Sales/Editor role or education-level authorization model.
  Add role and level-scoped authorization deliberately, including matching RLS
  policies and migration coverage, before implementing those workflows.
- Store product image object paths in the database and resolve public URLs through
  the storage helper. The public product-images bucket is for public images.
- Do not put Product Knowledge, flyers, or dummy files that require login in the
  public product-images bucket or expose their contents in anonymous SSR/API
  responses. Use an appropriately private storage/access design and authorize
  file access server-side; validate uploads and file metadata.
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
