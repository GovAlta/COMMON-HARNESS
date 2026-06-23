-- Migration: 017_ai_message
-- Description: Create ai_message table for individual messages within AI conversations

CREATE TABLE IF NOT EXISTS ai_message (
    pk_ai_message                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    fk_ai_message_ai_conversation   UUID         NOT NULL,
    message_role                    VARCHAR(20)  NOT NULL,
    message_content                 TEXT         NOT NULL,
    message_model_name              VARCHAR(100),
    message_token_count             INTEGER      DEFAULT 0,
    message_image_url               TEXT,
    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_ai_message                    PRIMARY KEY (pk_ai_message),
    CONSTRAINT fk_ai_message_ai_conversation    FOREIGN KEY (fk_ai_message_ai_conversation)
        REFERENCES ai_conversation (pk_ai_conversation),
    CONSTRAINT ck_ai_message_role               CHECK (message_role IN ('user', 'assistant', 'system'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_ai_message_ai_conversation ON ai_message (fk_ai_message_ai_conversation);
CREATE INDEX IF NOT EXISTS ix_ai_message_created_at      ON ai_message (created_at);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_ai_message_set_updated_at ON ai_message;
CREATE TRIGGER trg_ai_message_set_updated_at
    BEFORE UPDATE ON ai_message
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
