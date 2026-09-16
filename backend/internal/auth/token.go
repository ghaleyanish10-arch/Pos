package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID   string `json:"user_id"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	BranchID string `json:"branch_id"`
	TokenType string `json:"typ,omitempty"`
	jwt.RegisteredClaims
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
}

func GenerateTokenPair(userID, email, role, branchID, secret string, accessExpiry, refreshExpiry time.Duration) (*TokenPair, error) {
	accessToken, err := generateToken(userID, email, role, branchID, secret, accessExpiry)
	if err != nil {
		return nil, err
	}

	refreshToken, err := generateToken(userID, email, role, branchID, secret, refreshExpiry)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    time.Now().Add(accessExpiry).Unix(),
	}, nil
}

// GenerateSessionToken mints the shift-length session token issued by clock-in.
// It is a normal typ=access token so AuthMiddleware and RequireRole treat it
// exactly like a login token — clock-in changes how the token is minted, not
// what happens after. It is intentionally NOT stored server-side: revocation
// is by TTL (clock-out clears the client side; a future refresh-token
// revocation table would strengthen this, flagged in the clock-out handler).
func GenerateSessionToken(userID, email, role, branchID, secret string, ttl time.Duration) (token string, expiresAt int64, err error) {
	s, err := generateToken(userID, email, role, branchID, secret, ttl)
	if err != nil {
		return "", 0, err
	}
	return s, time.Now().Add(ttl).Unix(), nil
}

func generateToken(userID, email, role, branchID, secret string, expiry time.Duration) (string, error) {
	claims := &Claims{
		UserID:    userID,
		Email:     email,
		Role:      role,
		BranchID:  branchID,
		TokenType: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ValidateToken(tokenStr, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	// Elevation tokens must never authenticate a session. Session tokens carry
	// typ=access (or nothing, for tokens minted before this field existed).
	if claims.TokenType == TokenTypeElevation {
		return nil, fmt.Errorf("elevation token cannot be used as a session token")
	}

	return claims, nil
}
