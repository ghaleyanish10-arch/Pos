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
	UnitCost    float64    `json:"unit_cost"`
	RestockedAt *time.Time `json:"restocked_at"`
	BranchID    *string    `json:"branch_id"`
	CreatedAt   time.Time  `json:"created_at"`
}

// WasteEntry records stock deliberately written off (spoilage, breakage,
// staff meal, etc). Cost is qty × unit cost at the time of the write-off.
type WasteEntry struct {
	ID        string    `json:"id"`
	ItemID    string    `json:"item_id"`
	ItemName  string    `json:"item_name"`
	Qty       float64   `json:"qty"`
	Reason    string    `json:"reason"`
	Cost      float64   `json:"cost"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// StockSummary is the glanceable headline block for the Inventory screen:
// exception counts first (that is what staff act on), value second.
type StockSummary struct {
	TotalItems   int     `json:"total_items"`
	OutOfStock   int     `json:"out_of_stock"`
	Critical     int     `json:"critical"`
	Low          int     `json:"low"`
	StockValue   float64 `json:"stock_value"`
	WasteThisWeek float64 `json:"waste_this_week"`
}

// RecordWasteRequest writes off qty of an item and decrements stock atomically.
type RecordWasteRequest struct {
	ItemID string  `json:"item_id" binding:"required"`
	Qty    float64 `json:"qty" binding:"required,gt=0"`
	Reason string  `json:"reason" binding:"required"`
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
	UnitCost  *float64 `json:"unit_cost"`
}

type AdjustStockRequest struct {
	Delta float64 `json:"delta"`
}
