package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

// DeviceRepo owns the `devices` table: which terminals are approved for
// clock-in, per branch, and who approved them. A device "id" is the
// client-generated UUID the terminal sends in the X-Device-Id header — no
// secret material is stored or checked.
type DeviceRepo struct {
	db *pgxpool.Pool
}

func NewDeviceRepo(db *pgxpool.Pool) *DeviceRepo {
	return &DeviceRepo{db: db}
}

// IsEnabled reports whether the given device id has been approved for
// clock-in on the given branch. A terminal with no branch association (empty
// branch) is enabled only if an enabled row exists for it at all.
func (r *DeviceRepo) IsEnabled(ctx context.Context, deviceID, branchID string) (bool, error) {
	var enabled bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM devices
			WHERE id = $1 AND ($2 = '' OR branch_id = $2::uuid OR branch_id IS NULL)
			LIMIT 1
		 )`, deviceID, branchID,
	).Scan(&enabled)
	return enabled, err
}

// Enable marks the device as approved for the branch and records the actor.
// Re-approving an already-enabled device refreshes nothing but the actor —
// it is idempotent.
func (r *DeviceRepo) Enable(ctx context.Context, deviceID, branchID, enabledBy string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO devices (id, branch_id, enabled_at, enabled_by_user_id)
		 VALUES ($1, NULLIF($2,'')::uuid, now(), NULLIF($3,'')::uuid)
		 ON CONFLICT (id) DO UPDATE
		 SET branch_id = EXCLUDED.branch_id,
		     enabled_at = now(),
		     enabled_by_user_id = EXCLUDED.enabled_by_user_id`,
		deviceID, branchID, enabledBy,
	)
	return err
}

// Disable removes the device's approval so it shows the setup screen again.
func (r *DeviceRepo) Disable(ctx context.Context, deviceID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM devices WHERE id = $1`, deviceID)
	return err
}

// GetEnabledBy returns who enabled the device and when (audit/debug surface).
func (r *DeviceRepo) GetEnabledBy(ctx context.Context, deviceID string) (string, time.Time, error) {
	var by string
	var at time.Time
	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(enabled_by_user_id::text, ''), enabled_at FROM devices WHERE id = $1`,
		deviceID,
	).Scan(&by, &at)
	return by, at, err
}

// List returns the approved terminals for a branch (empty branch = all),
// newest first, with the approver's name joined in for the management screen.
func (r *DeviceRepo) List(ctx context.Context, branchID string) ([]model.Device, error) {
	rows, err := r.db.Query(ctx,
		`SELECT d.id, COALESCE(d.branch_id::text, ''), d.enabled_at,
		        COALESCE(d.enabled_by_user_id::text, ''), COALESCE(u.name, '')
		 FROM devices d
		 LEFT JOIN users u ON u.id = d.enabled_by_user_id
		 WHERE $1 = '' OR d.branch_id = $1::uuid OR d.branch_id IS NULL
		 ORDER BY d.enabled_at DESC`,
		branchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Device
	for rows.Next() {
		var d model.Device
		var branch string
		if err := rows.Scan(&d.ID, &branch, &d.EnabledAt, &d.EnabledByUserID, &d.EnabledByName); err != nil {
			return nil, err
		}
		if branch != "" {
			branchPtr := branch
			d.BranchID = &branchPtr
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
