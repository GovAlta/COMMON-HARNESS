-- Migration: 015_notification_delivery
-- Description: Create notification_delivery table for tracking message delivery to users

CREATE TABLE IF NOT EXISTS notification_delivery (
    pk_notification_delivery                        UUID        NOT NULL DEFAULT gen_random_uuid(),
    fk_notification_delivery_notification_message   UUID        NOT NULL,
    fk_notification_delivery_user_account           UUID        NOT NULL,
    is_read                                         BOOLEAN     NOT NULL DEFAULT false,
    read_at                                         TIMESTAMPTZ,
    delivered_at                                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at                                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_notification_delivery                         PRIMARY KEY (pk_notification_delivery),
    CONSTRAINT fk_notification_delivery_notification_message    FOREIGN KEY (fk_notification_delivery_notification_message)
        REFERENCES notification_message (pk_notification_message),
    CONSTRAINT fk_notification_delivery_user_account            FOREIGN KEY (fk_notification_delivery_user_account)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT uq_notification_delivery_message_user
        UNIQUE (fk_notification_delivery_notification_message, fk_notification_delivery_user_account)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_notification_delivery_user_account ON notification_delivery (fk_notification_delivery_user_account);
CREATE INDEX IF NOT EXISTS ix_notification_delivery_user_unread  ON notification_delivery (fk_notification_delivery_user_account, is_read);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_notification_delivery_set_updated_at ON notification_delivery;
CREATE TRIGGER trg_notification_delivery_set_updated_at
    BEFORE UPDATE ON notification_delivery
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
