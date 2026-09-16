package auth

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
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

// VerifyPassword re-authenticates a user by login password. Used by the PIN
// reset flow: the resetter must prove their own identity with their password,
// not just their (possibly stolen) session token. Never reveals or returns
// any secret.
func (s *Service) VerifyPassword(ctx context.Context, userID, password string) error {
	var hash string
	err := s.db.QueryRow(ctx,
		`SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&hash)
	if err != nil {
		return fmt.Errorf("invalid credentials")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return fmt.Errorf("invalid credentials")
	}
	return nil
}

// CreatePINUser provisions a staff member as a full users row so they appear
// in the clock-in roster and terminal roster, and gives them a mutable PIN.
// The PIN is strong-checked before anything is written and stored as a bcrypt
// hash exactly like the boss PIN — the existing ValidatePIN/SetPIN path is
// reused, so surprising the old PIN flows is impossible. Staff created this
// way have no login password; email logins for these rows always fail cleanly.
func (s *Service) CreatePINUser(ctx context.Context, name, email, role, branchID, pin string) (string, error) {
	if err := ValidatePIN(pin); err != nil {
		return "", err
	}
	if strings.TrimSpace(email) == "" {
		randBytes := make([]byte, 6)
		if _, err := rand.Read(randBytes); err != nil {
			return "", fmt.Errorf("generate email: %w", err)
		}
		email = fmt.Sprintf("staff-%x@mesa.local", randBytes)
	}
	email = strings.ToLower(strings.TrimSpace(email))

	hash, err := bcrypt.GenerateFromPassword([]byte(pin), 12)
	if err != nil {
		return "", err
	}

	var id string
	err = s.db.QueryRow(ctx,
		`INSERT INTO users (name, email, password_hash, role, branch_id, pin_hash, email_verified_at)
		 VALUES ($1, $2, '', $3, NULLIF($4, '')::uuid, $5, now())
		 RETURNING id`,
		name, email, role, branchID, string(hash),
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("failed to create staff account: %w", err)
	}
	return id, nil
}

// SetPIN stores a fresh bcrypt PIN hash for the user and clears lockout
// state. The caller must have validated the PIN and authorized the reset.
func (s *Service) SetPIN(ctx context.Context, userID, pin string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), 12)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx,
		`UPDATE users SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1`,
		userID, string(hash),
	)
	return err
}

// EnsureDefaultBranch returns the first branch — the seed's "Downtown Branch"
// when the demo DB is used — creating the default one the very first time. A
// branch IS the business/tenant (Option A): every signup claims this branch.
func (s *Service) EnsureDefaultBranch(ctx context.Context) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id::text FROM branches ORDER BY created_at LIMIT 1`).Scan(&id)
	if err == nil {
		return id, nil
	}

	err = s.db.QueryRow(ctx,
		`INSERT INTO branches (name, status, address) VALUES ('Downtown Branch', 'Online', 'Jyatha, Kathmandu') RETURNING id::text`,
	).Scan(&id)
	return id, err
}

// SetBranch attaches a user to a branch (their business/tenant).
func (s *Service) SetBranch(ctx context.Context, userID, branchID string) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET branch_id = $1::uuid WHERE id = $2`, branchID, userID)
	return err
}

// FindOAuthAccount returns the user bound to a provider identity, if any.
// (provider, provider_sub) is the stable external key.
func (s *Service) FindOAuthAccount(ctx context.Context, provider, sub string) (string, bool, error) {
	var userID string
	err := s.db.QueryRow(ctx,
		`SELECT user_id::text FROM oauth_accounts WHERE provider = $1 AND provider_sub = $2`,
		provider, sub,
	).Scan(&userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", false, nil
		}
		return "", false, err
	}
	return userID, true, nil
}

// RegisterOAuthUser creates a users row plus its oauth_accounts binding in one
// transaction. OAuth-trusted email: email_verified_at is stamped now (Google
// only returns addresses it has verified). Returns the new user id; on an
// email collision returns emailTaken=true so the caller can decide to attach
// the identity to the existing account instead of failing outright.
func (s *Service) RegisterOAuthUser(ctx context.Context, name, email, provider, sub, branchID string) (string, bool, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // read-only on rollback

	var userID string
	err = tx.QueryRow(ctx,
		`INSERT INTO users (name, email, password_hash, role, branch_id, email_verified_at)
		 VALUES ($1, $2, '', 'Corporate Admin', $3::uuid, now())
		 RETURNING id::text`,
		name, email, branchID,
	).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return "", true, nil
		}
		return "", false, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO oauth_accounts (user_id, provider, provider_sub, provider_email) VALUES ($1, $2, $3, $4)`,
		userID, provider, sub, email,
	); err != nil {
		return "", false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", false, err
	}
	return userID, false, nil
}

// BindOAuthAccount attaches a provider identity to an existing users row that
// already owns that email (e.g. signup-by-password first, Google later).
func (s *Service) BindOAuthAccount(ctx context.Context, userID, provider, sub, providerEmail string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO oauth_accounts (user_id, provider, provider_sub, provider_email) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (provider, provider_sub) DO NOTHING`,
		userID, provider, sub, providerEmail,
	)
	return err
}
