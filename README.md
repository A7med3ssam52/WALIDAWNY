# منصة مستر وليد عونى التعليمية

منصة وليد التعليمية — Arabic-first, RTL educational platform for Mr. Walid. Students buy time-limited subscription access to a video + PDF curriculum organized as **Grade → Unit → Lesson → (Video, PDF)**.

**Status:** Phases 1–11 implemented & verified. Phase 1 (Supabase backend) — migrations, RLS, RPCs, triggers, tests, seeded local data. Phase 2 (Auth & Account Lifecycle frontend) — login/register, session handling, profile edit, password change (with reauthentication flow), student dashboard, staff student list/detail/trash with disable/enable/soft-delete/restore, route guards. Phase 3 (Grades, Pricing & Subscriptions) — grade CRUD, pricing plans per grade (admin manage / mr_walid read-only), subscription code generation via Edge Function (staff-only, ≤500), atomic redemption (race-tested), expiry job Edge Function, student subscription status/history/redemption UI. Phase 4 (Curriculum & Content Management) — grades→units→lessons manager (/walid/curriculum): create/rename/reorder/publish/hide/soft-delete/restore; lesson assets (/walid/lessons/:id): PDF upload via Edge Function signed-URL flow. Phase 5 (Bunny Video) — 5 Edge Functions (upload session with TUS auth headers + session cancellation, numeric-status webhook driving the video state machine, IP-locked HS256 signed playback URLs, signed thumbnail URLs, scheduled state reconciliation), video upload with progress/cancel/resume, replace flow, cancel/release flow, preview player; token formula and full HLS chain verified live against the real pull zone. Phase 6 (Student Learning Experience) — student curriculum browsing (published units/lessons only), lesson player with HLS (hls.js + native fallback) and signed PDF viewing, resume-from-position, progress tracking with throttled upserts and ≥90% completion, unread notification center, get-pdf-signed-url Edge Function (student-only, active-subscription gate, TTL-signed URLs). Phase 7 (Dashboards) — staff dashboard at /walid/dashboard with live aggregates (students, active/expiring subscriptions, revenue, content readiness, codes, engagement, students-by-grade, recent subscriptions, upcoming expirations) via one staff-guarded stats RPC, plus persistent staff navigation across all management pages. Phase 8 (Notifications – Audit) – admin audit log (/admin/audit: filters, pagination, CSV export via the export-audit-log Edge Function with UTF-8 BOM), role management (/admin/roles via set_user_role, escalation admin-only), the notification engine (7-day expiry warnings + expiry events, deduplicated once per subscription), read/unread notification center, and an admin route group with its own navigation. Phase 9 (Security Hardening) — dual security reviews (database RLS/grants/authz + secrets/frontend) with no HIGH findings, migration 0020 hardening (re-asserted read-state REVOKE, PDF storage INSERT now pending-only — no planting at ready primary paths), a dedicated regression suite (search_path pins, storage policy inventory, B2 privilege locks, cross-user IDOR negatives, staff boundary matrix, grant-drift anchors), and corrected security documentation (the previously documented "column-scoped policy" claim is invalid PostgreSQL; enforcement is the REVOKE). All phases implemented (0–11); only deployment actions remain (db push, EF deploy, Bunny webhook wiring, Playwright E2E, CI workflow – they need a hosted Supabase project and a GitHub remote). Phase 10 (QA/Verification) — full regression sweep green (DB harness 10/10 suites + 21/21 migrations, vitest 184/184, deno 203/203, tsc, eslint, vite build, prettier with the formatting gap closed), no runtime mocks or TODO leftovers; Playwright E2E and the CI workflow are deferred to Phase 11 (they need a hosted Supabase project and a GitHub remote).

