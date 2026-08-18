# UI-AUDIT.md — Visual & UX Audit of the Existing Platform

> Audit date: 2026-08-12
> Scope: entire `src/` frontend of the وليد عونى (React 19 + Vite 7 + Tailwind CSS v4 + react-router-dom 7).
> Method: full source inspection of every route, page, component, and the test suite. No UI code was modified during this audit.
> Constraint: `PLAN.md` (functional) and `STYLE.md` (visual) are the authoritative specs. Tests (27 files, 184 cases) encode a strict UI contract (test-ids, accessible names, Arabic strings, ARIA roles) that any redesign must preserve or explicitly update with review.

---

## 1. Stack & Current Design System

| Aspect | Current state |
|---|---|
| CSS | Tailwind CSS v4 (`@import "tailwindcss"`) — utility classes only |
| `src/index.css` | 10 lines: `@theme` sets only `--font-sans`; body `bg #f1f5f9`, `color #0f172a`. **No design tokens, no semantic colors, no breakpoints, no motion tokens.** |
| Font | `"Segoe UI", "Tahoma", "Arial", system-ui` — **not an Arabic-optimized font stack; no webfont loaded** |
| Primary color | `emerald-600` (+ `emerald-700` hover) — used for brand, buttons, links, focus rings |
| Status colors | `emerald` (active/ready), `amber` (warning/pending), `rose`/`red` (error/destructive), `sky` (processing/info), `slate` (neutral/disabled) |
| Radius | `rounded-md` (6px) for controls, `rounded-lg` (8px) for cards, `rounded-full` for pills |
| Shadows | `shadow-sm` on cards, `shadow-lg`/`shadow-xl` on modals/toasts |
| Spacing | Tailwind scale (4/8/12/16/20/24/32/...) used ad hoc, not centralized |
| Breakpoints | Tailwind defaults (`sm=640`, `md=768`, `lg=1024`, `xl=1280`) used ad hoc |
| Icons | **None** — no icon library; navigation arrows are literal `←`/`→` text characters |
| Motion | None (no animation library). Only CSS `transition-colors`, `animate-spin`, `transition-all` for progress bars |
| Layout | `LayoutShell` header (max-w-5xl) + optional nav bar under it; content `max-w-5xl px-4 py-6` |
| Bundle | hls.js + tus-js-client bundled eagerly with the app (no route-level code splitting) |

---

## 2. Complete Route / Screen Inventory (source of truth: `src/app/router.tsx`)

### Public (guest-only)
| Route | Component | Notes |
|---|---|---|
| `/` | `LandingPage` | Single centered card: platform name, login/register CTAs, WhatsApp button |
| `/login` | `LoginPage` | Card + form, Arabic error mapping |
| `/register` | `RegisterPage` | Card + form (7 fields), email-confirmation success state |
| `*` | `NotFoundPage` | 404 card |

### Student (`/student/*`, `RoleGuard allow=['student']`)
| Route | Component | Notes |
|---|---|---|
| `/student/dashboard` | `StudentDashboardPage` | Access pill (trial/purchased), account summary, quick links, WhatsApp card |
| `/student/curriculum` | `StudentCurriculumPage` | Progress bar card + unit/lesson lists with status pills |
| `/student/lessons/:lessonId` | `StudentLessonPage` | Video (hls.js) + PDF iframe + progress + prev/next |
| `/student/units` | `UnitsPage` | Per-unit pricing + locked/purchased cards, redeem code form, purchase history |
| `/student/notifications` | `StudentNotificationsPage` | Read/unread list, mark-all |
| `/student/profile` | `StudentProfilePage` | **Does NOT use LayoutShell** (no header/nav) |
| `/student/password` | `StudentChangePasswordPage` | **Does NOT use LayoutShell** (no header/nav) |

