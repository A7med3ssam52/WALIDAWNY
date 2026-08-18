# وليد عونى — Testing Strategy

**Phase 0 deliverable.** Extracted from BLUEPRINT.md §16 (testing strategy), §15 (per-phase acceptance) and §17 (security strategy). Binding architecture-gate requirements are flagged **[BINDING]** and each has an explicit test below.

---

## 1. Strategy Overview

| Layer | Tool | Approach |
|---|---|---|
| DB schema/constraints | pgTAP (`supabase test db`) | Table/enum/column/constraint presence; FK integrity; CHECK rules; unique codes; partial unique primary asset |
| RLS | pgTAP role simulation | `SET ROLE` + `auth.uid()`-style injection; allowed/denied per policy row per role; disabled/deleted student matrix |
| Business rules | pgTAP + RPC-level tests | Unit-code redemption, access (trial + per-unit purchase), progress determinism, notifications, replacement, grade binding |
| Sign-in gate | pgTAP + Playwright | Register → disable → login fails → enable → login succeeds (and soft-delete/restore variant) |
| Code redemption race | Concurrent harness | 10–50 simultaneous redemptions of one code; exactly one success |
| Edge Functions | Deno `deno test` + integration | Webhook token verification, JWT handling, signed-URL generation, CSV build, webhook forgery rejection |
| Frontend unit/component | Vitest + React Testing Library | Guards, forms, validation, state components, RPC wrapper mocks |
| E2E | Playwright (Chrome mobile + desktop viewports) | Full business flows against real backend; RTL assertions |
| CI | GitHub Actions | lint → typecheck → db test → vitest → build → deploy EFs → (scheduled) smoke |

**Test data:** seeded via migrations (fixture grade, per-unit pricing, codes) — never mock backend calls in E2E for business flows.

**Low-spec machines:** the vitest config caps parallel workers (`maxWorkers: 2`) and raises the test timeout to 30 s so full-suite runs stay stable on small boxes (2-core/4 GB). Symptom of exceeding capacity is rotating per-test timeouts across unrelated files — if that recurs, close other heavy processes (editor, browsers) before the run; each failed file passes standalone. Verified green: 211/211 vitest (31 files), 199/199 deno, 12/12 DB harness.

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

Per table (all application tables): exists; every expected column with type, NOT NULL, default; every CHECK, UNIQUE, PK, FK (with correct ON DELETE behavior); every index present.

| Check | Assertion examples |
|---|---|
| Enums | Each of the enums exists with exact member sets |
| Tables/columns | Application tables (the `unit_*` purchase tables, replacing the removed time-based plans/codes tables); column types match DATABASE.md §4 |
| CHECK rules | `total_price = base_price + platform_fee`; code regex `^WLDN-[A-Z0-9]{8,12}$` + `code = upper(code)`; progress `0 <= percent_completed <= 100`; Egyptian phone regex on both phone columns |
| Unique constraints | `profiles.phone`; `grades.name`; `units (grade_id, name)`; `unit_codes.code`; `unit_purchases (student_id, unit_id)`; `progress (student_id, lesson_id)`; `notifications.dedup_key`; `lesson_videos.bunny_video_id`; `lesson_pdfs.storage_path`; partial `lessons.is_trial` (max one per unit) |
| Partial uniques | `lesson_videos`: UNIQUE `(lesson_id) WHERE is_primary AND deleted_at IS NULL` **[BINDING B9]**; `lesson_pdfs`: same pattern — exactly one primary per lesson |
| FKs | All FK pairs + declared ON DELETE (CASCADE/SET NULL/RESTRICT) match DATABASE.md |
| RLS | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on all application tables |
| Views | Views exist (`v_dashboard_metrics`, `v_lesson_access`); SECURITY INVOKER (no SECURITY DEFINER/security_barrier) |
| **Ownership [BINDING B1]** | Every function with `prosecdef` (SECURITY DEFINER, including trigger functions) is owned by `postgres` or a BYPASSRLS role — fail otherwise |
| **Grants [BINDING B2]** | `authenticated` has **no** UPDATE/INSERT/DELETE privileges on `notifications` (REVOKEd); table-level UPDATE denied |

---

## 4. RLS Role-Simulation Matrix (pgTAP)

