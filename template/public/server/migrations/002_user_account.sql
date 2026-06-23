-- Migration: 002_user_account
-- Description: Create user_account table for SSO authentication

CREATE TABLE IF NOT EXISTS user_account (
    pk_user_account       UUID         NOT NULL DEFAULT gen_random_uuid(),
    user_email_address    VARCHAR(255) NOT NULL,
    user_display_name     VARCHAR(255) NOT NULL,
    sso_provider_name     VARCHAR(50)  NOT NULL,
    sso_provider_id       VARCHAR(255) NOT NULL,
    google_id             VARCHAR(255),
    microsoft_id          VARCHAR(255),
    user_role_name        VARCHAR(20)  NOT NULL DEFAULT 'user',
    avatar_url            TEXT,
    is_active             BOOLEAN      NOT NULL DEFAULT true,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    is_deleted            BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT pk_user_account              PRIMARY KEY (pk_user_account),
    CONSTRAINT uq_user_account_email        UNIQUE (user_email_address),
    CONSTRAINT uq_user_account_google_id    UNIQUE (google_id),
    CONSTRAINT uq_user_account_microsoft_id UNIQUE (microsoft_id),
    CONSTRAINT ck_user_account_role         CHECK (user_role_name IN ('user', 'admin'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_user_account_email        ON user_account (user_email_address);
CREATE INDEX IF NOT EXISTS ix_user_account_google_id    ON user_account (google_id)    WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_user_account_microsoft_id ON user_account (microsoft_id) WHERE microsoft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_user_account_sso_provider ON user_account (sso_provider_name);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_user_account_set_updated_at ON user_account;
CREATE TRIGGER trg_user_account_set_updated_at
    BEFORE UPDATE ON user_account
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
