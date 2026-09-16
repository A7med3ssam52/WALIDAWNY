-- =====================================================================
-- 0076_drop_stale_overloads
-- Two pre-existing one-arg overloads survived next to their wider
-- replacements (different arity = new overload, old one kept):
--
-- 1) toggle_lesson_completed(uuid, boolean) vs 0072's
--    (uuid, boolean, text): the old unmark keeps percent at 100 so the
--    next upsert instantly re-completes (the "phantom uncomplete" bug
--    0072 was built to kill), and the extra function breaks the 05
--    authenticated allowlist count.
--
-- 2) disable_student(uuid) [0007] vs 0069's (uuid, text): the old form
--    revokes sessions (0069 deliberately does NOT, so the suspended
--    student can sign in and read the reason) and takes no reason, and
--    single-arg calls are now ambiguous
--    ("function public.disable_student(unknown) is not unique").
--
-- Every caller passes the full argument list (frontend disableStudent
-- sends an explicit reason; toggle callers send a source), so dropping
-- the narrow forms is safe.
-- =====================================================================

DROP FUNCTION IF EXISTS public.toggle_lesson_completed(uuid, boolean);

-- ---------------------------------------------------------------------
-- disable_student(uuid): superseded by 0069's disable_student(uuid, text).
-- The surviving one-arg overload is worse than stale: it revokes the
-- student's sessions (0069 deliberately does NOT, so the suspended
-- student can sign in and read the reason) and takes no reason, and its
-- coexistence makes single-arg calls ambiguous
-- ("function public.disable_student(unknown) is not unique").
-- Every caller (frontend disableStudent, tests) passes an explicit
-- reason, so dropping the one-arg form is safe.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.disable_student(uuid);
