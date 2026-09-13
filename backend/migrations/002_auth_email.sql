-- Account email verification and password-reset tokens.
-- Tokens are stored as SHA-256 hashes; the raw value is only ever emailed.
CREATE TABLE IF NOT EXISTS auth_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL CHECK (kind IN ('verify_email', 'reset_password')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_kind ON auth_tokens (kind);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
