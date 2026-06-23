-- Migration: 006_resource_update
-- Description: Create resource_update table for tracking changes to resource items

CREATE TABLE IF NOT EXISTS resource_update (
    pk_resource_update                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_resource_update_resource_item    UUID         NOT NULL,
    update_title                        VARCHAR(255) NOT NULL,
    update_description                  TEXT,
    update_type                         VARCHAR(50)  NOT NULL,
    created_at                          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                          UUID,

    CONSTRAINT pk_resource_update                PRIMARY KEY (pk_resource_update),
    CONSTRAINT fk_resource_update_resource_item  FOREIGN KEY (fk_resource_update_resource_item)
        REFERENCES resource_item (pk_resource_item),
    CONSTRAINT fk_resource_update_created_by     FOREIGN KEY (created_by)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT ck_resource_update_type           CHECK (update_type IN ('revision', 'correction', 'supplement', 'status_change'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_resource_update_resource_item ON resource_update (fk_resource_update_resource_item);
CREATE INDEX IF NOT EXISTS ix_resource_update_type          ON resource_update (update_type);
CREATE INDEX IF NOT EXISTS ix_resource_update_created_at    ON resource_update (created_at);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_resource_update_set_updated_at ON resource_update;
CREATE TRIGGER trg_resource_update_set_updated_at
    BEFORE UPDATE ON resource_update
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
