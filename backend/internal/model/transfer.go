package model

import (
	"time"
)

type BranchTransfer struct {
	ID           string     `json:"id"`
	Item         string     `json:"item"`
	Qty          float64    `json:"qty"`
	FromBranchID string     `json:"from_branch_id"`
	ToBranchID   string     `json:"to_branch_id"`
	Status       string     `json:"status"`
	ETA          *time.Time `json:"eta"`
	CreatedAt    time.Time  `json:"created_at"`
}

type CreateTransferRequest struct {
	Item         string  `json:"item" binding:"required"`
	Qty          float64 `json:"qty" binding:"required"`
	FromBranchID string  `json:"from_branch_id" binding:"required"`
	ToBranchID   string  `json:"to_branch_id" binding:"required"`
}
