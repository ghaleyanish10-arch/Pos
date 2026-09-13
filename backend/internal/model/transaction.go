package model

import (
	"time"
)

type Transaction struct {
	ID         string     `json:"id"`
	OrderID    *string    `json:"order_id"`
	Ref        string     `json:"ref"`
	TableName  string     `json:"table_name"`
	Method     string     `json:"method"`
	Amount     float64    `json:"amount"`
	Status     string     `json:"status"`
	FiscalID   string     `json:"fiscal_id"`
	Certified  bool       `json:"certified"`
	BranchID   *string    `json:"branch_id"`
	CreatedAt  time.Time  `json:"created_at"`
}

type CreateTransactionRequest struct {
	OrderID string  `json:"order_id"`
	Method  string  `json:"method" binding:"required"`
	Amount  float64 `json:"amount" binding:"required"`
	Ref     string  `json:"ref"`
}

type ManualPaymentRequest struct {
	Amount float64 `json:"amount" binding:"required"`
	Method string  `json:"method" binding:"required"`
}
