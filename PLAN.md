# وليد عونى — Master Technical Implementation Plan

## 0. Mission

Build a production-ready Arabic RTL educational platform for Walid Awny.

The implementation must be fully functional end-to-end. Do not ship mock functionality, fake buttons, placeholder business logic, incomplete integrations, or UI-only features.

The implementation AI is responsible for:
- architecture
- database design
- Supabase integration
- authentication
- authorization and RLS
- subscription/business logic
- curriculum/content management
- Bunny integration
- student progress
- notifications
- dashboards
- audit logging
- security
- automated/manual verification

Do not consider a phase complete because the UI renders or the TypeScript build succeeds. A phase is complete only when its functionality works against the real backend and passes its acceptance checks.

---

## 1. Existing Supabase Connection

Frontend environment:

```env
VITE_SUPABASE_URL=https://nfusbrktrqfrnaetetmr.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<provided separately in the environment>
```

Never put a Supabase Service Role Key, Bunny API secret, signing secret, or any other server secret into frontend code.

Use the publishable key only where appropriate.

---

## 2. Core Product Rules Already Decided

### Authentication

- Registration uses email.
- Login uses email + password.
- Email is required and unique.
- Email cannot be changed by the student.
- Email cannot be changed by Walid Awny.
- Email cannot be changed by the admin from the normal application UI.
- Password is required.
- No special password-complexity rule such as uppercase/lowercase/number is required.
- Student can change their password while authenticated.
- "Forgot password" is planned for a future phase and is not required in the initial MVP.
- Registration is immediate; no OTP.
- Egyptian phone number is required during registration but is not the login identifier.
- Parent/guardian phone number is required.
- Guardian phone number may be shared by multiple students.
- Address is required.
- Student phone is stored as profile data.

### Student Account Lifecycle

- Account can be active or temporarily disabled.
- Walid Awny and the admin can disable a student account.
- Disabled accounts cannot access the platform.
- Disabling an account does NOT pause subscription time.
- Subscription continues to count down normally while the account is disabled.
- Student accounts use Soft Delete.
- Deleted students go to a separate Trash.
- Walid Awny and admin can view Trash and restore students.
- Deleted accounts cannot log in or access protected content.
- Restore returns the account to an active recoverable state subject to subscription validity.

### Roles

Minimum roles:
- student
- mr_walid
- admin

Admin has the highest privileges.

Audit logs are visible to admin only.

### Curriculum

Structure:

```text
Grade
  └── Unit
       └── Lesson
            ├── Video
            └── PDF
```

Content must be real database-backed content, not mock data.

### Grade Management

- Student grade is part of their profile.
- Grade is not editable by the student.
- Grade is manually managed by Walid Awny and admin.
- Pricing may differ by grade.
- A grade can have multiple subscription-duration offers.

### Subscription System

- Pricing is configurable by grade.
- A grade may have multiple prices depending on subscription duration.
- Duration is measured in days.
- Base price, platform fee, and total are represented separately.
- The platform supports different pricing for different grades and durations.
- Subscription codes are used to activate subscriptions.
- A code is intended for one use only.
- Student cannot use another activation code while they already have an active subscription, unless the defined business rule explicitly allows a future extension.
- Subscription expiry is calculated from activation/start rules defined in the implementation.
- Access to protected content must be blocked when the subscription is expired.
- Subscription time continues during account disablement.
- Subscription history must be preserved.

### Subscription Notifications

- A notification is sent when approximately 7 days remain.
- The 7-day warning must not repeat for the same subscription.
- Expiry notifications should be supported.
- Notification state must be stored persistently.

### Student Progress

Track real student learning progress.

Minimum requirements:
- last playback position
- percentage watched
- lesson completion
- resume playback
- unit/course/grade progress where applicable
- completion threshold is 90%
- students cannot manually edit progress
- replacing a video must have an explicit, deterministic progress policy and must not create inconsistent progress records

### Bunny

Bunny is used for video hosting/management.

Required architecture:
- upload from Walid Awny dashboard
- upload/processing state tracking
- do not expose video before processing is ready
- private/protected video delivery
- signed/tokenized playback where appropriate
- thumbnail and duration synchronization where available
- video replacement
- safe handling of processing failures
- no Bunny secrets in frontend
- server-side integration must be used for privileged Bunny operations

### PDFs

- PDFs are stored privately.
- Access is authenticated and subscription-aware.
- Use signed/private access where appropriate.
- PDF access must stop after subscription expiry.
- Replacement and deletion must be handled safely.

### Notifications

Support in-platform notifications:
- unread/read state
- new content
- subscription activation
- subscription nearing expiry
- subscription expiry
- other important system events
- duplicate notifications must be prevented where the event is supposed to be unique

### Audit Log

Audit logging is for admin only.

Log important administrative operations such as:
- student creation
- student updates
- disable/enable
- soft delete
- restore
- subscription operations
- code creation/use/revocation where applicable
- content create/update/publish/hide/delete/restore
- important system setting changes
- other privileged operations

Each audit record should capture, where applicable:
- actor
- role
- action
- entity type
- entity ID
- timestamp
- metadata/context
- safe request information if useful

Admin must be able to filter and export audit logs.

Export:
- CSV and/or Excel-compatible output
- date range filtering
- useful action/entity/user filters

### WhatsApp

A WhatsApp button exists in the product.

Its number/configuration should be centrally configurable according to the product rules, not hardcoded throughout the frontend.

### Dashboards

#### Student Dashboard

Show:
- current subscription
- remaining time
- expiry date
- curriculum
- learning progress
- lessons
- video playback
- PDFs
- subscription history
- notifications
- relevant account information

