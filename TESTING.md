# منصة مستر وليد عونى التعليمية — Testing Strategy

**Phase 0 deliverable.** Extracted from BLUEPRINT.md §16 (testing strategy), §15 (per-phase acceptance) and §17 (security strategy). Binding architecture-gate requirements are flagged **[BINDING]** and each has an explicit test below.

---

## 1. Strategy Overview

| Layer | Tool | Approach |
|---|---|---|
| DB schema/constraints | pgTAP (`supabase test db`) | Table/enum/column/constraint presence; FK integrity; CHECK rules; unique codes; partial unique primary asset |
| RLS | pgTAP role simulation | `SET ROLE` + `auth.uid()`-style injection; allowed/denied per policy row per role; disabled/deleted student matrix |
| Business rules | pgTAP + RPC-level tests | Redemption, expiry, progress determinism, notifications, replacement, grade binding |
| Sign-in gate | pgTAP + Playwright | Register → disable → login fails → enable → login succeeds (and soft-delete/restore variant) |
| Code redemption race | Concurrent harness | 10–50 simultaneous redemptions of one code; exactly one success |
| Edge Functions | Deno `deno test` + integration | Webhook token verification, JWT handling, signed-URL generation, CSV build, webhook forgery rejection |
| Frontend unit/component | Vitest + React Testing Library | Guards, forms, validation, state components, RPC wrapper mocks |
| E2E | Playwright (Chrome mobile + desktop viewports) | Full business flows against real backend; RTL assertions |
| CI | GitHub Actions | lint → typecheck → db test → vitest → build → deploy EFs → (scheduled) smoke |

**Test data:** seeded via migrations (fixture grade, plans, codes) — never mock backend calls in E2E for business flows.

**Low-spec machines:** the vitest config caps parallel workers (`maxWorkers: 2`) and raises the test timeout to 30 s so full-suite runs stay stable on small boxes (2-core/4 GB). Symptom of exceeding capacity is rotating per-test timeouts across unrelated files — if that recurs, close other heavy processes (editor, browsers) before the run; each failed file passes standalone. Verified green: 184/184 vitest (27 files), 203/203 deno, 10/10 DB harness.

---

## 2. Local Tooling Instructions

### 2.1 PostgreSQL (native, fallback/manual testing)

```powershell
winget install PostgreSQL.PostgreSQL.16
```

- Used as a standalone Postgres for fast pgTAP iteration outside the Supabase container; the canonical environment remains `supabase start` (Docker).
- **pgTAP extension required:** the native-Postgres fallback does not bundle pgTAP — install it before running the suites (on Windows: run `CREATE EXTENSION IF NOT EXISTS pgtap;` as superuser against the test database; on Linux/macOS the `pgtap` package provides the extension). Inside the Docker stack (`supabase test db`) the extension is provisioned automatically — no manual step.

### 2.2 Deno (Edge Functions)

```powershell
winget install DenoLand.Deno
# or: irm https://deno.land/install.ps1 | iex
deno --version
```

### 2.3 Supabase CLI

```powershell
winget install Supabase.CLI
# or via scoop/npm
supabase --version
```

### 2.4 Local Supabase stack (Docker required)

```powershell
supabase start          # boots local Postgres/Auth/Storage/Edge Runtime
supabase stop           # stops the stack (data persists in docker volumes)
supabase status
supabase db reset       # LOCAL ONLY — applies all migrations on a fresh local DB (never against production, R-C)
supabase db push        # applies migrations to a linked remote (production/staging)
supabase test db        # runs pgTAP tests (supabase/tests/*.sql)
supabase functions serve        # local Edge Function runtime
supabase functions deploy <name>
supabase secrets set NAME=value
```

**Rule (R-C):** `supabase db reset` NEVER runs against production — only `db push` / `db migrations up`.

### 2.5 pnpm

```powershell
corepack enable pnpm   # or npm install -g pnpm
pnpm install
```

---

## 3. pgTAP — Schema & Constraint Tests

Per table (all 14): exists; every expected column with type, NOT NULL, default; every CHECK, UNIQUE, PK, FK (with correct ON DELETE behavior); every index present.

