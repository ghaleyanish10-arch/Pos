package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ElevationTTLDefault is the default lifetime of a single-use elevation
// token. Short by design: the token authorizes exactly one action.
const ElevationTTLDefault = 3 * time.Minute

// Token type markers. A token minted for one purpose must never be accepted
// for another: elevation tokens are rejected by the session middleware and
// session tokens are rejected by the elevation middleware.
const (
	TokenTypeAccess    = "access"
	TokenTypeRefresh   = "refresh"
	TokenTypeElevation = "elevation"
)

// ElevationClaims is the claim set of a step-up elevation token. It binds the
// token to the PIN holder (sub), one specific action (act) and, when given,
// one specific resource (res) — the token is unusable for anything else.
type ElevationClaims struct {
	Action      string `json:"act"`
	ResourceID  string `json:"res,omitempty"`
	TokenType   string `json:"typ"`
	UserID      string `json:"uid"`
	jwt.RegisteredClaims
}

// GenerateElevationToken mints a short-lived, single-use elevation token.
// The returned jti must be persisted (single use is enforced server-side by
// consuming it, not by the signature).
func GenerateElevationToken(pinHolderID, action, resourceID, secret string, ttl time.Duration) (token, jti string, expiresAt time.Time, err error) {
	now := time.Now()
	expiresAt = now.Add(ttl)
	jti = uuid.NewString()

	claims := &ElevationClaims{
		Action:     action,
		ResourceID: resourceID,
		TokenType:  TokenTypeElevation,
		UserID:     pinHolderID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   pinHolderID,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        jti,
		},
	}
	token, err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		return "", "", time.Time{}, err
	}
	return token, jti, expiresAt, nil
}

// ErrElevationMismatch reports a valid token presented for the wrong action
// or resource.
var ErrElevationMismatch = fmt.Errorf("elevation token does not cover this action or resource")

// ValidateElevationToken verifies signature, type, expiry and the action/resource
// binding. resourceID may be empty for actions without a single resource.
func ValidateElevationToken(tokenStr, secret, action, resourceID string) (*ElevationClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &ElevationClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*ElevationClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	if claims.TokenType != TokenTypeElevation {
		return nil, fmt.Errorf("not an elevation token")
	}
	if claims.Action != action {
		return nil, ErrElevationMismatch
	}
	if resourceID != "" && claims.ResourceID != resourceID {
		return nil, ErrElevationMismatch
	}
	return claims, nil
}
