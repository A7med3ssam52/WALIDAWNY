# Local verification harness (Phase 1)

Runs the Supabase migrations (`supabase/migrations/0001…`) against an
**embedded PostgreSQL 18.4** instance (no Docker, no network) and
validates them with deterministic assertion suites. This is the
"verify before deploy" step for the Supabase Foundation phase.

## Prerequisites

- Node.js 18+ (used by `embedded-postgres` and `pg`)
- No running process on port **54329**

## Usage

```powershell
cd supabase/tests/local
npm install        # once; downloads the embedded Postgres binaries
npm start          # boot -> shim -> migrations -> assertion suites
```

`npm start` exits non-zero if any migration fails to apply or any
assertion suite fails. Expected output ends with:

```
=== suites passed: 13, suites failed: 0 ===
ALL GREEN
```

A stale `postgres.exe` (e.g. after killing the harness mid-run) is
cleaned up automatically via `netstat` + `taskkill` and `postmaster.pid`
removal.

## What runs, in order

1. **auth-shim.sql** — hosted-Supabase simulation:
   - `auth.users` table, `auth.uid()`/`auth.jwt()`/`auth.role()`
   - `storage.buckets`/`storage.objects` shim
   - roles `anon`, `authenticated`, `student`, `mr_walid`, `admin`
   - **default table privileges** (all on public tables for
     `anon`/`authenticated`) — mirrors what a real Supabase project
     starts with; the migrations' RLS + REVOKEs are the enforcement
   - `tests.*` assertion helpers
2. **supabase/migrations/0001…0030** in filename order.
3. **sql/01_schema.sql** — schema shape (tables, enums, constraints,
   triggers, views, buckets, ownership, B2 revocations).
4. **sql/02_roles.sql** — fixture build (grades, per-unit pricing,
   users A–H/W/AD, curriculum, assets, codes) + role helpers, HIGH-1,
   escalation, fail-closed signup.
5. **sql/03_rls.sql** — the full role x operation matrix from
   TESTING.md §4.
6. **sql/04_business.sql** — auth gates, audit PII-freedom, progress
   semantics, unit-code redemption matrix, access matrix (trial +
   per-unit purchase), video state machine, PDF finalization, staff
   RPC spot checks.
7. **sql/05_grants.sql** — the exact RPC grant matrix (MED-6), B2
   notifications revocation, table surface.
8. **sql/06_dashboard_stats.sql** — `get_dashboard_stats` fixture +
   role matrix + aggregate keys (students/purchases/content/engagement,
   by_grade, top_units, recent_purchases).
9. **sql/07_audit_logs.sql** — audit capture, PII freedom, admin-only
   read surface, CSV export helpers.
10. **sql/08_security.sql** — search_path pins, storage policy
      inventory, B2 privilege locks, own-only RPC negatives, staff
      boundary matrix, grant-drift anchors.
11. **sql/09_exams.sql** — exam CRUD + take/grading matrix (roles,
      published/draft scope, MCQ + problem scoring, staff fan-out).
12. **sql/10_comments.sql** — lesson comments: access gates, threading,
      body/parent validation, moderation, notifications, audit capture.
13. **sql/11_boards.sql** — lesson boards: RLS matrix (staff vs student), RPC negatives, create/finalize/delete/reorder happy paths + errors, storage row-backed policy.
14. **concurrency** scenarios — HIGH-3 parallel progress upserts and the
      `redeem_unit_code` race (exactly one winner).

## How auth is simulated

Each assertion block impersonates a user with:

```sql
SET LOCAL "app.current_user_id" = '<uuid>';   -- auth.uid() returns this
SET LOCAL ROLE student;                        -- PostgREST "role" claim
...
RESET ROLE;
```

`auth.uid()` in the shim prefers the hosted `request.jwt.claim.sub`
setting and falls back to `app.current_user_id`, so suites can drive
role + identity without JWTs.

## Why the four RLS policy helpers are granted to `authenticated`

`is_admin()`, `is_mr_walid()`, `is_student()` and `can_access_lesson()`
are **invoked inside RLS policy expressions**. PostgreSQL evaluates
policy expressions with the privileges of the querying role, so the
function's EXECUTE privilege must be present at that moment. This was
verified empirically on the same embedded engine:

- CASE 1: policy calls a helper with EXECUTE revoked -> `42501
  permission denied for function` (the RLS path fails).
- CASE 3: helper granted to `authenticated` -> policy evaluates fine.

Hence `0010` grants EXECUTE on exactly these four to `authenticated`.
They remain out of the PostgREST RPC surface (only functions explicitly
granted there are exposed), and `anon` has none of them.

## Run records

### 2026-08-20 — final re-verification (boards + video config)

Full clean run on embedded PostgreSQL 18.4 (Windows, Node v24.11.1):

- **Migrations:** `0001…0041` all `PASS` (41/41), including `0041_boards_storage_rls_fix.sql`.
- **Suites:** `01…11` + the two concurrency scenarios — `=== suites passed: 13, suites failed: 0 ===` → **ALL GREEN**.
- Postgres stopped cleanly; port 54329 free afterwards. The only repo change since the
  2026-08-18 record is `[functions.create-video-upload-session] verify_jwt = true` in
  `supabase/config.toml` (deploy-time flag; not exercised by this harness).

### 2026-08-18 — boards storage/RLS hardening (0041)

Full clean run on embedded PostgreSQL 18.4 (Windows, Node v24.11.1):

- **Migrations:** `0001…0041` all `PASS` (including `0041_boards_storage_rls_fix.sql` —
  `boards_select_row_backed` C1, `boards_delete_row_backed` + `pdfs_delete_row_backed` H1,
  `finalize_board_upload` M2 `board_storage_missing`).
- **Suites:** `01…11` + the two concurrency scenarios — `=== suites passed: 13, suites failed: 0 ===` → **ALL GREEN**.
- 08_security.sql verifies the exact six-policy storage.objects inventory (2x INSERT + 2x SELECT + 2x DELETE), no UPDATE/anon surface, ENABLE-without-FORCE, and live RETURNING/delete proofs for both buckets; 11_boards.sql verifies the `board_storage_missing` negative, Sections 6–9 and the staff/student storage-DELETE matrix.

## Notes / caveats

- **Never apply auth-shim.sql to a real project** — it is a harness-only
  simulation (auth tables, roles and grants differ on hosted Supabase).
- `REVOKE EXECUTE ON ALL FUNCTIONS … FROM PUBLIC` in 0010 intentionally
  leaves the `tests.*` schema untouched (different schema).
- The harness runs each suite file as a single implicit transaction;
  failed suites roll back their whole file.
- pgTAP is not used (no hosted runner needed); assertion helpers in
  `auth-shim.sql` raise on failure, which fails the suite file.
