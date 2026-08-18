# STYLE.md — Product UI/UX & Visual Design Specification

## Purpose
This document defines the complete UI/UX, visual design, responsive behavior, accessibility, interaction, and design-system requirements for the platform.

`PLAN.md` defines what the product does, its architecture, business logic, database, security, and integrations.

`STYLE.md` defines how the product should look, feel, behave visually, and respond across devices.

`STYLE.md` MUST NOT override functional requirements in `PLAN.md`.

---

## 1. Core Design Goal

The platform must feel like a modern, premium educational SaaS product:

- Modern
- Professional
- Educational
- Trustworthy
- Clean
- Calm
- Premium
- Minimal
- Highly usable
- Mobile-first
- Accessible
- Consistent

Avoid outdated school-website aesthetics, excessive gradients/shadows/animations, visual clutter, random colors/spacing/radii, oversized UI, and desktop-first assumptions.

---

## 2. Mobile-First

Mobile-first is mandatory.

Design and implement in this order:

1. Mobile
2. Tablet
3. Desktop

The mobile interface must be intentionally designed, not merely a shrunken desktop layout.

The application must support small mobile screens, large mobile screens, tablets, laptops, and desktop monitors without unintended horizontal scrolling.

Recommended breakpoints:

- Mobile: < 640px
- Large Mobile: 640–767px
- Tablet: 768–1023px
- Desktop: 1024–1279px
- Large Desktop: >=1280px

Avoid arbitrary breakpoints unless there is a documented UX reason.

---

## 3. Arabic-First / RTL

The product is Arabic-first.

Use:

`<html lang="ar" dir="rtl">`

Support RTL correctly for:

- Navigation
- Forms
- Tables
- Modals
- Breadcrumbs
- Pagination
- Icons
- Animations
- Directional controls

Prefer CSS logical properties such as `margin-inline`, `padding-inline`, `inset-inline`, `border-inline`, and `text-align: start/end`.

---

## 4. Visual Direction

The product should feel like a professional modern EdTech/SaaS platform, not a generic dashboard template.

Every screen must have obvious visual hierarchy:

1. Primary action
2. Primary information
3. Secondary information
4. Supporting information

Users should understand the purpose of a screen within seconds.

---

## 5. Design System

Centralize all visual decisions into reusable tokens:

- Colors
- Typography
- Spacing
- Border radius
- Shadows
- Z-index
- Motion
- Container widths
- Breakpoints
- Component sizes

The design should be easy to rebrand later.

### Semantic color tokens

- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `background`
- `surface`
- `surface-muted`
- `foreground`
- `foreground-muted`
- `foreground-subtle`
- `border`
- `border-muted`
- `success`
- `warning`
- `error`
- `info`

Use one restrained primary brand color. Semantic colors must be reserved for semantic communication.

### Typography

Use a modern Arabic-compatible font stack with clear hierarchy:

- Display
- H1
- H2
- H3
- H4
- Body Large
- Body
- Body Small
- Caption
- Label
- Button

Optimize line-height for Arabic readability and mobile screens.

### Spacing

Use a consistent scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

### Radius

Use a consistent system:

`sm, md, lg, xl, full`

### Shadows

Use restrained levels:

`none, subtle, medium, elevated`

Do not put strong shadows around every card.

---

## 6. Layout System

Use reusable layout primitives:

- Page container
- Section
- Stack
- Inline
- Grid
- Card
- Surface
- Page header
- Content area
- Sidebar
- Topbar
- Bottom navigation

Control maximum content widths so text-heavy pages do not stretch excessively on large screens.

---

## 7. Navigation

### Public
Keep navigation simple and focused:

- Home
- Courses/Grades
- Login
- Register

### Student
Desktop:
- Sidebar or structured navigation

Mobile:
- Compact header
- Bottom navigation for the most important destinations

### Walid Awny
Desktop:
- Persistent sidebar
- Topbar
- Main content

Mobile:
- Drawer/collapsible navigation
- Compact topbar

### Admin
Use the same visual language with a denser administrative experience.

---

## 8. Page Structure

Use a predictable structure:

```text
Page
├── Page Header
│   ├── Title
│   ├── Description
│   └── Primary Action
├── Main Content
└── Supporting Content
```

Avoid inconsistent page structures between screens.

---

## 9. Components

