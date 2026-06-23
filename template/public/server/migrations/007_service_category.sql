-- Migration: 007_service_category
-- Description: Create service_category table and seed default categories

CREATE TABLE IF NOT EXISTS service_category (
    pk_service_category    UUID         NOT NULL DEFAULT gen_random_uuid(),
    category_name          VARCHAR(100) NOT NULL,
    category_icon_name     VARCHAR(50)  NOT NULL,
    category_sort_order    INTEGER      NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by             UUID,
    updated_by             UUID,

    CONSTRAINT pk_service_category        PRIMARY KEY (pk_service_category),
    CONSTRAINT uq_service_category_name   UNIQUE (category_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_service_category_sort_order ON service_category (category_sort_order);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_service_category_set_updated_at ON service_category;
CREATE TRIGGER trg_service_category_set_updated_at
    BEFORE UPDATE ON service_category
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Seed the default categories
INSERT INTO service_category (category_name, category_icon_name, category_sort_order)
VALUES
    ('Emergency Services',    'emergency',            1),
    ('Financial Assistance',  'wallet',               2),
    ('Recovery Support',      'build',                3),
    ('Reporting',             'analytics',            4),
    ('Information',           'information-circle',   5)
ON CONFLICT (category_name) DO NOTHING;
