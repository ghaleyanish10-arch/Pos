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
	Cost       float64    `json:"cost"`
	CategoryID *string    `json:"category_id"`
	PhotoURL   string     `json:"photo_url"`
	Available  bool       `json:"available"`
	ScheduleDays  string  `json:"schedule_days"`
	ScheduleStart string  `json:"schedule_start"`
	ScheduleEnd   string  `json:"schedule_end"`
	Variants     []Variant  `json:"variants"`
	Modifiers    []Modifier `json:"modifiers"`
	Published    bool       `json:"published"`
	BranchID   *string    `json:"branch_id"`
	CreatedAt  time.Time  `json:"created_at"`
	DeletedAt  *time.Time `json:"deleted_at"`
}

// Variant is a sellable configuration of an item (e.g. Steam / Fry / Jhol)
// with its own price. Variants appear in Register and the online store.
type Variant struct {
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

// Modifier is an optional add-on group (e.g. "Extra achar") with priced
// options the customer can pick at order time.
type Modifier struct {
	Name    string   `json:"name"`
	Options []string `json:"options"`
	Price   float64  `json:"price"`
}

// BulkUpdateRequest applies one change across many menu items at once —
// the price increase, category move, 86-out, or publish flip that would
// otherwise be 30 repetitive drawer edits.
type BulkUpdateRequest struct {
	IDs       []string `json:"ids" binding:"required,min=1"`
	Available *bool    `json:"available"`
	Published *bool    `json:"published"`
	CategoryID string  `json:"category_id"`
	PriceDelta *float64 `json:"price_delta"`        // additive, e.g. +25
	PricePercent *float64 `json:"price_percent"`     // multiplicative, e.g. 10 = +10%
}

type CreateMenuItemRequest struct {
	Name       string  `json:"name" binding:"required"`
	Price      float64 `json:"price" binding:"required"`
	Cost       float64 `json:"cost"`
	CategoryID string  `json:"category_id"`
	PhotoURL   string  `json:"photo_url"`
	Available  bool    `json:"available"`
	Variants   []Variant  `json:"variants"`
	Modifiers  []Modifier `json:"modifiers"`
}

type UpdateMenuItemRequest struct {
	Name       string  `json:"name"`
	Price      float64 `json:"price"`
	Cost       *float64 `json:"cost"`
	CategoryID string  `json:"category_id"`
	PhotoURL   string  `json:"photo_url"`
	Available  *bool   `json:"available"`
	Published  *bool   `json:"published"`
	ScheduleDays  string  `json:"schedule_days"`
	ScheduleStart string  `json:"schedule_start"`
	ScheduleEnd   string  `json:"schedule_end"`
	Variants     []Variant  `json:"variants"`
	Modifiers    []Modifier `json:"modifiers"`
}
