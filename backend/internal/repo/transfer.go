package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type TransferRepo struct {
	db *pgxpool.Pool
}

func NewTransferRepo(db *pgxpool.Pool) *TransferRepo {
	return &TransferRepo{db: db}
}

func (r *TransferRepo) List(ctx context.Context, status string) ([]model.BranchTransfer, error) {
	query := `SELECT id, item, qty, from_branch_id, to_branch_id, status, eta, created_at FROM branch_transfers WHERE 1=1`
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

	var transfers []model.BranchTransfer
	for rows.Next() {
		var t model.BranchTransfer
		if err := rows.Scan(&t.ID, &t.Item, &t.Qty, &t.FromBranchID, &t.ToBranchID, &t.Status, &t.ETA, &t.CreatedAt); err != nil {
			return nil, err
		}
		transfers = append(transfers, t)
	}
	return transfers, nil
}

func (r *TransferRepo) Create(ctx context.Context, t *model.BranchTransfer) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO branch_transfers (item, qty, from_branch_id, to_branch_id, status) VALUES ($1, $2, $3, $4, 'Requested') RETURNING id, created_at, status`,
		t.Item, t.Qty, t.FromBranchID, t.ToBranchID,
	).Scan(&t.ID, &t.CreatedAt, &t.Status)
	return err
}

// BranchExists reports whether a branch id exists (from/to ids are foreign keys).
func (r *TransferRepo) BranchExists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branches WHERE id = $1)`, id).Scan(&exists)
	return exists, err
}

// UpdateStatus flips a transfer's state. Reports how many rows matched so
// callers can distinguish "received" from "no such transfer".
func (r *TransferRepo) UpdateStatus(ctx context.Context, id, status string) (int64, error) {
	tag, err := r.db.Exec(ctx, `UPDATE branch_transfers SET status = $1 WHERE id = $2`, status, id)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