### Walid Awny (`/walid/*`, `RoleGuard allow=['mr_walid','admin']`)
| Route | Component | Notes |
|---|---|---|
| `/walid/dashboard` | `WalidDashboardPage` | Stat cards + tables (by_grade, top units, recent purchases, engagement) |
| `/walid/students` | `StudentListPage` | Search + status filter tabs + table + confirm modal |
| `/walid/students/trash` | `TrashPage` | Table + restore modal |
| `/walid/students/:studentId` | `StudentDetailPage` | Account info, actions, edit form incl. grade select |
| `/walid/grades` | `GradesPage` | Create form, active table, deleted table, edit/delete modals |
| `/walid/curriculum` | `CurriculumPage` | Grade select → units pane → lessons pane; create/edit/delete/restore; show/hide deleted; publish/hide |
| `/walid/lessons/:lessonId` | `LessonAssetsPage` | Lesson info, video list + TUS upload/preview/replace, PDF upload + list; **2 hand-rolled inline modals duplicating `Modal`** |
| `/walid/pricing` | `PricingPage` | Read-only banner for mr_walid; table of per-unit pricing; admin-only edit form + deactivate modal |
| `/walid/codes` | `CodesPage` | Unit select, generate (1–500), generated-codes box, codes table, revoke modal |

### Admin (`/admin/*`, `RoleGuard allow=['admin']`)
| Route | Component | Notes |
|---|---|---|
| `/admin/dashboard` | `WalidDashboardPage nav={<AdminNav/>}` | Reuses staff dashboard with admin nav |
| `/admin/audit` | `AuditLogPage` | Filter card (5 fields), table, pagination (50/page), CSV export |
| `/admin/roles` | `RolesPage` | Non-student users table, role select + confirm modal |

### Non-route surfaces
- `ConfigErrorScreen` (no env configured), `ErrorBoundary` fallback, guards' `LoadingScreen` (verify), `GuestOnly` redirects.

---

## 3. Shared & Duplicated Components

### Existing reusable components (`src/components/`)
| Component | Quality notes |
|---|---|
| `Button` | Variants primary/secondary/danger/ghost. Missing: `outline`, `link` (STYLE §9). Missing `aria-busy`; spinner inline; no size variants; focus ring hardcoded emerald |
| `Input` | Label + error + hint. Missing `aria-invalid`/`aria-describedby` wiring; no `Select`, `Textarea` siblings exist (raw `<select>`/`<textarea>`… none used) |
| `Card` | title/subtitle/actions. No `compact`/`padding` variants; used for one-off surfaces |
| `Modal` | Basic. **No focus trap, no Escape handling, no scroll lock, no backdrop click, no `aria-describedby`** (STYLE §9 modal rules) |
| `Toast` | Only success/error types (missing info/warning); error toasts use `role="status"` (should be `role="alert"`); no icon; fixed top-center; 4s timeout, no manual dismiss |
| `Spinner` | Centered spinner + label; **no skeleton loading states anywhere** (STYLE §10 prefers skeletons) |
| `EmptyState` | Title + description only — no icon, no CTA action (STYLE §10 wants "what to do next") |
| `ErrorState` | Message + retry only — no icon, minimal copy |
| `StatusBadge` | Active/disabled/deleted pills |
| `LessonStatusBadge` | Draft/published/hidden pills |
| `StaffNav` / `AdminNav` | Horizontal wrap bars under header; **no sidebar, no drawer, no bottom nav** (STYLE §7) |
| `LayoutShell` | Header (brand, role, name, sign-out) + nav slot + page header + content. Only `max-w-5xl` |
| `VideoPlayer` | hls.js + native fallback, resume-after-manifest, progress/complete hooks — **functionally sound; container styling minimal** |

