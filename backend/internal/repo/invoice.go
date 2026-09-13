package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type InvoiceRepo struct {
	db *pgxpool.Pool
}

func NewInvoiceRepo(db *pgxpool.Pool) *InvoiceRepo {
	return &InvoiceRepo{db: db}
}

func (r *InvoiceRepo) List(ctx context.Context, status string) ([]model.Invoice, error) {
	query := `SELECT id, party, amount, due_date, status, branch_id::text, created_at, last_chased_at FROM invoices WHERE 1=1`
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

	var invoices []model.Invoice
	for rows.Next() {
		var inv model.Invoice
		if err := rows.Scan(&inv.ID, &inv.Party, &inv.Amount, &inv.DueDate, &inv.Status, &inv.BranchID, &inv.CreatedAt, &inv.ChasedAt); err != nil {
			return nil, err
		}
		items, _ := r.GetItems(ctx, inv.ID)
		inv.Items = items
		invoices = append(invoices, inv)
	}
	return invoices, nil
}

func (r *InvoiceRepo) GetByID(ctx context.Context, id string) (*model.Invoice, error) {
	var inv model.Invoice
	err := r.db.QueryRow(ctx,
		`SELECT id, party, amount, due_date, status, branch_id::text, created_at, last_chased_at FROM invoices WHERE id = $1`, id,
	).Scan(&inv.ID, &inv.Party, &inv.Amount, &inv.DueDate, &inv.Status, &inv.BranchID, &inv.CreatedAt, &inv.ChasedAt)
	if err != nil {
		return nil, err
	}
	items, _ := r.GetItems(ctx, id)
	inv.Items = items
	return &inv, nil
}

func (r *InvoiceRepo) GetItems(ctx context.Context, invoiceID string) ([]model.InvoiceLineItem, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, invoice_id, description, qty, unit_price FROM invoice_line_items WHERE invoice_id = $1`, invoiceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.InvoiceLineItem
	for rows.Next() {
		var i model.InvoiceLineItem
		if err := rows.Scan(&i.ID, &i.InvoiceID, &i.Description, &i.Qty, &i.UnitPrice); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *InvoiceRepo) Create(ctx context.Context, inv *model.Invoice, items []model.InvoiceLineItemReq) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx,
		`INSERT INTO invoices (party, amount, due_date, status, branch_id) VALUES ($1, $2, $3, 'Draft', NULLIF($4,'')::uuid) RETURNING id, created_at`,
		inv.Party, inv.Amount, inv.DueDate, inv.BranchID,
	).Scan(&inv.ID, &inv.CreatedAt)
	if err != nil {
		return err
	}

	for _, item := range items {
		_, err = tx.Exec(ctx,
			`INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price) VALUES ($1, $2, $3, $4)`,
			inv.ID, item.Description, item.Qty, item.UnitPrice,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *InvoiceRepo) UpdateStatus(ctx context.Context, id, status string, chasedAt *time.Time) error {
	_, err := r.db.Exec(ctx,
		`UPDATE invoices SET status = $1, last_chased_at = COALESCE($2, last_chased_at) WHERE id = $3`,
		status, chasedAt, id,
	)
	return err
}
