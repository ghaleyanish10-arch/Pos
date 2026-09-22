package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type BranchesRepo struct {
	db *pgxpool.Pool
}

func NewBranchesRepo(db *pgxpool.Pool) *BranchesRepo {
	return &BranchesRepo{db: db}
}

// List returns the real branch rows (id + name). The transfers UI needs the
// ids to POST valid from_branch_id/to_branch_id — branch *names* alone always
// get rejected by the server.
func (r *BranchesRepo) List(ctx context.Context) ([]model.Branch, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, name, status, COALESCE(address, '') FROM branches ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []model.Branch
	for rows.Next() {
		var b model.Branch
		if err := rows.Scan(&b.ID, &b.Name, &b.Status, &b.Address); err != nil {
			return nil, err
		}
		branches = append(branches, b)
	}
	return branches, nil
}