### Duplicated / inline component implementations (violate STYLE §22)
1. **Badges** — at least 9 distinct hand-rolled pill implementations: `StatusBadge`, `LessonStatusBadge`, `CodeStatusBadge` (CodesPage), video status badge (LessonAssetsPage), grade status pill (GradesPage), unit status pill (PricingPage), PDF ready/primary pills (LessonAssetsPage), "الأساسي" pill, `LessonProgressBadge` (CurriculumPage), notification type pill, lesson percent/completed pills (LessonPage). Styles drift slightly (colors, padding).
2. **Selects** — raw `<select>` with copied class strings in 6 places: CurriculumPage (grade), CodesPage (unit), PricingPage (grade), StudentDetailPage (grade), RolesPage (role), AuditLogPage (entity type). No shared `Select`.
3. **Tables** — 9+ identical table scaffolds (`overflow-x-auto … <table>` with copied header/tbody classes): Students, Trash, Grades ×2, Curriculum-related, Codes, Pricing, Audit, UnitsPage purchase list, Walid dashboard (×3 small). No `Table` primitive.
4. **Modals** — `Modal` component exists, but `LessonAssetsPage` hand-rolls 2 dialogs (replace-video, preview) with duplicated overlay/panel markup.
5. **Filter tabs** — StudentListPage status tabs; AuditLogPage filter form; both custom.
6. **Link-buttons** — dozens of `<button className="text-sm font-medium text-emerald-700 hover:underline">` action cells repeated in every table (edit/delete/publish/hide/restore…). No `IconButton`/`LinkButton`, no focus-visible styling, small touch targets.
7. **Pagination** — only AuditLogPage; plain prev/next buttons; no page numbers, no aria-current.
8. **`LayoutShell` title/actions header** — repeated pattern; two pages bypass it entirely (profile/password).

---

## 4. Visual Problems

1. **No design system foundation** — zero tokens in `index.css`; colors/radii/spacing hardcoded per file; rebranding impossible without global edits (STYLE §5).
2. **Generic dashboard-template look** — emerald-on-white + slate cards + table rows everywhere; nothing distinctively "premium EdTech"; landing page is a single bare card (STYLE §1/§4).
3. **Typography flat** — one default sans stack; no display/heading/body scale; Arabic rendering with Segoe UI/Tahoma looks dated; no `text-balance`, no letter-spacing strategy for Arabic.
4. **Inconsistent radii/shadows** — `rounded-md` vs `rounded-lg` vs `rounded-full` mixed; `shadow-sm` on some cards, none on others; modal overlays use `bg-black/40` vs `bg-slate-900/50`.
5. **Mixed directional arrows** — literal `←`/`→` glyphs in lesson nav and "← المنهج الدراسي" back link; the back link points left (backward in RTL), lesson "next" uses `الدرس التالي ←` (correct), prev uses `→ الدرس السابق` (correct) — inconsistent mental model across surfaces.
6. **Icon absence** — status/action affordances rely on text and color only; no visual language (STYLE §17).
7. **`index.html`** — `<title>وليد عونى</title>` (English), no favicon, no `theme-color`; description is Arabic ✓.
8. **Student dashboard is a list of cards**, no visual priority (STYLE §12: continue learning → course → progress → curriculum → activity → notifications).
9. **Walid dashboard** — 8 stat cards + 5 small tables; dense but plain; no hierarchy beyond labels.
10. **No brand presence** — no logo mark, no visual identity beyond text "منصة أ. وليد التعليمية".

---

## 5. UX Problems

