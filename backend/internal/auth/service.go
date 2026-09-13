package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Login(ctx context.Context, email, password string) (string, string, string, string, error) {
	var id, passwordHash, role, branchID string
	err := s.db.QueryRow(ctx,
		`SELECT id, password_hash, role, COALESCE(branch_id::text, '') FROM users WHERE email = $1 AND deleted_at IS NULL`,
		email,
	).Scan(&id, &passwordHash, &role, &branchID)
	if err != nil {
		return "", "", "", "", fmt.Errorf("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return "", "", "", "", fmt.Errorf("invalid credentials")
	}

	return id, email, role, branchID, nil
}

func (s *Service) Register(ctx context.Context, name, email, password, role, branchID string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}

	var id string
	err = s.db.QueryRow(ctx,
		`INSERT INTO users (name, email, password_hash, role, branch_id) VALUES ($1, $2, $3, $4, NULLIF($5, '')::uuid) RETURNING id`,
		name, email, string(hash), role, branchID,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("failed to register user: %w", err)
	}

	return id, nil
}

func (s *Service) ValidateRefreshToken(ctx context.Context, refreshToken, secret string) error {
	claims, err := ValidateToken(refreshToken, secret)
	if err != nil {
		return fmt.Errorf("invalid refresh token")
	}

	var exists bool
	err = s.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL)`,
		claims.UserID,
	).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("user not found")
	}

	return nil
}

// MarkEmailVerified stamps email_verified_at once, the first time.
func (s *Service) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL`,
		userID,
	)
	return err
}

// UpdatePassword replaces the password hash (used by the reset flow).
func (s *Service) UpdatePassword(ctx context.Context, userID, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx,
		`UPDATE users SET password_hash = $1 WHERE id = $2`,
		string(hash), userID,
	)
	return err
}
