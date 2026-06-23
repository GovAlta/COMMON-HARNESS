-- Migration: 011_form_submission
-- Description: Create form_submission table for dynamic form submissions

CREATE TABLE IF NOT EXISTS form_submission (
    pk_form_submission                      UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_form_submission_form_definition      UUID         NOT NULL,
    fk_form_submission_user_account         UUID         NOT NULL,
    submission_data                         JSONB        NOT NULL,
    submission_status                       VARCHAR(20)  NOT NULL DEFAULT 'submitted',
    submission_reference_number             VARCHAR(20)  NOT NULL,
    created_at                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                              UUID,
    updated_by                              UUID,

    CONSTRAINT pk_form_submission                    PRIMARY KEY (pk_form_submission),
    CONSTRAINT fk_form_submission_form_definition    FOREIGN KEY (fk_form_submission_form_definition)
        REFERENCES form_definition (pk_form_definition),
    CONSTRAINT fk_form_submission_user_account       FOREIGN KEY (fk_form_submission_user_account)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT uq_form_submission_reference_number   UNIQUE (submission_reference_number),
    CONSTRAINT ck_form_submission_status             CHECK (submission_status IN (
        'draft', 'submitted', 'in-review', 'approved', 'rejected', 'completed', 'retracted'
    ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_form_submission_form_definition ON form_submission (fk_form_submission_form_definition);
CREATE INDEX IF NOT EXISTS ix_form_submission_user_account    ON form_submission (fk_form_submission_user_account);
CREATE INDEX IF NOT EXISTS ix_form_submission_reference       ON form_submission (submission_reference_number);
CREATE INDEX IF NOT EXISTS ix_form_submission_status          ON form_submission (submission_status);
CREATE INDEX IF NOT EXISTS ix_form_submission_created_at      ON form_submission (created_at);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_form_submission_set_updated_at ON form_submission;
CREATE TRIGGER trg_form_submission_set_updated_at
    BEFORE UPDATE ON form_submission
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