1. **No "continue learning"** on student dashboard (STYLE §12 priority 1) — student lands on account/purchase cards.
2. **Student profile/password pages lack app chrome** (no header, no nav, no back affordance) — dead-end pages.
3. **Curriculum page does N+1 lesson queries** per unit (acceptable volume, but no skeleton while loading → content pops).
4. **Lesson page**: video card appears before content; progress badge hidden until data loads; PDF iframe `h-[500px]` fixed on mobile; prev/next buttons wrap awkwardly on small screens.
5. **No empty/error variance**: EmptyState has no CTA; ErrorState has no "refresh"/context; toasts are the only success feedback.
6. **Landing page**: no public nav (Home/Courses/Login/Register per STYLE §7), no info about grades/courses/benefits, no footer; no grade/course info for prospects.
7. **Loading states** are full-card spinners on every screen — no skeletons, no suspense boundaries; slow-feeling on mobile.
8. **No pagination on long tables** (students, codes, audit is 50/page ✓); students list loads all rows.
9. **No sorting** on tables; **no bulk actions** (STYLE §15).
10. **Units page**: redeem form fine, but no unit/benefit explanation; access pill mixed with ad-hoc text (STYLE §14).
11. **Notifications**: list grows unbounded (no pagination); mark-all is a text button at top-right (left in RTL = start position is right… container `justify-end` in RTL puts it on the left) — inconsistent with reading flow.
12. **Dialog focus/scroll**: modals don't trap focus or restore scroll — mobile UX suffers.
13. **Session/account states**: disabled account → only login error message (acceptable per PLAN; no dedicated screen); session expiry handled on password change only.
14. **No keyboard-first flows** beyond native buttons; no skip-link.

---

## 6. Responsive & Mobile Problems

1. **Tables** rely on `overflow-x-auto` (9+ screens) — functional but poor mobile UX; no stacked-card/priority-hiding strategy (STYLE §9 tables).
2. **Student nav absent on mobile**: header shows brand + name + sign-out; with StaffNav/AdminNav the horizontal bar **wraps** on small screens (6–7 items) — no drawer/bottom nav (STYLE §7).
3. **LayoutShell content** `max-w-5xl px-4` — fine, but dashboard grid `sm:grid-cols-2 lg:grid-cols-4` is desktop-first thinking; no custom mobile composition.
4. **Lesson page**: fixed `h-[500px]` iframe; lesson nav two links wrap; back-link arrow misdirection.
5. **CodesPage generated-codes `<pre>`** scrolls inside; OK.
6. **WalidDashboardPage grids** collapse to 1 column — acceptable but tables inside cards scroll horizontally.
7. **AuditLogPage** filter grid `lg:grid-cols-5` → 2 cols on small; fine but filter actions row may overflow; pagination buttons okay.
8. **No meta viewport issues** — `index.html` viewport ✓.
9. **Touch targets**: table action links (~16–20px tall) below 44px recommendation; pill badges not interactive; nav links ~32px.
10. **Horizontal overflow risk**: `min-w-*`/wide content in codes `<pre>` (has overflow-auto ✓); UnitsPage tables ✓ wrapped; dashboard tables have their own overflow ✓. No global overflow bug found — but no systematic verification pass exists.

---

## 7. RTL Problems

1. `index.html` has `lang="ar" dir="rtl"` ✓; LandingPage/NotFoundPage set `dir="rtl"` redundantly ✓.
2. **Literal arrows** (`←`/`→`) for direction are fragile (see §4.5) — should use logical/directional icons or CSS transforms.
3. Physical utilities used in a few spots: `-left-2` (unread badge, StudentDashboardPage), `text-right`/`text-left` hardcodes (table headers `text-right` ✓ correct for RTL; UnitsPage `text-left` block), `mr-2` in notifications dot (physical; `ms-2` would be correct), `file:mr-3` in PDF input.
4. `dir="ltr"` correctly applied to emails/phones/codes/dates-with-times ✓ (good pattern).
5. No RTL-specific motion or layout flip issues (no direction-dependent animations exist).
6. **Mixed bidi content** in audit actions (`font-mono` + Arabic join separators) — handled via `dir="ltr"` ✓.

---

## 8. Accessibility Problems

