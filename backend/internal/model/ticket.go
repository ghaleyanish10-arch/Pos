package model

import (
	"time"
)

type KDSTicket struct {
	ID              string     `json:"id"`
	OrderID         string     `json:"order_id"`
	Type            string     `json:"type"`
	Table           string     `json:"table"`
	Tag             string     `json:"tag"`
	Station         string     `json:"station"`
	Status          string     `json:"status"`
	AIPhone         bool       `json:"ai_phone"`
	Allergy         string     `json:"allergy"`
	Fired           bool       `json:"fired"`
	LinkedTicketID  *string    `json:"linked_ticket_id"`
	CreatedAt       time.Time  `json:"created_at"`
	Items           []OrderItem `json:"items,omitempty"`
}

type UpdateTicketStatusRequest struct {
	Status string `json:"status"`
}
