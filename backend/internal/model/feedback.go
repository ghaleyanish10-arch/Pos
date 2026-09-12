package model

import (
	"time"
)

type SurveyResponse struct {
	ID        string     `json:"id"`
	GuestID   *string    `json:"guest_id"`
	GuestName string     `json:"guest_name"`
	TableID   *string    `json:"table_id"`
	Rating    int        `json:"rating"`
	Comment   string     `json:"comment"`
	Resolved  bool       `json:"resolved"`
	Escalated bool       `json:"escalated"`
	BranchID  *string    `json:"branch_id"`
	CreatedAt time.Time  `json:"created_at"`
}
