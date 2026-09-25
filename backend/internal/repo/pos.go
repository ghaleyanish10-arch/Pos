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

// GetTableBill returns the newest OPEN order for a table along with its line
// items and running total. The order id is returned first so the POS can
// record a payment against that exact check. Recording a payment does not
// close the order — the table stays seated until "close table" turns it over.
func (r *POSRepo) GetTableBill(ctx context.Context, tableID string) (string, []model.OrderItem, float64, error) {
	var orderID string
	err := r.db.QueryRow(ctx,
		`SELECT id FROM orders WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, tableID,
	).Scan(&orderID)
	if err != nil {
		return "", nil, 0, err
	}

	items, total, err := r.orderItems(ctx, orderID)
	if err != nil {
		return "", nil, 0, err
	}
	return orderID, items, total, nil
}

// SetBillDropped marks a table as having had its paper check dropped (true)
// or cancels that marker (false). The marker alone shows up as 'Check dropped'
// only while the table still has an open order; adding items does NOT clear it
// — only an explicit clear (or closing the table) resets it, per the operator.
func (r *POSRepo) SetBillDropped(ctx context.Context, id string, dropped bool) error {
	_, err := r.db.Exec(ctx,
		`UPDATE floor_tables SET bill_dropped = $1 WHERE id = $2`, dropped, id)
	return err
}

// SetNeedsAttention sets (true) or clears (false) the attention flag on a
// table. The note is stored when flagging; clearing keeps the last note so a
// follow-up can reference what the issue was (it resets only on table close).
func (r *POSRepo) SetNeedsAttention(ctx context.Context, id string, attention bool, note string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE floor_tables
		 SET needs_attention = $1,
		     attention_note = CASE WHEN $1 THEN $2 ELSE attention_note END
		 WHERE id = $3`, attention, note, id)
	return err
}

// CloseTable turns over every open order on a table: flips order.status to
// 'closed' so the table stops counting as seated (order-derived occupancy).
// Turn-over also clears the manual flags so a reopened table never leaks
// 'Check dropped' / 'Needs attention' from a previous guest.
// Returns how many orders were closed.
func (r *POSRepo) CloseTable(ctx context.Context, tableID string) (int64, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE orders SET status = 'closed', updated_at = now()
		 WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL`, tableID)
	if err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx,
		`UPDATE floor_tables SET bill_dropped = false, needs_attention = false, attention_note = '' WHERE id = $1`, tableID); err != nil {
		return 0, err
	}

	// Closing the (possibly combined) check is the natural end of a merged
	// group: clear merged_into on BOTH sides so every previously merged-away
	// source table reverts to an independent vacant row instead of pointing at
	// a closed target forever.
	if _, err := tx.Exec(ctx,
		`UPDATE floor_tables SET merged_into = NULL WHERE id = $1 OR merged_into = $1`, tableID); err != nil {
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *POSRepo) orderItems(ctx context.Context, orderID string) ([]model.OrderItem, float64, error) {
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
