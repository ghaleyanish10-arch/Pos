package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type POSRepo struct {
	db *pgxpool.Pool
}

func NewPOSRepo(db *pgxpool.Pool) *POSRepo {
	return &POSRepo{db: db}
}

func (r *POSRepo) UpdateTableState(ctx context.Context, id, state, detail string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE floor_tables SET state = $1, detail = $2 WHERE id = $3`,
		state, detail, id,
	)
	return err
}

func (r *POSRepo) GetTableBill(ctx context.Context, tableID string) ([]model.OrderItem, float64, error) {
	var orderID string
	err := r.db.QueryRow(ctx,
		`SELECT id, total FROM orders WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, tableID,
	).Scan(&orderID)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx,
		`SELECT id, order_id, menu_item_id::text, name, qty, price, COALESCE(notes, '') FROM order_items WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []model.OrderItem
	var total float64
	for rows.Next() {
		var i model.OrderItem
		if err := rows.Scan(&i.ID, &i.OrderID, &i.MenuItemID, &i.Name, &i.Qty, &i.Price, &i.Notes); err != nil {
			return nil, 0, err
		}
		items = append(items, i)
		total += float64(i.Qty) * i.Price
	}
	return items, total, nil
}