**Docs:**
- `PLAN.md` — master technical implementation plan (source of truth)
- `BLUEPRINT.md` — approved execution blueprint (contract)
- `ARCHITECTURE.md` — system architecture, routes, roles, data flows, integrations
- `DATABASE.md` — complete database reference (14 tables, views, RPCs, triggers, storage)
- `SECURITY.md` — threat model, RLS matrix, Edge Function security, accepted residuals
- `TESTING.md` — pgTAP / Deno / Vitest / Playwright strategy and CI pipeline

---

## Features

- **Auth:** email + password; immutable email; password change; sign-in gate blocks disabled/deleted accounts; fail-closed profile creation
- **Account lifecycle:** disable/enable, soft delete, Trash, restore (staff)
- **Curriculum:** grades → units → lessons with draft/published/hidden statuses, ordering, soft delete/restore
- **Subscriptions:** grade-based pricing with duration offers (base + platform fee + total), single-use activation codes (`WLDN-XXXX-XXXX-XXXX`), atomic redemption, live expiry enforcement, manual subscriptions
- **Bunny video:** server-side upload sessions (TUS direct upload with progress/cancel/resume), processing webhooks, state machine, IP-locked tokenized protected playback (HLS + signed thumbnails), deterministic replacement, abandoned-session release, stuck-video reconciliation
- **PDFs:** private Supabase Storage, signed URLs, subscription-aware access
- **Progress:** resume position, monotonic percent, deterministic 90% completion, video-replacement resets
- **Notifications:** in-platform, deduplicated (7-day warning fires exactly once, activation, expiry, new content)
- **Audit log:** insert-only, admin-only, filterable + CSV export (Arabic/Excel-safe)
- **Dashboards:** student, Mr. Walid, admin (operational metrics, analytics)
- **WhatsApp:** centrally configured button (whatsapp settings), public landing reads only `get_public_settings()`
- **Arabic-first RTL** UI, responsive (desktop/tablet/mobile)

---

## Architecture Summary

```
Presentation (React SPA, RTL)
    ↓
Application / Feature Services (React hooks + modules)
    ↓
Supabase Data Access (supabase-js, publishable key)
    ↓
Supabase PostgreSQL / Auth / Storage  ← authoritative authorization (RLS)
        ↑
Supabase Edge Functions (Deno)       ← all privileged operations
        ↓
External privileged APIs (Bunny Video/Storage, Storage signed URLs, CSV export)
```

Key principles: RLS on all 14 tables (forced); mutations through typed RPCs (SECURITY DEFINER, audited); Edge Functions hold all secrets and re-check role + active profile per request; the browser never holds service-role/Bunny secrets; sign-in gate trigger + session revocation + RLS + Edge Function checks provide defense-in-depth.

**Frontend env (existing):**
- `VITE_SUPABASE_URL=https://nfusbrktrqfrnaetetmr.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<provided separately>`

---

## Prerequisites

| Tool | Version/Notes | Install (Windows) |
|---|---|---|
| Node.js | 20+ (LTS) | https://nodejs.org |
| npm | 10+ (ships with Node) | — |
| Docker Desktop | Required by `supabase start` | https://www.docker.com |
| Supabase CLI | latest | `winget install Supabase.CLI` |
| Deno | latest | `winget install DenoLand.Deno` |
| PostgreSQL 16 | Fallback/manual DB testing | `winget install PostgreSQL.PostgreSQL.16` |
| Git | — | https://git-scm.com |

---

## Local Setup

```powershell
# 1. Clone / open the repo (C:\Users\admin\Desktop\WALIDAWNY)

# 2. Start the local Supabase stack (Docker)
supabase start

# 3. Install frontend dependencies
npm install

# 4. Create environment files
copy .env.example .env.local          # fill VITE_* values (public only)

# 5. Apply migrations locally (dev database)
supabase db reset                     # LOCAL ONLY — never against production (R-C)

# 6. Run the dev server
npm run dev
```

Edge Functions run locally with:

```powershell
supabase functions serve
# set function secrets locally first:
supabase secrets set BUNNY_API_KEY=... BUNNY_LIBRARY_ID=... BUNNY_PULL_ZONE_HOSTNAME=...
supabase secrets set BUNNY_SIGNING_KEY=... BUNNY_WEBHOOK_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set INTERNAL_JOB_TOKEN=...   # required by expire-subscriptions (x-internal-token header)
```

Phase 3 service functions (see `supabase/functions/`):

- `generate-subscription-codes` — POST, JWT-verified (`verify_jwt = true`); `mr_walid`/`admin` with an active, non-deleted profile; validates plan (active) + count (1–500); calls `create_codes_for_staff()` (staff-guarded wrapper → `generate_codes_internal()`); returns raw codes to the caller only
- `expire-subscriptions` — scheduled internal job (`verify_jwt = false`); protected by `x-internal-token` = `INTERNAL_JOB_TOKEN` (constant-time compare); invokes `expire_subscriptions()` (RETURNS void — the response's `expired` is the before/after delta)

Stop the stack when done: `supabase stop`.

---

## Environment Variables

See `.env.example`. All names:

| Variable | Where | Required | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | frontend `.env.local` | yes | Supabase project URL (`https://nfusbrktrqfrnaetetmr.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend `.env.local` | yes | Supabase publishable (anon) key — the ONLY key in frontend code |
| `BUNNY_API_KEY` | Edge Function secret | Phase 5 | Bunny API key (server-side privileged calls) |
| `BUNNY_LIBRARY_ID` | Edge Function secret | Phase 5 | Bunny video library ID |
| `BUNNY_PULL_ZONE_HOSTNAME` | Edge Function secret | Phase 5 | Bunny pull zone hostname for playback URLs |
| `BUNNY_SIGNING_KEY` | Edge Function secret | Phase 5 | Bunny token-auth signing key (`BUNNY_TOKEN_AUTH_SECURITY_KEY`) |
| `BUNNY_WEBHOOK_TOKEN` | Edge Function secret | Phase 5 | Shared token for verifying Bunny webhook calls (header or URL fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secret | yes | Used ONLY inside Edge Functions (server-side); never in the browser, never in `VITE_*` |
| `INTERNAL_JOB_TOKEN` | Edge Function secret | Phase 3 | Shared secret authorizing internal job endpoints (`expire-subscriptions`); sent as `x-internal-token` |
| `SUPABASE_ACCESS_TOKEN` | CI secret | CI | Supabase personal access token (deploys) |
| `SUPABASE_PROJECT_ID` | CI secret | CI | Project ref for remote commands |
| `SEED_ADMIN_PASSWORD` | CI secret | seed | Password for seeded `admin`/`mr_walid` users (A21) |

---

## Frontend (Phase 2)

React 19 + Vite 7 + TypeScript (strict) + Tailwind CSS v4, Arabic-first RTL (`lang="ar" dir="rtl"`), npm.

```
src/
  app/          Providers (Auth, Toast) + route definitions
  components/   UI kit (Button, Input, Card, Modal, Toast, badges, states) + guards + LayoutShell
  features/
    auth/       AuthContext, Login, Register, ConfigErrorScreen
    student/    Dashboard, Profile, ChangePassword
    walid/      StudentList, StudentDetail, Trash
  data/rpc.ts   Typed wrappers for every backend RPC (exact p_* args)
  lib/          supabase client, error mapping, validation, formatting
  test/         supabase-js mock + fixtures, test utils
  types/        Database schema types (tables, views, RPC signatures)
```

Behavior notes: register = `signUp` with `options.data {full_name, phone, guardian_phone, address}` (DB trigger creates the profile); sign-in gate blocks disabled/deleted accounts; password change retries via `reauthenticate()` when the session is stale; profile edits go through `update_own_profile` / `update_student_profile`; lifecycle actions use `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `list_trash`. All tests run against a hand-rolled `@supabase/supabase-js` mock (no network), so the suite is deterministic and offline.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build (`vite build`) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | `tsc --noEmit` (app + config) |
| `npm test` | Vitest + React Testing Library |
| `pnpm test:e2e` | Playwright E2E (later phase) |
| `pnpm db:test` | `supabase test db` (pgTAP) |
| `pnpm db:reset` | `supabase db reset` — **local only** |
| `pnpm db:push` | `supabase db push` (remote) |
| `pnpm functions:deploy` | Deploy Edge Functions |

---

## Testing

Full strategy: `TESTING.md`. Quick start:

```powershell
supabase test db        # pgTAP schema/RLS/business-rule suites
npm test                # Vitest + RTL (38 tests, 9 suites — all offline, mocked supabase)
pnpm test:e2e           # Playwright (needs local Supabase + seeded data)
deno test supabase/functions  # Edge Function unit tests
```

Highlights: RLS role-simulation matrix (incl. disabled/deleted students), sign-in gate sequence, notification immutability (combined-statement UPDATE must fail), code-redemption race harness (exactly one winner), webhook forgery rejection, 90% completion determinism, once-only 7-day warning, replacement reset, grade-change-mid-subscription.

---

## Deployment Guide (Phase 11 executes this)

| Component | How |
|---|---|
| Database | `supabase db push` / `supabase db migrations up` — **never `db reset` against production**; pre-release schema snapshot (R-F) |
| Edge Functions | `supabase functions deploy <name>`; secrets from CI (`supabase secrets set`); `--no-verify-jwt` only for `bunny-video-webhook` |
| Frontend | `npm run build` → deploy static output to Netlify/Vercel/Cloudflare Pages with `VITE_*` envs. The build injects a strict CSP meta (see PLAN §11). **If the Bunny pull zone uses a custom hostname** (not `*.b-cdn.net`), add it to `connect-src`/`media-src`/`img-src` in the `inject-csp` plugin (vite.config.ts) |
| Scheduling | `supabase functions schedule` for job functions (pg_cron/pg_net/external cron as fallback chain — MED-4); job endpoints are CORS-free and gated by `x-internal-token` |
| Bunny | Paste the webhook URL with `?token=<BUNNY_WEBHOOK_TOKEN>` into the Bunny dashboard; allowlist the app origin in the pull zone's Allowed Referrers (no-Referer requests are 403) |
| CI | GitHub Actions: lint → typecheck → db test → vitest → build → deploy EFs → scheduled smoke (workflow to be added when the repo lands on GitHub) |

---

## Security Notes

- Never put service-role/Bunny keys in frontend code or `VITE_*` (secret scan enforced in CI).
- RLS is authoritative; localStorage is session persistence only.
- Disabled/deleted accounts cannot sign in (trigger) or access protected data (RLS + Edge Function checks).
- Content access = `can_access_lesson()`: published, non-deleted, own-grade, active subscription, active grade.
- Signed URLs are short-lived (video 20 min, PDF 10–15 min); subscriptions are checked live at every issuance.
- Documented residual risks and hardening checklist: `SECURITY.md` §16–17.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `supabase start` fails | Docker Desktop running? Re-run `supabase start`; check `docker ps` |
| Port conflicts on start | `supabase stop` then `supabase start`; change ports in `supabase/config.toml` |
| pgTAP tests fail locally | Ensure `supabase/db/tests` (or `supabase/tests`) present; re-run `supabase db reset` then `supabase test db` |
| `db reset` blocked on remote | Expected — production resets are forbidden (R-C); use `db push` |
| Edge Function secrets missing | `supabase secrets set NAME=value` (local: also required for `functions serve`) |
| Login shows inactive-account error for a valid user | Intended: `account_inactive_or_deleted` maps to Arabic copy (I6); re-enable via walid/admin |
| Video stuck in `processing` | `recheck-video-states` job reconciles; manual retry = new upload session (R1) |
| Migrations out of sync with full schema | CI drift check (R13); regenerate `supabase-full-schema.sql` from migrations |
