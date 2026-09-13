package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type OrderRepo struct {
	db *pgxpool.Pool
}

func NewOrderRepo(db *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{db: db}
}

func (r *OrderRepo) List(ctx context.Context, branchID string, status string) ([]model.Order, error) {
	query := `SELECT id, type, table_id::text, guest_id::text, status, total, branch_id::text, created_at, updated_at FROM orders WHERE deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}
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

	var orders []model.Order
	for rows.Next() {
		var o model.Order
		if err := rows.Scan(&o.ID, &o.Type, &o.TableID, &o.GuestID, &o.Status, &o.Total, &o.BranchID, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *OrderRepo) GetByID(ctx context.Context, id string) (*model.Order, error) {
	var o model.Order
	err := r.db.QueryRow(ctx,
		`SELECT id, type, table_id::text, guest_id::text, status, total, branch_id::text, created_at, updated_at FROM orders WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&o.ID, &o.Type, &o.TableID, &o.GuestID, &o.Status, &o.Total, &o.BranchID, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}

	items, _ := r.GetItems(ctx, id)
	o.Items = items
	return &o, nil
}

func (r *OrderRepo) GetItems(ctx context.Context, orderID string) ([]model.OrderItem, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, order_id, menu_item_id::text, name, qty, price, COALESCE(notes, '') FROM order_items WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.OrderItem
	for rows.Next() {
		var i model.OrderItem
		if err := rows.Scan(&i.ID, &i.OrderID, &i.MenuItemID, &i.Name, &i.Qty, &i.Price, &i.Notes); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *OrderRepo) ResolveTableID(ctx context.Context, table string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `SELECT id FROM floor_tables WHERE name = $1`, table).Scan(&id)
	return id, err
}

func (r *OrderRepo) Create(ctx context.Context, o *model.Order, items []model.CreateOrderItemReq) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx,
		`INSERT INTO orders (type, table_id, guest_id, status, branch_id) VALUES ($1, NULLIF($2,'')::uuid, NULLIF($3,'')::uuid, 'open', NULLIF($4,'')::uuid) RETURNING id, created_at, updated_at`,
		o.Type, o.TableID, o.GuestID, o.BranchID,
	).Scan(&o.ID, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return err
	}

	var total float64
	for _, item := range items {
		_, err = tx.Exec(ctx,
			`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, notes) VALUES ($1, NULLIF($2,'')::uuid, $3, $4, $5, $6)`,
			o.ID, item.MenuItemID, item.Name, item.Qty, item.Price, item.Notes,
		)
		if err != nil {
			return err
		}
		total += float64(item.Qty) * item.Price
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET total = $1 WHERE id = $2`, total, o.ID)
	if err != nil {
		return err
	}
	o.Total = total

	// Every order creates a KDS ticket so it shows up on the kitchen display.
	tag := "Dine-in"
	if o.Type == "takeaway" {
		tag = "Takeaway"
	} else if o.Type == "delivery" {
		tag = "Delivery"
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO kds_tickets (order_id, tag, station, status, ai_phone, allergy, fired) VALUES ($1, $2, 'Kitchen', 'incoming', false, '', false)`,
		o.ID, tag,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *OrderRepo) Update(ctx context.Context, id string, status string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`, status, id)
	return err
}

func (r *OrderRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE orders SET deleted_at = now() WHERE id = $1`, id)
	return err
}

func itoa(i int) string {
	return string(rune('0' + i))
}
