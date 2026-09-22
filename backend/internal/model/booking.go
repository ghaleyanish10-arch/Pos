package model

import (
	"time"
)

type FloorTable struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Seats    int     `json:"seats"`
	State    string  `json:"state"`
	Detail   string  `json:"detail"`
	BranchID *string `json:"branch_id"`

	// Live order info derived from the newest open order on this table.
	// Empty/zero when the table has no open order (omitempty keeps the JSON
	// clean for vacant tables).
	OrderID    *string `json:"order_id,omitempty"`
	OrderTotal float64 `json:"order_total,omitempty"`
	ItemCount  int     `json:"item_count,omitempty"`
}

type Reservation struct {
	ID        string     `json:"id"`
	GuestID   *string    `json:"guest_id"`
	GuestName string     `json:"guest_name"`
	Covers    int        `json:"covers"`
	TableID   *string    `json:"table_id"`
	StartTime time.Time  `json:"start_time"`
	Duration  int        `json:"duration"`
	Status    string     `json:"status"`
	BranchID  *string    `json:"branch_id"`
	CreatedAt time.Time  `json:"created_at"`
}

type WaitlistEntry struct {
	ID        string    `json:"id"`
	GuestID   *string   `json:"guest_id"`
	GuestName string    `json:"guest_name"`
	Covers    int       `json:"covers"`
	BranchID  *string   `json:"branch_id"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateReservationRequest struct {
	GuestID   string `json:"guest_id"`
	GuestName string `json:"guest_name" binding:"required"`
	Covers    int    `json:"covers" binding:"required"`
	TableID   string `json:"table_id"`
	StartTime string `json:"start_time" binding:"required"`
	Duration  int    `json:"duration"`
}

type CreateWaitlistRequest struct {
	GuestID   string `json:"guest_id"`
	GuestName string `json:"guest_name" binding:"required"`
	Covers    int    `json:"covers" binding:"required"`
}
