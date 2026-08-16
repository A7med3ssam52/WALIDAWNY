# UI-UX-BLUEPRINT.md — Design & UX Blueprint for the UI/UX Refinement

> Status: ready for implementation
> Inputs: `PLAN.md` (functional rules), `STYLE.md` (visual rules), `UI-AUDIT.md` (current-state findings), plus the live test contract (184 tests).
> This document is the single source of truth for all visual/UX decisions. Deviations must be approved and documented here first.

---

## 1. Design Direction

**"Premium Arabic-first EdTech"** — a calm, confident, learning-focused platform.

- Modern, minimal, premium educational SaaS aesthetics (per `STYLE.md §4`), never a generic admin template.
- Arabic-first typography and RTL-correct layout throughout.
- Mobile-first: every screen is designed from the small viewport up (per `STYLE.md §2`).
- One restrained primary brand color; semantic colors only for semantic communication (`STYLE.md §5`).
- Clear hierarchy on every screen: Primary action → Primary info → Secondary info → Supporting info (`STYLE.md §4`).
- Subtle, purposeful motion that respects `prefers-reduced-motion` (`STYLE.md §18`).
- Functionality is sacred: every screen keeps its current behavior, RPC calls, test-ids, accessible names, and Arabic strings (see §13 Protected Contracts).

### Design keywords
Soft surfaces · airy spacing · generous radius · one accent color · crisp Arabic type · calm tables · friendly empty states · confident primary actions.

---

## 2. Recorded Decisions (D#)

| ID | Decision | Rationale | Test/contract impact |
|---|---|---|---|
| D1 | **Fonts**: Google Fonts — **Cairo** (display/headings, 700/800) + **Tajawal** (body/UI, 400/500/700). Loaded via `<link>` with preconnect in `index.html`; `font-display: swap`. | Both are modern Arabic-first families with Latin coverage (the app mixes Arabic + Latin digits). Cairo gives confident headings; Tajawal is crisp for UI. Replaces Segoe UI/Tahoma (`UI-AUDIT §4.3`). | None (no font assertions in tests). |
| D2 | **Icons**: `lucide-react` (tree-shaken, consistent 24px stroke set) + **one custom WhatsApp glyph** (brand icon absent from lucide). All arrows use the shared `DirectionalArrow` component with `rtl:rotate-180` logical flipping (`STYLE.md §17`). | One consistent icon system; removes literal `←`/`→` glyphs (`UI-AUDIT §4.5`, §7.2). Tree-shakable → no meaningful bundle cost. | None. Icon is always decorative (`aria-hidden`) with adjacent text labels. |
| D3 | **Brand color**: emerald retained (`#059669` family) but **tokenized**; interactive/link/small-text usages move to `emerald-700` (`#047857`, ≈5.2:1 on white) to pass WCAG AA (`UI-AUDIT §8.3`). | Rebrand-safe tokens (`STYLE.md §5`); contrast fix without changing brand feel. | None. |
| D4 | **Navigation architecture** (`STYLE.md §7`): public = topbar; **student** = compact topbar + **bottom nav on mobile**, structured horizontal nav on desktop; **Mr. Walid/Admin** = **persistent sidebar (right edge, RTL) + topbar on desktop**, **drawer on mobile**. Sidebar replaces the wrap-prone `StaffNav`/`AdminNav` bar. | Matches STYLE §7 exactly; fixes wrap/touch issues (`UI-AUDIT §6.2`, §8.9). | Nav labels kept identical (e.g. `المنهج الدراسي`, `الإشعارات`). `NavLink` stays used → `aria-current="page"` preserved. |
| D5 | **Tables**: new `Table` primitive with two densities. `density="normal"` business tables (students, trash, grades, codes, curriculum-related, pricing, purchases) become **responsive stacked cards below `md`**; `density="dense"` (audit log) keeps **horizontal scroll** (admin density + pagination). | `STYLE.md §9` requires an intentional mobile strategy, not desktop tables crammed in (`UI-AUDIT §6.1`). Audit stays scrollable like most admin tools. | `data-testid` stays on the row/card wrapper (`student-row-*`, `audit-row-*`…). Accessible row names unchanged. |
| D6 | **Modal**: behavioral upgrade (focus trap, Esc, scroll lock, backdrop click, initial focus, `aria-describedby`, `data-state`, mobile bottom-sheet below `sm`) keeping the same public API + `role="dialog"`/`aria-modal`. | `STYLE.md §9` modals; fixes `UI-AUDIT §8.1`, §5.12. | Same visible attributes as today. |
| D7 | **Toast roles**: success/info/warning → `role="status"`; **error → `role="alert"`** (assertive). One test (`Toast.test.tsx` family) may need a synchronized, review-approved update if it queries a single `status` role. | `STYLE.md §9`; fixes `UI-AUDIT §8.2`. Error toasts must be assertive. | **Executed (Phase 1)**: 4 tests updated — `LoginPage.test.tsx` (×2) and `RegisterPage.test.tsx` (×2) now scope `getByRole('alert')` to the form via `within(...)`, since the inline error and the error toast are both alerts now. Reviewed. |
| D8 | **Pre-existing build failure fixed in Phase 1**: the 7 TS errors in `AuditLogPage.test.tsx` (99–100) and `src/test/supabase-mock.ts` (1026–1043) are fixed with **type-only changes** (assertions/mocking types) that preserve behavior. | Unblocks the `tsc`/`build` gate that every Review agent depends on (`UI-AUDIT §11`). | Tests must remain 184/184 green. |
| D9 | **Out of scope (documented)**: Forgot Password / Password Reset screens (`STYLE.md §11`) are **not** implemented — `PLAN.md §2` defers them to a future phase. Login/Register/Disabled/Expired experiences are polished only. | PLAN.md overrides STYLE.md on functional scope. | No new routes. |
| D10 | **Code splitting (Phase 9)**: route-level `React.lazy` for walid/admin pages (heaviest: `LessonAssetsPage`, walid `CurriculumPage`) + dynamic `import('hls.js')` inside `VideoPlayer`. | `STYLE.md §20` / `UI-AUDIT §12`. | Router behavior unchanged (same paths, same guards). |
| D11 | **Test infra (Phase 1, executed)**: `testTimeout` raised 5000→15000 ms in `vite.config.ts`. UI-flow tests measure 2.4–3.4 s each on this machine; 5 s was flaky (deterministic timeouts under load, not caused by Phase 1 changes). **Amended (Phase 6)**: current value is 30000 ms (raised by a sub-agent during Phase 5 fix rounds without recording); Phase 6 also added `maxWorkers: 1` + `poolOptions.forks.singleFork: true` to eliminate CPU-contention flakes (full suite now 77 s deterministic). | Reliability of the test gate for all phases and review agents. | Test behavior unchanged. |

