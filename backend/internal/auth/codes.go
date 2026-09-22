package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"
)

// ErrCodeExpired is returned when the live code for a user has aged past its
// 10-minute TTL. It lets handlers (and the UI) tell "wrong digit" apart from
// "expired — ask for a fresh one" instead of one generic message.
var ErrCodeExpired = errors.New("verification code expired")

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
	var last *time.Time
	err := s.db.QueryRow(ctx,
		`SELECT last_code_sent_at FROM users WHERE id = $1`,
		userID,
	).Scan(&last)
	if err != nil {
		return false, err
	}
	// NULL last_code_sent_at = the very first code — never sent, so allowed.
	if last == nil {
		return true, nil
	}
	return time.Since(*last) >= resendCooldown, nil
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

// maxCodeAttempts caps wrong guesses against one live code. Six digits give
// a million combinations; the cap keeps an online guesser far below any
// useful fraction of that inside the 10-minute expiry.
const maxCodeAttempts = 5

// MaxCodeAttempts exposes the cap for handlers (error copy) and tests.
func MaxCodeAttempts() int { return maxCodeAttempts }

// ConsumeCode atomically marks a verification code used and returns the owning
// user. Expired, already-used, burned or unknown codes all fail — exactly the
// single-use semantics the email-verification link tokens already have. A
// wrong guess increments the attempt counter; hitting the cap burns the code
// so even the correct digits stop working (request a fresh one).
func (s *Service) ConsumeCode(ctx context.Context, userID, rawCode string) error {
	hash := HashCode(rawCode)
	var consumedUserID string
	err := s.db.QueryRow(ctx,
		`UPDATE verification_codes SET used_at = now()
		 WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND burned_at IS NULL AND expires_at > now()
		 RETURNING user_id`,
		userID, hash,
	).Scan(&consumedUserID)
	if err == nil {
		return nil
	}

	// Wrong code: bump the attempt counter and burn the code at the cap.
	// The UPDATE ... WHERE attempts < cap makes the burn atomic — racing
	// guessers can't overshoot it. Note the wrong hash must NOT appear in
	// this statement: an unused parameter ($2) leaves Postgres unable to
	// infer its type (42P18) and the whole bump would silently no-op.
	tag, aerr := s.db.Exec(ctx,
		`UPDATE verification_codes
		 SET attempts = attempts + 1,
		     burned_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE burned_at END
		 WHERE user_id = $1 AND used_at IS NULL AND burned_at IS NULL AND expires_at > now()
		 AND attempts < $2`,
		userID, maxCodeAttempts,
	)
	if aerr != nil {
		return fmt.Errorf("invalid or expired verification code")
	}
	_ = tag

	// A live code that aged past its TTL is "expired", not "wrong digit" —
	// the UI offers a fresh code instead of guessing into the grave. The
	// table keeps one live code per user, so an existence check is exact.
	var expired bool
	if serr := s.db.QueryRow(ctx,
		`SELECT exists(
			SELECT 1 FROM verification_codes
			WHERE user_id = $1 AND used_at IS NULL AND burned_at IS NULL AND expires_at <= now()
		)`,
		userID,
	).Scan(&expired); serr == nil && expired {
		return ErrCodeExpired
	}

	return fmt.Errorf("invalid or expired verification code")
}

// CodeAttempts reports how many wrong guesses remain on the user's live code
// so the handler can tell "wrong code" from "locked, request a new one".
// Returns (-1, false) when no live code exists.
func (s *Service) CodeAttempts(ctx context.Context, userID string) (int, bool, error) {
	var attempts int
	var burned bool
	err := s.db.QueryRow(ctx,
		`SELECT attempts, burned_at IS NOT NULL FROM verification_codes
		 WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
		 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&attempts, &burned)
	if err != nil {
		return -1, false, err
	}
	return attempts, burned, nil
}