| Check | Assertion examples |
|---|---|
| Enums | Each of the 7 enums exists with exact member sets |
| Tables/columns | 14 application tables; column types match DATABASE.md §4 |
| CHECK rules | `total_price = base_price + platform_fee`; `duration_days > 0`; progress `0 <= percent_completed <= 100`; `expires_at > started_at`; code regex + `code = upper(code)`; Egyptian phone regex on both phone columns |
| Unique constraints | `profiles.phone`; `grades.name`; `units (grade_id, name)`; `subscription_codes.code`; `code_redemptions (code_id)`; `progress (student_id, lesson_id)`; `notifications.dedup_key`; `lesson_videos.bunny_video_id`; `lesson_pdfs.storage_path` |
| Partial uniques | `lesson_videos`: UNIQUE `(lesson_id) WHERE is_primary AND deleted_at IS NULL` **[BINDING B9]**; `lesson_pdfs`: same pattern — exactly one primary per lesson |
| FKs | All FK pairs + declared ON DELETE (CASCADE/SET NULL/RESTRICT) match DATABASE.md |
| RLS | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on all 14 tables |
| Views | All 6 views exist; SECURITY INVOKER (no SECURITY DEFINER/security_barrier) |
| **Ownership [BINDING B1]** | Every function with `prosecdef` (SECURITY DEFINER, including trigger functions) is owned by `postgres` or a BYPASSRLS role — fail otherwise |
| **Grants [BINDING B2]** | `authenticated` has **no** UPDATE/INSERT/DELETE privileges on `notifications` (REVOKEd); table-level UPDATE denied |

---

## 4. RLS Role-Simulation Matrix (pgTAP)

Approach: `SET ROLE` + auth-uid injection (`auth.uid()` stubbed via a `set_auth` helper / Supabase test hook), asserting per-policy allowed/denied for student, mr_walid, admin, and unauthenticated.

| Table | student (own) | student (other) | student (disabled) | student (deleted) | mr_walid | admin | anon |
|---|---|---|---|---|---|---|---|
| `profiles` | own SELECT; 4-column UPDATE ok; grade/role/status UPDATE denied | denied | SELECT/UPDATE denied (`is_student()` false) | denied | SELECT; no broad UPDATE | SELECT; INSERT; DELETE (escape hatch) | denied |
| `grades` | SELECT active + non-deleted **[BINDING B8]** | n/a | denied | denied | SELECT/INSERT/UPDATE/DELETE | same | denied |
| `pricing_plans` | SELECT active only | n/a | denied | denied | SELECT | SELECT + DML | denied |
| `subscriptions` | own SELECT | denied | own SELECT ok (history) | own SELECT ok | SELECT | SELECT | denied |
| `subscription_codes` | denied (never sees raw codes) | denied | denied | denied | SELECT | SELECT | denied |
| `code_redemptions` | own SELECT | denied | own SELECT | own SELECT | SELECT | SELECT | denied |
| `units` | published + own-grade + non-deleted | n/a | denied | denied | DML | DML | denied |
| `lessons` | published + own-grade chain | n/a | denied | denied | DML | DML | denied |
| `lesson_videos` | primary + ready + `can_access_lesson` | n/a | denied | denied | SELECT (all) | SELECT (all) | denied |
| `lesson_pdfs` | primary + ready + `can_access_lesson` (metadata only) | n/a | denied | denied | SELECT (all) | SELECT (all) | denied |
| `progress` | own SELECT; direct INSERT/UPDATE/DELETE denied (RPC-only) | denied | denied | denied | SELECT | SELECT | denied |
| `notifications` | own SELECT | denied | own SELECT (stale session) | own SELECT | denied | denied | denied |
| `audit_logs` | denied | denied | denied | denied | **denied** | SELECT | denied |
| `app_settings` | denied | denied | denied | denied | SELECT; UPDATE `whatsapp%` only | SELECT + all UPDATE | denied |