---

## 3. Design Tokens (implemented in `src/index.css` via Tailwind v4 `@theme`)

### 3.1 Colors (semantic — `STYLE.md §5`)

| Token | Value | Contrast on white |
|---|---|---|
| `--color-primary` | `#059669` (emerald-600) | 3.6:1 (large/brand only) |
| `--color-primary-strong` | `#047857` (emerald-700) | **5.2:1** (buttons, links, small text) |
| `--color-primary-foreground` | `#ffffff` | on strong: 5.2:1 ✓ |
| `--color-primary-soft` | `#ecfdf5` (emerald-50) | badge/skeleton tint |
| `--color-secondary` | `#f1f5f9` (slate-100) | — |
| `--color-secondary-foreground` | `#1e293b` (slate-800) | 10.7:1 ✓ |
| `--color-background` | `#f8fafc` (slate-50) | page background |
| `--color-surface` | `#ffffff` | cards, panels |
| `--color-surface-muted` | `#f1f5f9` | inset rows, skeletons |
| `--color-foreground` | `#0f172a` (slate-900) | headings |
| `--color-foreground-muted` | `#475569` (slate-600) | body-secondary ✓ |
| `--color-foreground-subtle` | `#64748b` (slate-500) | captions ✓ (4.8:1) |
| `--color-border` | `#e2e8f0` (slate-200) | dividers |
| `--color-border-muted` | `#f1f5f9` | inner dividers |
| `--color-success` | `#059669` | success |
| `--color-warning` | `#d97706` (amber-600) | warning (4.6:1 ✓) |
| `--color-error` | `#e11d48` (rose-600) | error (4.5:1 ✓) |
| `--color-info` | `#0284c7` (sky-600) | info (4.7:1 ✓) |

Rules: primary is the **only** accent; semantic colors only for their meaning; never use color as the sole state signal (always pair with icon/text) (`STYLE.md §19`). Status badges use tinted surfaces (`bg-{color}-50` + `text-{color}-700` + border) for softness.

### 3.2 Typography (`STYLE.md §5`)

| Token | Family / Weight / Size / Line-height | Use |
|---|---|---|
| Display | Cairo 800 / `text-3xl sm:text-4xl` / 1.3 | Landing hero, 404 |
| H1 | Cairo 800 / `text-2xl sm:text-3xl` / 1.35 | Page titles |
| H2 | Cairo 700 / `text-xl` / 1.4 | Card/section titles |
| H3 | Cairo 700 / `text-lg` / 1.45 | Card subtitles, dialogs |
| H4 | Cairo 600 / `text-base` / 1.5 | Group labels |
| Body Large | Tajawal 400 / `text-lg` / 1.8 | Lead paragraphs |
| Body | Tajawal 400 / `text-base` / 1.8 | Default text |
| Body Small | Tajawal 400 / `text-sm` / 1.7 | Secondary text |
| Caption | Tajawal 400 / `text-xs` / 1.7 | Timestamps, metadata |
| Label | Tajawal 500 / `text-sm` / 1.5 | Form labels, table headers |
| Button | Tajawal 600 / `text-sm sm:text-base` / 1 | Buttons |
| Numeric/Mono | `ui-monospace`, `dir="ltr"` | Codes, IPs, IDs, timestamps |

Arabic line-heights are generous (1.7–1.8) for diacritic readability (`STYLE.md §5`). Use `text-balance` on headings. Set `body { font-family: Tajawal…; letter-spacing: 0 }` (Arabic has no letter-spacing).

### 3.3 Spacing / Radius / Shadows (`STYLE.md §5`)

- **Spacing scale**: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96` (Tailwind defaults already match — no change).
- **Radius**: `sm` 6px (inputs, buttons), `md` 10px (cards), `lg` 16px (modals, sheets, large surfaces), `xl` 20px (bottom-sheet top corners), `full` pills.
- **Shadows**: `shadow-subtle` (resting cards), `shadow-medium` (hover/popovers), `shadow-elevated` (modals, drawer, toasts). Cards use subtle by default; no strong shadows everywhere.
- **Z-index scale**: content 0 · sticky header 40 · sidebar/drawer 50 · modal overlay 100 · toast 200 · tooltip 300.
- **Container widths**: content `max-w-5xl`; auth `max-w-md`; landing `max-w-6xl`; dense admin content `max-w-7xl`. Always `mx-auto px-4 sm:px-6`.
- **Breakpoints**: `sm 640 / md 768 / lg 1024 / xl 1280` (matches `STYLE.md §2` exactly — defaults unchanged).
- **Component sizes**: buttons/inputs `h-11` (44px touch) mobile, `h-10` desktop; icon buttons 44×44 mobile / 40×40 desktop; table action cells ≥40px hit area.

---

## 4. Layout System (`STYLE.md §6`)

Tailwind utilities as primitives (no new JS components needed):
- `PageContainer` (max-w + px), `Section` (`space-y-*`), `Stack` (`flex flex-col gap-*`), `Inline` (`flex flex-wrap gap-*`), `Grid` (`grid gap-*` + responsive cols).
- `Card` = surface + `rounded-md` + `border` + `shadow-subtle`, consistent padding (`p-4 sm:p-6`), optional title/subtitle/actions.
- `PageHeader` (inside `LayoutShell`): title (H1) + description (muted) + primary action (left-aligned action area = inline-end in RTL).
- **App shell**: `LayoutShell` owns topbar + nav slot + `<main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6">`.

---

## 5. Navigation (`STYLE.md §7`, D4)

### Public (topbar, sticky, `z-40`)
Brand (logo mark + name) · [الرئيسية] · [المنهج الدراسي] · [تسجيل الدخول] (ghost) · [إنشاء حساب] (primary). Mobile: brand + [تسجيل الدخول] (primary) + hamburger → sheet with the same links + register. WhatsApp stays in hero/footer. *(Landing gains a footer: brand, quick links, WhatsApp, copyright.)*

### Student
- **Desktop (≥lg)**: topbar with brand + primary links (`لوحة التحكم`, `المنهج الدراسي`, `الوحدات`, `الملف الشخصي`) + notification bell (unread badge) + name/role + sign-out. No sidebar (5 items fit a topbar).
- **Mobile (<lg)**: compact topbar (brand, bell w/ unread badge, avatar menu) + **bottom nav** (5 items, `z-40`): لوحة التحكم · المنهج الدراسي · الوحدات · الإشعارات · الملف الشخصي — icons + labels, active state tinted + `aria-current="page"`. Content gets `pb-24` so nothing hides behind it. *(Also fixes the orphaned profile/password pages — they now render inside the shell.)*

