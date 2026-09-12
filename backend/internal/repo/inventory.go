package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type InventoryRepo struct {
	db *pgxpool.Pool
}

func NewInventoryRepo(db *pgxpool.Pool) *InventoryRepo {
	return &InventoryRepo{db: db}
}

func (r *InventoryRepo) List(ctx context.Context, branchID string) ([]model.InventoryItem, error) {
	query := `SELECT id, name, category, stock, capacity, unit, threshold, COALESCE(supplier,''), restocked_at, branch_id::text, created_at FROM inventory_items WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` ORDER BY name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.InventoryItem
	for rows.Next() {
		var i model.InventoryItem
		if err := rows.Scan(&i.ID, &i.Name, &i.Category, &i.Stock, &i.Capacity, &i.Unit, &i.Threshold, &i.Supplier, &i.RestockedAt, &i.BranchID, &i.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *InventoryRepo) GetByID(ctx context.Context, id string) (*model.InventoryItem, error) {
	var i model.InventoryItem
	err := r.db.QueryRow(ctx,
		`SELECT id, name, category, stock, capacity, unit, threshold, COALESCE(supplier,''), restocked_at, branch_id::text, created_at FROM inventory_items WHERE id = $1`, id,
	).Scan(&i.ID, &i.Name, &i.Category, &i.Stock, &i.Capacity, &i.Unit, &i.Threshold, &i.Supplier, &i.RestockedAt, &i.BranchID, &i.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

func (r *InventoryRepo) Create(ctx context.Context, i *model.InventoryItem) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO inventory_items (name, category, stock, capacity, unit, threshold, supplier, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8,'')::uuid) RETURNING id, created_at`,
		i.Name, i.Category, i.Stock, i.Capacity, i.Unit, i.Threshold, i.Supplier, i.BranchID,
	).Scan(&i.ID, &i.CreatedAt)
	return err
}

func (r *InventoryRepo) Update(ctx context.Context, id string, i *model.UpdateInventoryRequest) error {
	_, err := r.db.Exec(ctx,
		`UPDATE inventory_items SET name = COALESCE(NULLIF($1,''), name), category = COALESCE(NULLIF($2,''), category), stock = $3, capacity = $4, unit = COALESCE(NULLIF($5,''), unit), threshold = $6, supplier = COALESCE(NULLIF($7,''), supplier) WHERE id = $8`,
		i.Name, i.Category, i.Stock, i.Capacity, i.Unit, i.Threshold, i.Supplier, id,
	)
	return err
}

func (r *InventoryRepo) AdjustStock(ctx context.Context, id string, delta float64) error {
	_, err := r.db.Exec(ctx,
		`UPDATE inventory_items SET stock = GREATEST(0, stock + $1), restocked_at = CASE WHEN $1 > 0 THEN now() ELSE restocked_at END WHERE id = $2`,
		delta, id,
	)
	return err
}

func (r *InventoryRepo) ReorderSuggestions(ctx context.Context, branchID string) ([]model.ReorderSuggestion, error) {
	query := `SELECT name, CEIL(threshold - stock)::int, name || ' is low (' || stock || ' ' || unit || ')' FROM inventory_items WHERE stock < threshold`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND branch_id = $1`
		args = append(args, branchID)
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []model.ReorderSuggestion
	for rows.Next() {
		var s model.ReorderSuggestion
		if err := rows.Scan(&s.Name, &s.Quantity, &s.Note); err != nil {
			return nil, err
		}
		suggestions = append(suggestions, s)
	}
	return suggestions, nil
}
