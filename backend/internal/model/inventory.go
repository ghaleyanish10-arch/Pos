package model

import (
	"time"
)

type InventoryItem struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Category    string     `json:"category"`
	Stock       float64    `json:"stock"`
	Capacity    float64    `json:"capacity"`
	Unit        string     `json:"unit"`
	Threshold   float64    `json:"threshold"`
	Supplier    string     `json:"supplier"`
	RestockedAt *time.Time `json:"restocked_at"`
	BranchID    *string    `json:"branch_id"`
	CreatedAt   time.Time  `json:"created_at"`
}

type ReorderSuggestion struct {
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
	Note     string `json:"note"`
}

type CreateInventoryRequest struct {
	Name     string  `json:"name" binding:"required"`
	Category string  `json:"category" binding:"required"`
	Stock    float64 `json:"stock" binding:"required"`
	Capacity float64 `json:"capacity" binding:"required"`
	Unit     string  `json:"unit" binding:"required"`
	Threshold float64 `json:"threshold"`
	Supplier string  `json:"supplier"`
}

type UpdateInventoryRequest struct {
	Name      string  `json:"name"`
	Category  string  `json:"category"`
	Stock     float64 `json:"stock"`
	Capacity  float64 `json:"capacity"`
	Unit      string  `json:"unit"`
	Threshold float64 `json:"threshold"`
	Supplier  string  `json:"supplier"`
}

type AdjustStockRequest struct {
	Delta float64 `json:"delta"`
}