### Mr. Walid (desktop ≥lg)
Persistent right-side **sidebar** (brand at top, nav below, sign-out at bottom): لوحة التحكم · الطلاب (sub: سلة المحذوفات) · الصفوف الدراسية · المنهج الدراسي · الأسعار · أكواد التفعيل. Main area = compact topbar (page title context + name) + content.
**Mobile**: compact topbar + hamburger → **drawer** (slide from right, `z-50`, focus-trapped, Esc/backdrop close); same items; active item tinted.

### Admin
Same sidebar pattern (denser): **لوحة التحكم** · سجل النشاطات · الأدوار والصلاحيات, then divider + walid section (الطلاب، الصفوف، المنهج، الأسعار، الأكواد).

All nav links keep their current `NavLink` semantics (→ `aria-current="page"`).

---

## 6. Component Specifications (`STYLE.md §9`)

### 6.1 Button
Variants: `primary` (emerald-700 bg), `secondary` (white + border), `outline` (primary text + primary border), `ghost`, `destructive` (rose-600), `link`. Sizes: `sm`, `md` (default `h-10`), `lg` (`h-11`). States: default/hover/pressed/`focus-visible` ring/`loading` (spinner + `aria-busy`, disables pointer)/disabled. Optional `icon` (decorative) + `iconPosition`. Backward-compatible with current `Button` props (variant, type, onClick, disabled, loading, className, children…).

### 6.2 Input / Select / Textarea (field family)
Every field: visible `label`, control, optional `hint`, `error` (Arabic, `role="alert"`), `aria-invalid` + `aria-describedby` wiring. States: default/focus/filled/error/success (icon)/disabled/loading. Placeholders never carry meaning alone. `Select` wraps native `<select>` (keeps `combobox` semantics + current tests). Inputs: `rounded-sm`, `h-10`/`h-11`, `border`, focus ring primary-strong.

### 6.3 Card
`title`, `description`, `actions`, `padding="sm|md"`, `interactive` (hover lift subtle). Consistency: one radius, one border, `shadow-subtle`.

### 6.4 Badge (replaces 9+ hand-rolled pills)
`variant`: success/warning/error/info/neutral + `outline` option. Mapping (`STYLE.md §16`): active→success · published→success · completed→success · in-progress→info · pending→warning · hidden→warning · draft→neutral · inactive→neutral · expired→error · locked→neutral · deleted→error · used→neutral · revoked→error · disabled→warning (amber "موقوف" is intentionally more communicative than neutral; reviewer-accepted) · status `موقوف`→warning. Same status always looks the same. Icon optional (e.g. check, clock).

### 6.5 Table (D5)
`Table`/`TableRow`/`TableCell`/`TableHead` primitives. `density="normal"`: stacked-card rows < `md` (each cell becomes label:value pair; `data-testid` + row name preserved); `density="dense"` (audit): horizontal scroll w/ `overflow-x-auto`, sticky inline-start column optional. All tables keep semantic `<table>` + `role="table"`.

### 6.6 Modal (D6)
`isOpen`, `onClose`, `title`, `description?`, `children`, `footer` (actions), `variant="default|destructive|form"`, `size="sm|md|lg"`. Behavior: focus trap (first focusable on open, restore on close), Esc close, body scroll lock, backdrop click close (not for destructive), `role="dialog" aria-modal="true" aria-labelledby aria-describedby`, mobile: bottom sheet < `sm` (full-width, rounded-t-lg). Entrance: fade + scale 200ms (respects reduced motion).

### 6.7 Toast
`showToast(message, type)` API unchanged; types `success|info|warning|error` with icons. Error → `role="alert"` (D7), others `role="status"`; `aria-live="polite"` container; auto-dismiss (success/info 4s, warning 6s, error 8s) + manual dismiss button; slide-down 200ms.

### 6.8 Skeleton (new)
`Skeleton` blocks (`animate-pulse`, `rounded-sm`, `bg-surface-muted`). Used for every async list/detail screen (replaces full-card spinners) per `STYLE.md §10`. `aria-hidden`; live content announces when ready.