1. **Modals**: no focus trap, no Escape-to-close, no initial focus, no scroll lock, no `aria-describedby`, no backdrop click (STYLE §9).
2. **Toast**: error toasts use `role="status"`; should be `role="alert"` for errors; no `aria-live="assertive"`; no keyboard dismiss.
3. **Contrast**: `emerald-600` on white ≈ 3.5:1 (fails AA for small text); `slate-400`/`slate-500` hints (≈2.8:1/4.6:1) used for important secondary text; `text-slate-400` IP/ID strings in audit.
4. **Focus**: `focus:outline-none` + emerald ring on buttons/inputs ✓, but table link-buttons/links have no visible focus style (hover:underline only); no `:focus-visible` strategy; no skip-link.
5. **Semantics**: list pages use `<ul>/<li>` for curriculums ✓; notification items are `<button>` ✓; stat cards are `div`+`p` (fine); progress bars are `div` with width (curriculum progress lacks `role="progressbar"`; upload progress has it ✓).
6. **Labels**: all form inputs have labels ✓ (via `htmlFor` or wrapper). Selects have labels ✓. Icon-free buttons rely on text ✓. `iframe` has title ✓.
7. **`aria-current`** missing on nav active states (NavLink sets it automatically ✓ actually react-router sets aria-current="page" on active NavLink ✓).
8. **Reduced motion**: no `prefers-reduced-motion` handling (only spinners/transitions exist — low risk but should be honored).
9. **Touch targets** < 44px (table actions, filter tabs, pills).
10. **Screen-reader announcements**: no live regions for async updates (list loads, filter results); toast covers some.
11. **Document title** not localized; no per-page titles.

---

## 9. Loading / Empty / Error State Inventory

| Page | Loading | Empty | Error |
|---|---|---|---|
| Landing | Spinner (settings) | — | ErrorState (settings) |
| Student dashboard | — (cards render empty) | — | ErrorState (settings only) |
| Curriculum | Spinner | EmptyState (no grade / no lessons) | ErrorState |
| Lesson | Spinner | EmptyState (missing) | ErrorState + per-asset errors (access_denied card, video_not_ready text) |
| Purchases | Spinner ×2 | EmptyState (history) | ErrorState ×2 |
| Notifications | Spinner | EmptyState | ErrorState |
| Walid dashboard | Spinner | "لا توجد بيانات بعد" (plain `<p>`) | ErrorState |
| Students | Spinner | EmptyState | ErrorState |
| Trash | Spinner | EmptyState | ErrorState |
| Student detail | Spinner | — | ErrorState |
| Grades | Spinner ×3 | EmptyState / plain `<p>` | ErrorState ×3 |
| Curriculum mgmt | Spinner ×4 | EmptyState / plain `<p>` | ErrorState ×4 |
| Lesson assets | Spinner ×3 | EmptyState | ErrorState ×3 |
| Pricing | Spinner | EmptyState | ErrorState |
| Codes | Spinner ×2 | EmptyState | ErrorState ×2 |
| Audit | Spinner | EmptyState | ErrorState |
| Roles | Spinner | EmptyState | ErrorState |
| Auth | n/a | n/a | inline alert + toast |

**Findings**: no skeletons anywhere; empty states rarely explain "why" or offer next steps; error states rarely offer retry beyond explicit cases; success feedback is toast-only; no optimistic UI.

---

## 10. Reusable / Refactor Candidates

