package model

import (
	"time"
)

type Order struct {
	ID        string     `json:"id"`
	Type      string     `json:"type"`
	TableID   *string    `json:"table_id"`
	GuestID   *string    `json:"guest_id"`
	Status    string     `json:"status"`
	Total     float64    `json:"total"`
	BranchID  *string    `json:"branch_id"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at"`
	Items     []OrderItem `json:"items,omitempty"`
}

type OrderItem struct {
	ID         string  `json:"id"`
	OrderID    string  `json:"order_id"`
	MenuItemID *string `json:"menu_item_id"`
	Name       string  `json:"name"`
	Qty        int     `json:"qty"`
	Price      float64 `json:"price"`
	Notes      string  `json:"notes"`
}

type CreateOrderRequest struct {
	Type    string              `json:"type"`
	TableID string              `json:"table_id"`
	GuestID string              `json:"guest_id"`
	Items   []CreateOrderItemReq `json:"items"`
}

type CreateOrderItemReq struct {
	MenuItemID string  `json:"menu_item_id"`
	Name       string  `json:"name"`
	Qty        int     `json:"qty"`
	Price      float64 `json:"price"`
	Notes      string  `json:"notes"`
}

type UpdateOrderRequest struct {
	Status string `json:"status"`
}

// TransferOrderRequest moves an open order to another floor table. TableID
// accepts the target's table name ("T4") or its UUID.
type TransferOrderRequest struct {
	TableID string `json:"table_id"`
}

// MergeTablesRequest folds the SOURCE table's open check into the target table
// (the route's :id), combining both parties into one check on one floor card.
// SourceTableID accepts the source's table name ("T8") or its UUID.
type MergeTablesRequest struct {
	SourceTableID string `json:"source_table_id"`
}
