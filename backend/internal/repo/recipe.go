package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type RecipeRepo struct {
	db *pgxpool.Pool
}

func NewRecipeRepo(db *pgxpool.Pool) *RecipeRepo {
	return &RecipeRepo{db: db}
}

// recipeCols is the shared SELECT list for the recipe surface plus the
// listing conveniences (linked menu item's name/price and the computed plate
// cost) so the list view never has to fetch ingredients again.
const recipeCols = `
	SELECT r.id, r.name, r.menu_item_id::text, r.target_cost, r.branch_id::text, r.created_at,
	       COALESCE(mi.name, ''),
	       COALESCE(mi.price, 0)::float8,
	       COALESCE((SELECT SUM(rl.unit_cost) FROM recipe_lines rl WHERE rl.recipe_id = r.id), 0)::float8
	FROM recipes r
	LEFT JOIN menu_items mi ON mi.id = r.menu_item_id AND mi.deleted_at IS NULL
	WHERE r.deleted_at IS NULL`

func (r *RecipeRepo) List(ctx context.Context, branchID string) ([]model.Recipe, error) {
	query := recipeCols
	args := []interface{}{}
	if branchID != "" {
		query += ` AND r.branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY r.name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []model.Recipe
	for rows.Next() {
		rec, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		lines, _ := r.GetLines(ctx, rec.ID)
		rec.Lines = lines
		recipes = append(recipes, *rec)
	}
	return recipes, nil
}

func (r *RecipeRepo) GetByID(ctx context.Context, id string) (*model.Recipe, error) {
	rec, err := scanRecipe(r.db.QueryRow(ctx, recipeCols+` AND r.id = $1`, id))
	if err != nil {
		return nil, err
	}
	lines, _ := r.GetLines(ctx, rec.ID)
	rec.Lines = lines
	return rec, nil
}

// scanRecipe scans one row of recipeCols (either rows.Rows or pgx.Row).
func scanRecipe(r interface{ Scan(...interface{}) error }) (*model.Recipe, error) {
	var rec model.Recipe
	var menuName string
	var menuPrice, plateCost float64
	if err := r.Scan(
		&rec.ID, &rec.Name, &rec.MenuItemID, &rec.TargetCost, &rec.BranchID, &rec.CreatedAt,
		&menuName, &menuPrice, &plateCost,
	); err != nil {
		return nil, err
	}
	if menuName != "" {
		rec.MenuItemName = &menuName
		rec.MenuPrice = &menuPrice
	}
	rec.PlateCost = &plateCost
	return &rec, nil
}

func (r *RecipeRepo) GetLines(ctx context.Context, recipeID string) ([]model.RecipeLine, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, recipe_id, ingredient, qty, unit_cost FROM recipe_lines WHERE recipe_id = $1`, recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []model.RecipeLine
	for rows.Next() {
		var l model.RecipeLine
		if err := rows.Scan(&l.ID, &l.RecipeID, &l.Ingredient, &l.Qty, &l.UnitCost); err != nil {
			return nil, err
		}
		lines = append(lines, l)
	}
	return lines, nil
}

func (r *RecipeRepo) Create(ctx context.Context, rec *model.Recipe, lines []model.RecipeLineReq) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx,
		`INSERT INTO recipes (name, menu_item_id, target_cost, branch_id) VALUES ($1, NULLIF($2,'')::uuid, $3, NULLIF($4,'')::uuid) RETURNING id, created_at`,
		rec.Name, rec.MenuItemID, rec.TargetCost, rec.BranchID,
	).Scan(&rec.ID, &rec.CreatedAt)
	if err != nil {
		return err
	}

	for _, line := range lines {
		_, err = tx.Exec(ctx,
			`INSERT INTO recipe_lines (recipe_id, ingredient, qty, unit_cost) VALUES ($1, $2, $3, $4)`,
			rec.ID, line.Ingredient, line.Qty, line.UnitCost,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *RecipeRepo) Update(ctx context.Context, id string, rec *model.UpdateRecipeRequest) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if rec.Name != "" || rec.TargetCost > 0 {
		_, err = tx.Exec(ctx,
			`UPDATE recipes SET name = COALESCE(NULLIF($1,''), name), target_cost = CASE WHEN $2 > 0 THEN $2 ELSE target_cost END WHERE id = $3`,
			rec.Name, rec.TargetCost, id,
		)
		if err != nil {
			return err
		}
	}

	if rec.Lines != nil {
		_, err = tx.Exec(ctx, `DELETE FROM recipe_lines WHERE recipe_id = $1`, id)
		if err != nil {
			return err
		}
		for _, line := range rec.Lines {
			_, err = tx.Exec(ctx,
				`INSERT INTO recipe_lines (recipe_id, ingredient, qty, unit_cost) VALUES ($1, $2, $3, $4)`,
				id, line.Ingredient, line.Qty, line.UnitCost,
			)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

// Delete soft-deletes a recipe so the list stays clean but history can be
// recovered. Idempotent: deleting an already-deleted or unknown recipe is
// a no-op.
func (r *RecipeRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE recipes SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id)
	return err
}