**Refactor targets (with benefits):**
1. `index.css` → full token layer (colors, typography scale, spacing, radius, shadows, breakpoints, motion, z-index) via Tailwind v4 `@theme` + CSS variables. Highest leverage.
2. `Badge` component (variant: neutral/success/warning/danger/info + outline) → replaces 9+ pill implementations.
3. `Select` + `Textarea` field primitives matching `Input`.
4. `Table`/`DataTable` primitive (wrapper, header, row, cell, responsive stacking at `sm`) → replaces 9+ scaffolds; keep `data-testid` hooks.
5. `Modal` upgrade: focus trap, Esc, scroll lock, backdrop, `aria-describedby`; migrate the 2 hand-rolled dialogs.
6. `Toast` upgrade: 4 types, icons, `role="alert"` for errors, dismiss, auto-close per type.
7. `Skeleton` primitive (content-shape loading) + switch key list pages to skeletons.
8. `EmptyState` + icon + optional action; `ErrorState` + icon + optional action.
9. `StatCard` (dashboard KPI) shared by Walid/Admin dashboards.
10. `Pagination` component (page numbers, aria-current, RTL-safe) for audit + future tables.
11. `Tabs`/filter-segmented component (students filter).
12. Student `StudentNav` (mobile bottom nav + desktop structured nav per STYLE §7); wrap profile/password pages in app chrome.
13. `PageHeader` unified within LayoutShell (already there) — ensure all pages use it.
14. `ArrowIcon`/directional icon system (inline SVG, logical flip via `[dir=rtl]`) replacing literal arrows.
15. `VideoPlayer` container polish (poster, loading, buffering state, mobile fullscreen) without touching auth logic.
16. `LinkButton`/action-cell component with proper focus-visible + touch target.

---

## 11. Regression Risks (what must NOT break)

### Test contract (184 tests / 27 files — must stay green or be deliberately updated)
- **Test-ids** (non-exhaustive, authoritative list gathered from tests): `lesson-video`, `lesson-pdf-frame`, `lesson-pdf-download`, `lesson-completed-badge`, `lesson-percent-badge`, `lesson-nav`, `prev-lesson`, `next-lesson`, `units-link`, `open-unit-{id}`, `curriculum-progress-bar`, `curriculum-progress-label`, `curriculum-lesson-{id}`, `notifications-link`, `unread-count`, `notification-{id}` (+ `data-unread`), `mark-all-read`, `student-row-*`, `trash-row-*`, `grade-row-*`, `deleted-grade-row-*`, `unit-row-*`, `deleted-unit-row-*`, `lesson-row-*`, `deleted-lesson-row-*`, `video-row-*`, `pdf-row-*`, `code-row-*`, `audit-row-*`, `role-row-*`, `role-badge-*`, `lesson-status-*`.
- **Accessible names asserted**: buttons `تسجيل الدخول`, `إنشاء حساب`, `إعادة المحاولة`, `تسجيل الخروج`, `إعادة التحميل`, `نعم، حذف/إيقاف/تفعيل/استعادة/إلغاء/تغيير`, `حفظ التغييرات`, `تغيير كلمة المرور`, `إضافة وحدة`, `إضافة درس`, `إضافة`, `بحث`, `تصدير CSV`, `تحديد الكل كمقروء`, `توليد الأكواد`, `نسخ`, `معاينة`, `استبدال`, `رفع الملف`, `رفع فيديو جديد`, `رفع الفيديو`, `إلغاء الرفع`, `إعادة المحاولة`, `متابعة الاستبدال`, etc.; links `المنهج الدراسي`, `الإشعارات`, `عرض التفاصيل`, `فتح محادثة واتساب`, `العودة إلى الرئيسية`, `إنشاء حساب جديد`; headings `تسجيل الدخول`, `إنشاء حساب`, `لوحة الطالب`, `المنهج الدراسي`, `الملف الشخصي`, `سجل النشاطات`, `الأدوار والصلاحيات`, `404`, lesson titles as headings, etc.
- **Visible strings**: validation messages (`صيغة البريد الإلكتروني غير صحيحة`, `كلمة المرور يجب أن تكون 6 أحرف على الأقل`, phone rules), error cards (`هذا الدرس غير متاح حاليًا`, `الفيديو قيد التجهيز، حاول مرة أخرى لاحقًا.`, `الدرس غير موجود`), labels (`البريد الإلكتروني`, `كلمة المرور`, `رقم الهاتف`, `رقم هاتف ولي الأمر`, `العنوان`, `الاسم الكامل`, `اسم الوحدة`, `عنوان الدرس`, `الوصف`, `الترتيب`, `كود التفعيل`, `عدد الأكواد (1 - 500)`, `السعر الأساسي (ج.م)`, `رسوم المنصة (ج.م)`, `اختيار الملف`, `البحث`…), price/date formats (`350 ج.م`, `%61.5`, `10500 ج.م`), progress formats (`1 من 2 درسًا`, `30٪`, `40٪`).
- **Roles/ARIA**: `role="dialog"` + `aria-modal` on modals; `role="alert"` on form errors; `role="progressbar"` on video upload; `role="table"` (`getByRole('table')` in AuditLogPage test); `combobox` for selects; heading hierarchy (page titles as `h1`/`h2`).