Approach: `SET ROLE` + auth-uid injection (`auth.uid()` stubbed via a `set_auth` helper / Supabase test hook), asserting per-policy allowed/denied for student, mr_walid, admin, and unauthenticated.

| Table | student (own) | student (other) | student (disabled) | student (deleted) | mr_walid | admin | anon |
|---|---|---|---|---|---|---|---|
| `profiles` | own SELECT; 4-column UPDATE ok; grade/role/status UPDATE denied | denied | SELECT/UPDATE denied (`is_student()` false) | denied | SELECT; no broad UPDATE | SELECT; INSERT; DELETE (escape hatch) | denied |
| `grades` | SELECT active + non-deleted **[BINDING B8]** | n/a | denied | denied | SELECT/INSERT/UPDATE/DELETE | same | denied |
| `unit_pricing` | SELECT active, own-grade, published-unit | n/a | denied | denied | SELECT | SELECT + DML | denied (prices only via `get_public_unit_prices()`) |
| `unit_codes` | denied (never sees raw codes) | denied | denied | denied | SELECT | SELECT | denied |
| `unit_purchases` | own SELECT | denied | own SELECT ok (history) | own SELECT ok | SELECT | SELECT | denied |
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

**DML-only paths:** `unit_pricing`, `unit_codes`, `unit_purchases`, `progress` — direct INSERT/UPDATE/DELETE fail for every role; only SECURITY DEFINER RPCs mutate (unit_purchases has an explicit `insert_via_rpc` FORBIDDEN policy).

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

### 6.1 Redemption validations (`redeem_unit_code`)

- Success: eligible student + available code → permanent `unit_purchases` row (`status='active'`, no time limit), price snapshot equals `unit_pricing` (P12), code → `used` (used_at/used_by), `unit_activated` notification (dedup `unit_activated:{purchase_id}`), audit `unit_purchase.create`.
- Failures (each asserted, in order): empty/unknown code (`code_not_found`); pricing missing (`unit_not_found`); pricing or unit inactive (`unit_inactive`); revoked code (`code_revoked`); already-used code (`code_already_used`); student without grade (`no_grade_assigned`); unit not in the student's grade (`unit_not_in_student_grade`); unit already purchased (`unit_already_purchased`).
- Guards: `is_student()` false → `access_denied`; disabled student blocked via `is_student()`.

### 6.2 Access model (`can_access_lesson`)

- Staff (`is_admin()`/`is_mr_walid()`/`is_teacher()`): any live (non-deleted) lesson visible — content-visible check, no purchase/trial gate.
- Student: needs published lesson+unit in own **active** grade, active profile, and (**active `unit_purchases`** row OR `lessons.is_trial`).
- Permanent purchase: an active `unit_purchases` row grants access indefinitely (permanent — nothing ever times out).
- Trial: a lesson flagged `is_trial` is accessible without a purchase; at most one trial lesson per unit (partial unique index); toggling via `set_lesson_trial` atomically clears any prior trial in the unit.

### 6.3 90% completion determinism (`upsert_progress`)

- `percent = 89.99` → not completed; `percent = 90` → `is_completed = true`; any later lower percent does NOT un-complete (A12).
- Percent monotonic: repeated writes with decreasing percent keep the max (GREATEST).
- Client cannot pass `is_completed` (no parameter; server-derived).
- Clamping: negative position → 0; percent > 100 → 100 (A24).
- Guard: non-student / disabled / deleted / no access (no purchase, not trial) / wrong grade → rejected.
- **[BINDING B4]** PDF-only lesson (no primary video): progress write succeeds with `video_id = NULL`, pinned to lesson. Lesson with a primary video: write from a stale `video_id` (simulated) → `progress_stale_video` rejection; first write after replacement repairs `video_id` to the new primary.
- Concurrent writes to same (student, lesson): serialized by row lock; final state consistent (A26).

### 6.4 Notification deduplication

- `unit_activated`: emitted exactly once per purchase (`ON CONFLICT (dedup_key) DO NOTHING`).
- `new_content`: emitted by `publish_lesson` to **active purchasers of the unit's grade** (profile `status='active'`, not deleted), dedup `new_content:{lesson_id}:{student_id}`.
- Exam/comment notifications (Phase 6/7) follow the same once-only dedup pattern.

