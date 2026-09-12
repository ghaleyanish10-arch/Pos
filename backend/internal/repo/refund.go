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
	query := `SELECT id, transaction_id, items, COALESCE(reason, ''), amount, status, locked_by::text, branch_id::text, created_at FROM refunds WHERE 1=1`
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
		if err := rows.Scan(&rf.ID, &rf.TransactionID, &rf.Items, &rf.Reason, &rf.Amount, &rf.Status, &rf.LockedBy, &rf.BranchID, &rf.CreatedAt); err != nil {
			return nil, err
		}
		refunds = append(refunds, rf)
	}
	return refunds, nil
}

func (r *RefundRepo) Create(ctx context.Context, rf *model.Refund) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO refunds (transaction_id, items, reason, amount, status, branch_id) VALUES ($1, $2, $3, $4, 'Requested', NULLIF($5,'')::uuid) RETURNING id, created_at`,
		rf.TransactionID, rf.Items, rf.Reason, rf.Amount, rf.BranchID,
	).Scan(&rf.ID, &rf.CreatedAt)
	return err
}

func (r *RefundRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE refunds SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *RefundRepo) Lock(ctx context.Context, id, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE refunds SET locked_by = $1 WHERE id = $2`, userID, id)
	return err
}
