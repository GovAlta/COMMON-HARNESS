-- Migration 021: contact_inquiry
-- Stores inbound messages from the public Contact form. Anonymous-friendly:
-- no FK to user_account so guests can submit without signing in. Admins can
-- view + triage via the existing /admin views or a future inbox UI.

CREATE TABLE IF NOT EXISTS contact_inquiry (
    pk_contact_inquiry      UUID         NOT NULL DEFAULT gen_random_uuid(),
    inquiry_name            VARCHAR(255) NOT NULL,
    inquiry_email           VARCHAR(320) NOT NULL,
    inquiry_subject         VARCHAR(300) NULL,
    inquiry_message         TEXT         NOT NULL,
    inquiry_ip_address      INET         NULL,
    inquiry_user_agent      TEXT         NULL,
    inquiry_status          VARCHAR(20)  NOT NULL DEFAULT 'new',
    handled_by              UUID         NULL,
    handled_at              TIMESTAMPTZ  NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_contact_inquiry  PRIMARY KEY (pk_contact_inquiry),
    CONSTRAINT fk_contact_inquiry_handled_by FOREIGN KEY (handled_by)
        REFERENCES user_account (pk_user_account) ON DELETE SET NULL,
    CONSTRAINT ck_contact_inquiry_status CHECK (inquiry_status IN ('new', 'in_progress', 'resolved', 'spam'))
);

CREATE INDEX IF NOT EXISTS ix_contact_inquiry_created_at ON contact_inquiry (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_contact_inquiry_status     ON contact_inquiry (inquiry_status);
CREATE INDEX IF NOT EXISTS ix_contact_inquiry_email      ON contact_inquiry (LOWER(inquiry_email));

-- updated_at trigger (uses the harness's generic set_updated_at function
-- defined in migration 001_extensions_and_functions.sql).
DROP TRIGGER IF EXISTS trg_contact_inquiry_set_updated_at ON contact_inquiry;
CREATE TRIGGER trg_contact_inquiry_set_updated_at
    BEFORE UPDATE ON contact_inquiry
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
