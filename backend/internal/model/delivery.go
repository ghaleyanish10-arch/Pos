package model

import (
	"encoding/json"
	"time"
)

type DeliveryOrder struct {
	ID        string          `json:"id"`
	Platform  string          `json:"platform"`
	Items     json.RawMessage `json:"items"`
	Courier   string          `json:"courier"`
	Status    string          `json:"status"`
	AIPhone   bool            `json:"ai_phone"`
	BranchID  *string         `json:"branch_id"`
	CreatedAt time.Time       `json:"created_at"`
}

type UpdateDeliveryStatusRequest struct {
	Status string `json:"status" binding:"required"`
}