### 6.5 Replacement reset (video replacement, A11)

- Replace primary video → same transaction: old video `status='replaced'`, `is_primary=false`; new video `ready` + `is_primary=true`; progress rows pinned to old video zeroed (`position=0`, `percent=0`, `is_completed=false`, `video_id=new`); rows already pinned to new video untouched; audit `video.replace`.
- **[BINDING B9]** Soft-delete of a video clears `is_primary` in the same transaction; the partial unique constraint allows a new primary afterwards.

### 6.6 Grade-change access re-evaluation

Student with an active unit purchase has grade changed by staff (`set_student_grade`):
- Accessible grade set changes **immediately** (next request re-evaluates `can_access_lesson`).
- Old-grade lesson access denied; new-grade lessons open; existing purchases unaffected (a purchase is tied to a unit, which belongs to a grade — moving the student changes which units are in their accessible grade).

### 6.7 Staff RPC semantics

- `set_unit_price(unit_id, base_price)` **[BINDING B6]**: staff (admin/mr_walid/teacher) sets the base price; `set_platform_fee(fee)` owner-only (mr_walid or admin) sets ONE global fixed fee applied to every `unit_pricing` row; generated `total_price = base_price + platform_fee`; both audited.
- `set_student_grade` / `set_lesson_trial`: staff-guarded (`is_admin() OR is_mr_walid() OR is_teacher()`); audited; `set_lesson_trial` clears any prior trial in the unit atomically (decision D).
- `create_unit_codes_internal(p_unit_pricing_id, p_count, p_note)`: SECURITY DEFINER, **no client grants** (EF entry point: `create_unit_codes_for_staff`); validates count cap (≤500) and format (`^WLDN-[A-Z0-9]{8,12}$`, uppercase — A22).
- `create_unit_codes_for_staff(...)`: staff-guarded EF entry point (`is_admin() OR is_mr_walid()` → `permission_denied`); delegates to `create_unit_codes_internal`; granted to `authenticated`.
- `revoke_unit_code(p_code_id)`: available/used → `revoked`; audited; does not cancel the created purchase.
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

- JS/PowerShell harness (or Playwright API calls) firing **10–50 simultaneous** `redeem_unit_code` calls for one code against the real backend (local Supabase; also staged against a dedicated test project).
- Assert: **exactly one success**; every other call rejected with `code_already_used`; exactly one `unit_purchases` row; code `used` once.
- Repeat N times (≥10 rounds); also run mixed concurrent redemptions of distinct codes (no cross-talk).
- Full-stack variant: concurrent HTTP calls through the UI layer with real auth sessions.

---

## 9. Edge Function Tests (Deno)

- **Unit** (`deno test`): webhook token verification (constant-time compare; wrong/missing token rejected 401/403); JWT handling via `supabase.auth.getUser()` mocks; tokenized URL generation (IP-locked HS256 directory token, query form, TTL 20 min); thumbnail signed URL; PDF signed-URL parameter construction; CSV builder (UTF-8 BOM, Arabic-safe, correct columns/filters).
- **Webhook forgery rejection [mandatory]:** unsigned payload, forged/wrong token → rejected (401/403); valid-token happy-path payload → accepted; payloads with missing/oversized/malformed fields → rejected. State-transition validation in `set_video_status` additionally rejects illegal transitions even if a webhook payload is somehow valid.
- **Integration** (`supabase functions serve` against local/CI Supabase + stubbed Bunny HTTP): create-video-upload-session (create + replace modes); upload-pdf (MIME/size validation, signed upload URL issued); get-video-playback-url student path (trial or purchased unit access → URL; no access/disabled/deleted/other-grade → denied) and **[BINDING B5]** staff path (`is_mr_walid()`/`is_admin()` → content-visible check passes without a purchase; lesson soft-deleted → denied); get-pdf-signed-url (primary-resolved, non-primary rejected — MED-7); generate-unit-codes (count cap, format/uppercase, pricing validation); export-audit-log (filters, CSV, signed URL; non-admin denied).
- Security: functions reject inactive/deleted profiles even with a valid role claim (A34).

---

## 10. Frontend Tests (Vitest + RTL)

