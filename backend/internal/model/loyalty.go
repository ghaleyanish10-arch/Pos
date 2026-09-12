package model

import (
	"time"
)

type LoyaltyTier struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	MinPoints   int     `json:"min_points"`
	DiscountPct float64 `json:"discount_pct"`
}

type PointsLedgerEntry struct {
	ID        string    `json:"id"`
	GuestID   string    `json:"guest_id"`
	GuestName string    `json:"guest_name,omitempty"`
	Delta     int       `json:"delta"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

type EarnPointsRequest struct {
	GuestID string `json:"guest_id" binding:"required"`
	Points  int    `json:"points" binding:"required"`
	Reason  string `json:"reason" binding:"required"`
}

type RedeemPointsRequest struct {
	GuestID string `json:"guest_id" binding:"required"`
	Points  int    `json:"points" binding:"required"`
	Reason  string `json:"reason" binding:"required"`
}
