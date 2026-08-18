-- Update the platform display name in the live database.
-- The original 0011 seed used ON CONFLICT DO NOTHING, so an existing
-- row keeps the old English value; this migration explicitly updates it.
UPDATE public.app_settings
SET value = '"وليد عونى"',
    updated_at = now()
WHERE key = 'platform_name';
