package model

import (
	"time"
)

type MenuCategory struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	BranchID *string `json:"branch_id"`
	SortOrder int    `json:"sort_order"`
}

type MenuItem struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Price      float64    `json:"price"`
	CategoryID *string    `json:"category_id"`
	PhotoURL   string     `json:"photo_url"`
	Available  bool       `json:"available"`
	BranchID   *string    `json:"branch_id"`
	CreatedAt  time.Time  `json:"created_at"`
	DeletedAt  *time.Time `json:"deleted_at"`
}

type CreateMenuItemRequest struct {
	Name       string  `json:"name" binding:"required"`
	Price      float64 `json:"price" binding:"required"`
	CategoryID string  `json:"category_id"`
	PhotoURL   string  `json:"photo_url"`
	Available  bool    `json:"available"`
}

type UpdateMenuItemRequest struct {
	Name       string  `json:"name"`
	Price      float64 `json:"price"`
	CategoryID string  `json:"category_id"`
	PhotoURL   string  `json:"photo_url"`
	Available  *bool   `json:"available"`
}
