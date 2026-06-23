-- Migration: 014_notification_message
-- Description: Create notification_message table for system notifications

CREATE TABLE IF NOT EXISTS notification_message (
    pk_notification_message                     UUID         NOT NULL DEFAULT gen_random_uuid(),
    message_title                               VARCHAR(255) NOT NULL,
    message_body                                TEXT         NOT NULL,
    message_type                                VARCHAR(30)  NOT NULL DEFAULT 'general',
    message_region_filter                       VARCHAR(100),
    fk_notification_message_resource_item       UUID,
    created_at                                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                                  UUID,
    updated_by                                  UUID,

    CONSTRAINT pk_notification_message                  PRIMARY KEY (pk_notification_message),
    CONSTRAINT fk_notification_message_resource_item    FOREIGN KEY (fk_notification_message_resource_item)
        REFERENCES resource_item (pk_resource_item),
    CONSTRAINT ck_notification_message_type             CHECK (message_type IN (
        'resource_update', 'service_notice', 'announcement', 'general'
    ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_notification_message_type          ON notification_message (message_type);
CREATE INDEX IF NOT EXISTS ix_notification_message_resource_item ON notification_message (fk_notification_message_resource_item);
CREATE INDEX IF NOT EXISTS ix_notification_message_created_at    ON notification_message (created_at);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_notification_message_set_updated_at ON notification_message;
CREATE TRIGGER trg_notification_message_set_updated_at
    BEFORE UPDATE ON notification_message
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
