package model

import (
	"time"
)

type Review struct {
	ID        string     `json:"id"`
	Author    string     `json:"author"`
	Platform  string     `json:"platform"`
	Rating    int        `json:"rating"`
	Text      string     `json:"text"`
	Answered  bool       `json:"answered"`
	Reply     string     `json:"reply"`
	BranchID  *string    `json:"branch_id"`
	CreatedAt time.Time  `json:"created_at"`
}

type ReplyReviewRequest struct {
	Reply string `json:"reply" binding:"required"`
}
