package model

import (
	"time"
)

type Invoice struct {
	ID        string            `json:"id"`
	Party     string            `json:"party"`
	Amount    float64           `json:"amount"`
	DueDate   time.Time         `json:"due_date"`
	Status    string            `json:"status"`
	BranchID  *string           `json:"branch_id"`
	CreatedAt time.Time         `json:"created_at"`
	ChasedAt  *time.Time        `json:"chased_at"`
	Items     []InvoiceLineItem `json:"items,omitempty"`
}

type InvoiceLineItem struct {
	ID          string  `json:"id"`
	InvoiceID   string  `json:"invoice_id"`
	Description string  `json:"description"`
	Qty         int     `json:"qty"`
	UnitPrice   float64 `json:"unit_price"`
}

type CreateInvoiceRequest struct {
	Party   string              `json:"party" binding:"required"`
	DueDate string              `json:"due_date" binding:"required"`
	Items   []InvoiceLineItemReq `json:"items"`
}

type InvoiceLineItemReq struct {
	Description string  `json:"description" binding:"required"`
	Qty         int     `json:"qty"`
	UnitPrice   float64 `json:"unit_price" binding:"required"`
}

type UpdateInvoiceRequest struct {
	Status string `json:"status"`
	Chased bool   `json:"chased"`
}
