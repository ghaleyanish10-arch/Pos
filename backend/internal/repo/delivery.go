package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type DeliveryRepo struct {
	db *pgxpool.Pool
}

func NewDeliveryRepo(db *pgxpool.Pool) *DeliveryRepo {
	return &DeliveryRepo{db: db}
}

func (r *DeliveryRepo) List(ctx context.Context, status string) ([]model.DeliveryOrder, error) {
	query := `SELECT id, platform, items, COALESCE(courier, ''), status, branch_id::text, created_at FROM delivery_orders WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if status != "" {
		query += ` AND status = $` + itoa(argIdx)
		args = append(args, status)
		argIdx++
	}

	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []model.DeliveryOrder
	for rows.Next() {
		var o model.DeliveryOrder
		if err := rows.Scan(&o.ID, &o.Platform, &o.Items, &o.Courier, &o.Status, &o.BranchID, &o.CreatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *DeliveryRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE delivery_orders SET status = $1 WHERE id = $2`, status, id)
	return err
}
