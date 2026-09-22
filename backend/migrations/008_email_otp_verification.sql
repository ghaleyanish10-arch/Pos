-- =============================================================
-- Gmail SMTP OTP email verification: attempt limits on codes,
-- a used flag for invalidate-on-consume, and signup pre-verify.
-- =============================================================

-- Failed verification attempts per live code. Reset whenever a new code is
-- issued; when it reaches the limit the code is burned even if unexpired,
-- so a leaked 6-digit code can't be brute-forced at line rate.
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- Marks codes killed by too many wrong guesses (distinct from used_at, which
-- means "successfully consumed" — the error copy differs for the two cases).
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS burned_at TIMESTAMPTZ;
