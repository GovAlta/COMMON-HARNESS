-- Migration: 013_notification_subscription
-- Description: Create notification_subscription table for user notification preferences

CREATE TABLE IF NOT EXISTS notification_subscription (
    pk_notification_subscription                UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_notification_subscription_user_account   UUID         NOT NULL,
    subscription_type                           VARCHAR(20)  NOT NULL,
    subscription_target_id                      UUID,
    subscription_region_name                    VARCHAR(100),
    filter_criteria                             JSONB        DEFAULT '{}',
    created_at                                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                                  UUID,
    updated_by                                  UUID,

    CONSTRAINT pk_notification_subscription              PRIMARY KEY (pk_notification_subscription),
    CONSTRAINT fk_notification_subscription_user_account FOREIGN KEY (fk_notification_subscription_user_account)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT uq_notification_subscription_user_type_target
        UNIQUE (fk_notification_subscription_user_account, subscription_type, subscription_target_id),
    CONSTRAINT ck_notification_subscription_type         CHECK (subscription_type IN ('resource', 'region', 'broadcast'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_notification_subscription_user_account ON notification_subscription (fk_notification_subscription_user_account);
CREATE INDEX IF NOT EXISTS ix_notification_subscription_type         ON notification_subscription (subscription_type);
CREATE INDEX IF NOT EXISTS ix_notification_subscription_target       ON notification_subscription (subscription_target_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_notification_subscription_set_updated_at ON notification_subscription;
CREATE TRIGGER trg_notification_subscription_set_updated_at
    BEFORE UPDATE ON notification_subscription
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
