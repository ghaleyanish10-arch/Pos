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
		`INSERT INTO branch_transfers (item, qty, from_branch_id, to_branch_id, status) VALUES ($1, $2, $3, $4, 'Requested') RETURNING id, created_at`,
		t.Item, t.Qty, t.FromBranchID, t.ToBranchID,
	).Scan(&t.ID, &t.CreatedAt)
	return err
}

func (r *TransferRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE branch_transfers SET status = $1 WHERE id = $2`, status, id)
	return err
}
