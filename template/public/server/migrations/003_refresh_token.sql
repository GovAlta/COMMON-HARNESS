-- Migration: 003_refresh_token
-- Description: Create refresh_token table for JWT refresh token management

CREATE TABLE IF NOT EXISTS refresh_token (
    pk_refresh_token                UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_refresh_token_user_account   UUID         NOT NULL,
    token_hash_value                VARCHAR(255) NOT NULL,
    token_expires_at                TIMESTAMPTZ  NOT NULL,
    token_revoked_at                TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_refresh_token              PRIMARY KEY (pk_refresh_token),
    CONSTRAINT fk_refresh_token_user_account FOREIGN KEY (fk_refresh_token_user_account)
        REFERENCES user_account (pk_user_account)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_refresh_token_user_account ON refresh_token (fk_refresh_token_user_account);
CREATE INDEX IF NOT EXISTS ix_refresh_token_hash         ON refresh_token (token_hash_value);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_refresh_token_set_updated_at ON refresh_token;
CREATE TRIGGER trg_refresh_token_set_updated_at
    BEFORE UPDATE ON refresh_token
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
