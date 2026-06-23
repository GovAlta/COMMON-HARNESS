-- Migration: 012_file_attachment
-- Description: Create file_attachment table for form submission file uploads

CREATE TABLE IF NOT EXISTS file_attachment (
    pk_file_attachment                      UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_file_attachment_form_submission      UUID,
    file_original_name                      VARCHAR(255) NOT NULL,
    file_stored_name                        VARCHAR(255) NOT NULL,
    file_mime_type                          VARCHAR(100) NOT NULL,
    file_size_bytes                         INTEGER      NOT NULL,
    file_data                               BYTEA,
    storage_provider_name                   VARCHAR(50)  NOT NULL DEFAULT 'database',
    storage_reference_path                  TEXT,
    created_at                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                              UUID,
    updated_by                              UUID,

    CONSTRAINT pk_file_attachment                    PRIMARY KEY (pk_file_attachment),
    CONSTRAINT fk_file_attachment_form_submission    FOREIGN KEY (fk_file_attachment_form_submission)
        REFERENCES form_submission (pk_form_submission)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_file_attachment_form_submission ON file_attachment (fk_file_attachment_form_submission);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_file_attachment_set_updated_at ON file_attachment;
CREATE TRIGGER trg_file_attachment_set_updated_at
    BEFORE UPDATE ON file_attachment
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
