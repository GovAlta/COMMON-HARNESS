-- Migration: 005_resource_item
-- Description: Create resource_item table for generic resource/content management

CREATE TABLE IF NOT EXISTS resource_item (
    pk_resource_item        UUID         NOT NULL DEFAULT gen_random_uuid(),
    resource_title          VARCHAR(255) NOT NULL,
    resource_status         VARCHAR(20)  NOT NULL DEFAULT 'draft',
    resource_category       VARCHAR(50)  NOT NULL,
    resource_summary        VARCHAR(500),
    resource_content        TEXT,
    resource_author         VARCHAR(255),
    resource_region         VARCHAR(100),
    resource_published_at   TIMESTAMPTZ,
    resource_tags           JSONB        DEFAULT '[]'::jsonb,
    metadata                JSONB        DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by              UUID,
    updated_by              UUID,
    is_deleted              BOOLEAN      NOT NULL DEFAULT false,
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT pk_resource_item            PRIMARY KEY (pk_resource_item),
    CONSTRAINT fk_resource_item_created_by FOREIGN KEY (created_by)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT fk_resource_item_updated_by FOREIGN KEY (updated_by)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT ck_resource_item_status     CHECK (resource_status IN ('published', 'draft', 'archived')),
    CONSTRAINT ck_resource_item_category   CHECK (resource_category IN ('guide', 'announcement', 'policy', 'reference', 'bulletin'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_resource_item_status          ON resource_item (resource_status);
CREATE INDEX IF NOT EXISTS ix_resource_item_category        ON resource_item (resource_category);
CREATE INDEX IF NOT EXISTS ix_resource_item_region          ON resource_item (resource_region);
CREATE INDEX IF NOT EXISTS ix_resource_item_published_at    ON resource_item (resource_published_at);
CREATE INDEX IF NOT EXISTS ix_resource_item_is_deleted      ON resource_item (is_deleted);
CREATE INDEX IF NOT EXISTS ix_resource_item_deleted_status  ON resource_item (is_deleted, resource_status);
CREATE INDEX IF NOT EXISTS ix_resource_item_status_category ON resource_item (resource_status, resource_category);
CREATE INDEX IF NOT EXISTS ix_resource_item_status_created  ON resource_item (resource_status, created_at);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_resource_item_set_updated_at ON resource_item;
CREATE TRIGGER trg_resource_item_set_updated_at
    BEFORE UPDATE ON resource_item
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
