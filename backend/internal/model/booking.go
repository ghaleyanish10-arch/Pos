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

	// Manual flags behind the derived states. bill_dropped / needs_attention
	// are always present (false when unset) so clients can render the flag
	// actions reliably; attention_note is optional.
	BillDropped    bool   `json:"bill_dropped"`
	NeedsAttention bool   `json:"needs_attention"`
	AttentionNote  string `json:"attention_note,omitempty"`

	// Merged-group info: when OTHER tables have been merged into this one,
	// merged_with lists their names and merged_seats the extra seats they
	// bring, so the floor can render ONE combined card ("T8 + T9") without a
	// second round-trip. Empty when the table is not the head of a merged
	// group (child rows are excluded from the listing entirely).
	MergedWith  []string `json:"merged_with,omitempty"`
	MergedSeats int      `json:"merged_seats,omitempty"`
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
