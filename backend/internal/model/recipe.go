package model

import (
	"time"
)

type Recipe struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	MenuItemID   *string      `json:"menu_item_id"`
	MenuItemName *string      `json:"menu_item_name,omitempty"`
	MenuPrice    *float64     `json:"menu_price,omitempty"`
	PlateCost    *float64     `json:"plate_cost,omitempty"`
	TargetCost   float64      `json:"target_cost"`
	BranchID     *string      `json:"branch_id"`
	CreatedAt    time.Time    `json:"created_at"`
	Lines        []RecipeLine `json:"lines,omitempty"`
}

type RecipeLine struct {
	ID         string  `json:"id"`
	RecipeID   string  `json:"recipe_id"`
	Ingredient string  `json:"ingredient"`
	Qty        float64 `json:"qty"`
	UnitCost   float64 `json:"unit_cost"`
}

type CreateRecipeRequest struct {
	Name       string          `json:"name" binding:"required"`
	MenuItemID string          `json:"menu_item_id"`
	TargetCost float64         `json:"target_cost"`
	Lines      []RecipeLineReq `json:"lines"`
}

type RecipeLineReq struct {
	Ingredient string  `json:"ingredient" binding:"required"`
	Qty        float64 `json:"qty" binding:"required"`
	UnitCost   float64 `json:"unit_cost" binding:"required"`
}

type UpdateRecipeRequest struct {
	Name       string          `json:"name"`
	TargetCost float64         `json:"target_cost"`
	Lines      []RecipeLineReq `json:"lines"`
}
