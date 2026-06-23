-- Migration: 019_expand_role_check
-- Description: Align the user_account.user_role_name DB CHECK constraint with
-- the 6-tier role hierarchy enforced by server/src/middleware/authorize.ts.
--
-- BEFORE: CHECK (user_role_name IN ('user', 'admin')) — only 2 values allowed.
-- The middleware (`ROLE_HIERARCHY = ['viewer','submitter','editor','manager',
-- 'admin','super_admin']`) recognises 6 values, so any attempt to assign a
-- middle-tier role (e.g. 'editor') by the set-role script would fail at the DB
-- layer — silent over-denial for users at intermediate privilege levels.
--
-- AFTER: CHECK accepts 'user' (legacy default — treated as 'viewer' by code)
-- plus the 6 hierarchy values. Existing rows keep 'user' unchanged; new rows
-- can use the richer scale. Idempotent: drops the old constraint if it exists,
-- adds the new one with IF NOT EXISTS via DO block.

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_user_account_role'
        AND conrelid = 'user_account'::regclass
  ) THEN
    ALTER TABLE user_account DROP CONSTRAINT ck_user_account_role;
  END IF;

  -- Add the expanded constraint
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_user_account_role'
        AND conrelid = 'user_account'::regclass
  ) THEN
    ALTER TABLE user_account
      ADD CONSTRAINT ck_user_account_role
      CHECK (user_role_name IN (
        'user',         -- legacy default — middleware aliases to 'viewer'
        'viewer',
        'submitter',
        'editor',
        'manager',
        'admin',
        'super_admin'
      ));
  END IF;
END$$;
