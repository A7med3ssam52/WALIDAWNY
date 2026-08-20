# وليد عونى — Security Reference

**Phase 0 deliverable.** Extracted from BLUEPRINT.md §§5 (authz/RLS), 6.3 (redemption atomicity), 9 (PDF security), 14 (Edge Functions), 17 (security strategy), 18 (risks) and PLAN §§6–12. Binding architecture-gate requirements are flagged **[BINDING]**.

---

## 1. Threat Model

### 1.1 Assets

| Asset | Sensitivity | Primary controls |
|---|---|---|
| `auth.users` credentials/sessions | Critical | Supabase Auth; sign-in gate trigger; session revocation |
| `profiles` PII (phone, guardian_phone, address) | High | RLS own-row/staff; column-whitelist RPCs; PII-delta audit |
| `unit_purchases` / `unit_codes` | Critical (revenue) | RLS read-only; RPC-only DML; atomic redemption; price snapshots; students never see raw codes |
| `progress` | Medium | RPC-only writes; own-row SELECT; staff analytics |
| `lessons`/`units`/`grades` + assets metadata | Medium | RLS content gates |
| `lesson_videos` (Bunny) | High (revenue) | Private; signed tokenized URLs; server-resolved primary; status gating |
| `lesson_pdfs` (Storage) | High (revenue) | Private bucket; signed URLs; live `can_access_lesson` check |
| `notifications` | Low-Medium | Own-row; immutable except read state (mark-read RPC-only — [BINDING B2]) |
| `audit_logs` | High | Insert-only; admin-only SELECT; no UPDATE/DELETE |
| `app_settings` | Medium | Staff-scoped RLS; public surface limited to `get_public_settings()` |
| Secrets (service-role key, Bunny keys, signing keys, webhook secret) | Critical | Edge Function env only; CI secrets; never `VITE_*` |

### 1.2 Adversaries & threats

| Adversary | Representative threats |
|---|---|
| Unauthenticated attacker | Read protected data; forge webhooks; guess codes; brute-force auth |
| Student (incl. malicious) | IDOR on other students' data; self-escalation; double redemption; forced completion; purchase bypass; share signed URLs; mutate own notification content |
| Disabled/deleted student | Re-login; continue content access via stale session |
| Staff (mr_walid) | Read audit logs; escalate to admin; tamper pricing |
| External (Bunny/Supabase platform) | Missed/lost webhooks; schema drift |
| Compromised browser/extension | Exfiltrate secrets, tokens, or data in scope of the user's own grant |

### 1.3 Security principles

1. RLS is mandatory on all application tables, with `FORCE ROW LEVEL SECURITY` on all tables (belt & braces).
2. The browser is untrusted: localStorage is session persistence only; all authorization enforced server-side/database-side; never solve security problems by hiding buttons (PLAN §3).
3. SECURITY DEFINER functions: `SET search_path = public`, owned by `postgres`/BYPASSRLS **[BINDING B1]**, explicit grants, and no broad table DML privileges leaked.
4. Money/content-critical tables have **no direct DML policies** — RPC-only.
5. Defense-in-depth: sign-in gate + RLS + Edge Function profile checks + short-lived signed URLs.

---

## 2. Trust Boundaries

```
Browser (untrusted) ──JWT──▶ Supabase (Auth/Postgres/Storage)  ← authoritative RLS
Browser (untrusted) ──JWT──▶ Edge Functions ──service role──▶ Supabase/Bunny
Bunny ──webhook (shared token)──▶ bunny-video-webhook (no JWT; token-verified constant-time)
```

- Privileged operations (Bunny, signed URLs, code generation, audit export, service-role calls) exist **only** in Edge Functions (BP §1.4).
- Every privileged Edge Function re-checks role **and** caller profile `status='active'` + `deleted_at IS NULL` (A34).

---

## 3. Role Helper Functions (BP §5.1)

