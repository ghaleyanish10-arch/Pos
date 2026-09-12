package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type TransactionRepo struct {
	db *pgxpool.Pool
}

func NewTransactionRepo(db *pgxpool.Pool) *TransactionRepo {
	return &TransactionRepo{db: db}
}

func (r *TransactionRepo) List(ctx context.Context, branchID string) ([]model.Transaction, error) {
	query := `SELECT id, order_id::text, COALESCE(ref, ''), method, amount, status, COALESCE(fiscal_id, ''), certified, branch_id::text, created_at FROM transactions WHERE 1=1`
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

	var txs []model.Transaction
	for rows.Next() {
		var t model.Transaction
		if err := rows.Scan(&t.ID, &t.OrderID, &t.Ref, &t.Method, &t.Amount, &t.Status, &t.FiscalID, &t.Certified, &t.BranchID, &t.CreatedAt); err != nil {
			return nil, err
		}
		txs = append(txs, t)
	}
	return txs, nil
}

func (r *TransactionRepo) Create(ctx context.Context, t *model.Transaction) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO transactions (order_id, ref, method, amount, status, branch_id) VALUES (NULLIF($1,'')::uuid, $2, $3, $4, 'Success', NULLIF($5,'')::uuid) RETURNING id, created_at`,
		t.OrderID, t.Ref, t.Method, t.Amount, t.BranchID,
	).Scan(&t.ID, &t.CreatedAt)
	return err
}

func (r *TransactionRepo) GetByID(ctx context.Context, id string) (*model.Transaction, error) {
	var t model.Transaction
	err := r.db.QueryRow(ctx,
		`SELECT id, order_id::text, COALESCE(ref,''), method, amount, status, COALESCE(fiscal_id,''), certified, branch_id::text, created_at FROM transactions WHERE id = $1`, id,
	).Scan(&t.ID, &t.OrderID, &t.Ref, &t.Method, &t.Amount, &t.Status, &t.FiscalID, &t.Certified, &t.BranchID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TransactionRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE transactions SET status = $1 WHERE id = $2`, status, id)
	return err
}
