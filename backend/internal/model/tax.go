package model

import "time"

// TaxRule is one layer of the branch's tax engine. Multiple rules apply
// simultaneously (GST + QST in Canada, VAT in Europe); each is either
// inclusive (menu price already contains it) or exclusive (added at
// checkout). category_ids narrows a rule to specific menu categories —
// nil/empty means it applies to everything.
type TaxRule struct {
	ID          string    `json:"id"`
	BranchID    *string   `json:"branch_id"`
	Name        string    `json:"name"`
	RatePercent float64   `json:"rate_percent"`
	Inclusive   bool      `json:"inclusive"`
	CategoryIDs []string  `json:"category_ids"`
	Priority    int       `json:"priority"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UpsertTaxRuleRequest struct {
	Name        string   `json:"name" binding:"required"`
	RatePercent float64  `json:"rate_percent"`
	Inclusive   bool     `json:"inclusive"`
	CategoryIDs []string `json:"category_ids"`
	Priority    int      `json:"priority"`
	IsActive    *bool    `json:"is_active"`
}

// TaxLineInput is one order line as the engine sees it: the menu price for
// the line (exclusive of any added-on taxes) and the menu category it belongs
// to, so category-scoped rules can match.
type TaxLineInput struct {
	Amount     float64
	CategoryID string
}

// TaxLine is one computed row of a bill's tax breakdown.
type TaxLine struct {
	Name     string  `json:"name"`
	Rate     float64 `json:"rate"`      // percent
	Inclusive bool   `json:"inclusive"`
	Amount   float64 `json:"amount"`
}

// TaxComputation is the result of applying a branch's rules to a subtotal.
type TaxComputation struct {
	Subtotal      float64   `json:"subtotal"`
	TaxTotal      float64   `json:"tax_total"`
	GrandTotal    float64   `json:"grand_total"`
	Lines         []TaxLine `json:"lines"`
	TaxInclusive  bool      `json:"tax_inclusive"` // true when ANY applied rule is inclusive
}
