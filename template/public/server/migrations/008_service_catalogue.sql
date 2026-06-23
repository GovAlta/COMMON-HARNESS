-- Migration: 008_service_catalogue
-- Description: Create service_catalogue table with full-text search support

CREATE TABLE IF NOT EXISTS service_catalogue (
    pk_service_catalogue                    UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_service_catalogue_service_category   UUID         NOT NULL,
    service_title                           VARCHAR(255) NOT NULL,
    service_description_brief               VARCHAR(255) NOT NULL,
    service_description_full                TEXT         NOT NULL,
    service_eligibility                     TEXT,
    service_how_to_apply                    TEXT,
    service_required_documents              TEXT,
    service_contact_phone                   VARCHAR(20),
    service_contact_email                   VARCHAR(255),
    is_published                            BOOLEAN      NOT NULL DEFAULT true,
    tsv                                     TSVECTOR,
    created_at                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                              UUID,
    updated_by                              UUID,
    deleted_at                              TIMESTAMPTZ,
    is_deleted                              BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT pk_service_catalogue                  PRIMARY KEY (pk_service_catalogue),
    CONSTRAINT fk_service_catalogue_service_category FOREIGN KEY (fk_service_catalogue_service_category)
        REFERENCES service_category (pk_service_category)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_service_catalogue_category  ON service_catalogue (fk_service_catalogue_service_category);
CREATE INDEX IF NOT EXISTS ix_service_catalogue_published ON service_catalogue (is_published);
CREATE INDEX IF NOT EXISTS ix_service_catalogue_tsv       ON service_catalogue USING GIN (tsv);

-- Full-text search trigger function
CREATE OR REPLACE FUNCTION service_catalogue_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.tsv := to_tsvector(
        'pg_catalog.english',
        COALESCE(NEW.service_title, '') || ' ' || COALESCE(NEW.service_description_brief, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update tsvector on insert/update
DROP TRIGGER IF EXISTS trg_service_catalogue_tsv ON service_catalogue;
CREATE TRIGGER trg_service_catalogue_tsv
    BEFORE INSERT OR UPDATE ON service_catalogue
    FOR EACH ROW
    EXECUTE FUNCTION service_catalogue_tsv_trigger();

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_service_catalogue_set_updated_at ON service_catalogue;
CREATE TRIGGER trg_service_catalogue_set_updated_at
    BEFORE UPDATE ON service_catalogue
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
