-- Migration: 004_audit_log
-- Description: Create audit_log table for tracking data changes and application events
-- Note: audit_action is VARCHAR(50) to support extended event types (LOGIN, LOGOUT, AI_CHAT, etc.)
-- Note: audit_record_id is nullable because not all audit events reference a specific record

CREATE TABLE IF NOT EXISTS audit_log (
    pk_audit_log       UUID         NOT NULL DEFAULT gen_random_uuid(),
    audit_table_name   VARCHAR(100) NOT NULL,
    audit_record_id    UUID,
    audit_action       VARCHAR(50)  NOT NULL,
    audit_old_data     JSONB,
    audit_new_data     JSONB,
    audit_user_id      UUID,
    audit_ip_address   INET,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_audit_log              PRIMARY KEY (pk_audit_log),
    CONSTRAINT fk_audit_log_user_account FOREIGN KEY (audit_user_id)
        REFERENCES user_account (pk_user_account)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_audit_log_table_name    ON audit_log (audit_table_name);
CREATE INDEX IF NOT EXISTS ix_audit_log_record_id     ON audit_log (audit_record_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_user_id       ON audit_log (audit_user_id) WHERE audit_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_audit_log_created_at    ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS ix_audit_log_table_action  ON audit_log (audit_table_name, audit_action);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_audit_log_set_updated_at ON audit_log;
CREATE TRIGGER trg_audit_log_set_updated_at
    BEFORE UPDATE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