#### Walid Awny Dashboard

Show/manage:
- students
- grades
- subscriptions
- subscription codes
- curriculum
- units
- lessons
- Bunny videos
- PDFs
- student progress analytics
- number of students per grade
- viewing/progress analytics
- most-viewed lessons
- content state
- Trash
- configurable WhatsApp information

#### Admin Dashboard

Includes Walid Awny capabilities plus:
- system/user administration
- role/permission management
- audit logs
- pricing/platform fee management
- subscription configuration
- administrative settings
- audit export
- date/filter controls
- operational statistics

Admin dashboard should include at least:
- total students
- active students
- disabled students
- active subscribers
- expired subscriptions
- published lessons
- hidden/draft lessons
- available codes
- used codes
- relevant operational metrics

---

# 3. Required Technical Architecture

Use a clean layered architecture.

Recommended separation:

```text
Presentation
  ↓
Application / Feature Services
  ↓
Supabase Data Access
  ↓
Supabase PostgreSQL / Auth / Storage
```

Privileged operations:

```text
Frontend
  ↓
Server-side endpoint / Edge Function
  ↓
External privileged API
```

Never solve security problems by hiding buttons only.

Authorization must be enforced server-side/database-side.

---

# 4. Database Architecture

The implementation AI must design a normalized PostgreSQL schema.

Expected logical domains include:

- profiles/users
- roles
- permissions if a granular permission system is implemented
- grades
- pricing plans
- platform fees/settings
- subscriptions
- subscription codes
- code redemption/history
- units
- lessons
- lesson assets
- videos
- PDFs/files
- progress
- notifications
- audit logs
- application settings
- soft-delete metadata where appropriate

Do not create unnecessary duplicated data.

Use:
- UUID primary keys where appropriate
- timestamptz
- foreign keys
- unique constraints
- check constraints
- indexes
- enums only where they provide stable domain value
- explicit cascade/restrict behavior

---

# 5. Supabase Full Schema Requirements

The implementation AI must create:

```text
supabase/
  migrations/
  supabase-full-schema.sql
```

The final `supabase-full-schema.sql` must represent the complete database state.

It must include, as applicable:
- extensions
- enums
- tables
- columns
- defaults
- constraints
- indexes
- foreign keys
- functions
- triggers
- RLS enablement
- RLS policies
- views
- RPC functions
- storage policies
- seed/configuration data that is safe and intentional

The schema must be idempotent where practical and migration-safe.

Do not rely on manually created dashboard-only database objects without documenting/reproducing them in SQL.

---

# 6. RLS / Security Model

RLS is mandatory for sensitive application data.

Minimum rules:

### Student
Can:
- read/update only the allowed parts of their own profile
- change password through Auth
- read their own subscriptions
- read their own progress
- write only progress records through controlled logic
- read their own notifications
- mark their own notifications as read
- access only curriculum content they are authorized to access
- access protected assets only when subscription rules allow

Cannot:
- change grade
- change role
- change email through application profile update
- modify subscription state
- create/use arbitrary subscription records
- modify another student's data
- modify audit logs
- access admin data
- access another student's progress

### Walid Awny
Can:
- manage student operational data allowed by the product
- manage grades
- manage curriculum
- manage subscriptions/codes according to business rules
- manage videos/PDFs through controlled services
- view progress analytics
- manage relevant settings

Cannot:
- read admin-only audit logs
- escalate own role
- bypass protected database rules

### Admin
Full authorized administrative access.

Audit logs remain admin-only.

---

# 7. Authentication Rules

Use Supabase Auth.

Profile/business data must be linked safely to `auth.users`.

The implementation must avoid:
- orphaned profiles
- duplicate profiles
- privilege escalation
- client-controlled roles
- insecure profile creation

Use secure triggers/functions or server-side logic when appropriate.

Do not expose service-role credentials to the browser.

---

# 8. Subscription Access Control

Protected content access must be determined from authoritative subscription data.

Do not trust:
- localStorage
- client-side countdowns
- hidden UI
- frontend-only flags

The database/backend must be able to determine whether access is currently valid.

The system must correctly handle:
- active
- expired
- disabled account
- deleted account
- invalid code
- already-used code
- invalid duration
- pricing changes
- historical subscription records

---

# 9. Subscription Code Safety

Codes must be:
- securely generated
- stored safely
- unique
- single-use
- associated with a defined subscription offer
- associated with redemption metadata
- protected against accidental duplicate redemption
- protected against race conditions

Redemption must be atomic.

Two simultaneous requests must never successfully redeem the same single-use code.

---

# 10. Progress Tracking Safety

Progress updates must be resilient to:
- repeated updates
- concurrent playback updates
- refreshes
- network failures
- seeking
- video replacement

Completion at 90% must be deterministic.

Do not allow the client to arbitrarily mark a lesson as completed without satisfying the defined rule.

---

# 11. Bunny Integration

All privileged Bunny API operations must happen server-side.

Expected lifecycle:

```text
Create/Select Lesson
      ↓
Create Upload Session
      ↓
Upload
      ↓
Bunny Processing
      ↓
Webhook/Polling Verification
      ↓
Ready
      ↓
Protected Playback
```

Store stable Bunny identifiers in the database.

Never expose Bunny API credentials to the browser.

---

# 12. Storage

Use Supabase Storage or another approved storage mechanism for PDFs and appropriate non-video assets.

Use private buckets for protected material.

Access must be controlled through authenticated, subscription-aware logic.

---

# 13. Application UX Requirements

Arabic-first and RTL.

