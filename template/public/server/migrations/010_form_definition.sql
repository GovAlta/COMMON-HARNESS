-- Migration: 010_form_definition
-- Description: Create form_definition table for dynamic form system

CREATE TABLE IF NOT EXISTS form_definition (
    pk_form_definition      UUID         NOT NULL DEFAULT gen_random_uuid(),
    form_name               VARCHAR(255) NOT NULL,
    form_version_number     INTEGER      NOT NULL DEFAULT 1,
    form_schema             JSONB        NOT NULL,
    form_description        TEXT,
    is_published            BOOLEAN      NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by              UUID,
    updated_by              UUID,
    deleted_at              TIMESTAMPTZ,
    is_deleted              BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT pk_form_definition                PRIMARY KEY (pk_form_definition),
    CONSTRAINT uq_form_definition_name_version   UNIQUE (form_name, form_version_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_form_definition_published ON form_definition (is_published);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_form_definition_set_updated_at ON form_definition;
CREATE TRIGGER trg_form_definition_set_updated_at
    BEFORE UPDATE ON form_definition
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