```sql
is_admin()    := (SELECT role = 'admin'    FROM profiles WHERE id = auth.uid());
is_mr_walid() := (SELECT role = 'mr_walid' FROM profiles WHERE id = auth.uid());
is_student()  := (SELECT role = 'student'  FROM profiles
                  WHERE id = auth.uid() AND status = 'active' AND deleted_at IS NULL);
```

STABLE, SECURITY DEFINER, `SET search_path = public`. `is_student()` returns **false** for disabled/deleted accounts → blocked everywhere content/progress/access logic is concerned. Not client-callable (REVOKEd; used inside RLS policies, RPCs and Edge Function service-role queries).

---

## 4. The `can_access_lesson` Gate (BP §5.3)

```sql
can_access_lesson(p_lesson_id uuid) RETURNS boolean  -- SECURITY DEFINER, STABLE
-- returns true IFF:
--   is_admin() OR is_mr_walid() OR is_teacher()   => lesson exists AND not soft-deleted (staff QA preview)
--   else is_student()                          (active, not deleted, role student)
--   AND lesson exists AND lesson.status = 'published' AND lesson.deleted_at IS NULL
--   AND its unit is 'published' AND unit.deleted_at IS NULL
--   AND unit.grade_id = (SELECT grade_id FROM profiles WHERE id = auth.uid())   -- live grade (H5)
--   AND grades.is_active = true            [BINDING B8]
--   AND (lesson.is_trial OR EXISTS an ACTIVE unit_purchases row for (student, unit))
```

- **Live grade check (H5):** a staff grade change changes the student's accessible grade set **immediately** — the next request re-evaluates against the new current grade; existing purchases are permanent and unaffected, only the accessible content set changes.
- **Access model:** a student gets a lesson via either a free trial lesson (`lessons.is_trial`, at most one per unit) or a permanent unit purchase (`unit_purchases.status = 'active'`). No time-limited access exists anywhere.
- Used by: `lesson_videos`/`lesson_pdfs` SELECT policies, `get-pdf-signed-url` EF, `get-video-playback-url` EF, `upsert_progress` guard, frontend access gate (informational only). All Edge Functions additionally verify active/not-deleted profile (defense-in-depth).

---

## 5. Sign-in Gate (A34, LOW-18)

```sql
CREATE FUNCTION block_sign_in_for_inactive_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.id
      AND (deleted_at IS NOT NULL OR status <> 'active')
  ) THEN
    RAISE EXCEPTION 'account_inactive_or_deleted';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER block_sign_in_for_inactive_accounts
BEFORE UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION block_sign_in_for_inactive_accounts();
```

Behavior and layering:

1. **Sign-in blocked at the source:** the trigger fires on the column Supabase Auth touches at every sign-in (`last_sign_in_at`); disabled/deleted accounts **cannot log in** and cannot obtain new sessions.
2. **Session hardening:** `disable_student()` / `soft_delete_student()` revoke the student's `auth.sessions` (service role) **where feasible per the Phase 1 spike (LOW-18)**; fallback = sign-in gate + RLS + Edge Function checks **[BINDING B10]**. Refresh tokens die immediately; already-issued access JWTs remain valid up to ~1h — closed by RLS (`is_student()`) and EF active-profile checks (MED-9).
3. **Defense-in-depth:** `is_student()` false when disabled/deleted → protected RLS paths close instantly even with a stale session.
4. **Trigger hygiene (R-A):** version-pinned (digest) + CI unit tests.
5. **Login UX (I6):** `account_inactive_or_deleted` mapped to friendly Arabic copy on the login form; never shown raw.

---

## 6. RLS Policy Matrix (BP §5.2)