Must support:
- desktop
- tablet
- mobile

Every important screen needs:
- loading state
- empty state
- error state
- success feedback
- validation feedback

Destructive operations require confirmation.

Soft-delete operations must clearly communicate the action.

---

# 14. Implementation Phases

## PHASE 0 — Discovery & Architecture

Deliver:
- architecture document
- route map
- role matrix
- entity map
- data flow
- security model
- integration plan
- risk list

Do not start feature coding until this is internally consistent.

## PHASE 1 — Supabase Foundation

Deliver:
- migrations
- full schema
- Auth integration
- profile model
- roles
- RLS
- seed/configuration data

Acceptance:
- schema applies cleanly
- no missing foreign keys
- no policy contradictions
- roles cannot escalate
- core Auth flow works

## PHASE 2 — Authentication & Account Lifecycle

Implement:
- registration
- login
- logout
- session persistence
- profile creation
- password change
- disable/enable
- soft delete
- trash
- restore

Acceptance:
- every lifecycle transition works against real Supabase.

## PHASE 3 — Grades, Pricing & Subscriptions

Implement:
- grades
- pricing offers
- duration in days
- base/platform/total price
- subscription records
- codes
- atomic redemption
- expiration
- subscription history

Acceptance:
- full activation lifecycle works.

## PHASE 4 — Curriculum & Content Management

Implement:
- grades
- units
- lessons
- ordering
- draft/published/hidden
- soft delete
- restore
- PDFs
- content metadata

## PHASE 5 — Bunny Video

Implement full upload/processing/protected playback lifecycle.

## PHASE 6 — Student Learning Experience

Implemented (all verified):
- curriculum browsing (published units/lessons per grade, completion badges, summary bar)
- lesson access (hidden lessons excluded; missing lesson → empty state)
- video (hls.js + native-HLS fallback; playback via get-video-playback-url; resume seek after manifest parsed)
- PDF (new EF get-pdf-signed-url: POST+JWT, student-only, active-subscription gate, RLS-scoped, service-role createSignedUrl on `pdfs`, 900s TTL; stable error codes; access_denied card + subscription link when gated)
- progress (upsert_progress RPC, 5s-throttled saves, mock mirrors DB GREATEST semantics)
- resume (position + percent persisted; monotonic, no regressions)
- completion (≥90% watch ratio → is_completed)
- notifications (list, read/unread, mark-single, mark-all, unread badge on dashboard, navigation to lesson)
- gates: 161/161 vitest (24 files), tsc, eslint, vite build, 190/190 deno (get-pdf-signed-url 16/16), deno lint

## PHASE 7 — Dashboards

Implemented (all verified):
- staff dashboard (/walid/dashboard, new index target) — single-round-trip get_dashboard_stats RPC (0018, staff-guarded, read-only)
- headline cards: students (+new this month), active subscriptions, expiring ≤7d, subscription revenue
- content cards: published lessons, ready videos/PDFs, available codes
- students-by-grade table, recent subscriptions, upcoming expirations (≤7d), engagement summary
- StaffNav across all walid pages (dashboard/students/grades/curriculum/pricing/codes)
- student dashboard: unread-notification badge + curriculum/notifications links (Phase 6)
- gates: 168/168 vitest (25 files), tsc, eslint, vite build, 8/8 DB harness (06_dashboard_stats.sql, exact grant-count 45)

## PHASE 8 — Notifications & Audit

Implemented (all verified):
- notification engine (DB, Phase 3/4): `subscription_expiring` (threshold from `app_settings.expiry_warning_days`, default 7) + `subscription_expired` events from `expire_subscriptions`, deduped via UNIQUE(dedup_key) — fires exactly once per subscription
- read/unread: `mark_notification_read` / `mark_all_notifications_read`, student notifications page + dashboard badge (Phase 6)
- admin audit log: admin-only reads via `list_audit_logs` / `count_audit_logs` (0019, SECURITY DEFINER, is_admin gate, ILIKE substring filters, pagination clamp, newest-first) over `v_audit_log` (actor name/role join)
- filtering UI: date range, action substring, entity type, actor id — filters apply to both the list and the count
- pagination (50/page) + CSV export button
- export EF `export-audit-log` (ARCHITECTURE §8.4 row 7): POST+JWT admin-only, filters → v_audit_log (RLS-scoped) → CSV with UTF-8 BOM (Excel/Arabic) → private `audit-exports` bucket → 600 s signed URL; stable error codes; 13/13 deno tests
- role management: `/admin/roles` — lists non-student users, `set_user_role` change with confirm modal, self-change blocked; escalation admin-only (02_roles escalation tests)
- admin route group `/admin/*` (RoleGuard allow=['admin']): dashboard (reuses staff dashboard with AdminNav), audit, roles; `roleHome.admin` → `/admin/dashboard`
- webhook forgery rejection (Phase 5): wrong/missing token → 401 `invalid_webhook_token`, constant-time compare
- gates: 184/184 vitest (27 files), tsc, eslint, vite build, 203/203 deno, deno lint, 9/9 DB harness (07_audit_logs.sql; authenticated grant count 45→47 = 42 client RPCs + settings + 4 helpers; SECURITY.md §8.2 → 43 names)

## PHASE 9 — Security Hardening

