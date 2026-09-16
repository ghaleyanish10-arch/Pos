package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"
)

const (
	// codeTTL is how long a 6-digit verification code stays valid.
	codeTTL = 10 * time.Minute
	// resendCooldown throttles code resends to one per minute per user.
	resendCooldown = 60 * time.Second
	// codeDigits fixes the code length for the UI (a 6-box pin pad).
	codeDigits = 6
)

// GenerateCode returns a cryptographically random 6-digit numeric code.
// The code is generated here and only ever returned to the caller that emails
// it — it is never stored in plaintext and never logged.
func GenerateCode() (string, error) {
	max := big.NewInt(1_000_000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("generate code: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// HashCode is the SHA-256 hex digest stored in verification_codes, matching
// the auth_tokens pattern: the raw value exists only in the email client.
func HashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// CodeTTL exposes the lifetime for handlers, tests and email copy.
func CodeTTL() time.Duration { return codeTTL }

// ResendCooldown exposes the resend throttle for handlers and tests.
func ResendCooldown() time.Duration { return resendCooldown }

// CanResend reports whether the user may be sent another code: no code has
// been issued yet, or the last one was issued more than resendCooldown ago.
// Purely informational; no locks, ideal for a pre-send guard.
func (s *Service) CanResend(ctx context.Context, userID string) (bool, error) {
	var last time.Time
	var exists bool
	err := s.db.QueryRow(ctx,
		`SELECT last_code_sent_at, last_code_sent_at IS NOT NULL FROM users WHERE id = $1`,
		userID,
	).Scan(&last, &exists)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}
	return time.Since(last) >= resendCooldown, nil
}

// IssueCode generates a 6-digit code, stores ONLY its hash for this user
// (invalidating any prior unconsumed code), stamps last_code_sent_at, and
// returns the raw code for the emailer. Callers must have checked CanResend
// (or be the very first signup send) to respect the throttle.
func (s *Service) IssueCode(ctx context.Context, userID string) (string, error) {
	code, err := GenerateCode()
	if err != nil {
		return "", err
	}
	hash := HashCode(code)

	// Invalidate any previous unconsumed code — one live code per user.
	if _, err := s.db.Exec(ctx,
		`DELETE FROM verification_codes WHERE user_id = $1 AND used_at IS NULL`,
		userID,
	); err != nil {
		return "", fmt.Errorf("clear old codes: %w", err)
	}

	if _, err := s.db.Exec(ctx,
		`INSERT INTO verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, time.Now().Add(codeTTL),
	); err != nil {
		return "", fmt.Errorf("store code: %w", err)
	}

	if _, err := s.db.Exec(ctx,
		`UPDATE users SET last_code_sent_at = now() WHERE id = $1`,
		userID,
	); err != nil {
		return "", fmt.Errorf("stamp last code sent: %w", err)
	}

	return code, nil
}

// ConsumeCode atomically marks a verification code used and returns the owning
// user. Expired, already-used or unknown codes all fail — exactly the
// single-use semantics the email-verification link tokens already have.
func (s *Service) ConsumeCode(ctx context.Context, userID, rawCode string) error {
	hash := HashCode(rawCode)
	var consumedUserID string
	err := s.db.QueryRow(ctx,
		`UPDATE verification_codes SET used_at = now()
		 WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()
		 RETURNING user_id`,
		userID, hash,
	).Scan(&consumedUserID)
	if err != nil {
		return fmt.Errorf("invalid or expired verification code")
	}
	return nil
}