### Cards
Use cards only when grouping improves comprehension. Keep padding, radius, borders, status, metadata, and actions consistent.

### Buttons
Variants:

- Primary
- Secondary
- Outline
- Ghost
- Destructive
- Link

States:

- Default
- Hover
- Pressed
- Focus
- Loading
- Disabled

Use clear labels and appropriate touch targets.

### Forms
States:

- Default
- Focus
- Filled
- Error
- Success
- Disabled
- Loading

Every field must have a label, input, optional description, and actionable validation message. Never rely only on placeholders.

### Tables
On mobile, use an intentional strategy:

- Horizontal scrolling
- Responsive cards
- Stacked rows
- Priority-based column hiding

Do not force a desktop table into a narrow screen.

### Modals
Must work on mobile, have clear titles/actions, maintain focus, support keyboard navigation, and confirm destructive actions.

### Toasts
Use concise:

- Success
- Info
- Warning
- Error

Do not use toast as the only communication for critical information.

---

## 10. Loading / Empty / Error States

Every asynchronous screen needs an intentional loading state. Prefer skeletons for content-heavy screens.

Every list/collection needs an empty state explaining:

1. What is empty
2. Why it may be empty
3. What the user can do next

Every data-dependent screen needs an error state with:

- Clear Arabic message
- Retry action

Never expose technical errors to normal users.

---

## 11. Authentication UX

Authentication screens must be minimal, focused, trustworthy, and mobile-first.

Required experiences:

- Login
- Register
- Forgot Password
- Password Reset
- Account Disabled
- Session Expired

---

## 12. Student Experience

The student UI must prioritize learning.

Dashboard priority:

1. Continue Learning
2. Current course/grade
3. Progress
4. Curriculum
5. Recent activity
6. Notifications

The primary action should always be obvious.

---

## 13. Lesson Experience

Lesson page priority:

1. Video
2. Lesson title
3. Progress
4. Lesson information
5. Resources
6. Navigation

The video player must be responsive and usable on mobile.

Resources such as PDFs must be easy to access without overwhelming the learning experience.

---

## 14. Purchase UX

Clearly communicate:

- Unit
- Price (base + platform fee = total)
- Ownership (permanent, one-time)
- Activation state
- Redemption result
- Benefits
- Trial lessons (free preview)

Primary actions must be obvious.

---

## 15. Dashboards

Avoid excessive KPI cards.

Use metrics only when actionable.

Hierarchy:

1. Important KPI
2. Important activity
3. Important actions
4. Detailed information

Charts should only be used when they improve understanding.

Administrative interfaces may be denser but must remain clean and responsive.

Use:

- Search
- Filters
- Pagination
- Bulk actions where appropriate
- Confirmation dialogs
- Status badges
- Tables

---

## 16. Status Badges

Use consistent semantic treatments for:

- Active
- Inactive
- Pending
- Expired
- Locked
- Published
- Draft
- Deleted
- Completed
- In Progress

The same status must look the same throughout the product.

---

## 17. Icons

Use one consistent icon system.

Rules:

- Consistent visual weight
- Correct RTL direction
- Icons support rather than replace important text
- Decorative icons must not harm accessibility
- Avoid mixing unrelated icon libraries

---

## 18. Motion

Animations must be subtle and purposeful.

Use motion for:

- Navigation
- Dialogs
- Dropdowns
- Toasts
- Progress
- State transitions

Avoid excessive animations, bouncing effects, long transitions, and distracting effects.

Respect reduced-motion preferences.

---

## 19. Accessibility

Mandatory:

- Keyboard navigation
- Visible focus states
- Sufficient contrast
- Semantic HTML
- Accessible labels
- Correct form associations
- ARIA only where necessary
- Screen-reader compatibility
- Touch-friendly targets
- Reduced-motion support

Never rely only on color to communicate state.

---

## 20. Performance

Do not unnecessarily increase bundle size or runtime cost.

Avoid:

- Huge assets
- Unoptimized images
- Excessive DOM complexity
- Unnecessary re-renders
- Unnecessary animation libraries

Use lazy loading where appropriate.

---

## 21. Protect Existing Functionality

UI/UX work MUST NOT break:

- Business logic
- Supabase schema
- RLS policies
- Authentication
- Access logic (trial / per-unit purchase)
- Bunny security
- Video authorization
- API contracts

unless explicitly required and approved.