- Guards: AuthGuard (unauthenticated → redirect), RoleGuard (role → allowed prefixes; stale-cache residual documented, never used for authz), AccessGuard on the lesson page (informational; `can_access_lesson` is authoritative).
- Forms/validation: register (required fields, Egyptian phone regex both phones, no grade field), login error mapping for `account_inactive_or_deleted`, profile (4-column whitelist), code entry normalization, destructive-confirmation modals.
- State components: loading/empty/error/success for every important screen.
- RPC wrapper mocks: typed wrappers call the correct RPC with correct args; mark-read uses RPCs only **[BINDING B2]**.
- Arabic/RTL: format helpers, date/number formatting.

---

## 11. E2E Playwright

Viewports: Chrome mobile (<768) + tablet (768–1023) + desktop (≥1024).

| Flow | Steps |
|---|---|
| Student journey | Register (Arabic form) → login → staff assigns grade + creates per-unit pricing → student redeems a code → browse curriculum → watch video → progress persists/resumes → completion at 90% → locked unit shows purchase/trial gate |
| Redemption | Staff generates unit codes → student redeems → unit unlocked permanently → double redemption rejected in UI |
| Sign-in gate | Covered in §7 |
| Walid flows | Students list/disable/trash/restore; grade CRUD + reorder; curriculum CRUD + publish/hide; video upload session + PDF upload; analytics with real data |
| Admin flows | Audit log filter + CSV export (Arabic/BOM); per-unit pricing management; `set_user_role`; dashboard metrics |
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
| 3 | §6.1 redemption validations, §6.2 access model, §8 race harness, §6.7 pricing/codes RPCs |
| 4 | §6.6 grade binding, §6.5 B9, §6.7 B3, content lifecycle pgTAP + Playwright walid flow |
| 5 | §9 Edge Function suite incl. webhook forgery + B5 staff preview, state machine units, staging Bunny integration |
| 6 | §6.3 progress determinism incl. B4, student Playwright flow |
| 7 | View-level SQL tests (`v_lesson_access`, `v_dashboard_metrics`), dashboard Playwright |
| 8 | §5 notification immutability, §6.4 dedup tests, role-escalation tests, audit export EF test |
| 9 | §4 hardening matrix rerun + dedicated security suite (IDOR, storage access, access-bypass, race, forgery) |
| 10 | Full regression: all suites green, no known blockers — **executed**: 12/12 DB harness (30/30 migrations), 211/211 vitest (31 files), 199/199 deno + deno lint, tsc (app+node), eslint 0, vite build, prettier (gap closed in Phase 10) |
| 11 | Final smoke + manual verification script (PLAN §19 questions); trigger digest + snapshot verified — **executed (local)**: CSP meta present in built `index.html` (no inline scripts, `script-src 'self'`), internal EFs return no CORS headers with OPTIONS 405 (re-ran 199/199 deno), migrations regen byte-clean + full harness re-run green; remaining actions are deployment-time and external (see README §Deployment) |
| 12 | Exams (0029) + comments (0030) — **executed**: harness suites 09_exams + 10_comments green (12/12 suites, 30/30 migrations), regen OK to 0030, vitest 211/211 (31 files, +2 suites: StudentLessonTabs, ExamsPage staff builder; LessonAssetsPage comments moderation), tsc (app+node), eslint 0, vite build; ZERO LEFTOVERS sweep clean (src/ has no subscription/expires_at outside the mock auth-shape exemptions) |
| 12a | Schema snapshot filter (option A) — **executed**: `scripts/regen-schema.mjs` now splits legacy 0001–0026 at statement level ($$-aware) and drops the 86 forbidden subscription statements; the 14 mixed statements (legit subjects that also reference removed objects, e.g. `can_access_lesson`, `notify_new_content`, `v_dashboard_metrics`, `get_dashboard_stats`, trigger loops over `pricing_plans`) are kept verbatim and logged as notes; 0027+ kept verbatim so 0028's intentional DROPs survive. regen OK (30 markers, LF-only, no BOM); harness 12/12 re-run green; probe shows the filtered snapshot no longer applies top-to-bottom (fails at 0004's kept `set_updated_at` loop on the dropped `pricing_plans` table) — the harness (migrations applied individually) remains the authoritative check |
