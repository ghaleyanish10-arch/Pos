package model

import (
	"encoding/json"
	"time"
)

type Refund struct {
	ID            string          `json:"id"`
	TransactionID string          `json:"transaction_id"`
	Items         json.RawMessage `json:"items"`
	Reason        string          `json:"reason"`
	Amount        float64         `json:"amount"`
	Status        string          `json:"status"`
	LockedBy      *string         `json:"locked_by"`
	BranchID      *string         `json:"branch_id"`
	CreatedAt     time.Time       `json:"created_at"`
}

type CreateRefundRequest struct {
	TransactionID string   `json:"transaction_id" binding:"required"`
	Items         []string `json:"items"`
	Reason        string   `json:"reason"`
	Amount        float64  `json:"amount" binding:"required"`
}
