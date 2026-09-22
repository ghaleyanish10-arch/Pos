package repo

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type MenuRepo struct {
	db *pgxpool.Pool
}

func NewMenuRepo(db *pgxpool.Pool) *MenuRepo {
	return &MenuRepo{db: db}
}

// fmtPriceArg renders a float as a SQL numeric literal. Inputs are computed
// from API floats (not user strings), so this is safe — and it keeps the
// dynamic SET clause buildable while every user-controlled value still goes
// through a bound parameter.
func fmtPriceArg(v float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.4f", v), "0"), ".")
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

const menuItemCols = `id, name, price, cost, category_id::text, COALESCE(photo_url,''), available,
	schedule_days, schedule_start, schedule_end, variants, modifiers, published,
	branch_id::text, created_at`

func scanMenuItem(row interface{ Scan(...interface{}) error }) (model.MenuItem, error) {
	var i model.MenuItem
	err := row.Scan(&i.ID, &i.Name, &i.Price, &i.Cost, &i.CategoryID, &i.PhotoURL, &i.Available,
		&i.ScheduleDays, &i.ScheduleStart, &i.ScheduleEnd,
		&i.Variants, &i.Modifiers, &i.Published, &i.BranchID, &i.CreatedAt)
	return i, err
}

func (r *MenuRepo) ListItems(ctx context.Context, branchID, categoryID string) ([]model.MenuItem, error) {
	query := `SELECT ` + menuItemCols + ` FROM menu_items WHERE deleted_at IS NULL`
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
		i, err := scanMenuItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *MenuRepo) GetItem(ctx context.Context, id string) (*model.MenuItem, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+menuItemCols+` FROM menu_items WHERE id = $1 AND deleted_at IS NULL`, id)
	i, err := scanMenuItem(row)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

// GetItemsByIDs returns the live catalog rows for a set of menu item ids,
// keyed by id. Missing or deleted items are simply absent from the map — the
// caller decides whether an absent id is an error.
func (r *MenuRepo) GetItemsByIDs(ctx context.Context, ids []string) (map[string]*model.MenuItem, error) {
	out := make(map[string]*model.MenuItem, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.db.Query(ctx,
		`SELECT `+menuItemCols+` FROM menu_items WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		i, err := scanMenuItem(rows)
		if err != nil {
			return nil, err
		}
		it := i
		out[it.ID] = &it
	}
	return out, rows.Err()
}

func (r *MenuRepo) CreateItem(ctx context.Context, i *model.MenuItem) error {
	// nil slices marshal to JSON null, which the jsonb NOT NULL columns reject.
	variants := i.Variants
	if variants == nil {
		variants = []model.Variant{}
	}
	modifiers := i.Modifiers
	if modifiers == nil {
		modifiers = []model.Modifier{}
	}
	err := r.db.QueryRow(ctx,
		`INSERT INTO menu_items (name, price, cost, category_id, photo_url, available, variants, modifiers)
		VALUES ($1, $2, $3, NULLIF($4,'')::uuid, $5, $6, $7, $8) RETURNING id, created_at`,
		i.Name, i.Price, i.Cost, i.CategoryID, i.PhotoURL, i.Available, variants, modifiers,
	).Scan(&i.ID, &i.CreatedAt)
	return err
}

func (r *MenuRepo) UpdateItem(ctx context.Context, id string, req *model.UpdateMenuItemRequest) error {
	_, err := r.db.Exec(ctx,
		`UPDATE menu_items SET
			name = COALESCE(NULLIF($1,''), name),
			price = CASE WHEN $2 > 0 THEN $2 ELSE price END,
			cost = COALESCE($3, cost),
			category_id = COALESCE(NULLIF($4,'')::uuid, category_id),
			photo_url = COALESCE(NULLIF($5,''), photo_url),
			available = COALESCE($6, available),
			published = COALESCE($7, published),
			schedule_days = COALESCE(NULLIF($8,''), schedule_days),
			schedule_start = COALESCE(NULLIF($9,''), schedule_start),
			schedule_end = COALESCE(NULLIF($10,''), schedule_end),
			variants = COALESCE($11, variants),
			modifiers = COALESCE($12, modifiers)
		WHERE id = $13`,
		req.Name, req.Price, req.Cost, req.CategoryID, req.PhotoURL, req.Available, req.Published,
		req.ScheduleDays, req.ScheduleStart, req.ScheduleEnd,
		req.Variants, req.Modifiers, id,
	)
	return err
}

// ResolveCategoryID maps a category reference to its real id. The reference
// may be a raw id or a display name ("Momo & Snacks"); "" is returned when
// nothing matched so the caller can produce a clean client error.
func (r *MenuRepo) ResolveCategoryID(ctx context.Context, ref string) (string, error) {
	if ref == "" {
		return "", nil
	}
	var id string
	err := r.db.QueryRow(ctx,
		`SELECT id::text FROM menu_categories
		 WHERE lower(name) = lower($1) OR id::text = $1
		 ORDER BY sort_order LIMIT 1`, ref).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return id, nil
}

// BulkUpdate applies one change across many items in a single statement.
// Every field is optional; only the ones provided (non-nil / non-empty) are
// written. Price deltas add; percents multiply — pick exactly one.
func (r *MenuRepo) BulkUpdate(ctx context.Context, req *model.BulkUpdateRequest) (int64, error) {
	sets := []string{}
	args := []interface{}{}
	idx := 1

	addParam := func(col string, val interface{}) {
		sets = append(sets, col+" = $"+itoa(idx))
		args = append(args, val)
		idx++
	}

	if req.Available != nil {
		addParam("available", *req.Available)
	}
	if req.Published != nil {
		addParam("published", *req.Published)
	}
	if req.CategoryID != "" {
		addParam("category_id", req.CategoryID)
	}
	// Price changes are SQL expressions over the existing price, so the
	// numeric literal must be inlined rather than bound. fmtPriceArg emits
	// only digits, a dot and a minus sign — never user-supplied strings —
	// so the inline values cannot carry SQL.
	if req.PriceDelta != nil {
		sets = append(sets, "price = GREATEST(0, price + "+fmtPriceArg(*req.PriceDelta)+")")
	}
	if req.PricePercent != nil {
		sets = append(sets, "price = GREATEST(0, ROUND(price * "+fmtPriceArg(1+*req.PricePercent/100)+", 2))")
	}

	if len(sets) == 0 {
		return 0, nil
	}

	// IDs go last as a single array argument.
	idPlaceholder := "$" + itoa(idx)
	args = append(args, req.IDs)

	query := `UPDATE menu_items SET ` + strings.Join(sets, ", ") +
		` WHERE id = ANY(` + idPlaceholder + "::uuid[]) AND deleted_at IS NULL"
	tag, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *MenuRepo) DeleteItem(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE menu_items SET deleted_at = now() WHERE id = $1`, id)
	return err
}
