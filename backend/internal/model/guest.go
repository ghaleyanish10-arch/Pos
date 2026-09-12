package model

import (
	"encoding/json"
	"time"
)

type Guest struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Email     string          `json:"email"`
	Phone     string          `json:"phone"`
	Initials  string          `json:"initials"`
	Visits    int             `json:"visits"`
	LastVisit *time.Time      `json:"last_visit"`
	AvgSpend  float64         `json:"avg_spend"`
	Tier      string          `json:"tier"`
	Segments  json.RawMessage `json:"segments"`
	Note      string          `json:"note"`
	BranchID  *string         `json:"branch_id"`
	CreatedAt time.Time       `json:"created_at"`
	DeletedAt *time.Time      `json:"deleted_at"`
}

type GuestTimelineEntry struct {
	ID        string    `json:"id"`
	GuestID   string    `json:"guest_id"`
	EventType string    `json:"event_type"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateGuestRequest struct {
	Name     string   `json:"name" binding:"required"`
	Email    string   `json:"email"`
	Phone    string   `json:"phone"`
	Tier     string   `json:"tier"`
	Segments []string `json:"segments"`
	Note     string   `json:"note"`
}

type UpdateGuestRequest struct {
	Name     string   `json:"name"`
	Email    string   `json:"email"`
	Phone    string   `json:"phone"`
	Tier     string   `json:"tier"`
	Segments []string `json:"segments"`
	Note     string   `json:"note"`
}
