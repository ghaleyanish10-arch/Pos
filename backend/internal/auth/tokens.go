package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"
)

// Token kinds — constrained in the auth_tokens schema.
const (
	TokenVerifyEmail   = "verify_email"
	TokenResetPassword = "reset_password"
)

const (
	verifyTTL  = 24 * time.Hour
	resetTTL   = time.Hour
	tokenBytes = 32
)

// VerifyTTL / ResetTTL expose the token lifetimes for handlers and tests.
func VerifyTTL() time.Duration { return verifyTTL }

func ResetTTL() time.Duration { return resetTTL }

// IssueToken creates a new single-use token for the user, stores only its
// SHA-256 hash, and returns the raw value (which exists nowhere on the server).
func (s *Service) IssueToken(ctx context.Context, userID, kind string, ttl time.Duration) (string, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	rawToken := base64.RawURLEncoding.EncodeToString(raw)
	hash := hashToken(rawToken)

	// Invalidate any previous token of the same kind for this user.
	if _, err := s.db.Exec(ctx,
		`DELETE FROM auth_tokens WHERE user_id = $1 AND kind = $2`, userID, kind,
	); err != nil {
		return "", fmt.Errorf("clear old tokens: %w", err)
	}

	if _, err := s.db.Exec(ctx,
		`INSERT INTO auth_tokens (user_id, token_hash, kind, expires_at) VALUES ($1, $2, $3, $4)`,
		userID, hash, kind, time.Now().Add(ttl),
	); err != nil {
		return "", fmt.Errorf("store token: %w", err)
	}
	return rawToken, nil
}

// ConsumeToken validates a raw token for the given kind and marks it used in a
// single atomic statement. Expired, already-used or unknown tokens all fail.
// Returns the owning user ID.
func (s *Service) ConsumeToken(ctx context.Context, rawToken, kind string) (string, error) {
	hash := hashToken(rawToken)

	var userID string
	err := s.db.QueryRow(ctx,
		`UPDATE auth_tokens SET used_at = now()
		 WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
		 RETURNING user_id`,
		hash, kind,
	).Scan(&userID)
	if err != nil {
		return "", fmt.Errorf("invalid or expired token")
	}
	return userID, nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