Implemented (all verified):
- **RLS review (agent)** — every policy/grant/RPC guard re-audited; no HIGH findings. MED: docs claimed a "column-scoped" notifications UPDATE policy (`UPDATE OF is_read, read_at`) — invalid PostgreSQL (no such syntax; `FOR UPDATE OF` is a SELECT row-lock clause). Corrected: the real B2 enforcement is the REVOKE; 0020 re-asserts the own-row policy + REVOKE idempotently; SECURITY.md/DATABASE.md/PLAN.md/BLUEPRINT.md/TESTING.md claims fixed.
- **LOW fix (0020 HARD-2)** — `pdfs_insert_row_backed` (0015) allowed INSERT at ANY row-backed path visible to the caller, incl. a ready primary PDF. Now pending-only (is_ready=false AND is_primary=false); upload-pdf EF flow unaffected (pending row exists at signed-URL issuance); 04_business.sql storage16 hardened accordingly.
- **New regression suite 08_security.sql (8 sections)** — search_path pin lock for every public SECURITY DEFINER (B1); storage.objects policy inventory lock (exactly one INSERT-only authenticated policy, pending-only, no SELECT/UPDATE/DELETE/anon); B2 privilege locks (no table- or column-level UPDATE for anon/authenticated) + probe-role proof that RLS row-scoping confines any re-granted UPDATE to own rows; cross-user IDOR negatives (mark-read on another user's id is a no-op, subscriptions own-only, grade-mismatch progress denied); student/mr_walid boundary matrix (finalize_pdf_upload access_denied; audit reads + dashboard admin-only); grant-drift anchors (anon stays at exactly 1 executable function; 10 internal helpers locked).
- **Secret scan (agent)** — no HIGH/MED. LOW-1: live secrets in local-only `.env.functions.local` (not a git repo; hygiene note). LOW-2: no CSP in index.html. INFO-1: wildcard CORS on internal EFs (bunny-video-webhook, expire-subscriptions, recheck-video-states).
- **Doc drift fixed** — DATABASE.md §6.4 audit signatures matched to real 0019 contract (`p_from, p_to, p_action, p_entity_type, p_actor_id, p_limit, p_offset`).
- **Gates:** 10/10 DB harness suites (21/21 migrations; new 08_security.sql), tsc, eslint, vite build, vitest, deno.

Deferred to Phase 11 — ALL CLOSED in Phase 11: CSP header (build-time injection plugin), wildcard-CORS tightening on internal EFs (noCors), `.env.functions.local` hygiene (gitignore + header).

## PHASE 10 — QA / Verification

Implemented (all verified):
- **Full regression sweep (every gate re-run after Phase 9 changes):** DB harness **10/10 suites, 21/21 migrations** (01 schema, 02 roles/sign-in gate, 03 RLS, 04 business rules, 05 grants, 06 dashboard stats, 07 audit, 08 security, 2 concurrency races), **vitest 184/184 (27 files)**, **deno 203/203 + deno lint**, tsc (app+node), eslint 0 errors, vite build, prettier.
- **Prettier gap closed:** `prettier --check` was failing on 109 files (never run before). Formatted all code (`src/**`, `supabase/functions/**`, configs, scripts); `*.md` excluded via `.prettierignore` (docs use hand-tuned tables). All gates re-verified green after formatting.
- **DoD #8 verified:** no mock remains in runtime code — `src/test/supabase-mock.ts` is imported only by `*.test.tsx` (grep-verified).
- **No TODO/FIXME leftovers** in src/functions/scripts (only placeholder strings like `WLDN-XXXX`).
- **TESTING.md coverage matrix §1–§10: all satisfied** (see §14 for the full mapping).
- **Deferred to Phase 11 (documented, external deps):** §11 Playwright E2E (needs a hosted Supabase project + seeded real data; no `playwright.config` in repo), §12 CI pipeline (repo not yet on GitHub; workflow file will be added at deploy time). Responsive/viewport assertions likewise ride on Playwright.

## PHASE 11 — Final Production Readiness

Implemented (all verified):
- **Build** — `vite build` green; production `index.html` now carries a strict CSP meta (injected at build time only via the `inject-csp` plugin in vite.config.ts): `default-src 'self'`, `script-src 'self'` (no inline scripts in the bundle — verified), `style-src 'self' 'unsafe-inline'` + Google Fonts, `font-src` gstatic, `img-src`/`media-src` data:/blob:/`*.b-cdn.net` (Bunny pull zone), `connect-src` self + `*.supabase.co` + `wss://*.supabase.co` + `video.bunnycdn.com` (TUS) + `*.b-cdn.net`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. NOTE: if the Bunny pull zone ever uses a custom (non `*.b-cdn.net`) hostname, add it to `connect-src`/`media-src`/`img-src`.
- **Environment variables** — every env used by the frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, typed in `vite-env.d.ts`) and by Edge Functions (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BUNNY_*`, `INTERNAL_JOB_TOKEN`, `BUNNY_WEBHOOK_TOKEN`) is documented in `.env.example` with usage notes; `.gitignore` already excludes `.env.local`, `.env.functions.local`, `.env.secrets`.
- **Migrations** — 21 migration files, `supabase-full-schema.sql` regenerated byte-clean (20 markers, LF-only, no BOM, 0001–0020); embedded-PG harness applies all 21 and passes 10/10 suites.
- **Storage** — pdfs bucket INSERT policy hardened (0020 HARD-2, pending-only); storage.objects policy inventory locked in 08_security.sql.
- **Bunny** — token formula cross-checked: `_shared/bunny.ts` `signDirectoryToken` ≡ `scripts/smoke-bunny.mjs` replica (IP-locked HS256, raw `token_path` in the message, query form in URL); verified live against the production pull zone in Phase 5 (master + sub-playlists + segments all 200; unsigned rejected).
- **Security** — Phase 9 deferrals closed: (1) CSP header added (see Build); (2) internal EFs (`bunny-video-webhook`, `expire-subscriptions`, `recheck-video-states`) no longer emit `Access-Control-Allow-Origin: *` — `jsonResponse(body, status, noCors=true)`; OPTIONS now rejected 405; all 203 deno tests still pass; (3) `.env.functions.local` hygiene confirmed — header comment marks LOCAL-ONLY, `.gitignore` excludes it.
- **Error handling** — ErrorBoundary (componentDidCatch → console.error + reload fallback) tested; every EF logs structured errors (`<fn-name>: <op> failed <code>`) to Supabase logs.
- **Monitoring** — Supabase platform logs for EFs + DB; scheduled jobs (`expire-subscriptions` daily 03:00, `recheck-video-states` daily 06:00 via `supabase functions schedule`) log per-run summaries; frontend console errors land in the platform logs.
- **Deployment checklist (external, requires hosted Supabase + GitHub)** — see README §Deployment: `supabase link` → `db push` (never `db reset` on prod — R-C) → `functions deploy` with secrets → webhook URL setup in Bunny → CSP custom-hostname note → Playwright E2E + CI workflow added post-repo-push (deferred from Phase 10, external deps).
- **Phase 9 deferrals note updated:** CSP ✓, CORS ✓, `.env.functions.local` ✓ — all closed in this phase.

Remaining external (no hosted project/GitHub remote yet): actual `db push` to production, EF deploy, Bunny webhook wiring, Playwright E2E run, CI workflow file, production smoke.

---

# 15. Definition of Done

A phase is DONE only if:

1. Code exists.
2. Real backend integration exists.
3. Database objects exist.
4. RLS is tested.
5. Business rules are tested.
6. Error cases are handled.
7. Loading/empty states exist.
8. No mock implementation remains for the feature.
9. No required TODO remains.
10. The feature works from the actual UI through the actual backend.

---

# 16. Required Final Deliverables

The implementation AI must produce:

```text
PLAN.md
ARCHITECTURE.md
DATABASE.md
SECURITY.md
TESTING.md
supabase/
  migrations/
  supabase-full-schema.sql
.env.example
README.md
```

And the actual production codebase.

---

# 17. Master Agent Operating Rules

The AI must behave as a senior engineering team.

Before implementing:
- inspect the repository
- inspect existing code
- inspect existing Supabase state if access is available
- do not blindly overwrite working functionality
- identify conflicts
- document assumptions

For every phase:
1. Plan.
2. Implement.
3. Validate.
4. Test.
5. Fix.
6. Re-test.
7. Update PLAN.md.
8. Move to the next phase only after acceptance criteria pass.

If a requirement is ambiguous:
- prefer an explicit documented assumption
- do not invent contradictory business rules
- do not repeatedly ask already-resolved questions

---

# 18. Anti-Patterns Forbidden

Do NOT:
- use mock data as a substitute for backend functionality
- use fake API calls
- store secrets in frontend code
- trust client-side roles
- trust localStorage for authorization
- bypass RLS
- expose service-role keys
- create insecure public storage buckets for private material
- create duplicate subscription records accidentally
- allow double redemption
- make disabled accounts continue accessing protected content
- allow expired subscribers to access protected content
- make audit logs editable by normal users
- mark required features as "coming soon"
- leave required buttons nonfunctional
- finish based only on a successful build

---

# 19. Final Verification Commandment

Before reporting completion, the AI must answer:

- Does registration work?
- Does login work?
- Does password change work?
- Does disable/restore work?
- Does soft delete/trash work?
- Do grades work?
- Does pricing work?
- Does code redemption work atomically?
- Does subscription expiry work?
- Does protected content close after expiry?
- Does Bunny work end-to-end?
- Do PDFs work securely?
- Does progress work?
- Does 90% completion work?
- Do notifications work?
- Does the 7-day notification fire once?
- Does Walid Awny dashboard work?
- Does admin dashboard work?
- Does audit logging work?
- Does audit export work?
- Does RLS prevent unauthorized access?
- Are secrets protected?
- Does mobile/desktop work?
- Are there any mock implementations left?
- Are there any required TODOs left?

If any answer is NO, the project is NOT COMPLETE.

---

# 20. Important Implementation Constraint

Do not claim absolute zero defects merely because automated tests pass.

The target is:
- deterministic business logic
- validated database schema
- tested RLS
- real integrations
- no known blocking defects
- complete acceptance criteria

The implementation AI must surface any unresolved risk instead of hiding it.

---

# 21. Start Instruction

Start by reading the repository and existing project structure.

Then create/update `PLAN.md`.

Do not jump directly into feature coding.

First produce the technical implementation plan and architecture, then execute phases sequentially.

Do not ask questions that have already been answered in this document.

---

# 22. Live Implementation Status

## 22.1 Phase Status

| Phase | Deliverable focus | STATUS | Notes |
|---|---|---|---|
| 0 | Discovery & Architecture | **implemented (verified)** | ARCHITECTURE.md, DATABASE.md, SECURITY.md, TESTING.md, README.md, .env.example delivered; architecture gate approved; binding requirements recorded in §22.2; Phase 0 Fast Review PASS (round 2 — cross-refs fixed) |
| 1 | Supabase Foundation | **implemented (verified)** | 11 migrations + supabase-full-schema.sql (byte-faithful, UTF-8 verified); 6 local suites green (schema, roles, RLS, business, grants, concurrency); 3 review cycles; fixes: B8 grade enforcement, cross-lesson replacement validation, atomic upsert_progress, target-role guard, replacement promotion |
| 2 | Authentication & Account Lifecycle | **implemented (verified)** | frontend: register (guardian phone required), login w/ friendly Arabic errors, session handling, profile edit, password change (real GoTrue updateUser + reauth flow), student dashboard, staff student list/detail/trash, route guards; 64/64 frontend tests + 6/6 DB suites green; 2 review cycles; fixes: list_trash staff guard (0012), guardian-phone required, deleted_at filter, grade-clear atomicity, sign-out resilience |
| 3 | Grades, Pricing & Subscriptions | **implemented (verified)** | 0013 grade CRUD RPCs (staff-guarded, audited, B8 gates), 0014 create_codes_for_staff wrapper; Edge Functions generate-subscription-codes (user-JWT, staff-guarded) + expire-subscriptions (internal token, constant-time); frontend: /student/subscriptions (redeem+history+status), /walid/grades, /walid/pricing (admin mutate / mr_walid read-only, B7 messaging), /walid/codes (EF generation, revoke, usage); redemption race harness (2-connection, one winner); 97/97 frontend, 32/32 deno, 7/7 DB suites; 2 review cycles; fixes: codes EF↔frontend contract, error envelope passthrough |
| 4 | Curriculum & Content Management | **implemented (verified)** | 0015 pdf record wrapper + pdfs_insert_row_backed storage policy (INSERT-only, no read escape); upload-pdf EF (sanitized names, signed upload URL, caller-token, stable codes); /walid/curriculum two-pane grades→units→lessons (create/rename/reorder/publish/hide/soft-delete/restore, Arabic status badges); /walid/lessons/:lessonId PDF assets (EF→PUT→finalize flow, per-stage states); 121/121 frontend, 61/61 deno, 7/7 DB suites; 1 review cycle PASS (3 LOWs fixed/assessed) |
| 5 | Bunny Video | **implemented (verified)** | 5 EFs: create-video-upload-session (TUS + signed headers; modes create/replace + action=cancel), bunny-video-webhook (numeric status map → set_video_status chain; shared-token auth, constant-time; metadata fetch + notify_new_content), get-video-playback-url (IP-locked HS256 directory token, query form; GET-only), get-video-thumbnail-url (IP-locked signed thumbnail — the raw thumbnail_url column is never sent to clients), recheck-video-states (J2); 0016 create_video_upload_record wrapper (staff-guarded, create/replace, orphan rule, B9 primary, audit) + 0017 delete_video_upload_record (cancel/abandon release: staff-guarded, pending-only, hard delete + audit; the ONLY lesson_videos delete surface); frontend: tus-js-client upload w/ progress/cancel/resume (cancel routes to the release EF), status badges, 4s polling, replace flow, preview modal (GET contract), signed thumbnails; LIVE-VERIFIED: scripts/smoke-bunny.mjs against the real pull zone — signed HLS chain (master + sub-playlists + .ts segments + thumbnail) 200 with IP-locked token, unsigned 403; EMPIRICAL CORRECTION: zone requires IP-locked QUERY-form tokens (docs' bcdn_token path form 403); zone also enforces a Referer allowlist (no-Referer 403) — app origin must be allowlisted; webhook token + URL handed to operator for Bunny dashboard; review round 1 = FAIL (1 HIGH + 4 MED + 5 LOW) → ALL FIXED: playback GET contract (rpc.ts query support + tests), cancel release (0017 + EF cancel + frontend routing), signed thumbnail EF (unit-tested), regen-schema rebuilt from scratch (dynamic range, 17 markers), webhook header aliases + docs drift (ARCHITECTURE/SECURITY/BLUEPRINT/README/.env.example), smoke IPv6 /64 masking, test file renamed; gates: 174/174 deno, 130/130 vitest, tsc, build, eslint, deno lint, 7/7 DB harness; review round 2 = FAIL (doc drift only: 11 stale webhook-signature/TTL claims + missing RPCs in SECURITY.md §8.2) → FIXED: webhook shared-token scheme, TTL 20 min, BLUEPRINT §14 row 3b + inventory notes (10 functions), SECURITY.md §8.2 = 40 names (39 client RPCs + settings, incl. create_grade/update_grade + 4 EF wrappers), 05_grants.sql header, ARCHITECTURE Edge Functions row, README Phase 5 count, DATABASE §6.4; review round 3 = **PASS** (all items RESOLVED, stale scan clean) |
| 6 | Student Learning Experience | **implemented (verified)** | curriculum browsing (published-only, completion badges), lesson page (video via hls.js/native fallback + signed PDF via new EF get-pdf-signed-url, student-only POST+JWT, active-subscription gate, 900s TTL), progress upserts (5s-throttled, mock mirrors DB GREATEST), resume, ≥90% completion, notifications center (mark-single/mark-all, unread badge on dashboard); gates: 161/161 vitest, tsc, eslint, vite build, 190/190 deno (EF suite 16/16 new), deno lint |
| 7 | Dashboards | **implemented (verified)** | staff dashboard /walid/dashboard (new index target): get_dashboard_stats RPC (0018 — staff-guarded, read-only, single round trip: students, subscriptions incl. expiring ≤7d + revenue, content readiness, engagement, codes, by_grade, recent subscriptions, upcoming expirations); StaffNav across all walid pages; student dashboard unread badge + links (Phase 6); gates: 168/168 vitest, tsc, eslint, vite build, 8/8 DB harness (06_dashboard_stats.sql; authenticated grant count 44→45, SECURITY.md §8.2 → 41 names) |
| 8 | Notifications & Audit | **implemented (verified)** | notification engine (DB, Phase 3/4): subscription_expiring (expiry_warning_days threshold) + subscription_expired events, UNIQUE-deduped → fires exactly once; read/unread RPCs + notifications page + dashboard badge; admin audit log: list_audit_logs / count_audit_logs (0019 — admin-only SECURITY DEFINER over v_audit_log, substring filters, pagination clamp) + /admin/audit UI (filters, pagination, CSV export button) + export-audit-log EF (POST+JWT admin-only → CSV UTF-8 BOM → audit-exports bucket → 600 s signed URL; 13/13 deno tests); /admin/roles UI (set_user_role w/ confirm modal, self-change blocked, escalation admin-only); admin route group /admin/* (dashboard/audit/roles, AdminNav); webhook forgery tests (Phase 5, wrong token → 401); gates: 184/184 vitest (27 files), tsc, eslint, vite build, 203/203 deno, deno lint, 9/9 DB harness (07_audit_logs.sql; grant count 45→47, SECURITY.md §8.2 → 43 names) |
| 9 | Security Hardening | **implemented (verified)** | agent reviews (RLS/grants/authz + secrets/frontend; no HIGH); 0020 hardening (re-assert B2 REVOKE + own-row policy; pdfs INSERT pending-only — closes planting at ready-primary paths); 08_security.sql regression suite (search_path lock, storage policy inventory, B2 privilege locks + RLS own-row probe, IDOR negatives, boundary matrix, grant-drift anchors); docs corrected (B2 "column-scoped policy" claims — invalid PG syntax; DATABASE.md §6.4 audit signatures); gates: 10/10 DB harness (21/21 migrations), tsc, eslint, vite build, vitest, deno |
| 10 | QA / Verification | **implemented (verified)** | full regression sweep: 10/10 DB harness (21/21 migrations), 184/184 vitest (27 files), 203/203 deno + lint, tsc, eslint 0, vite build, prettier (gap closed — 109 files formatted, `*.md` ignored); DoD #8 no runtime mocks (grep-verified), no TODO/FIXME; TESTING.md §1–§10 all satisfied; Playwright E2E + CI workflow deferred to Phase 11 (external deps: hosted Supabase, GitHub) |
| 11 | Final Production Readiness | **implemented (verified)** | CSP meta injected at build (strict: script-src 'self', frame-ancestors 'none', object-src 'none', Bunny/CDN/Supabase hosts; no inline scripts verified); internal EFs CORS-free (noCors, OPTIONS 405; 203/203 deno re-run); env matrix verified vs `.env.example` + `.gitignore`; 21 migrations + regen byte-clean, 10/10 harness; Bunny formula cross-checked (bunny.ts ≡ smoke-bunny.mjs, live-verified Phase 5); ErrorBoundary + structured EF logging reviewed; Phase 9 deferrals all closed; external items documented (db push, EF deploy, Bunny webhook wiring, Playwright E2E, CI workflow — need hosted Supabase/GitHub) |

## 22.2 Architecture Gate Binding Requirements

The architecture gate has been approved with the following BINDING implementation requirements. Review agents in later phases MUST verify these are satisfied. They are also reflected in ARCHITECTURE.md, DATABASE.md, SECURITY.md and TESTING.md (flagged [BINDING B#]).

> Renumbered at the Phase 0 Fast Review: the original H#/M# labels collided with BLUEPRINT.md's own finding IDs (H1, M1, M2, M3, M4, M5, M6, M7). The binding IDs are now unique collision-free **B1–B10**: H1→B1, M1→B2, M2→B3, M3→B4, M4→B5, M5→B6, M6→B7, H2→B8, M7→B9, MISC→B10.

### PHASE 1 BINDING

- **B1** (was H1) — All SECURITY DEFINER functions (incl. trigger functions) MUST be owned by `postgres` (superuser) or a BYPASSRLS role; pgTAP ownership test required.
- **B2** (was M1) — REVOKE UPDATE ON notifications FROM authenticated (mark-read only via RPCs); the own-row RLS UPDATE policy stays as belt-and-braces; pgTAP must assert no UPDATE privilege (table- or column-level) for `anon`/`authenticated` and that the mark-read RPCs confine writes to own rows (PostgreSQL has no column-scoped policies — `FOR UPDATE OF ...` is a SELECT row-lock clause, not a policy).
- **Verify** pg_cron/pg_net availability; spike feasibility of DELETE FROM auth.sessions from postgres.

### PHASE 3 BINDING

- **B6** (was M5) — create_manual_subscription(p_notes) — notes stored in audit metadata (subscriptions has no notes column).
- **B7** (was M6) — delete_pricing_plan semantics: hard-delete only unreferenced plans (RESTRICT guards referenced), otherwise is_active=false; audit pricing.delete.

### PHASE 4 BINDING

- **B8** (was H2) — grades SELECT policy includes AND is_active; can_access_lesson() includes AND g.is_active; document deactivation = soft-delete equivalent.
- **B9** (was M7) — lesson_videos partial unique: UNIQUE (lesson_id) WHERE is_primary AND deleted_at IS NULL; soft-delete clears is_primary in same transaction.
- **B3** (was M2) — add update_student_profile(p_student_id, full_name, phone, guardian_phone, address) RPC — mr_walid/admin, SECURITY DEFINER, audited, 4-column whitelist.

### PHASE 5 BINDING

- **B5** (was M4) — get-video-playback-url accepts is_mr_walid() OR is_admin() (content-visible check, no subscription requirement) for staff QA preview, in addition to students.

### PHASE 6 BINDING

- **B4** (was M3) — PDF-only lessons can record progress with video_id = NULL (pinned to lesson); replacement guard applies only when a primary video exists.

### MISC — Cross-Phase Requirements (all B10)

- **B10** — A32/A34 reconcile session revocation wording ("revoke where feasible per spike; fallback = sign-in gate + RLS + EF checks").
- **B10** — RoleGuard caching residual documented (client role cache is never authoritative; refreshed on next sign-in).
- **B10** — create_manual_subscription doesn't require student grade (documented).
- **B10** — handle_new_user fail-closed runbook note (raises on missing required meta fields; admin-created users must include full_name, phone, guardian_phone, address).


## 23. إعداد قاعدة البيانات — نشر الوحدات (0038_unit_publish)

> ملاحظات جاهزة للنسخ والتنفيذ على قاعدة البيانات. الهدف: التأكد من تطبيق `0038_unit_publish.sql`، ونشر الوحدات المتسعّرة (لأن redeem_unit_code يرفض أي وحدة `status <> 'published'` برمز `unit_inactive`)، والتحقق من صف كل طالب.

### 23.1 التحقق من تطبيق 0038_unit_publish

التوقيع المتوقع (من 0038): `publish_unit(p_unit_id uuid)` و `hide_unit(p_unit_id uuid)` — كلاهما SECURITY DEFINER، محروس بدور (is_admin OR is_mr_walid OR is_teacher)، وممنوحان لـ authenticated فقط.

```sql
-- يجب أن تُرجع صفّين (publish_unit, hide_unit) إذا كان الـ migration مطبّقًا.
-- إن كانت النتيجة فارغة فالـ migration غير مطبّق: شغّل `supabase db push` أو نَفّذ الملف يدويًا ثم أعد التحقق.
SELECT proname FROM pg_proc WHERE proname IN ('publish_unit','hide_unit');
```

ملاحظة: بما أن `publish_unit` يتحقق من الدور عبر `auth.uid()` (دوال 0003)، فلا يمكن استدعاؤه من كنسول postgres مباشرة (auth.uid() = NULL → access_denied). الاستدعاء الصحيح له يكون من جلسة موظف (أزرار النشر في واجهة المنهج) أو من supabase-js بحساب mr_walid/admin.

### 23.2 Backfill — نشر الوحدات المتسعّرة فقط (DO block آمن)

القاعدة: وحدة مؤهلة للنشر = `status = 'draft'` و `deleted_at IS NULL` ولها صف `unit_pricing` نشط (`is_active = true`). التحديث المباشر آمن لأن:
- audit_trigger (0005) ملتصق بجدول units ويسجّل التغيير تلقائيًا (units.update مع changed_fields).
- no-op للوحدات غير المؤهلة (بلا رسائل خطأ)، مع NOTICE لكل وحدة.

```sql
DO $$
DECLARE
    v_unit record;
    v_count int := 0;
BEGIN
    FOR v_unit IN
        SELECT u.id, u.name
        FROM public.units u
        WHERE u.status = 'draft'
          AND u.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM public.unit_pricing p
              WHERE p.unit_id = u.id AND p.is_active = true
          )
        ORDER BY u.id
    LOOP
        UPDATE public.units
        SET status = 'published'
        WHERE id = v_unit.id;
        v_count := v_count + 1;
        RAISE NOTICE 'نشرت الوحدة: % (id: %)', v_unit.name, v_unit.id;
    END LOOP;

    RAISE NOTICE 'تم نشر % وحدة متسعّرة كان حالتها draft.', v_count;