UI changes should preserve existing behavior.

---

## 22. Component Reusability

Before creating a new component:

1. Search existing components.
2. Determine whether one can be reused.
3. Extend an existing component when appropriate.
4. Create a new component only when necessary.

Do not create duplicate components for the same purpose.

---

## 23. UI Audit Before Coding

Before modifying UI code:

Create:

`UI-AUDIT.md`

It must include:

- Existing screens
- Existing components
- Current visual problems
- UX problems
- Responsive problems
- Accessibility problems
- Reusable components
- Components requiring redesign
- Regression risks

No UI implementation should begin before the audit is complete.

---

## 24. UI/UX Blueprint Before Coding

After the audit create:

`UI-UX-BLUEPRINT.md`

It must define:

- Design direction
- Design tokens
- Typography
- Color system
- Layouts
- Navigation
- Component behavior
- Screen-by-screen specifications
- Mobile behavior
- Tablet behavior
- Desktop behavior
- Loading states
- Empty states
- Error states
- Accessibility
- Motion
- Acceptance criteria

Major design decisions must be documented before implementation.

---

## 25. Implementation Phases

Recommended UI phases:

1. Design System & Shared Foundations
2. Public Experience
3. Authentication Experience
4. Student Experience
5. Walid Awny Dashboard
6. Admin Dashboard
7. Shared States, Forms, Tables & Data UX
8. Responsive & Mobile Optimization
9. Accessibility & Performance
10. Final Visual QA

You may adjust the phase boundaries based on the actual repository.

Independent phases should run in parallel.

Dependent phases must run sequentially.

---

## 26. Parallel Execution

Before execution, build a dependency graph.

Example:

```text
Design System
      ↓
 ┌────┼──────┬──────┐
 ↓    ↓      ↓      ↓
Public Auth Student Walid
                    ↓
                  Admin
```

Independent phases may run simultaneously.

If phases modify the same critical files/components, coordinate them or run them sequentially.

Never allow parallel agents to overwrite each other's work.

---

## 27. Sub-Agent Per Phase

Each implementation phase MUST have a dedicated Sub-Agent.

Every Sub-Agent must:

1. Read `PLAN.md`
2. Read `STYLE.md`
3. Read `UI-AUDIT.md`
4. Read `UI-UX-BLUEPRINT.md`
5. Inspect relevant existing code
6. Implement only its assigned scope
7. Run relevant tests
8. Check responsive behavior
9. Check RTL
10. Check accessibility
11. Report modified files
12. Report completed requirements
13. Report unresolved issues

---

## 28. Review After Every Sub-Agent

Every implementation Sub-Agent MUST be followed by an independent lightweight Review Sub-Agent.

Reviewer checks:

- `STYLE.md` compliance
- `UI-UX-BLUEPRINT.md` compliance
- `PLAN.md` functional preservation
- Visual consistency
- Responsive behavior
- RTL
- Accessibility
- Console errors
- Scope violations
- Regressions

Return exactly:

`PASS`

or:

`FAIL`

If FAIL:

```text
Implementation Agent
        ↓
Review Agent
        ↓
FAIL
        ↓
Fix Agent
        ↓
Review Agent
        ↓
PASS
```

Do not move to dependent phases until required review passes.

---

## 29. Final Visual QA

At the end, inspect every major screen and route across:

- Mobile
- Tablet
- Desktop
- RTL

Verify:

- Navigation
- Typography
- Colors
- Spacing
- Cards
- Forms
- Tables
- Modals
- Buttons
- Loading
- Empty
- Error
- Disabled
- Hover
- Focus
- Active
- Locked
- Responsive overflow
- Accessibility
- Performance

The final UI must feel like one coherent product.

---

## 30. Definition of Done

The UI/UX work is complete only when:

- `UI-AUDIT.md` exists.
- `UI-UX-BLUEPRINT.md` exists.
- All required screens are redesigned.
- All screens follow the same design system.
- Mobile-first behavior is verified.
- RTL is verified.
- Accessibility requirements are met.
- Loading/empty/error states exist.
- Existing functionality remains intact.
- Every implementation phase has passed independent review.
- Final Visual QA passes.
- Final Functional Regression QA passes.
- No blocking console errors remain.
- No unintended horizontal overflow remains.
- No major visual inconsistencies remain.

Only then may the UI/UX refinement be considered complete.
