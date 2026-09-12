package model

import (
	"time"
)

type PurchaseOrder struct {
	ID           string       `json:"id"`
	Supplier     string       `json:"supplier"`
	Total        float64      `json:"total"`
	ExpectedDate *time.Time   `json:"expected_date"`
	Status       string       `json:"status"`
	BranchID     *string      `json:"branch_id"`
	CreatedAt    time.Time    `json:"created_at"`
	Items        []POLineItem `json:"items,omitempty"`
}

type POLineItem struct {
	ID         string  `json:"id"`
	POID       string  `json:"po_id"`
	Ingredient string  `json:"ingredient"`
	Qty        float64 `json:"qty"`
	UnitCost   float64 `json:"unit_cost"`
}

type CreatePORequest struct {
	Supplier     string         `json:"supplier" binding:"required"`
	ExpectedDate string         `json:"expected_date"`
	Items        []POLineItemReq `json:"items"`
}

type POLineItemReq struct {
	Ingredient string  `json:"ingredient" binding:"required"`
	Qty        float64 `json:"qty" binding:"required"`
	UnitCost   float64 `json:"unit_cost" binding:"required"`
}

type UpdatePORequest struct {
	Status string `json:"status"`
}

type ReceivePORequest struct {
	ReceivedItems []string `json:"received_items"`
}
