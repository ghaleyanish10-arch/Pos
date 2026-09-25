package repo

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type PurchaseOrderRepo struct {
	db *pgxpool.Pool
}

func NewPurchaseOrderRepo(db *pgxpool.Pool) *PurchaseOrderRepo {
	return &PurchaseOrderRepo{db: db}
}

func (r *PurchaseOrderRepo) List(ctx context.Context, status string) ([]model.PurchaseOrder, error) {
	query := `SELECT id, supplier, total, expected_date, status, branch_id::text, created_at FROM purchase_orders WHERE 1=1`
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

	var pos []model.PurchaseOrder
	for rows.Next() {
		var po model.PurchaseOrder
		if err := rows.Scan(&po.ID, &po.Supplier, &po.Total, &po.ExpectedDate, &po.Status, &po.BranchID, &po.CreatedAt); err != nil {
			return nil, err
		}
		items, _ := r.GetItems(ctx, po.ID)
		po.Items = items
		pos = append(pos, po)
	}
	return pos, nil
}

func (r *PurchaseOrderRepo) GetByID(ctx context.Context, id string) (*model.PurchaseOrder, error) {
	var po model.PurchaseOrder
	err := r.db.QueryRow(ctx,
		`SELECT id, supplier, total, expected_date, status, branch_id::text, created_at FROM purchase_orders WHERE id = $1`, id,
	).Scan(&po.ID, &po.Supplier, &po.Total, &po.ExpectedDate, &po.Status, &po.BranchID, &po.CreatedAt)
	if err != nil {
		return nil, err
	}
	items, _ := r.GetItems(ctx, id)
	po.Items = items
	return &po, nil
}

func (r *PurchaseOrderRepo) GetItems(ctx context.Context, poID string) ([]model.POLineItem, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, po_id, ingredient, qty, unit_cost FROM po_line_items WHERE po_id = $1`, poID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.POLineItem
	for rows.Next() {
		var i model.POLineItem
		if err := rows.Scan(&i.ID, &i.POID, &i.Ingredient, &i.Qty, &i.UnitCost); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *PurchaseOrderRepo) Create(ctx context.Context, po *model.PurchaseOrder, items []model.POLineItemReq) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx,
		`INSERT INTO purchase_orders (supplier, total, expected_date, status, branch_id) VALUES ($1, $2, $3, 'Draft', NULLIF($4,'')::uuid) RETURNING id, created_at`,
		po.Supplier, po.Total, po.ExpectedDate, po.BranchID,
	).Scan(&po.ID, &po.CreatedAt)
	if err != nil {
		return err
	}

	for _, item := range items {
		_, err = tx.Exec(ctx,
			`INSERT INTO po_line_items (po_id, ingredient, qty, unit_cost) VALUES ($1, $2, $3, $4)`,
			po.ID, item.Ingredient, item.Qty, item.UnitCost,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// ErrExceedsOrderedQty is returned when a received quantity exceeds what the
// PO line ordered — a client error, not a server fault.
var ErrExceedsOrderedQty = fmt.Errorf("received quantity exceeds ordered quantity")

// ErrAlreadyReceived is returned when a purchase order that has already been
// received (fully or partially) is received again. Re-receiving would add
// stock a second time for the same goods, so it is refused outright.
var ErrAlreadyReceived = fmt.Errorf("purchase order has already been received")

// Receive confirms goods arriving on a purchase order: for every received line
// it adds the quantity to the matching tracked inventory item (matched by
// case-insensitive name) and moves the PO to Received or Partially Received.
// Lines whose ingredient is not tracked in inventory are skipped and counted in
// the returned skip count so callers can be honest about what was stocked.
// pgx.ErrNoRows when the PO does not exist; ErrExceedsOrderedQty when a
// received quantity is too large.
func (r *PurchaseOrderRepo) Receive(ctx context.Context, id string, received map[string]float64) (*model.PurchaseOrder, int, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	var exists bool
	var currentStatus string
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM purchase_orders WHERE id = $1), COALESCE((SELECT status FROM purchase_orders WHERE id = $1), '')`, id).
		Scan(&exists, &currentStatus); err != nil {
		return nil, 0, err
	}
	if !exists {
		return nil, 0, pgx.ErrNoRows
	}
	if currentStatus == "Received" || currentStatus == "Partially Received" {
		return nil, 0, ErrAlreadyReceived
	}

	lines, err := r.GetItems(ctx, id)
	if err != nil {
		return nil, 0, err
	}

	allMatched := true
	skipped := 0
	for _, line := range lines {
		rqty, ok := received[line.Ingredient]
		if !ok {
			rqty = line.Qty // lines without an explicit confirmation arrive in full
		}
		if rqty < 0 || rqty > line.Qty {
			return nil, 0, fmt.Errorf("%w: %s (received %.2f, ordered %.2f)", ErrExceedsOrderedQty, line.Ingredient, rqty, line.Qty)
		}
		if rqty <= 0 {
			continue
		}
		if rqty != line.Qty {
			allMatched = false
		}

		tag, err := tx.Exec(ctx,
			`UPDATE inventory_items
			 SET stock = stock + $1, unit_cost = CASE WHEN $2 > 0 THEN $2 ELSE unit_cost END, restocked_at = now()
			 WHERE id = (SELECT id FROM inventory_items WHERE lower(name) = lower($3) ORDER BY created_at LIMIT 1)`,
			rqty, line.UnitCost, line.Ingredient,
		)
		if err != nil {
			return nil, 0, err
		}
		if tag.RowsAffected() == 0 {
			skipped++
		}
	}

	status := "Received"
	if !allMatched {
		status = "Partially Received"
	}
	if _, err := tx.Exec(ctx, `UPDATE purchase_orders SET status = $1 WHERE id = $2`, status, id); err != nil {
		return nil, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	po, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, 0, err
	}
	return po, skipped, nil
}

func (r *PurchaseOrderRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE purchase_orders SET status = $1 WHERE id = $2`, status, id)
	return err
}
