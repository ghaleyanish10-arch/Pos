package repo

import (
	"context"

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

func (r *PurchaseOrderRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE purchase_orders SET status = $1 WHERE id = $2`, status, id)
	return err
}
