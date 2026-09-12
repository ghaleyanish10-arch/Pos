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

func (r *RecipeRepo) List(ctx context.Context, branchID string) ([]model.Recipe, error) {
	query := `SELECT id, name, menu_item_id::text, target_cost, branch_id::text, created_at FROM recipes WHERE 1=1`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []model.Recipe
	for rows.Next() {
		var rec model.Recipe
		if err := rows.Scan(&rec.ID, &rec.Name, &rec.MenuItemID, &rec.TargetCost, &rec.BranchID, &rec.CreatedAt); err != nil {
			return nil, err
		}
		lines, _ := r.GetLines(ctx, rec.ID)
		rec.Lines = lines
		recipes = append(recipes, rec)
	}
	return recipes, nil
}

func (r *RecipeRepo) GetByID(ctx context.Context, id string) (*model.Recipe, error) {
	var rec model.Recipe
	err := r.db.QueryRow(ctx,
		`SELECT id, name, menu_item_id::text, target_cost, branch_id::text, created_at FROM recipes WHERE id = $1`, id,
	).Scan(&rec.ID, &rec.Name, &rec.MenuItemID, &rec.TargetCost, &rec.BranchID, &rec.CreatedAt)
	if err != nil {
		return nil, err
	}
	lines, _ := r.GetLines(ctx, id)
	rec.Lines = lines
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
