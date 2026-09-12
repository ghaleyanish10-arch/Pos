package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type MenuRepo struct {
	db *pgxpool.Pool
}

func NewMenuRepo(db *pgxpool.Pool) *MenuRepo {
	return &MenuRepo{db: db}
}

func (r *MenuRepo) ListCategories(ctx context.Context, branchID string) ([]model.MenuCategory, error) {
	query := `SELECT id, name, branch_id::text, sort_order FROM menu_categories`
	args := []interface{}{}
	if branchID != "" {
		query += ` WHERE branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY sort_order`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []model.MenuCategory
	for rows.Next() {
		var c model.MenuCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.BranchID, &c.SortOrder); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (r *MenuRepo) ListItems(ctx context.Context, branchID, categoryID string) ([]model.MenuItem, error) {
	query := `SELECT id, name, price, category_id::text, COALESCE(photo_url,''), available, branch_id::text, created_at FROM menu_items WHERE deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}
	if categoryID != "" {
		query += ` AND category_id = $` + itoa(argIdx)
		args = append(args, categoryID)
		argIdx++
	}

	query += ` ORDER BY name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.MenuItem
	for rows.Next() {
		var i model.MenuItem
		if err := rows.Scan(&i.ID, &i.Name, &i.Price, &i.CategoryID, &i.PhotoURL, &i.Available, &i.BranchID, &i.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *MenuRepo) GetItem(ctx context.Context, id string) (*model.MenuItem, error) {
	var i model.MenuItem
	err := r.db.QueryRow(ctx,
		`SELECT id, name, price, category_id::text, COALESCE(photo_url,''), available, branch_id::text, created_at FROM menu_items WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&i.ID, &i.Name, &i.Price, &i.CategoryID, &i.PhotoURL, &i.Available, &i.BranchID, &i.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

func (r *MenuRepo) CreateItem(ctx context.Context, i *model.MenuItem) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO menu_items (name, price, category_id, photo_url, available, branch_id) VALUES ($1, $2, NULLIF($3,'')::uuid, $4, $5, NULLIF($6,'')::uuid) RETURNING id, created_at`,
		i.Name, i.Price, i.CategoryID, i.PhotoURL, i.Available, i.BranchID,
	).Scan(&i.ID, &i.CreatedAt)
	return err
}

func (r *MenuRepo) UpdateItem(ctx context.Context, id string, i *model.UpdateMenuItemRequest) error {
	_, err := r.db.Exec(ctx,
		`UPDATE menu_items SET name = COALESCE(NULLIF($1,''), name), price = CASE WHEN $2 > 0 THEN $2 ELSE price END, category_id = COALESCE(NULLIF($3,'')::uuid, category_id), photo_url = COALESCE(NULLIF($4,''), photo_url), available = COALESCE($5, available) WHERE id = $6`,
		i.Name, i.Price, i.CategoryID, i.PhotoURL, i.Available, id,
	)
	return err
}

func (r *MenuRepo) DeleteItem(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE menu_items SET deleted_at = now() WHERE id = $1`, id)
	return err
}
