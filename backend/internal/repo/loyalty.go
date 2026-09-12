package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

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
	_, err := r.db.Exec(ctx,
		`INSERT INTO loyalty_points_ledger (guest_id, delta, reason) VALUES ($1, $2, $3)`,
		guestID, -delta, reason,
	)
	return err
}
