package repo

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

// ErrInsufficientPoints is returned when a redemption exceeds the guest's
// available balance — the ledger must never go negative.
var ErrInsufficientPoints = errors.New("guest does not have enough points")

type LoyaltyRepo struct {
	db *pgxpool.Pool
}

func NewLoyaltyRepo(db *pgxpool.Pool) *LoyaltyRepo {
	return &LoyaltyRepo{db: db}
}

func (r *LoyaltyRepo) ListTiers(ctx context.Context) ([]model.LoyaltyTier, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name, min_points, discount_pct FROM loyalty_tiers ORDER BY min_points`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tiers []model.LoyaltyTier
	for rows.Next() {
		var t model.LoyaltyTier
		if err := rows.Scan(&t.ID, &t.Name, &t.MinPoints, &t.DiscountPct); err != nil {
			return nil, err
		}
		tiers = append(tiers, t)
	}
	return tiers, nil
}

func (r *LoyaltyRepo) ListLedger(ctx context.Context) ([]model.PointsLedgerEntry, error) {
	rows, err := r.db.Query(ctx,
		`SELECT l.id, l.guest_id, g.name, l.delta, l.reason, l.created_at FROM loyalty_points_ledger l JOIN guests g ON l.guest_id = g.id ORDER BY l.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.PointsLedgerEntry
	for rows.Next() {
		var e model.PointsLedgerEntry
		if err := rows.Scan(&e.ID, &e.GuestID, &e.GuestName, &e.Delta, &e.Reason, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *LoyaltyRepo) Earn(ctx context.Context, guestID string, delta int, reason string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO loyalty_points_ledger (guest_id, delta, reason) VALUES ($1, $2, $3)`,
		guestID, delta, reason,
	)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`UPDATE guests SET tier = CASE
			WHEN (SELECT COALESCE(SUM(delta),0) FROM loyalty_points_ledger WHERE guest_id = $1) >= 500 THEN 'Gold'
			WHEN (SELECT COALESCE(SUM(delta),0) FROM loyalty_points_ledger WHERE guest_id = $1) >= 200 THEN 'Silver'
			ELSE 'New'
		END WHERE id = $1`, guestID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *LoyaltyRepo) Redeem(ctx context.Context, guestID string, delta int, reason string) error {
	// A redemption is a spend, so it must never push the ledger negative and
	// it must stay within the guest's current balance. The guest row is locked
	// FIRST so two concurrent redemptions serialize: the second waits, then
	// re-reads the sum and correctly sees the first one's spend.
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var locked bool
	if err := tx.QueryRow(ctx,
		`SELECT TRUE FROM guests WHERE id = $1 FOR UPDATE`, guestID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return pgx.ErrNoRows
		}
		return err
	}

	var balance int
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(l.delta), 0) FROM loyalty_points_ledger l WHERE l.guest_id = $1`,
		guestID).Scan(&balance); err != nil {
		return err
	}
	if delta > balance {
		return ErrInsufficientPoints
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO loyalty_points_ledger (guest_id, delta, reason) VALUES ($1, $2, $3)`,
		guestID, -delta, reason,
	)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`UPDATE guests SET tier = CASE
			WHEN (SELECT COALESCE(SUM(delta),0) FROM loyalty_points_ledger WHERE guest_id = $1) >= 500 THEN 'Gold'
			WHEN (SELECT COALESCE(SUM(delta),0) FROM loyalty_points_ledger WHERE guest_id = $1) >= 200 THEN 'Silver'
			ELSE 'New'
		END WHERE id = $1`, guestID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}