**Disabled/deleted student matrix (explicit):** every student-scoped policy denies when `profiles.status = 'disabled'` or `deleted_at IS NOT NULL` — driven by `is_student()` returning false. Asserted for `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `progress` SELECT/UPDATE paths.

**HIGH-1:** signUp with `options.data.grade_id` yields `grade_id NULL` (self-assignment impossible).

**DML-only paths:** `subscriptions`, `subscription_codes`, `progress` — direct INSERT/UPDATE/DELETE fail for every role (`WITH (NO POLICY)`); only RPCs mutate.

---

## 5. Notification Immutability — Combined-Statement Test [BINDING B2]

pgTAP asserts, for the notification owner:

1. **Pass:** `UPDATE notifications SET is_read = true WHERE user_id = :uid` via `mark_notification_read` RPC → row read.
2. **Fail (permission denied):** direct `UPDATE notifications SET is_read = true, title = 'x' WHERE user_id = :uid` (authenticated) → must fail. This is the authoritative B2 assertion: with UPDATE REVOKEd (table- and column-level; PostgreSQL has no column-scoped policies), no direct UPDATE succeeds — read-state writes exist only via the mark-read RPCs (08_security.sql Section 3 additionally proves the own-row RLS policy confines even a hypothetical re-granted UPDATE to own rows).
3. **Fail:** direct `UPDATE notifications SET title = 'x' WHERE user_id = :uid` (authenticated) → denied (REVOKEd UPDATE).
4. **Fail:** non-owner UPDATE of `is_read` (no-op / RLS-blocked).
5. **Fail:** DELETE and INSERT by any role.

---

## 6. Business Rule Tests (pgTAP / RPC-level)

### 6.1 Redemption validations (`redeem_subscription_code`)

- Success: eligible student + available code → subscription `active`, `started_at = now()`, `expires_at = started_at + duration_days` (A4), price snapshot equals plan prices (MED-5), code → `used` (used_at/used_by), `code_redemptions` row, `subscription_activated` notification, audit row.
- Failures (each asserted): unknown/invalid format code (normalized uppercase, L1); already-used code (`code_already_used`); revoked code; student without grade; plan not belonging to student's grade; plan `is_active = false`; student already has active subscription (A5 — no extension while active); disabled student; deleted student.
- Very short plan already inside warning window → `subscription_expiring` notification emitted **in the same transaction** as subscription creation.

### 6.2 Expiry idempotency (`expire_subscriptions`)

- Run twice: second run flips nothing new; notifications (`sub_expiring`, `sub_expired`) emitted **exactly once** per subscription (dedup `ON CONFLICT DO NOTHING`).
- Live authority: access check uses `expires_at > now()` regardless of status label (A8).
- Disabled student's subscription continues to count down (A9 — no pause).

### 6.3 90% completion determinism (`upsert_progress`)

- `percent = 89.99` → not completed; `percent = 90` → `is_completed = true`; any later lower percent does NOT un-complete (A12).
- Percent monotonic: repeated writes with decreasing percent keep the max (GREATEST).
- Client cannot pass `is_completed` (no parameter; server-derived).
- Clamping: negative position → 0; percent > 100 → 100 (A24).
- Guard: non-student / disabled / deleted / no subscription / wrong grade → rejected.
- **[BINDING B4]** PDF-only lesson (no primary video): progress write succeeds with `video_id = NULL`, pinned to lesson. Lesson with a primary video: write from a stale `video_id` (simulated) → `progress_stale_video` rejection; first write after replacement repairs `video_id` to the new primary.
- Concurrent writes to same (student, lesson): serialized by row lock; final state consistent (A26).

### 6.4 Once-only 7-day warning

- Set `expiry_warning_days = 7`; run job N times within warning window → exactly one `sub_expiring:{id}` notification.
- Threshold boundary: `expires_at - now() == 7 days` → fires; `> 7 days` → not yet.

### 6.5 Replacement reset (video replacement, A11)

- Replace primary video → same transaction: old video `status='replaced'`, `is_primary=false`; new video `ready` + `is_primary=true`; progress rows pinned to old video zeroed (`position=0`, `percent=0`, `is_completed=false`, `video_id=new`); rows already pinned to new video untouched; audit `video.replace`.
- **[BINDING B9]** Soft-delete of a video clears `is_primary` in the same transaction; the partial unique constraint allows a new primary afterwards.

### 6.6 Grade-change-mid-subscription (A33/H5)

Student with an active subscription has grade changed by staff (`set_student_grade`):
- Accessible grade set changes **immediately** (next request re-evaluates `can_access_lesson`).
- Old-grade lesson access denied; new-grade lessons open; subscription itself unaffected.

### 6.7 Staff RPC semantics

- `create_manual_subscription` **[BINDING B6]**: `p_notes` lands in audit metadata; works for a student **without** a grade **[BINDING B10]**; price snapshot copied; overlap not auto-merged.
- `delete_pricing_plan` **[BINDING B7]**: unreferenced plan → hard-deleted; plan referenced by a subscription or code → deletion blocked (RESTRICT), plan deactivated (`is_active = false`), audit `pricing.delete` written in both cases.
- `update_student_profile` **[BINDING B3]**: mr_walid/admin only; exactly the 4 whitelisted columns writable; role/grade/status/deleted_at untouched; audit row written.
- `set_user_role`: admin-only; role escalation attempts by mr_walid fail.

---

## 7. Sign-in Gate Test Sequence (A32/A34)

pgTAP (trigger level) + Playwright (E2E level):

1. Register a student → profile created with `status='active'`, `deleted_at NULL` (fail-closed meta validation asserted separately: signUp missing a required meta field → exception, no orphan profile — LOW-12).
2. Login succeeds.
3. Admin disables (`disable_student`) → login **fails** with `account_inactive_or_deleted`; UI shows the friendly Arabic copy (I6), never the raw error.
4. Admin enables → login succeeds again.
5. Repeat 2–4 with `soft_delete_student` → restore (`restore_student` sets `status='active'`, `deleted_at=NULL` — A10).
6. Direct trigger test: `UPDATE auth.users SET last_sign_in_at = now()` on a disabled/deleted user raises.
7. Session revocation (per Phase 1 spike outcome — LOW-18): refresh-token grant fails after disable/soft-delete where revocation is feasible; **[BINDING B10]** fallback = sign-in gate + RLS + EF checks; access-JWT residual (≤1h) is closed by `is_student()` + EF active-profile checks (MED-9).

---

## 8. Race-Condition Harness (Code Redemption)

- JS/PowerShell harness (or Playwright API calls) firing **10–50 simultaneous** `redeem_subscription_code` calls for one code against the real backend (local Supabase; also staged against a dedicated test project).
- Assert: **exactly one success**; every other call rejected with `code_already_used`; exactly one `code_redemptions` row; exactly one subscription; code `used` once.
- Repeat N times (≥10 rounds); also run mixed concurrent redemptions of distinct codes (no cross-talk).
- Full-stack variant: concurrent HTTP calls through the UI layer with real auth sessions.

---

## 9. Edge Function Tests (Deno)

- **Unit** (`deno test`): webhook token verification (constant-time compare; wrong/missing token rejected 401/403); JWT handling via `supabase.auth.getUser()` mocks; tokenized URL generation (IP-locked HS256 directory token, query form, TTL 20 min); thumbnail signed URL; PDF signed-URL parameter construction; CSV builder (UTF-8 BOM, Arabic-safe, correct columns/filters).
- **Webhook forgery rejection [mandatory]:** unsigned payload, forged/wrong token → rejected (401/403); valid-token happy-path payload → accepted; payloads with missing/oversized/malformed fields → rejected. State-transition validation in `set_video_status` additionally rejects illegal transitions even if a webhook payload is somehow valid.
- **Integration** (`supabase functions serve` against local/CI Supabase + stubbed Bunny HTTP): create-video-upload-session (create + replace modes); upload-pdf (MIME/size validation, signed upload URL issued); get-video-playback-url student path (subscription valid → URL; expired/disabled/deleted/other-grade → denied) and **[BINDING B5]** staff path (`is_mr_walid()`/`is_admin()` → content-visible check passes without subscription; lesson soft-deleted → denied); get-pdf-signed-url (primary-resolved, non-primary rejected — MED-7); generate-subscription-codes (count cap, format/uppercase, plan validation); export-audit-log (filters, CSV, signed URL; non-admin denied).
- Security: functions reject inactive/deleted profiles even with a valid role claim (A34).

---

## 10. Frontend Tests (Vitest + RTL)

- Guards: AuthGuard (unauthenticated → redirect), RoleGuard (role → allowed prefixes; stale-cache residual documented, never used for authz), SubscriptionGuard (lock screen informational).
- Forms/validation: register (required fields, Egyptian phone regex both phones, no grade field), login error mapping for `account_inactive_or_deleted`, profile (4-column whitelist), code entry normalization, destructive-confirmation modals.
- State components: loading/empty/error/success for every important screen.
- RPC wrapper mocks: typed wrappers call the correct RPC with correct args; mark-read uses RPCs only **[BINDING B2]**.
- Arabic/RTL: format helpers, date/number formatting.

---

## 11. E2E Playwright

Viewports: Chrome mobile (<768) + tablet (768–1023) + desktop (≥1024).

| Flow | Steps |
|---|---|
| Student journey | Register (Arabic form) → login → staff assigns grade + creates manual subscription (seeded) → browse curriculum → watch video → progress persists/resumes → completion at 90% → expiry lock |
| Redemption | Staff generates codes → student redeems → active subscription shown → double redemption rejected in UI |
| Sign-in gate | Covered in §7 |
| Walid flows | Students list/disable/trash/restore; grade CRUD + reorder; curriculum CRUD + publish/hide; video upload session + PDF upload; analytics with real data |
| Admin flows | Audit log filter + CSV export (Arabic/BOM); pricing management; `set_user_role`; dashboard metrics |
| RTL assertions | `dir="rtl"`, layout, Arabic copy on key screens |

E2E business flows use seeded real data — never mocked backend calls.

---

## 12. CI Pipeline (GitHub Actions)

```
1. lint            (eslint + prettier check; deno lint for functions)
2. typecheck       (tsc --noEmit; deno check for functions)
3. db test         (supabase start → supabase db reset [local] → supabase test db [pgTAP])
4. vitest          (frontend unit/component)
5. build           (pnpm build; verify vite output)
6. deploy EFs      (supabase functions deploy, secrets from CI)
7. (scheduled) smoke (production endpoint smoke checks)
```

- PR checks: lint → typecheck → db test → vitest → build; R13 schema drift check (`supabase db diff` / dump compare) on PR.
- Secret scan step (e.g. gitleaks) on every PR.
- Race harness (§8) runs in CI on a dedicated test project (not on shared production data).
- **Rule (R-C):** no `db reset` against production — CI db stage runs against the local Docker stack only.

---

## 13. Phase Mapping (BP §15)

| Phase | Test focus |
|---|---|
| 1 | §3 schema/constraints (incl. **B1 ownership** + **B2 grants**), §4 RLS matrix, sign-in gate presence + version pin |
| 2 | §7 sign-in gate sequence, lifecycle Playwright, guard Vitest |
| 3 | §6.1 redemption validations, §6.2 expiry idempotency, §8 race harness, §6.7 B6/B7 |
| 4 | §6.6 grade binding, §6.5 B9, §6.7 B3, content lifecycle pgTAP + Playwright walid flow |
| 5 | §9 Edge Function suite incl. webhook forgery + B5 staff preview, state machine units, staging Bunny integration |
| 6 | §6.3 progress determinism incl. B4, student Playwright flow |
| 7 | View-level SQL tests (`v_lesson_stats`, `v_dashboard_metrics`, summaries), dashboard Playwright |
| 8 | §5 notification immutability, §6.4 once-only warning, dedup tests, role-escalation tests, audit export EF test |
| 9 | §4 hardening matrix rerun + dedicated security suite (IDOR, storage access, subscription bypass, race, forgery) |
| 10 | Full regression: all suites green, no known blockers — **executed**: 10/10 DB harness (21/21 migrations), 184/184 vitest (27 files), 203/203 deno + deno lint, tsc (app+node), eslint 0, vite build, prettier (gap closed in Phase 10) |
| 11 | Final smoke + manual verification script (PLAN §19 questions); trigger digest + snapshot verified — **executed (local)**: CSP meta present in built `index.html` (no inline scripts, `script-src 'self'`), internal EFs return no CORS headers with OPTIONS 405 (re-ran 203/203 deno), migrations regen byte-clean + full harness re-run green; remaining actions are deployment-time and external (see README §Deployment) |
