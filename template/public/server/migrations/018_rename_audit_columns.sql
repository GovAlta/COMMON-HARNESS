-- Migration: 018_rename_audit_columns
-- Description: Rename prefixed audit_log columns to standard names and add user_agent column

ALTER TABLE audit_log RENAME COLUMN audit_table_name TO table_name;
ALTER TABLE audit_log RENAME COLUMN audit_record_id  TO record_id;
ALTER TABLE audit_log RENAME COLUMN audit_action      TO action;
ALTER TABLE audit_log RENAME COLUMN audit_old_data    TO old_data;
ALTER TABLE audit_log RENAME COLUMN audit_new_data    TO new_data;
ALTER TABLE audit_log RENAME COLUMN audit_user_id     TO user_id;
ALTER TABLE audit_log RENAME COLUMN audit_ip_address  TO ip_address;

-- Add user_agent column (nullable text, not stored in new_data JSONB anymore)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Recreate indexes with updated column names
DROP INDEX IF EXISTS ix_audit_log_table_name;
DROP INDEX IF EXISTS ix_audit_log_record_id;
DROP INDEX IF EXISTS ix_audit_log_user_id;
DROP INDEX IF EXISTS ix_audit_log_table_action;

CREATE INDEX IF NOT EXISTS ix_audit_log_table_name   ON audit_log (table_name);
CREATE INDEX IF NOT EXISTS ix_audit_log_record_id    ON audit_log (record_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_user_id      ON audit_log (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_audit_log_table_action  ON audit_log (table_name, action);

-- Update foreign key constraint to reference new column name
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS fk_audit_log_user_account;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_log_user_account
    FOREIGN KEY (user_id) REFERENCES user_account (pk_user_account);