END $$;
```

تحقق بعد التنفيذ — يجب أن تُرجع صفر وحدات draft متسعّرة:

```sql
SELECT u.id, u.name, u.status
FROM public.units u
WHERE u.status = 'draft'
  AND u.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.unit_pricing p WHERE p.unit_id = u.id AND p.is_active = true);
```

البديل عبر RPC الرسمي (إن رغبت بالسجل عبر publish_unit نفسه، من جلسة موظف — مثال supabase-js):

```js
// نفّذ من حساب mr_walid أو admin:
// const { error } = await supabase.rpc('publish_unit', { p_unit_id: unitId });
```

### 23.3 التحقق من صف الطالب (profiles ↔ auth.users)

```sql
-- الطلاب بلا صف (grade_id NULL) — يحتاجون إسناد صف يدويًا وإلا يفشل التفعيل برمز no_grade_assigned
SELECT u.id AS user_id, u.email, p.full_name, p.grade_id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.role = 'student'
  AND p.deleted_at IS NULL
  AND p.grade_id IS NULL
ORDER BY u.email;

-- الطلاب الذين grade_id يشير لصف محذوف/غير نشط (soft-delete في grades)
SELECT u.id AS user_id, u.email, p.full_name, p.grade_id, g.name AS grade_name, g.is_active, g.deleted_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.grades g ON g.id = p.grade_id
WHERE p.role = 'student'
  AND p.deleted_at IS NULL
  AND (g.id IS NULL OR g.is_active = false OR g.deleted_at IS NOT NULL)
ORDER BY u.email;

-- إجمالي الطلاب وأصحاب الصفوف السليمة (ملخص)
SELECT
  COUNT(*) FILTER (WHERE p.grade_id IS NOT NULL AND g.id IS NOT NULL AND g.is_active AND g.deleted_at IS NULL) AS students_ok,
  COUNT(*) FILTER (WHERE p.grade_id IS NULL) AS students_no_grade,
  COUNT(*) AS students_total
FROM public.profiles p
LEFT JOIN public.grades g ON g.id = p.grade_id
WHERE p.role = 'student' AND p.deleted_at IS NULL;
```
