package model

import (
	"time"
)

type FiscalEntry struct {
	ID            string    `json:"id"`
	TransactionID string    `json:"transaction_id"`
	FiscalID      string    `json:"fiscal_id"`
	Certified     bool      `json:"certified"`
	BranchID      *string   `json:"branch_id"`
	CreatedAt     time.Time `json:"created_at"`
}
