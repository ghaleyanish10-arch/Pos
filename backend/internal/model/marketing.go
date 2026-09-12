package model

import (
	"time"
)

type Campaign struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Channel     string     `json:"channel"`
	Audience    string     `json:"audience"`
	Status      string     `json:"status"`
	Stat        string     `json:"stat"`
	AIGenerated bool       `json:"ai_generated"`
	BranchID    *string    `json:"branch_id"`
	CreatedAt   time.Time  `json:"created_at"`
}

type CreateCampaignRequest struct {
	Name     string `json:"name" binding:"required"`
	Channel  string `json:"channel" binding:"required"`
	Audience string `json:"audience"`
}

type UpdateCampaignRequest struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
}
