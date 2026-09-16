package repo

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

// ElevationRepo owns PIN state, lockout counters and single-use elevation
// tokens. PIN hashes live on users but are only ever touched through here.
type ElevationRepo struct {
	db *pgxpool.Pool
}

func NewElevationRepo(db *pgxpool.Pool) *ElevationRepo {
	return &ElevationRepo{db: db}
}

// PINStatus is the elevation-relevant slice of a user row.
type PINStatus struct {
	UserID         string
	Name           string
	Email          string
	Role           string
	BranchID       string
	PINHash        *string
	FailedAttempts int
	LockedUntil    *time.Time
}

// LoadPIN fetches the PIN state for a user. Returns pgx.ErrNoRows when the
// user does not exist — callers must not reveal that to the client.
func (r *ElevationRepo) LoadPIN(ctx context.Context, userID string) (*PINStatus, error) {
	var s PINStatus
	err := r.db.QueryRow(ctx,
		`SELECT id::text, name, email, role, COALESCE(branch_id::text, ''), pin_hash, pin_failed_attempts, pin_locked_until
		 FROM users WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&s.UserID, &s.Name, &s.Email, &s.Role, &s.BranchID, &s.PINHash, &s.FailedAttempts, &s.LockedUntil)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ListRoster returns the staff eligible to clock in at a branch on the
// shared terminal: every active account at that branch, plus accounts
// without a branch (e.g. a floating Corporate Admin). All roles appear —
// Kitchen and Cashier included, not just managers. It returns RosterMember,
// a bare surface with no secret material: no PIN hash, no lockout state, no
// attempt counters, no has_pin flag.
func (r *ElevationRepo) ListRoster(ctx context.Context, branchID string) ([]model.RosterMember, error) {
	query := `SELECT id::text, name, role, COALESCE(branch_id::text, '')
		 FROM users WHERE deleted_at IS NULL AND ($1 = '' OR branch_id = $1::uuid OR branch_id IS NULL)
		 ORDER BY name`
	rows, err := r.db.Query(ctx, query, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.RosterMember
	for rows.Next() {
		var u model.RosterMember
		var branch string
		if err := rows.Scan(&u.ID, &u.Name, &u.Role, &branch); err != nil {
			return nil, err
		}
		if branch != "" {
			branchPtr := branch
			u.BranchID = &branchPtr
		}
		users = append(users, u)
	}
	return users, nil
}

// ListPINHolders returns the users whose PIN can authorize an elevation:
// managers and admins that actually have a PIN set. Safe to expose to any
// authenticated terminal user — it carries no secret material.
func (r *ElevationRepo) ListPINHolders(ctx context.Context) ([]model.User, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id::text, name, email, role FROM users
		 WHERE deleted_at IS NULL AND pin_hash IS NOT NULL
		   AND role IN ('Store Manager', 'Corporate Admin')
		 ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// ListUsers returns all active accounts (admin-only surface).
func (r *ElevationRepo) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id::text, name, email, role, pin_hash IS NOT NULL FROM users
		 WHERE deleted_at IS NULL ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		var hasPIN bool
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &hasPIN); err != nil {
			return nil, err
		}
		u.HasPIN = hasPIN
		users = append(users, u)
	}
	return users, nil
}

// RegisterFailure increments the failed-attempt counter and returns the new
// count plus the (possibly refreshed) lockout expiry.
func (r *ElevationRepo) RegisterFailure(ctx context.Context, userID string, threshold int, cooldown time.Duration) (attempts int, lockedUntil *time.Time, err error) {
	err = r.db.QueryRow(ctx,
		`UPDATE users
		 SET pin_failed_attempts = pin_failed_attempts + 1,
		     pin_locked_until = CASE
		         WHEN pin_failed_attempts + 1 >= $2 THEN now() + $3::interval
		         ELSE pin_locked_until
		     END
		 WHERE id = $1
		 RETURNING pin_failed_attempts, pin_locked_until`,
		userID, threshold, cooldown,
	).Scan(&attempts, &lockedUntil)
	return attempts, lockedUntil, err
}

// ResetFailures clears the failure counter after a successful PIN match.
func (r *ElevationRepo) ResetFailures(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1`,
		userID,
	)
	return err
}

// SetPIN overwrites the PIN hash and clears any lockout. The hash is the only
// representation of the PIN that is ever stored.
func (r *ElevationRepo) SetPIN(ctx context.Context, userID, pinHash string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1`,
		userID, pinHash,
	)
	return err
}

// ErrTokenUsed marks the jti conflict on single-use consumption.
var ErrTokenUsed = errors.New("elevation token already used")

// ConsumeToken atomically marks a single-use elevation token as used.
// Returns pgx.ErrNoRows when the jti is unknown/expired, ErrTokenUsed when it
// was already consumed.
func (r *ElevationRepo) ConsumeToken(ctx context.Context, jti string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE elevation_tokens SET used_at = now()
		 WHERE jti = $1 AND used_at IS NULL AND expires_at > now()`,
		jti,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// Distinguish replay from unknown/expired so the middleware can answer
		// precisely without leaking more than necessary.
		var exists bool
		if err := r.db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM elevation_tokens WHERE jti = $1)`, jti,
		).Scan(&exists); err == nil && exists {
			return ErrTokenUsed
		}
		return pgx.ErrNoRows
	}
	return nil
}

// StoreToken persists the jti binding so a signature alone is not enough.
func (r *ElevationRepo) StoreToken(ctx context.Context, jti, userID, action, resourceID string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO elevation_tokens (jti, user_id, action, resource_id, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		jti, userID, action, resourceID, expiresAt,
	)
	return err
}

// CreateNotification inserts a server-side notification row.
func (r *ElevationRepo) CreateNotification(ctx context.Context, targetRole, branchID, notifType string, payload []byte) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO notifications (target_role, branch_id, type, payload)
		 VALUES ($1, NULLIF($2,'')::uuid, $3, $4)`,
		targetRole, branchID, notifType, payload,
	)
	return err
}

// CountLockoutNotifications guards notification spam: while a lockout is
// active, only the first failure that trips it notifies.
func (r *ElevationRepo) CountLockoutNotifications(ctx context.Context, userID string, since time.Time) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		`SELECT count(*) FROM notifications
		 WHERE type = 'pin.lockout' AND payload->>'user_id' = $1 AND created_at > $2`,
		userID, since,
	).Scan(&n)
	return n, err
}

// ListNotifications returns recent notifications visible to the given role.
// Corporate Admin sees everything; other roles see rows targeted at them or
// broadcast to all.
func (r *ElevationRepo) ListNotifications(ctx context.Context, role string, limit int) ([]model.Notification, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.Query(ctx,
		`SELECT id::text, target_role, branch_id::text, type, payload, created_at, read_at
		 FROM notifications
		 WHERE $1 = 'Corporate Admin' OR target_role IN ($1, 'All')
		 ORDER BY created_at DESC LIMIT $2`,
		role, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Notification
	for rows.Next() {
		var n model.Notification
		if err := rows.Scan(&n.ID, &n.TargetRole, &n.BranchID, &n.Type, &n.Payload, &n.CreatedAt, &n.ReadAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, nil
}

// MarkNotificationRead stamps read_at once, the first time.
func (r *ElevationRepo) MarkNotificationRead(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL`,
		id,
	)
	return err
}
