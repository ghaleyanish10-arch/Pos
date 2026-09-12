package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type FiscalRepo struct {
	db *pgxpool.Pool
}

func NewFiscalRepo(db *pgxpool.Pool) *FiscalRepo {
	return &FiscalRepo{db: db}
}

func (r *FiscalRepo) List(ctx context.Context, branchID string) ([]model.FiscalEntry, error) {
	query := `SELECT id, transaction_id, fiscal_id, certified, branch_id::text, created_at FROM fiscal_entries WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.FiscalEntry
	for rows.Next() {
		var e model.FiscalEntry
		if err := rows.Scan(&e.ID, &e.TransactionID, &e.FiscalID, &e.Certified, &e.BranchID, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *FiscalRepo) GetByTransaction(ctx context.Context, transactionID string) (*model.FiscalEntry, error) {
	var e model.FiscalEntry
	err := r.db.QueryRow(ctx,
		`SELECT id, transaction_id, fiscal_id, certified, branch_id::text, created_at FROM fiscal_entries WHERE transaction_id = $1`, transactionID,
	).Scan(&e.ID, &e.TransactionID, &e.FiscalID, &e.Certified, &e.BranchID, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *FiscalRepo) Create(ctx context.Context, e *model.FiscalEntry) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO fiscal_entries (transaction_id, fiscal_id, certified, branch_id) VALUES ($1, $2, $3, NULLIF($4,'')::uuid) RETURNING id, created_at`,
		e.TransactionID, e.FiscalID, e.Certified, e.BranchID,
	).Scan(&e.ID, &e.CreatedAt)
	return err
}
