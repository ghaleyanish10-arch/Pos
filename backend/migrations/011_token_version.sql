-- Token-version rotation: switching roles bumps this counter, and any refresh
-- token minted under an older version is rejected server-side at refresh time.
-- This revokes the login-issued refresh token the moment the same account
-- switches hats, so a lifted session can never re-materialise a dropped one.
-- Old tokens carry no version claim (0), which matches this DEFAULT 0, so
-- pre-existing sessions keep working untouched.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;