### Functional surface (must remain behaviorally identical)
- All RPC calls, their args and error-code mappings (rpc.ts unchanged).
- Supabase auth flows (login/register/session/sign-out/password change with reauth).
- Route guards (ProtectedRoute/RoleGuard/GuestOnly), redirect targets, `roleHome`.
- Video authorization (EF-driven), TUS upload lifecycle, progress throttling (5s), ≥90% completion, resume.
- PDF signed-URL flow and download attributes.
- Toast context API (`showToast(message, type)`).
- WhatsApp link construction.
- Notifications mark-read flows.
- All `data-testid` attributes (see above) — renaming requires coordinated test updates + review.

### Pre-existing issues (documented, NOT caused by redesign)
- `npm run build` currently FAILS: TS errors in `src/features/admin/AuditLogPage.test.tsx` (99–100) and `src/test/supabase-mock.ts` (1026–1043). Tests themselves pass (184/184). The build gate is broken at baseline — recommend a type-only fix (small, non-UI) before/with Phase 1 so review agents have a working gate.

---

## 12. Performance Risks

1. **No code splitting**: all routes + hls.js + tus-js-client in one bundle; `LessonAssetsPage` (heavy upload logic) loads for everyone.
2. **VideoPlayer imports `hls.js` statically** in a shared component — bundle weight on every page (though used only on lesson pages + preview).
3. **Curriculum page** fires N+1 `listLessonsForUnit` queries sequentially (Promise.all — parallel ✓ but many round trips).
4. **No memoization on large lists** (students, codes, audit rows map) — fine at current scale.
5. **Spinner-based loading** delays perceived performance vs skeletons.
6. No lazy images beyond `loading="lazy"` thumbnails ✓.
7. Re-render risk: page-level state churn in big forms (CurriculumPage ~40 state fields) — acceptable but could split components.

---

## 13. Priorities for the UI-UX Blueprint

**P0 (foundation):** design tokens; font; Button/Input/Select/Badge/Card/Modal/Toast/Skeleton/EmptyState/ErrorState primitives; LayoutShell + nav system (student bottom nav, staff drawer); fix pre-existing TS build errors.
**P1 (screens):** landing (public identity), auth (split-panel premium), student dashboard (continue learning), curriculum & lesson polish, purchases, notifications, walid dashboard & management screens, admin audit/roles.
**P2 (cross-cutting):** tables→responsive strategy, pagination, filter/search patterns, confirmation dialogs, status badges, focus-visible & contrast, reduced motion, code splitting (lazy routes + lazy hls.js), RTL arrow icons, document title/favicon.
**P3 (verification):** responsive matrix, RTL checks, a11y pass, console-error pass, full test + typecheck + build gates after every phase.

---

## 14. Conclusion

The application is **functionally complete and well-tested** but visually and experientially at "generic admin template" level: no token system, no Arabic-first typography, no iconography, minimal public presence, spinners instead of skeletons, duplicated markup across 9 tables/6 selects/9 badges, inaccessible modals, and two orphan pages. The redesign plan in `UI-UX-BLUEPRINT.md` converts `STYLE.md` into concrete changes, phase by phase, while the regression protection in §11 keeps the 184-test contract and every backend integration intact.
