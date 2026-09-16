package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type RefundRepo struct {
	db *pgxpool.Pool
}

func NewRefundRepo(db *pgxpool.Pool) *RefundRepo {
	return &RefundRepo{db: db}
}

func (r *RefundRepo) List(ctx context.Context, status string) ([]model.Refund, error) {
	query := `SELECT r.id, r.transaction_id, r.items, COALESCE(r.reason, ''), r.amount, r.status,
	                  r.locked_by::text, r.branch_id::text, r.created_at, COALESCE(ft.name, ''), COALESCE(r.created_by::text, '')
	         FROM refunds r
	         LEFT JOIN transactions t ON t.id = r.transaction_id
	         LEFT JOIN orders o ON o.id = t.order_id
	         LEFT JOIN floor_tables ft ON ft.id = o.table_id
	         WHERE 1=1`
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

	var refunds []model.Refund
	for rows.Next() {
		var rf model.Refund
		if err := rows.Scan(&rf.ID, &rf.TransactionID, &rf.Items, &rf.Reason, &rf.Amount, &rf.Status, &rf.LockedBy, &rf.BranchID, &rf.CreatedAt, &rf.TableName, &rf.CreatedBy); err != nil {
			return nil, err
		}
		refunds = append(refunds, rf)
	}
	return refunds, nil
}

func (r *RefundRepo) Create(ctx context.Context, rf *model.Refund) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO refunds (transaction_id, items, reason, amount, status, branch_id, created_by) VALUES ($1, $2, $3, $4, 'Requested', NULLIF($5,'')::uuid, NULLIF($6,'')::uuid) RETURNING id, created_at`,
		rf.TransactionID, rf.Items, rf.Reason, rf.Amount, rf.BranchID, rf.CreatedBy,
	).Scan(&rf.ID, &rf.CreatedAt)
	return err
}

// GetCreator returns the user that filed the refund — the separation-of-duties
// anchor for approval. pgx.ErrNoRows when the refund does not exist.
func (r *RefundRepo) GetCreator(ctx context.Context, id string) (string, error) {
	var createdBy string
	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(created_by::text, '') FROM refunds WHERE id = $1`, id,
	).Scan(&createdBy)
	return createdBy, err
}

func (r *RefundRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE refunds SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *RefundRepo) Lock(ctx context.Context, id, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE refunds SET locked_by = $1 WHERE id = $2`, userID, id)
	return err
}