Every table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` plus `FORCE ROW LEVEL SECURITY` on all tables. All expressions below are the exact WHERE clauses.

### `profiles`
- SELECT: `id = auth.uid()` (own) OR `is_admin() OR is_mr_walid()`
- INSERT: `is_admin()` (CHECK role-whitelist: role in enum, never student-created rows)
- UPDATE (student self-service): `USING (id = auth.uid() AND is_student()) WITH CHECK (id = auth.uid() AND role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id) AND grade_id = (SELECT p.grade_id FROM profiles p WHERE p.id = profiles.id) AND status = (SELECT p.status FROM profiles p WHERE p.id = profiles.id) AND deleted_at IS NULL)` — only the **four editable columns** (`full_name`, `phone`, `guardian_phone`, `address`) can change; role/grade/status/deleted_at pinned immutable in WITH CHECK; the app only performs self-edits through `update_own_profile()` RPC (SECURITY DEFINER column whitelist); direct table UPDATE never issued by the app
- UPDATE (staff): **no broad staff UPDATE policy** — all staff profile mutations are RPC-only (`set_student_grade`, `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `update_student_profile` [BINDING B3], `set_user_role`), all SECURITY DEFINER + audited
- DELETE: `is_admin()` only (hard-delete escape hatch; app uses soft delete)

### `grades`
- SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND deleted_at IS NULL AND is_active)` — **[BINDING B8]** students read active, non-deleted grades only
- INSERT/UPDATE/DELETE: `is_admin() OR is_mr_walid()`; WITH CHECK prevents escalation. Admin-only hard delete; app soft-deletes

### `unit_pricing`
- SELECT: `is_admin() OR is_mr_walid() OR is_teacher()` OR (student: own active grade, published unit, pricing active). anon has **no** direct SELECT — its only price surface is the RPC `get_public_unit_prices()` (never evaluates helper functions in a policy)
- INSERT/UPDATE/DELETE: RPC-only (`set_unit_price` — staff base price, audited; `set_platform_fee` — owner/admin global fee, audited); `FORCE ROW LEVEL SECURITY`

### `unit_codes`
- SELECT: `is_admin() OR is_mr_walid() OR is_teacher()` (students never see raw codes)
- INSERT/UPDATE/DELETE: RPC/Edge-Function-only (`create_unit_codes_internal` / `create_unit_codes_for_staff` / `revoke_unit_code`); `FORCE ROW LEVEL SECURITY`

### `unit_purchases`
- SELECT: `student_id = auth.uid()` (own history) OR `is_admin() OR is_mr_walid() OR is_teacher()`
- INSERT: **explicitly forbidden** (`unit_purchases_insert_via_rpc` policy `WITH CHECK (false)`) — writes only through SECURITY DEFINER `redeem_unit_code` (owner superuser bypasses RLS); UPDATE/DELETE: none
- Unique backstop: UNIQUE `(student_id, unit_id)` — double purchase of the same unit impossible

### `units`
- SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND grade access: grade_id IN (SELECT grade_id FROM profiles WHERE id = auth.uid()) AND status='published' AND deleted_at IS NULL)`
- INSERT/UPDATE/DELETE: `is_mr_walid() OR is_admin()`

### `lessons`
- SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND status='published' AND deleted_at IS NULL AND unit_id IN (SELECT id FROM units WHERE grade_id = (SELECT grade_id FROM profiles WHERE id = auth.uid()) AND status='published' AND deleted_at IS NULL))`
- INSERT/UPDATE/DELETE: `is_mr_walid() OR is_admin()`

### `lesson_videos`
- SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND can_access_lesson(lesson_id) AND status='ready' AND deleted_at IS NULL)` — students see **every ready, non-deleted video** of accessible lessons (0042 C2: the `is_primary` condition was removed for the multi-video UX; `deleted_at IS NULL` is now explicit since soft-deleted rows are no longer hidden by the primary filter); processing/pending/replaced videos invisible
- INSERT/UPDATE/DELETE: RPC/Edge-Function-only
- **[BINDING B9]** Partial unique `UNIQUE (lesson_id) WHERE is_primary AND deleted_at IS NULL` — exactly one primary per lesson; soft-delete of a video clears `is_primary` in the same transaction
- **0042 C1:** `source` CHECK (`'bunny'` ⇔ `bunny_video_id` present, `'youtube'` ⇔ `youtube_video_id` present) + partial unique `uq_lesson_videos_youtube (youtube_video_id) WHERE NOT NULL` (globally unique, soft-deleted rows included)

