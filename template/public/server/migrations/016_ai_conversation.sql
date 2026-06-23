-- Migration: 016_ai_conversation
-- Description: Create ai_conversation table for AI chat sessions

CREATE TABLE IF NOT EXISTS ai_conversation (
    pk_ai_conversation                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_ai_conversation_user_account     UUID         NOT NULL,
    conversation_title                  VARCHAR(255) DEFAULT 'New Conversation',
    created_at                          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                          UUID,
    updated_by                          UUID,

    CONSTRAINT pk_ai_conversation              PRIMARY KEY (pk_ai_conversation),
    CONSTRAINT fk_ai_conversation_user_account FOREIGN KEY (fk_ai_conversation_user_account)
        REFERENCES user_account (pk_user_account)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_ai_conversation_user_account ON ai_conversation (fk_ai_conversation_user_account);
CREATE INDEX IF NOT EXISTS ix_ai_conversation_created_at   ON ai_conversation (created_at);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_ai_conversation_set_updated_at ON ai_conversation;
CREATE TRIGGER trg_ai_conversation_set_updated_at
    BEFORE UPDATE ON ai_conversation
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