### 6.9 EmptyState / ErrorState (upgraded)
- EmptyState: `icon`, `title`, `description` (what's empty, why, what to do next), optional `action` (CTA). Keeps current `data-testid` if asserted.
- ErrorState: `icon`, Arabic `title` + `message`, `retry` button (`إعادة المحاولة` — name preserved), `role="alert"`, optional compact `detail` (never technical for end users).

### 6.10 StatCard (dashboard KPI)
`icon`, `label`, `value`, `hint` (delta/date), `tone` (default/success/warning/error). Icon + color paired (never color-only).

### 6.11 Pagination
`current`, `totalPages`, `onChange`, prev/next + page buttons, `aria-current="page"`, numbers wrapped `dir="ltr"` inside RTL layout. Used by audit now; available to all tables (students/codes next).

### 6.12 DirectionalArrow + IconButton (D2)
`DirectionalArrow direction="back|forward"` = Chevron base + `rtl:rotate-180`; `IconButton` = 44px hit area + `aria-label` + visible focus ring.

### 6.13 VideoPlayer (visual only)
Container polish: 16:9 aspect frame, rounded-lg, overlay loading/buffering state, error state reuses ErrorState copy, mobile fullscreen via native controls; **zero logic changes** (auth/resume/progress untouched).

### 6.14 Empty/Error/success state inventory (must exist per screen)
See per-screen rows in §9 — every async screen specifies its loading (skeleton), empty, error, and success feedback.

---

## 7. State & Feedback Patterns

- **Loading**: skeletons shaped like final content (rows for tables, cards for grids, lines for forms). Spinners only for small in-place actions (button loading).
- **Empty**: icon + title + description + CTA. Never bare "لا توجد بيانات".
- **Error**: ErrorState with retry; per-asset errors (e.g. `access_denied`, `video_not_ready`) keep their current cards/strings + visual polish.
- **Success**: toasts (success type); destructive confirmations use destructive modals; bulk ops (e.g. توليد الأكواد) show result summaries (kept: generated-codes box).
- **Validation**: inline field errors (`role="alert"`, red border + Arabic message) — never placeholder-only (`STYLE.md §9`).

---

## 8. Motion (`STYLE.md §18`)

Only four motions: modal/drawer enter (200–250ms fade+translate), toast slide-in (200ms), skeleton pulse, progress-bar width transitions (500ms linear). Durations 150–250ms, single easing curve (`cubic-bezier(0.2, 0, 0, 1)`). Global `@media (prefers-reduced-motion: reduce)` disables animation/transition. No spring/bounce/parallax. No animation libraries (performance rule).

---

## 9. Screen-by-Screen Specifications

Format per screen: **Layout / Primary action / Mobile / Loading / Empty / Error / Acceptance**.

### 9.1 Public (`/`, `*`, config screen)
- **Landing** (`/`): hero (brand mark, H1 `منصة أ. وليد التعليمية`, tagline, CTA buttons `إنشاء حساب` primary + `تسجيل الدخول` secondary, WhatsApp outline), trust/benefits strip (3 items: منهج منظم، متابعة التقدم، محتوى حصري), footer (links + WhatsApp + copyright). Keep `فتح محادثة واتساب` text. Mobile: stacked hero, CTA full-width.
- **404**: full-page brand + `404` display + `العودة إلى الرئيسية` primary. Mobile: centered, no overflow.
- **Config error screen**: same visual language as ErrorState + retry.

### 9.2 Auth (`/login`, `/register`)
- **Login**: split layout ≥ `lg` (brand panel right/RTL-start with value props | form card); `< lg`: single centered card. Title `تسجيل الدخول`, fields كلمة المرور/البريد الإلكتروني, submit `تسجيل الدخول`, link `إنشاء حساب جديد`. Keep all error strings/roles.
- **Register**: same chrome; 7 fields (الاسم الكامل، البريد الإلكتروني، رقم الهاتف، رقم هاتف ولي الأمر، العنوان، كلمة المرور، تأكيد كلمة المرور); submit `إنشاء حساب`; success confirmation state (email sent) kept + polished; back link to login kept.
- **Account disabled / session expired**: presented as inline error cards on login (existing strings), styled via ErrorState. No new flows (D9).

### 9.3 Student
- **Dashboard** (`/student/dashboard`, priority per `STYLE.md §12`):
  1. **Continue learning** card: next incomplete lesson (fetch: curriculum + progress — reuse existing data; if none, EmptyState with CTA `تصفح المنهج`).
  2. **Access** card (purchased units, trial availability, redemption CTA) + `units-link`.
  3. **Progress** summary (unit-level %, progress bar `curriculum-progress-bar`).
  4. **Curriculum** shortcut (`curriculum-lesson-*` preserved) + **recent activity** (recent completed lessons).
  5. **Notifications** card w/ `unread-count` + `notifications-link`.
  Primary action: continue/start lesson button. Keep `المنهج الدراسي`/`الإشعارات` quick links; WhatsApp card kept, restyled. Mobile: single column; desktop: 2-col grid with learning card first.
- **Curriculum**: page header (title + overall progress `curriculum-progress-label` + bar) → units list (`unit-row-*` kept) → lessons per unit with status badges (completed/in-progress/locked), progress % per lesson, `curriculum-lesson-{id}` preserved. Loading: unit skeletons; Empty: per-unit EmptyState (no lessons yet); Error: ErrorState + retry.
- **Lesson** (`/student/lessons/:lessonId`, priority `STYLE.md §13`): video first (16:9, `lesson-video`), then title (H1), progress badge (`lesson-percent-badge`/`lesson-completed-badge` preserved), info (unit/grade/duration), resources card (PDF `lesson-pdf-frame` + `lesson-pdf-download`), then prev/next nav (`prev-lesson`/`next-lesson`) using DirectionalArrow (`الدرس السابق` → / `الدرس التالي` ←). Back link `المنهج الدراسي` with correct RTL arrow. `access_denied` / `video_not_ready` cards kept verbatim, polished. Mobile: video full-width on top; PDF opens in new tab (download link preserved).
- **Units/Purchases** (`/student/units`): unit list with per-unit price cards (base + platform fee = total, permanent access, trial lesson badge — `STYLE.md §14`), locked/purchased states, redeem form (code field + submit), purchase history table → stacked cards mobile (`unit-row-*`/`purchase-row-*` kept). Empty history: EmptyState. Redeem success/error: toast + inline.
- **Notifications**: page header + `تحديد الكل كمقروء` (`mark-all-read`), list `notification-{id}` + `data-unread` kept, type pills → Badge, click navigates to lesson as today. Empty: EmptyState. Loading: skeletons.
- **Profile** (now inside shell): read-only email (with hint that email cannot be changed), editable fields (الاسم الكامل، رقم الهاتف، رقم هاتف ولي الأمر، العنوان), `حفظ التغييرات`; success toast. Keep all current labels/validation strings.
- **Change password**: current/new/confirm fields + `تغيير كلمة المرور`; success toast + re-auth flow untouched; strings preserved.

### 9.4 Mr. Walid
- **Dashboard**: header row (title + primary action e.g. `إضافة طالب`/view students) → KPI StatCards (students, purchases this month, revenue, content readiness) → activity section (students by grade, top units, recent purchases, engagement) as compact tables (dense on desktop, cards mobile). All existing table semantics + labels kept. Loading: KPI skeletons; Error: ErrorState.
- **Students**: toolbar (search `البحث` + status filter tabs) → `Table` with `student-row-*` kept, actions as IconButton+text (`عرض التفاصيل`, edit, delete → confirm destructive modal). Empty: EmptyState ("no students yet" + CTA). Mobile: stacked cards.
- **Trash**: same chrome as students; `trash-row-*` kept; restore → confirm modal (Arabic confirm text preserved).
- **Student detail**: account info card (status badge, purchase info), actions (change grade `Select`, disable/enable w/ confirm, edit form `حفظ التغييرات`), delete w/ confirm. Keep all labels/strings; `student-detail-*` testids intact.
- **Grades**: create form (اسم الصف + `إضافة`), active table (`grade-row-*`), deleted table (`deleted-grade-row-*`), edit/delete modals (B7 semantics untouched). Mobile: stacked cards.
- **Curriculum**: 3-pane (grade select → units `unit-row-*` → lessons `lesson-row-*`) on ≥ `lg`; on mobile panes stack with segmented switching; `deleted-unit-row-*`/`deleted-lesson-row-*` toggles kept; publish/hide/delete/restore actions + modals preserved with Badge statuses. All Arabic labels/strings preserved.
- **Lesson assets** (`/walid/lessons/:lessonId`): lesson info header → video section (`رفع فيديو جديد`, `video-row-*` list w/ status Badges, `معاينة`, `استبدال`, cancel/release flows untouched, TUS UI restyled) → PDF section (`رفع الملف`, pdf rows w/ ready/processing states). The 2 hand-rolled dialogs migrate to `Modal` (D6) — same texts/test-ids. Loading: skeletons; upload progress bar kept (`role="progressbar"`).
- **Pricing**: walid read-only info banner (kept strings) + per-unit pricing table (`unit-price-row-*`); admin: form (unit, base/platform fee/total) + deactivate confirm. Mobile: cards.
- **Codes**: unit `Select` + count input (1–500) + `توليد الأكواد` → generated box (`نسخ` kept, `dir="ltr"` mono) → codes table (`code-row-*`, status Badges, revoke confirm modal). Empty state for no codes.

### 9.5 Admin
- **Dashboard**: reuses walid dashboard chrome w/ AdminNav → now sidebar variant; KPI density preserved.
- **Audit**: filter card (5 fields incl. date range, action, entity, actor) → dense `Table` (`audit-row-*`, scroll mobile) → `Pagination` (50/page) + `تصدير CSV`. Filters apply to list+count (logic untouched). Empty: EmptyState ("no records for filters" + clear-filters action). Error: ErrorState.
- **Roles**: users table (`role-row-*`, `role-badge-*`), role `Select` + confirm modal (`نعم، تغيير`…preserved), self-change blocked note kept (B10).

---

## 10. Breakpoint Behavior Matrix

| Breakpoint | Student | Walid/Admin | Tables (normal) | Modals |
|---|---|---|---|---|
| `<640` mobile | compact topbar + bottom nav | hamburger + drawer | stacked cards | bottom sheet |
| `640–767` large mobile | same | same | stacked cards | bottom sheet |
| `768–1023` tablet | topbar links may collapse → bottom nav stays until `lg` | drawer (sidebar at `lg`) | stacked cards (2-col) | centered dialog |
| `1024–1279` desktop | topbar nav visible | sidebar + topbar | full table | centered dialog |
| `≥1280` large desktop | `max-w-5xl` content | `max-w-7xl` | full table | centered dialog |

Touch targets ≥44px on < `lg`; ≥40px on ≥ `lg` (`UI-AUDIT §8.9`).

---

## 11. RTL & Accessibility Requirements (`STYLE.md §3`, §19)

- Keep `<html lang="ar" dir="rtl">`; all layout via **logical properties** (`ms/me/ps/pe/start/end`); physical utilities (`ml/mr/left/right`) removed (`UI-AUDIT §7.3`: `-left-2`, `mr-2`, `file:mr-3`, `text-left` blocks).
- `DirectionalArrow` handles all directional icons; no literal `←/→` glyphs (`UI-AUDIT §4.5`).
- Bidi-sensitive data (emails, phones, codes, IPs, dates+times, `ج.م` prices) keep `dir="ltr"`/`font-mono` as today.
- Contrast: all text ≥ AA (§3.1); focus-visible ring on every interactive element incl. table links (fixes `UI-AUDIT §8.4`); no `focus:outline-none` without replacement.
- Semantics: labels+`htmlFor` everywhere, `aria-invalid`/`aria-describedby`, `role="alert"` on field errors + error toasts, `aria-live` for async list updates, `role="progressbar"` (existing uploads) + `aria-valuenow` for curriculum progress, `aria-current="page"` via NavLink, skip-link at top of shell, reduced-motion global rule.
- Document: `index.html` → Arabic `<title>منصة أ. وليد التعليمية</title>`, `theme-color`, inline-SVG favicon (emerald rounded square + white و), `description` updated.

---

## 12. Performance (`STYLE.md §20`)

- D2: tree-shaken lucide icons only.
- D1: Google Fonts w/ preconnect + `display=swap`; no @fontsource bundles.
- D10: lazy routes (walid/admin pages) + dynamic `hls.js` import in `VideoPlayer`; `React.lazy` + `Suspense` with skeleton fallback.
- Keep: current query pattern (no extra round trips); memoize large list rows where beneficial; no new animation/dependency libs.

---

## 13. Protected Contracts (must stay green — from `UI-AUDIT §11`)

1. **All 184 tests** in 27 files, except the single coordinated D7 toast-role exception (with Review approval).
2. **Test-ids** (authoritative list in `UI-AUDIT §11`): `lesson-video`, `lesson-pdf-frame`, `lesson-pdf-download`, `lesson-completed-badge`, `lesson-percent-badge`, `lesson-nav`, `prev-lesson`, `next-lesson`, `units-link`, `curriculum-progress-bar`, `curriculum-progress-label`, `curriculum-lesson-*`, `notifications-link`, `unread-count`, `notification-*`/`data-unread`, `mark-all-read`, `student-row-*`, `trash-row-*`, `grade-row-*`, `deleted-grade-row-*`, `unit-row-*`, `deleted-unit-row-*`, `lesson-row-*`, `deleted-lesson-row-*`, `video-row-*`, `pdf-row-*`, `code-row-*`, `unit-price-row-*`, `purchase-row-*`, `audit-row-*`, `role-row-*`, `role-badge-*`, `lesson-status-*`.
3. **Accessible names & Arabic strings**: all current button/link/heading names and message strings (validation, error cards, empty states, modal confirms) unchanged unless the change is explicitly listed here.
4. **Roles/ARIA**: `dialog`+`aria-modal`, `alert`, `progressbar`, `table`, `combobox`, heading structure.
5. **Behavior**: RPC layer, auth/session flows, guards + redirects, video authorization/TUS lifecycle, progress rules (5s throttle, 90% completion, resume), PDF signed URLs, toasts API, WhatsApp link, notification flows. No new routes; no removed routes.
6. **Pre-existing TS errors** fixed type-only in Phase 1 (D8) — `nnpm run typecheck` + `nnpm run build` must pass from Phase 1 onward.

---

## 14. Implementation Phases (from `STYLE.md §25`, adjusted)

Dependency graph:

```text
Phase 1: Design System & Shared Foundations (tokens, fonts, index.css, Button/Input/Select/
         Textarea/Badge/Card/Modal/Toast/Skeleton/EmptyState/ErrorState/Table/Pagination/
         StatCard/IconButton/DirectionalArrow, LayoutShell + nav shells, D8 TS fixes, index.html)
                       ↓
 ┌─────────┬──────────┼──────────────┬──────────────┐
 ↓         ↓          ↓              ↓              ↓
Phase 2   Phase 3   Phase 4        Phase 5        Phase 6
Public    Auth      Student        Walid          Admin
         └──────────┴──────────────┴──────────────┘ (all depend on Phase 1 only)
                       ↓
Phase 7: Shared States, Forms, Tables & Data UX polish (skeletons everywhere, pagination
         beyond audit, responsive tables everywhere, toast coverage)
Phase 8: Responsive & Mobile Optimization (bottom nav, drawer, touch targets, overflow sweep)
Phase 9: Accessibility & Performance (contrast audit, focus audit, reduced-motion, D10 splitting)
Phase 10: Final Visual QA + Functional Regression QA (STYLE §29/§30)
```

### Per-phase scope & gates
| Phase | Scope (files) | Gate |
|---|---|---|
| 1 | `src/index.css`, `index.html`, `src/components/*` (all primitives + LayoutShell + nav shells), `src/test/*` (D8 only), add `lucide-react` | typecheck+build+lint+184/184; layout smoke on 3 representative pages |
| 2 | LandingPage, NotFoundPage, ConfigErrorScreen | own tests green; no regressions |
| 3 | LoginPage, RegisterPage (+ auth error presentation) | own tests green |
| 4 | student pages + student nav (bottom nav) + profile/password shell wiring | student test files green |
| 5 | walid pages + sidebar/drawer + LessonAssetsPage modal migration | walid test files green |
| 6 | admin pages + admin sidebar | admin test files green |
| 7 | cross-cutting shared-state work (skeletons on remaining screens, pagination, table density everywhere) | full suite green |
| 8 | responsive sweep (all breakpoints, overflow check, touch targets) | no horizontal overflow; full suite |
| 9 | a11y/performance (contrast, focus-visible, reduced motion, lazy routes + hls.js) | bundle size reported; full suite |
| 10 | Visual QA (STYLE §29 matrix) + Functional Regression QA (PLAN §19 checklist) | DoD below |

### Phase 1 execution report (2026-08-12)
- **Delivered**: token system in `src/index.css` (colors/typography/radius/shadow/motion, stacked-table CSS, reduced-motion guard, skip-link + sr-only in base layer); `index.html` (Arabic title `منصة أ. وليد التعليمية`, theme-color, inline-SVG favicon, Google Fonts Cairo+Tajawal); `lucide-react` installed; rebuilt primitives `Button` (6 variants + sizes + `aria-busy` + focus-visible), `Input`/`Select` (label+hint+error+`aria-invalid`+`aria-describedby`), `Card`, `Badge` (+ `StatusBadge`/`LessonStatusBadge` reimplemented on it), `Skeleton`, `Spinner`, `Modal` (focus trap, Esc, scroll lock, backdrop, bottom sheet <sm, `aria-describedby`), `Toast` (4 types + icons + dismiss + role split), `EmptyState`/`ErrorState` (icon + action), `StatCard`, `Table` primitives (density normal/dense), `Pagination`, `IconButton`, `DirectionalArrow`, `WhatsAppIcon`; `LayoutShell` (`variant="sidebar"` + topbar + mobile drawer + bottomNav slot + skip link), `StaffNav`/`AdminNav` (sidebar item lists + admin sections), `guards` restyled (strings preserved); `variant="sidebar"` wired into all 11 walid/admin LayoutShell usages; D8 type-only fixes (`AuditLogPage.test.tsx`, `supabase-mock.ts`); D7 test updates (`LoginPage.test.tsx`, `RegisterPage.test.tsx`); D11 `testTimeout` 15000ms.
- **Gates**: `npm test` 184/184 (27 files) · `nnpm run typecheck` ✓ · `nnpm run build` ✓ · `nnpm run lint` ✓ (all previously broken/failing baselines now green).
- **Deferred (by design)**: screen-level redesign (Phases 2–6), VideoPlayer visual polish (Phase 4/9), code splitting (D10, Phase 9), skeleton adoption across screens (Phase 7).
- **Known note**: production bundle ~1.19 MB (pre-existing; code splitting in Phase 9).

Execution order: sequential (Phase 1 first; 2–6 are independent once 1 lands — may run in parallel sub-agents if resources allow; 7–10 sequential). Parallel phases touch disjoint file sets; if a conflict appears, serialize and rerun reviews. Every phase: implement (dedicated sub-agent reading PLAN/STYLE/UI-AUDIT/this blueprint) → independent Review sub-agent → `PASS`/`FAIL` loop (`STYLE.md §27–28`). Reviewer must also run `npm test`, `nnpm run typecheck`, `nnpm run build`, `nnpm run lint` and report console-error cleanliness.

---

## 15. Definition of Done (per `STYLE.md §30`)

- `UI-AUDIT.md` exists ✓ · `UI-UX-BLUEPRINT.md` exists ✓
- All required screens redesigned on the same design system; mobile-first, RTL, and a11y verified
- Loading/empty/error/success states exist on every async screen
- 184/184 tests green (plus any review-approved D7 updates); typecheck, build, lint green; no new console errors; no unintended horizontal overflow
- Every phase passed independent review; Final Visual QA + Functional Regression QA passed
- No blocking defects; no mock/placeholder UI introduced; no functional regression (`PLAN.md §19` checklist all YES)

### Phase 2 execution report (2026-08-12)
- **Delivered**: LandingPage redesigned per §9.1: sticky public topbar (brand mark + الرئيسية/تسجيل الدخول/إنشاء حساب; mobile hamburger → a11y drawer with Esc/backdrop/initial-focus/scroll-lock), hero (H1 platform name from settings, tagline, single فتح محادثة واتساب CTA with loading Spinner / تعذر تحميل إعدادات المنصة ErrorState / لا يوجد رقم تواصل متاح حاليًا empty state), benefits strip (منهج منظم / متابعة التقدم / محتوى حصري), footer (brand + copyright + WhatsApp icon link تواصل عبر واتساب). NotFoundPage: full-page brand + 404 display + العودة إلى الرئيسية (same contracts). ConfigErrorScreen: branded card, mono env-key pills, new إعادة المحاولة reload button.
- **Test-contract note (deviation from §9.1 sketch)**: topbar holds the only تسجيل الدخول/إنشاء حساب links and hero holds the only فتح محادثة واتساب; the LandingPage tests assert *single* matches of each name, so login/register live in the topbar (persistent, mobile drawer renders only when open) instead of also in hero/footer; footer quick-link is labeled الرئيسية.
- **Gates**: 
npm test 184/184 (27 files) OK; 
npm run typecheck OK; 
npm run build OK (1.2 MB chunk warning = pre-existing, D10 in Phase 9); 
npm run lint OK.

### Phase 3 execution report (2026-08-12)
- **Delivered** (§9.2 split-layout auth): new src/features/auth/AuthLayout.tsx — shared shell with emerald-gradient brand panel (RTL-start = right column) with value props (دروس مصورة بجودة عالية / متابعة مستمرة للتقدم / تواصل مباشر مع الأستاذ) + copyright; hidden below lg where a compact centered brand bar shows above the card. LoginPage and RegisterPage rewritten on AuthLayout + Card + tokens; ALL logic, labels, validation strings, error mapping, toast calls, GuestOnly wrapper, and submit handlers unchanged. Confirmation state polished (MailCheck icon + full-width primary link الذهاب إلى تسجيل الدخول). Form errors: compact ole="alert" inline card in error token colors, still inside <form> (D7 contract). Bottom links kept verbatim (إنشاء حساب جديد / تسجيل الدخول).
- **Gates**: 
pm test 184/184 (27 files) OK; 
pm run typecheck OK; 
pm run build OK (chunk warning pre-existing, D10 in Phase 9); 
pm run lint OK.
  Fix round: error alert tokens (error/25, error/5, text-error); brand panel gradient darkened (to-emerald-700) + text-emerald-50/90 for AA; sr-only brand h1 in AuthLayout (page titles stay Card h2 — guards tests assert single تسجيل الدخول heading).

### Phase 4 execution report (2026-08-12)
- **Delivered** (§9.3, D4): NEW src/components/StudentNav.tsx — single responsive element: fixed bottom tab bar on mobile (5 items: لوحة الطالب / المنهج الدراسي / الوحدات / الإشعارات / الملف الشخصي, lucide icons in chips, NavLink aria-current) that becomes a static horizontal nav under the header on md+ (no duplicate DOM — preserves single-match link-name contracts). LayoutShell: additive pb-24 md:pb-0 on <main> when ariant=top + nav (students only). All 7 student pages restyled on tokens/components (Badge, Skeleton, Table primitives + data-label stacking, DirectionalArrow, lucide icons, WhatsAppIcon, role=progressbar added to curriculum bar): Dashboard (access Badge chip, quick-links card now الإشعارات+testids / تعديل الملف الشخصي / تغيير كلمة المرور — المنهج الدراسي quick-link moved to nav to keep single-match), Curriculum (skeleton loading, Badge progress states), Lesson (restyled frame/badges/PDF/prev-next w/ DirectionalArrow; VideoPlayer untouched; access_denied/video_not_ready verbatim), Units/purchases (shared Table + unit-row-* preserved), Notifications (Badge type pills, skeleton loading), Profile (now inside shell + nav), ChangePassword (label تغيير كلمة المرور unchanged, 2 fields). All logic/handlers/rpc/toasts/navigation byte-identical; no test files touched.
- **Gates**: 
pm test 184/184 (27 files) OK; 
pm run typecheck OK; 
pm run build OK (chunk warning pre-existing, D10 Phase 9); 
pm run lint OK.
- **Deferred**: VideoPlayer visual polish + hls.js code split (Phase 9).

### Phase 5 execution report (2026-08-12)
- **Delivered** (§9.4): all 9 walid pages restyled on the design system with logic byte-identical: WalidDashboardPage (StatCard KPIs + skeleton loading + activity tables), StudentListPage (search toolbar + shared Table student-row-* + confirm Modals + EmptyState), TrashPage (	rash-row-* + restore/delete Modals), StudentDetailPage (info Card + status Badge + grade Select + disable/enable/delete confirm Modals + حفظ التغييرات), GradesPage (create form + grade-row-*/deleted-grade-row-* + edit/delete Modals), CurriculumPage (3-pane grade/units/lessons with unit-row-*/lesson-row-*/deleted-* toggles + publish/hide/delete/restore Modals + status Badges + mobile segmented switch), LessonAssetsPage (**2 hand-rolled dialogs migrated to Modal per D6** — same texts/test-ids; ideo-row-*/pdf-row-*, status Badges, TUS UI restyled, ole="progressbar" kept), PricingPage (info banner + plan-row-* + admin-gated form/delete), CodesPage (plan Select + count + توليد الأكواد + joined نسخ box dir=ltr mono + code-row-* + revoke Modal + empty state). Verified facts: CodesPage has no admin gating (mr_walid generates/revokes — pre-existing), pricing admin-only gating kept.
- **Gates**: 
pm test 184/184 (27 files) OK (final run; two earlier runs had CPU-contention flakiness under parallel forks — every file passes in isolation and the full run was re-verified); 
pm run typecheck OK; 
pm run build OK (chunk warning pre-existing, D10 Phase 9); 
pm run lint OK.

### Phase 6 execution report (2026-08-12)
- **Delivered** (§9.5): both admin pages restyled on the design system with logic byte-identical. AuditLogPage: filter Card (من تاريخ / إلى تاريخ date inputs, إجراء, نوع الكيان, معرف المستخدم) + بحث button + تصدير CSV button; dense shared Table (`audit-row-*` testids, `data-density="dense"`, stacked `data-label` on mobile) → shared Pagination (50/page) + `${total} عملية` subtitle; skeleton rows; EmptyState `لا توجد عمليات مسجلة` + مسح الفلاتر; ErrorState `تعذر تحميل سجل النشاطات` + retry; `font-mono dir="ltr"` on action/entity/IP/actor IDs + dates/times. RolesPage: users table (`role-row-*`, `role-badge-*` Badge variants success/warning/neutral), per-row role Select (self-change disabled + `لا يمكنك تغيير دورك بنفسك`), confirm Modal `نعم، تغيير`, skeleton/Empty/Error states. Headings `سجل النشاطات` / `الأدوار والصلاحيات` stay the single LayoutShell h1 (guards contract). AdminNav already wired (Phase 1); no dashboard page — admin uses walid dashboard chrome (pre-existing).
- **Gates**: 
npm test 184/184 (27 files) OK; 
npm run typecheck OK; 
npm run lint OK; build verified in Phase 5 state (admin pages are pure client-side, no new imports).
- **Flakiness fix (important)**: two independent full-suite runs under default parallel forks failed on `LessonAssetsPage` "renders the video list" (row not found — machine-load timing; passes in isolation). Root cause: parallel-fork overhead on this machine (environment setup 150–185s) + desktop load. **vite.config.ts now sets `maxWorkers: 1` + `poolOptions.forks.singleFork: true`** — full suite is now deterministic and FASTER (77s vs 263–311s). No test files were edited.

## 16. Cross-cutting Phase 7 (Skeletons, Forms, Tables & Data UX polish) — scope reference
Skeletons on remaining async screens, pagination beyond audit (evaluated per list), table density sweep, toast coverage. Gate: full suite green.

### Phase 7 execution report (2026-08-12)
- **Delivered** (cross-cutting sweep, §7/§14 row 7):
  - ErrorState retry added to 5 async screens — all retries re-run the exact same `load`/`loadSettings` callback (single fetch on mount, stable `useCallback`, error cleared + skeleton restored before refetch): StudentNotificationsPage (`تعذر تحميل الإشعارات`), StudentCurriculumPage (two parallel effects merged into one retryable `load` with identical fetch order/filters), StudentLessonPage (retryable `load` + request-id stale guard alongside the pre-existing `active` flags), LandingPage + StudentDashboardPage settings (`تعذر تحميل إعدادات المنصة`).
  - Full-card spinner → content-shaped skeleton: StudentProfilePage (form-shaped lines), StudentDashboardPage (access-card lines). Both `aria-hidden`, no post-load flash.
  - Tables (D5): audited — zero raw `<table>` outside shared Table; every business table uses `TableCell label=` stacking; audit = dense. No changes needed.
  - Pagination: only `listAuditLogs` supports limit/offset — already paginated. Other lists (students, codes, curriculum, purchases) have no page/limit RPC params; **intentionally left** (volumes small; adding = new RPCs, out of scope).
  - Toast coverage: all mutations verified; `تحديد الكل كمقروء` uses inline feedback + error toast (no new copy).
  - Buttons: all submits/confirms pass busy → `aria-busy`; frozen strings `جاري الاستعادة...`/`جاري...` kept.
- **Files changed**: StudentNotificationsPage, StudentCurriculumPage, StudentLessonPage, StudentProfilePage, StudentDashboardPage, LandingPage (features only; no tests/components/config).
- **Review round (FAIL → fixed, 2 rounds)**: independent reviewer found a protected-contract flake (`StudentLessonPage.test.tsx` "resumes from the saved position once the manifest is parsed" — `currentTime` stayed 0, ~1-in-5 under contention) and a missing report. **Root cause**: (a) `VideoPlayer`'s `MANIFEST_PARSED`/`loadedmetadata` resume handlers closed over the mount-time `initialPosition` (`src/components/VideoPlayer.tsx`) — if the player ever mounted before the progress row landed, resume was silently lost; (b) deeper: the test triggers `MANIFEST_PARSED` synchronously after the video mounts, so if `getPlaybackUrl` ever out-resolves `getMyProgress`, the trigger races the pending progress commit. **Fixes**: (a) resume handlers now read a live `initialPositionRef` (updated every render) instead of the effect closure — covers late-arriving positions; (b) `StudentLessonPage` now gates the VideoPlayer mount on `progressLoaded` (a flag set when `getMyProgress` settles inside the same `Promise.all` as the lesson) — the player physically cannot mount before the position is known, so resume is deterministic by construction (in practice no user-visible delay: progress settles in the same batch as the lesson row). Semantics otherwise unchanged (same `resumeAppliedRef` single-seek guard, same seek-then-play, same `saveProgress` throttle); zero test edits. Full suite re-verified **3× 184/184 (27 files)** after round 2, typecheck ✓, lint ✓, build ✓.
- **Gates**: npm test 184/184 (27 files) OK (multiple consecutive deterministic runs, ~50–80s each; one 183/184 at ~1-in-20 rate was root-caused to the race above and eliminated — no further unexplained failures; runs at 3–5× normal duration correspond to machine-load spikes, D11-documented class, all green); npm run typecheck OK; npm run lint OK; npm run build OK (1.22 MB chunk warning = pre-existing, D10 Phase 9).

### Phase 8 execution report (2026-08-12)
- **Delivered** (responsive sweep, §14 row 8; all class-only, zero logic/name/string/testid changes, zero test edits):
  - Touch targets ≥44px mobile (STYLE §19): Button/Input/Select `h-11 sm:h-10`; hamburger/drawer-close/back links `h-11 sm:h-10`; StudentNav bottom-bar labels 11px→12px + `pb-[env(safe-area-inset-bottom)]`; walid/admin drawer items `py-3`; Toast dismiss `p-3.5`; Pagination `min-w-10`; CurriculumPage `عرض/إخفاء المحذوفة` toggles `py-3`; StudentLessonPage prev/next links `py-3`; StudentListPage status filter tabs `py-3`.
  - Overflow: LayoutShell brand `min-w-0 truncate` (header safe at 360px); ConfigErrorScreen env-key pills `break-all`; Modal bottom-sheet safe-area padding `pb-[calc(env(safe-area-inset-bottom)+1.25rem)]`; drawers bounded `max-w-[82vw]`/`85%`; zero `whitespace-nowrap` on long text; dense audit table scrolls in-card.
  - Grids: StatCards 1→2→4; auth split panel `lg:` only; pricing/codes forms `sm:grid-cols-2`; lesson-assets rows `flex-wrap`.
  - Intentionally left: dashboard quick-links at 40px (≥40 + 12px gap compensation, documented); codes/emails break naturally (dash/space breakable); dense audit cells wrap inside their scroll container (D5).
- **Files changed (19)**: Button, Input, Select, LayoutShell, StudentNav, Modal, Toast, StaffNav, AdminNav, Pagination, LandingPage, ConfigErrorScreen, StudentListPage, TrashPage, StudentDetailPage, StudentLessonPage, LessonAssetsPage, CurriculumPage + this blueprint.
- **Review round (FAIL → fixed)**: reviewer flagged missing report + 3 sub-44px targets (Toast dismiss, CurriculumPage toggles, prev/next + filter tabs). All fixed with `p-3.5`/`py-3` bumps; report appended.
- **Incident (documented)**: a bulk class-name edit on CurriculumPage.tsx via PowerShell `Get-Content -Raw` + `Set-Content -Encoding utf8` corrupted the file (PS 5.1 read UTF-8 as ANSI/CP1256 → mojibake + BOM on write; no git, no backups). Recovered byte-exactly by reversing the CP1256 round-trip (decode file as UTF-8 → re-encode as CP1256 → decode as UTF-8; stripped stray leading `?` from the BOM artifact) and verified via `unit_not_found`/toast/empty strings + full suite. **Process rule added**: never use PowerShell content cmdlets on non-ASCII sources — use the edit/write tools only; snapshots kept OUTSIDE the project root (vitest/lint pick them up; the temporary in-tree snapshot was removed).
- **Gates**: npm test 184/184 (27 files) OK; npm run typecheck OK; npm run lint OK; npm run build OK (1.22 MB chunk warning = pre-existing, D10 Phase 9); PLAN §19 checklist all YES (no functional code touched).
