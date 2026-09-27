package repo

import (
	"context"
	"errors"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type TaxRepo struct {
	db *pgxpool.Pool
}

func NewTaxRepo(db *pgxpool.Pool) *TaxRepo {
	return &TaxRepo{db: db}
}

// List returns the tax rules for a branch. A NULL branch_id row is the
// org-wide default and applies to every branch without its own rules.
func (r *TaxRepo) List(ctx context.Context, branchID string) ([]model.TaxRule, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id::text, COALESCE(branch_id::text, ''), name, rate_percent::float8, inclusive, COALESCE(category_ids, '{}'), priority, is_active, created_at, updated_at
		 FROM tax_rules
		 WHERE is_active AND (branch_id = $1::uuid OR branch_id IS NULL)
		 ORDER BY priority, created_at`,
		branchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.TaxRule
	for rows.Next() {
		var t model.TaxRule
		var cats []*string
		if err := rows.Scan(&t.ID, &t.BranchID, &t.Name, &t.RatePercent, &t.Inclusive, &cats, &t.Priority, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		if len(cats) > 0 {
			t.CategoryIDs = make([]string, 0, len(cats))
			for _, c := range cats {
				if c != nil {
					t.CategoryIDs = append(t.CategoryIDs, *c)
				}
			}
		}
		out = append(out, t)
	}
	return out, nil
}

// ListAll includes inactive rules so the settings UI can edit and re-enable them.
func (r *TaxRepo) ListAll(ctx context.Context, branchID string) ([]model.TaxRule, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id::text, COALESCE(branch_id::text, ''), name, rate_percent::float8, inclusive, COALESCE(category_ids, '{}'), priority, is_active, created_at, updated_at
		 FROM tax_rules
		 WHERE branch_id = $1::uuid OR branch_id IS NULL
		 ORDER BY priority, created_at`,
		branchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.TaxRule
	for rows.Next() {
		var t model.TaxRule
		var cats []*string
		if err := rows.Scan(&t.ID, &t.BranchID, &t.Name, &t.RatePercent, &t.Inclusive, &cats, &t.Priority, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		if len(cats) > 0 {
			t.CategoryIDs = make([]string, 0, len(cats))
			for _, c := range cats {
				if c != nil {
					t.CategoryIDs = append(t.CategoryIDs, *c)
				}
			}
		}
		out = append(out, t)
	}
	return out, nil
}

func (r *TaxRepo) Create(ctx context.Context, branchID string, req model.UpsertTaxRuleRequest) (model.TaxRule, error) {
	if req.RatePercent < 0 || req.RatePercent > 100 {
		return model.TaxRule{}, errors.New("rate_percent must be between 0 and 100")
	}
	// Pass the UUID slice directly — pgx encodes []string as uuid[].
	var catsIn []string
	if len(req.CategoryIDs) > 0 {
		catsIn = req.CategoryIDs
	}
	var t model.TaxRule
	var catsOut []*string
	err := r.db.QueryRow(ctx,
		`INSERT INTO tax_rules (branch_id, name, rate_percent, inclusive, category_ids, priority, is_active)
		 VALUES (NULLIF($1,'')::uuid, $2, $3, $4, $5::uuid[], $6, COALESCE($7, TRUE))
		 RETURNING id::text, COALESCE(branch_id::text, ''), name, rate_percent::float8, inclusive, COALESCE(category_ids, '{}'), priority, is_active, created_at, updated_at`,
		branchID, req.Name, req.RatePercent, req.Inclusive, catsIn, req.Priority, req.IsActive,
	).Scan(&t.ID, &t.BranchID, &t.Name, &t.RatePercent, &t.Inclusive, &catsOut, &t.Priority, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func (r *TaxRepo) Update(ctx context.Context, id string, req model.UpsertTaxRuleRequest) (model.TaxRule, error) {
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	// Pass the UUID slice directly — pgx encodes []string as uuid[].
	var catsIn []string
	if len(req.CategoryIDs) > 0 {
		catsIn = req.CategoryIDs
	}
	var t model.TaxRule
	var catsOut []*string
	err := r.db.QueryRow(ctx,
		`UPDATE tax_rules SET name = $2, rate_percent = $3, inclusive = $4, category_ids = $5::uuid[], priority = $6, is_active = $7, updated_at = now()
		 WHERE id = $1::uuid
		 RETURNING id::text, COALESCE(branch_id::text, ''), name, rate_percent::float8, inclusive, COALESCE(category_ids, '{}'), priority, is_active, created_at, updated_at`,
		id, req.Name, req.RatePercent, req.Inclusive, catsIn, req.Priority, isActive,
	).Scan(&t.ID, &t.BranchID, &t.Name, &t.RatePercent, &t.Inclusive, &catsOut, &t.Priority, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func (r *TaxRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM tax_rules WHERE id = $1::uuid`, id)
	return err
}

// Compute applies the branch's active rules to a set of line items. Rules
// match when they have no category restriction or when the item's category is
// in the rule's category_ids. Inclusive rules report their portion of the
// menu price; exclusive rules add on top. Mixed setups are supported: the
// grand total is base + sum(exclusive), where base is reduced proportionally
// by inclusive taxes (the menu price already contained them).
func (r *TaxRepo) Compute(ctx context.Context, branchID string, lines []model.TaxLineInput) (model.TaxComputation, error) {
	rules, err := r.List(ctx, branchID)
	if err != nil {
		return model.TaxComputation{}, err
	}

	var subtotal float64
	for _, l := range lines {
		subtotal += l.Amount
	}

	comp := model.TaxComputation{Subtotal: subtotal, Lines: []model.TaxLine{}}
	if len(rules) == 0 {
		comp.GrandTotal = subtotal
		return comp, nil
	}

	// Menu prices with inclusive tax embed that tax, so the taxable base is
	// smaller than the sticker sum. Derive the pre-tax base from the rules.
	base := subtotal
	var exclusive []model.TaxRule
	for _, rule := range rules {
		matched := matchLines(rule, lines)
		if len(matched) == 0 {
			continue
		}
		if rule.Inclusive {
			var matchedSum float64
			for _, l := range matched {
				matchedSum += l.Amount
			}
			// price includes rate% → pre-tax portion = price / (1 + rate/100)
			removed := matchedSum - matchedSum/(1+rule.RatePercent/100)
			base -= removed
			comp.Lines = append(comp.Lines, model.TaxLine{Name: rule.Name, Rate: rule.RatePercent, Inclusive: true, Amount: removed})
			comp.TaxInclusive = true
		} else {
			exclusive = append(exclusive, rule)
		}
	}

	// Exclusive rules tax the (reduced) base, compounded in priority order.
	taxable := base
	for _, rule := range exclusive {
		var matchedSum float64
		for _, l := range matchLines(rule, lines) {
			matchedSum += l.Amount
		}
		amount := matchedSum * rule.RatePercent / 100
		taxable += amount
		comp.Lines = append(comp.Lines, model.TaxLine{Name: rule.Name, Rate: rule.RatePercent, Inclusive: false, Amount: amount})
		comp.TaxTotal += amount
	}

	// Inclusive amounts count toward the tax total too (they're tax, just
	// already inside the price).
	for _, l := range comp.Lines {
		if l.Inclusive {
			comp.TaxTotal += l.Amount
		}
	}

	comp.GrandTotal = taxable
	sort.Slice(comp.Lines, func(i, j int) bool { return comp.Lines[i].Name < comp.Lines[j].Name })
	return comp, nil
}

// OrderLines projects an order's items into tax inputs, joining the menu
// category so category-scoped rules can match. Items without a menu item
// (ad-hoc lines) have no category and match only unrestricted rules.
func (r *TaxRepo) OrderLines(ctx context.Context, orderID string) ([]model.TaxLineInput, error) {
	rows, err := r.db.Query(ctx,
		`SELECT COALESCE(oi.price, 0)::float8 * oi.qty, COALESCE(mi.category_id::text, '')
		 FROM order_items oi
		 LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
		 WHERE oi.order_id = $1::uuid`,
		orderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.TaxLineInput
	for rows.Next() {
		var l model.TaxLineInput
		if err := rows.Scan(&l.Amount, &l.CategoryID); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// matchLines returns the input lines a rule applies to: all of them when the
// rule has no category restriction, otherwise only items whose category is
// listed.
func matchLines(rule model.TaxRule, lines []model.TaxLineInput) []model.TaxLineInput {
	if len(rule.CategoryIDs) == 0 {
		return lines
	}
	cats := map[string]bool{}
	for _, c := range rule.CategoryIDs {
		cats[c] = true
	}
	var out []model.TaxLineInput
	for _, l := range lines {
		if l.CategoryID == "" || cats[l.CategoryID] {
			out = append(out, l)
		}
	}
	return out
}
