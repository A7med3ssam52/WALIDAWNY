-- Update the platform display name in the live database.
-- Rebrand: "مستر وليد عونى" -> "وليد عونى". Existing rows were seeded
-- with the old name (0011) and updated once (0024); this migration
-- applies the final rename for already-deployed environments.
UPDATE public.app_settings
SET value = '"منصة وليد عونى التعليمية"',
    updated_at = now()
WHERE key = 'platform_name';
