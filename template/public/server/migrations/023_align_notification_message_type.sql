-- Migration 023: align ck_notification_message_type with the application enum
--
-- Background: migration 014 created the table with CHECK values
--   ('resource_update', 'service_notice', 'announcement', 'general')
-- but the TypeScript NotificationMessageType, Zod validator, and admin UI all
-- ship a different set:
--   ('service_update', 'announcement', 'emergency_broadcast', 'general')
-- Result: admins picking 'service_update' or 'emergency_broadcast' from the
-- Broadcast UI hit a 23514 (CHECK constraint violation) at INSERT time,
-- surfaced to the client as a confusing 422.
--
-- This migration replaces the constraint with the UNION of both sets so that
-- (a) the application's canonical four values now insert cleanly AND
-- (b) any historical rows seeded with 'resource_update' / 'service_notice'
--     continue to satisfy the check.
--
-- Idempotent: DROP IF EXISTS + add the new constraint. Re-running is a no-op
-- because the CHECK is named.

ALTER TABLE notification_message
    DROP CONSTRAINT IF EXISTS ck_notification_message_type;

ALTER TABLE notification_message
    ADD CONSTRAINT ck_notification_message_type
    CHECK (message_type IN (
        -- Canonical (UI + validator + TS type)
        'service_update',
        'announcement',
        'emergency_broadcast',
        'general',
        -- Legacy (preserved for backwards compatibility with earlier seeds)
        'resource_update',
        'service_notice'
    ));
