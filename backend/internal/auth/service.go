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
