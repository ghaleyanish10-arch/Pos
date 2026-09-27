package model

import (
	"time"
)

// SupportedCurrencies is the check-constraint set from migration 015. NPR is
// the launch market; CAD/EUR/USD/GBP are the expansion targets.
var SupportedCurrencies = map[string]bool{
	"NPR": true,
	"CAD": true,
	"EUR": true,
	"USD": true,
	"GBP": true,
}

// Organization is the tenant root: a business (restaurant group) that owns
// branches. All branch-level data ultimately belongs to one organization, and
// RBAC checks organization membership before branch scoping. Currency is
// ISO 4217 — every branch of an org reports in the same currency.
type Organization struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Currency  string    `json:"currency"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateOrganizationRequest struct {
	Name     string `json:"name" binding:"required"`
	Currency string `json:"currency"` // optional, defaults to NPR
}

type UpdateOrganizationRequest struct {
	Name     string `json:"name"`
	Currency string `json:"currency"`
}
