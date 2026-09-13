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
	query := `
		SELECT t.id, t.order_id::text, COALESCE(t.ref, ''),
		       COALESCE(ft.name, ''), t.method, t.amount, t.status,
		       COALESCE(t.fiscal_id, ''), t.certified, t.branch_id::text, t.created_at
		FROM transactions t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND t.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` ORDER BY t.created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []model.Transaction
	for rows.Next() {
		var t model.Transaction
		if err := rows.Scan(&t.ID, &t.OrderID, &t.Ref, &t.TableName, &t.Method, &t.Amount, &t.Status, &t.FiscalID, &t.Certified, &t.BranchID, &t.CreatedAt); err != nil {
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
		`SELECT t.id, t.order_id::text, COALESCE(t.ref,''),
		       COALESCE(ft.name, ''), t.method, t.amount, t.status,
		       COALESCE(t.fiscal_id,''), t.certified, t.branch_id::text, t.created_at
		FROM transactions t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE t.id = $1`, id,
	).Scan(&t.ID, &t.OrderID, &t.Ref, &t.TableName, &t.Method, &t.Amount, &t.Status, &t.FiscalID, &t.Certified, &t.BranchID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TransactionRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE transactions SET status = $1 WHERE id = $2`, status, id)
	return err
}
