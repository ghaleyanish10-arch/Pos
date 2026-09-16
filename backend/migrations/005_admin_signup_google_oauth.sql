-- =============================================================
-- Admin/owner signup: Google OAuth, 6-digit email verification codes.
-- The business/tenant IS a branch (Option A): no new tenant table —
-- every signup reuses/clains branches as the tenant unit.
-- =============================================================

-- 1. Google OAuth accounts compact-linked to users.
--    One user has at most one row per provider; (provider, provider_sub)
--    is the stable Google identity used to find the account again.
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider       TEXT NOT NULL DEFAULT 'google',
    provider_sub   TEXT NOT NULL,
    provider_email TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts (user_id);

-- 2. 6-digit email verification codes. Single-use, 10-minute expiry.
--    Only the SHA-256 hash of the code is stored — the raw digits exist
--    only in the email and in memory, never logged or returned.
CREATE TABLE IF NOT EXISTS verification_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes (user_id, created_at DESC);

-- 3. Throttle code resends: the last moment a code was issued per user.
--    Kept on the user row so the throttle is a single indexed UPDATE/SELECT.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_code_sent_at TIMESTAMPTZ;