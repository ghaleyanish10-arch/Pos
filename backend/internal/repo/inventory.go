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
	query := `SELECT id, name, category, stock, capacity, unit, threshold, COALESCE(supplier,''), unit_cost, restocked_at, branch_id::text, created_at FROM inventory_items WHERE 1=1`
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
		if err := rows.Scan(&i.ID, &i.Name, &i.Category, &i.Stock, &i.Capacity, &i.Unit, &i.Threshold, &i.Supplier, &i.UnitCost, &i.RestockedAt, &i.BranchID, &i.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

// Summary returns the headline counts for the exception-first Inventory
// screen: out-of-stock / critical (≤25% of threshold) / low buckets plus
// total stock value and waste this week.
func (r *InventoryRepo) Summary(ctx context.Context, branchID string) (*model.StockSummary, error) {
	query := `SELECT
		COUNT(*),
		COUNT(*) FILTER (WHERE stock <= 0),
		COUNT(*) FILTER (WHERE stock > 0 AND stock <= threshold * 0.25),
		COUNT(*) FILTER (WHERE stock > threshold * 0.25 AND stock <= threshold),
		COALESCE(SUM(stock * unit_cost), 0),
		COALESCE((SELECT SUM(cost) FROM waste_log
			WHERE created_at > now() - INTERVAL '7 days'
				AND ($1 = '' OR branch_id::text = $1)), 0)
		FROM inventory_items WHERE ($1 = '' OR branch_id::text = $1)`
	var s model.StockSummary
	err := r.db.QueryRow(ctx, query, branchID).Scan(
		&s.TotalItems, &s.OutOfStock, &s.Critical, &s.Low, &s.StockValue, &s.WasteThisWeek)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *InventoryRepo) GetByID(ctx context.Context, id string) (*model.InventoryItem, error) {
	var i model.InventoryItem
	err := r.db.QueryRow(ctx,
		`SELECT id, name, category, stock, capacity, unit, threshold, COALESCE(supplier,''), unit_cost, restocked_at, branch_id::text, created_at FROM inventory_items WHERE id = $1`, id,
	).Scan(&i.ID, &i.Name, &i.Category, &i.Stock, &i.Capacity, &i.Unit, &i.Threshold, &i.Supplier, &i.UnitCost, &i.RestockedAt, &i.BranchID, &i.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

// Exists reports whether an inventory item id exists.
func (r *InventoryRepo) Exists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM inventory_items WHERE id = $1)`, id).Scan(&exists)
	return exists, err
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
		`UPDATE inventory_items SET name = COALESCE(NULLIF($1,''), name), category = COALESCE(NULLIF($2,''), category), stock = $3, capacity = $4, unit = COALESCE(NULLIF($5,''), unit), threshold = $6, supplier = COALESCE(NULLIF($7,''), supplier), unit_cost = COALESCE($8, unit_cost) WHERE id = $9`,
		i.Name, i.Category, i.Stock, i.Capacity, i.Unit, i.Threshold, i.Supplier, i.UnitCost, id,
	)
	return err
}

// RecordWaste writes off stock and decrements it in one transaction — the
// write-off and the stock decrement must agree or neither happens.
func (r *InventoryRepo) RecordWaste(ctx context.Context, w *model.WasteEntry, unitCost float64) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`INSERT INTO waste_log (item_id, qty, reason, cost, branch_id, created_by)
		SELECT id, $2, $3, ROUND($2 * unit_cost, 2), branch_id, $4 FROM inventory_items WHERE id = $1`,
		w.ItemID, w.Qty, w.Reason, w.CreatedBy,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE inventory_items SET stock = GREATEST(0, stock - $2) WHERE id = $1`,
		w.ItemID, w.Qty,
	); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(unit_cost, 0) FROM inventory_items WHERE id = $1`, w.ItemID,
	).Scan(&unitCost); err != nil {
		return err
	}
	w.Cost = unitCost * w.Qty
	return tx.Commit(ctx)
}

func (r *InventoryRepo) WasteLog(ctx context.Context, limit int) ([]model.WasteEntry, error) {
	rows, err := r.db.Query(ctx,
		`SELECT w.id, w.item_id, COALESCE(i.name, 'deleted item'), w.qty, w.reason, w.cost, COALESCE(w.created_by,''), w.created_at
		FROM waste_log w LEFT JOIN inventory_items i ON i.id = w.item_id
		ORDER BY w.created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.WasteEntry
	for rows.Next() {
		var w model.WasteEntry
		if err := rows.Scan(&w.ID, &w.ItemID, &w.ItemName, &w.Qty, &w.Reason, &w.Cost, &w.CreatedBy, &w.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, nil
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
