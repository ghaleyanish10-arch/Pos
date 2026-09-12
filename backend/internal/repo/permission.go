package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type PermissionRepo struct {
	db *pgxpool.Pool
}

func NewPermissionRepo(db *pgxpool.Pool) *PermissionRepo {
	return &PermissionRepo{db: db}
}

func (r *PermissionRepo) List(ctx context.Context) ([]model.Permission, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, role, action, granted FROM role_permissions ORDER BY role, action`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []model.Permission
	for rows.Next() {
		var p model.Permission
		if err := rows.Scan(&p.ID, &p.Role, &p.Action, &p.Granted); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func (r *PermissionRepo) GetByRole(ctx context.Context, role string) ([]model.Permission, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, role, action, granted FROM role_permissions WHERE role = $1 ORDER BY action`, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []model.Permission
	for rows.Next() {
		var p model.Permission
		if err := rows.Scan(&p.ID, &p.Role, &p.Action, &p.Granted); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func (r *PermissionRepo) Upsert(ctx context.Context, role string, permissions []model.Permission) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM role_permissions WHERE role = $1`, role)
	if err != nil {
		return err
	}

	for _, p := range permissions {
		_, err = tx.Exec(ctx,
			`INSERT INTO role_permissions (role, action, granted) VALUES ($1, $2, $3)`,
			role, p.Action, p.Granted,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