### `lesson_pdfs`
- SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND can_access_lesson(lesson_id) AND is_ready AND is_primary)` — students see **only the primary ready PDF** of accessible lessons (MED-7). Direct SELECT returns **metadata only**; content bytes require signed URL
- INSERT/UPDATE/DELETE: RPC/Edge-Function-only. `storage.objects` row-backed policies (0015/0021/0041): INSERT `pdfs_insert_row_backed` (pending-only) + SELECT mirror `pdfs_select_row_backed` (0021 H1, required by the Storage API's `INSERT ... RETURNING *`) + DELETE `pdfs_delete_row_backed` (0041 H1, staff-only `is_admin() OR is_mr_walid() OR is_teacher()` + row-backed — makes the delete-pdf EF's caller-token object removal actual, never arbitrary bucket content)

### `lesson_boards`
- SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND can_access_lesson(lesson_id) AND is_ready AND deleted_at IS NULL)` — staff see all non-deleted rows; students see only ready, non-deleted boards of accessible lessons (gallery style, no `is_primary`). Direct SELECT returns metadata; image bytes via signed URLs from `get-board-signed-urls`.
- INSERT/UPDATE/DELETE: RPC/Edge-Function-only. `storage.objects` row-backed policies (0036/0041): INSERT `boards_insert_row_backed` (0015 pattern: `name ~ '^uuid/uuid\.(jpg|jpeg|png|webp)$'` + EXISTS on non-deleted `lesson_boards` row, no `is_ready` filter) + SELECT mirror `boards_select_row_backed` (0041 C1 — the Storage API uploads with `INSERT ... RETURNING *`, which requires a SELECT policy covering the inserted row; same scope as the INSERT policy) + DELETE `boards_delete_row_backed` (0041 H1 — staff-only `is_admin() OR is_mr_walid() OR is_teacher()` + row-backed, makes the delete-board EF's caller-token object removal actual). No UPDATE policy and no anon surface on `storage.objects`; `storage.objects` stays ENABLE-without-FORCE (0021 H2) so the service role is never subject to RLS on its own bookkeeping.

### `progress`
- SELECT: `student_id = auth.uid() OR is_mr_walid() OR is_admin()`
- INSERT/UPDATE/DELETE: RPC-only (`upsert_progress`); `WITH (NO POLICY)`

### `notifications`
- SELECT: `user_id = auth.uid()`
- UPDATE: **[BINDING B2]** direct UPDATE **REVOKEd from `authenticated`** (mark-read only via RPCs). The RLS UPDATE policy (own-row `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`) stays as belt-and-braces — it confines any hypothetical re-granted UPDATE to own rows. Note: PostgreSQL has no column-scoped policies, so column immutability of `title`, `body`, `type`, `dedup_key`, `entity_type`, `entity_id` is enforced purely by the REVOKE (re-asserted in 0020; pgTAP asserts no UPDATE privilege, table- or column-level, for `anon`/`authenticated`)
- INSERT: RPC/system-only. DELETE: none

### `audit_logs`
- SELECT: `is_admin()` ONLY. INSERT: trigger/system-only (no user policy). UPDATE/DELETE: none

### `app_settings`
- SELECT: `is_admin() OR is_mr_walid()` (frontend staff reads WhatsApp via this; the public landing uses `get_public_settings()` — anon-safe, no direct access)
- UPDATE/INSERT: `is_admin() OR (is_mr_walid() AND key LIKE 'whatsapp%')`

---

## 7. Edge Function Security Model (BP §14)

| Function | JWT verification | In-function authorization |
|---|---|---|
| `create-video-upload-session` | default (`verify_jwt`) | `is_mr_walid() OR is_admin() OR is_teacher()` + active/not-deleted; multi-session per lesson allowed (0042 — the one-pending-upload orphan rule was removed); `action=cancel` releases an abandoned session |
| `bunny-video-webhook` | `--no-verify-jwt` (public) | **Token check** — constant-time compare (`x-webhook-token` header or `?token=` URL) against `BUNNY_WEBHOOK_TOKEN` (§8.6/R17). No Bunny-side signature secret. Never trusts payload alone; transitions validated again in `set_video_status()`; ready only accepted with a fresh metadata fetch |
| `get-video-playback-url` | default | student → `can_access_lesson()` + active/not-deleted; **[BINDING B5]** `is_mr_walid() OR is_admin() OR is_teacher()` → content-visible check (lesson exists, not soft-deleted), **no purchase/trial requirement** — staff QA preview. Resolves the lesson's primary `ready` video by default, or the `video_id` query target (must belong to the lesson, not deleted, ready, `source='bunny'` — a YouTube target is rejected with `youtube_video`; RLS keeps a student scoped to their primary ready row); returns IP-locked HS256 directory token URL (query form, TTL 20 min — S3) |
| `get-video-thumbnail-url` | default | same gates as `get-video-playback-url`; returns short-lived IP-locked signed `thumbnail.jpg` (same directory token). The raw `thumbnail_url` column is never sent to clients |
| `get-pdf-signed-url` | default | student only (S7) + active/not-deleted; accepts `lesson_id` only; server resolves primary `ready` PDF (MED-7); `can_access_lesson()` live; service-role `createSignedUrl` TTL 10–15 min |
| `upload-pdf` | default | `is_mr_walid() OR is_admin()` + active/not-deleted; MIME/size validation; `createSignedUploadUrl` (I4) |
| `generate-unit-codes` | default | `is_admin() OR is_mr_walid()` + active/not-deleted; validates pricing (active) + count cap (≤500); calls `create_unit_codes_for_staff()` → `create_unit_codes_internal()` (pgcrypto, unambiguous charset, uppercase — A22) |
| `export-audit-log` | default | `is_admin()` + active/not-deleted |
| `upload-board` | default | `is_mr_walid() OR is_admin() OR is_teacher()` + active/not-deleted; MIME/size validation (image/jpeg|png|webp, ≤10 MiB); `createSignedUploadUrl` on `boards` |
| `delete-board` | default | `is_mr_walid() OR is_admin() OR is_teacher()` + active/not-deleted; storage remove best-effort + `delete_board_upload_record` (soft-delete) |
| `get-board-signed-urls` | default | **student** → `can_access_lesson()` + active/not-deleted; **mr_walid/admin/teacher** → content-visible check (lesson exists, not soft-deleted), **no purchase/trial requirement** — staff QA preview. Returns signed URLs for all ready, non-deleted boards ordered by sort_order. |
| `recheck-video-states` | internal endpoint (service role) | `verify_jwt = false` + `x-internal-token` header compared in constant time against `INTERNAL_JOB_TOKEN` — invoked by scheduling chain only |

Common rules:
- `supabase.auth.getUser()` on the `Authorization: Bearer` JWT — never trust decoded claims alone.
- Role check via service-role query to `profiles` (or SQL `can_access_lesson`), plus `status='active'` and `deleted_at IS NULL` (A34).
- Secrets via `Deno.env` only; `supabase secrets set` / CI; never in `VITE_*`.
- Service-role client created inside the function only; never returned to the browser.

---

## 8. Grant Matrix (MED-6; enforced by pgTAP grant test)

### 8.1 Revoked (no client grants — `REVOKE EXECUTE FROM anon, authenticated`)

`create_unit_codes_internal`, `set_video_status` (internal; no public variant exists), `set_video_status_ef` (if ever introduced, same treatment), `recheck_video_states`, `youtube_video_id_from_url` (0042 internal helper — id extraction is server-side only), `notify_new_content`, `audit_log`, `handle_new_user`, `block_email_change`, `block_sign_in_for_inactive_accounts`, `set_updated_at`, `is_student`, `is_mr_walid`, `is_admin`, `is_teacher`, `get_current_role`, `can_access_lesson` (used inside RLS/EFs, not callable by clients).

### 8.2 Client-callable allowlist (`GRANT EXECUTE TO authenticated`; `anon` additionally for `get_public_settings`)

`update_own_profile`, `update_student_profile` **[BINDING B3]**, `redeem_unit_code`, `get_my_unit_purchases`, `get_my_lesson_access`, `upsert_progress`, `mark_notification_read`, `mark_all_notifications_read`, `set_student_grade`, `set_lesson_trial`, `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `list_trash`, `create_unit`, `update_unit`, `delete_unit`, `restore_unit`, `create_lesson`, `update_lesson`, `publish_lesson`, `hide_lesson`, `soft_delete_lesson`, `restore_lesson`, `create_grade`, `update_grade`, `delete_grade`, `restore_grade`, `set_app_setting`, `set_unit_price`, `set_platform_fee`, `get_platform_fee`, `list_unit_pricing`, `list_codes_by_unit`, `revoke_unit_code`, `create_unit_codes_for_staff`, `list_all_unit_purchases`, `unit_purchase_stats`, `set_user_role`, `set_role_by_email`, `finalize_pdf_upload`, `create_pdf_upload_record`, `create_video_upload_record`, `delete_video_upload_record`, `add_youtube_video` (0042, staff-guarded), `delete_lesson_video` (0042, staff-guarded), `get_dashboard_stats`, `list_audit_logs`, `count_audit_logs`, `get_public_settings`, `list_active_grades`. (anon additionally: `get_public_settings`, `list_active_grades`, `get_public_unit_prices`, `get_platform_fee`.)

Everything else is REVOKEd; the allowlist is enforced by a pgTAP grant test.

### 8.3 Ownership **[BINDING B1]**

All SECURITY DEFINER functions (including trigger functions) MUST be owned by `postgres` (superuser) or a BYPASSRLS role. A pgTAP ownership test asserts this for every function marked SECURITY DEFINER.

---

## 9. Storage Security (BP §3.7, §9)

- Buckets `pdfs`, `audit-exports`, and `boards`: **private**, storage RLS enabled, **no anonymous policies**, authenticated users have **no direct object policies**.
- Every object operation (upload/read/delete) authorized inside Edge Functions via signed URLs (service role).
- Upload: staff-only signed **upload** URLs (`createSignedUploadUrl` — I4). Read: student-only signed download URLs after `can_access_lesson`; staff preview bypasses gate for boards. Export: admin-only signed URLs.
- Short TTLs: video 20 min; PDF 10–15 min; boards 900 s (15 min); audit export ~10 min.
- Path convention: PDFs `{lesson_id}/{uuid}.pdf`; Boards `{lesson_id}/{uuid}.{ext}` (jpg|jpeg|png|webp); original filenames sanitized.

---

## 10. Purchase Security (BP §6)

### 10.1 Atomic redemption (the race requirement)

`redeem_unit_code` (SECURITY DEFINER) executes in a single transaction:
1. `pg_advisory_xact_lock(hashtext('wldn_redeem_unit:' || COALESCE(v_code, '')))` — serializes per code.
2. `SELECT ... WHERE code = v_code FOR UPDATE` — row lock (belt & braces).
3. Re-validate **inside** the transaction: `is_student()`; code `available` + not revoked; pricing exists + `is_active`; unit exists, published, not deleted (`unit_inactive` otherwise); student has a grade (`no_grade_assigned`); unit belongs to the student's grade (`unit_not_in_student_grade`); no active purchase of the unit (`unit_already_purchased`).
4. Insert `unit_purchases` with **price snapshot** from `unit_pricing` (P12); mark code `used` (used_at/used_by); insert `unit_activated` notification (`ON CONFLICT (dedup_key) DO NOTHING`); write audit `unit_purchase.create`; COMMIT.

Two simultaneous redemptions: exactly one commits; the second sees `status='used'` → `code_already_used`. Double purchase is impossible (advisory lock + FOR UPDATE + UNIQUE `(student_id, unit_id)` backstop).

### 10.2 Permanent access

- Purchases never lapse: `unit_purchases.status='active'` is permanent — no time limit, no job required, no countdown.
- Live authority: `can_access_lesson` evaluates the purchase/trial check at request time.
- Access is grade-bound at redemption time (unit must belong to the student's current grade); the check re-evaluates the student's current grade on every request (H5).
- History: purchases and code usage are never deleted; rows remain visible to the owner and staff.

### 10.3 Revocation

- `revoke_unit_code`: `available`/`used` → `revoked` (audited); revoking a used code does **not** cancel the created purchase (history preserved, documented rule).

### 10.4 Code generation

`create_unit_codes_internal` via Edge Function (`create_unit_codes_for_staff` staff-guarded wrapper): `pgcrypto gen_random_bytes`, unambiguous charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O, 1/I — A22), stored uppercase, CHECK-constrained (`code ~ '^WLDN-[A-Z0-9]{8,12}$'`), lookups normalized to uppercase (L1). Students never see raw codes (RLS).

---

## 11. Progress Safety (BP §11)

- Writes only through `upsert_progress` (SECURITY DEFINER, RPC-only): guards `is_student()` + `can_access_lesson()`; clamps position/percent server-side (A24); client can never set `is_completed` directly.
- Deterministic rules: percent monotonic (`GREATEST`); completion irreversible at ≥90 (A12) — single exception: video replacement reset (A11/§7.4); position last-write-wins (A26); row-level UPSERT `ON CONFLICT (student_id, lesson_id)`; row locks serialize concurrent writes.
- **[BINDING B4]** Video pinning: when a primary `ready` video exists, stale-video writes are rejected (`progress_stale_video`); PDF-only lessons (no primary video) record progress with `video_id = NULL`, pinned to the lesson — the replacement guard applies only when a primary video exists.
- Replacement reset: single atomic statement zeroing `position_seconds`, `percent_completed`, `is_completed` and re-pinning `video_id` for rows pointing at the replaced video only, in the same transaction as the primary flip.

---

## 12. Secret Hygiene

| Secret | Location | Never in |
|---|---|---|
| Service-role key | Edge Function env, CI | browser, `VITE_*`, repo |
| `BUNNY_API_KEY` | Edge Function env | browser |
| `BUNNY_SIGNING_KEY` (token auth) | Edge Function env | browser |
| `BUNNY_WEBHOOK_TOKEN` | Edge Function env | browser, logs |
| Seed admin password | CI secret | repo, docs |
| Publishable (anon) key | `VITE_SUPABASE_PUBLISHABLE_KEY` | — (safe for browser) |

CI secret scan; `.env.example` documents names only, empty values; `supabase secrets set` for Edge Functions.

## 12.5 Browser Hardening (Phase 11)

- **CSP (production build only):** `inject-csp` plugin in `vite.config.ts` adds a meta CSP to the built `index.html` — `default-src 'self'`; `script-src 'self'` (verified: no inline scripts in the bundle); `style-src 'self' 'unsafe-inline'` + Google Fonts; `font-src` gstatic; `img-src`/`media-src` `self data: blob:` + `*.b-cdn.net` (Bunny pull zone); `connect-src` `self` + `*.supabase.co` + `wss://*.supabase.co` + `video.bunnycdn.com` (TUS) + `*.b-cdn.net`; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`. Custom Bunny hostname (non-`*.b-cdn.net`) must be added to the plugin.
- **Internal EFs are CORS-free:** `bunny-video-webhook`, `recheck-video-states` reply with `noCors` responses (no `Access-Control-Allow-Origin` at all) and reject OPTIONS with 405 — no browser-origin surface is advertised on server-to-server endpoints. Client-facing EFs keep the permissive CORS (platform default for `/functions/v1/*`; required for browser calls).
- **Secret hygiene confirmed:** `.env.functions.local` carries live secrets but is LOCAL-ONLY (header note) and gitignored (`.gitignore`); `.env.example` holds names with empty values.

---

## 13. IDOR Posture

- RLS-scoped SELECTs (`id = auth.uid()` ownership patterns) on every student-owned table.
- UUID PKs (unguessable).
- Entity ownership re-checked in every RPC (`mark_notification_read`, `upsert_progress`, etc.).
- Edge Functions re-derive access from the DB — never trust client IDs: `can_access_lesson` is the single gate; PDF/video EFs accept `lesson_id` only and resolve the primary asset server-side (MED-7/A2).
- Trash/restore paths staff-only via `list_trash`/`restore_student` RPCs.

---

## 14. Rate Limiting

- Supabase Auth built-in limits on register/login.
- Redemption serialized per-code by advisory lock (correctness, not just rate).
- Edge Functions add simple per-user caps (e.g. signed-URL issuance) via DB counters or Supabase platform limits — implementation detail, documented.
- Storage signed URL issuance is bounded by request TTLs.

---

## 15. Audit Immutability

- `audit_logs` insert-only: no INSERT user policy (trigger/system-only), no UPDATE/DELETE policies for any role, SELECT admin-only.
- Trigger inventory fixed (MED-8): profiles, grades, units, lessons, lesson_videos, lesson_pdfs, unit_pricing, unit_codes, unit_purchases, app_settings (plus exams/lesson_comments added by Phases 6–7); `progress`/`notifications` excluded.
- PII-delta handling: profile metadata excludes sensitive values; `update_own_profile` logs only changed column names.
- Explicit `audit_log()` calls inside SECURITY DEFINER RPCs for non-trigger events.

---

## 16. Residual Accepted Risks (documented, not defects)

| # | Residual risk | Accepted because / mitigation |
|---|---|---|
| S3/R9 | Signed video URLs valid 20 min after issuance | Short TTL + live access check at every issuance; sharing window bounded |
| R10 | PDF signed URLs valid 10–15 min post-issuance | Same model; short TTL; client session end |
| LOW-13 | `account_inactive_or_deleted` reveals account existence (enumeration) | Required for clear Arabic UX (I6); UUID-keyed, unguessable accounts |
| MED-9 | Already-issued access JWTs valid up to ~1h after disable/delete | RLS `is_student()` + EF active-profile checks close content paths instantly |
| A13/R15/R16 | Email immutability has no in-app exception; Supabase dashboard/direct SQL changes blocked by trigger | Documented SQL escape hatch runbook (email change via direct SQL by superuser support path) |
| LOW-11 | Direct SQL hard delete CASCADEs history (profiles → unit_purchases/notifications; grades → units → lessons → videos/pdfs/progress) | Runbook mandates soft-delete first; hard delete only after explicit data-archival decision |
| LOW-18 | `DELETE FROM auth.sessions` from Postgres may be infeasible | Phase 1 spike; fallback = sign-in gate + RLS + EF checks **[BINDING B10]** |
| R4/A19 | pg_cron/pg_net availability unverified until Phase 1 | Unified 3-link scheduling chain; link verified in Phase 1 |
| R17 | Bunny webhook signature feature unavailable on this account | Pre-checked at Phase 5; implemented = shared token in webhook URL + constant-time compare + payload validation |
| RoleGuard | Frontend role cache may be stale within a session after a server-side role change | Cache never used for authorization; RLS/EFs authoritative; refreshed on next sign-in **[BINDING B10]** |
| LOW-12 | `handle_new_user` fails closed on missing meta fields — admin-created users via dashboard require all four fields | Intended: no partial/orphan profiles; documented runbook **[BINDING B10]** |
| LOW-14 | `v_lesson_access` returns empty for staff | By design (student-facing); staff use dedicated views |
| LOW-15 | `get_public_settings` exposed to anon | Returns only whatsapp + platform_name; nothing else leaks |

---

## 17. Hardening checklist (Phase 9)

- RLS review; IDOR testing (cross-student reads, staff→admin, admin→audit).
- Secret scan in CI; storage access testing (direct object URL attempts, unsigned reads).
- Access bypass testing (no purchase / no trial, disabled/deleted; stale signed URLs).
- Role escalation testing (`set_user_role` path; RLS WITH CHECK pinning).
- Code redemption race-condition testing (harness, TESTING.md §8).
- Webhook forgery testing (unsigned/forged payloads → 401/403).
