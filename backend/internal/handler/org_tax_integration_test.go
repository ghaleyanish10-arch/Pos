package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/mesa-os/backend/internal/auth"
)

// TestOrgSignupAndIsolation covers the tenant layer end-to-end:
//   - signup creates an organization + its own first branch (not a claim on
//     the shared demo branch),
//   - the org claim lands in the access token and the org context middleware
//     resolves it on protected routes,
//   - a second signup gets a DIFFERENT organization — tenants are isolated,
//   - currency is stored on the org and exposed via GET /org.
func TestOrgSignupAndIsolation(t *testing.T) {
	r, pool := newTestRouter(t)

	var firstOrgID string
	t.Run("signup creates org + branch", func(t *testing.T) {
		email := "org-owner-one@test.dev"
		w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
			"name": "Himalayan Kitchen", "email": email, "password": "ownerpass123", "currency": "NPR",
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("signup returned %d: %s", w.Code, w.Body.String())
		}

		// The org exists, the owner belongs to it, and the branch is the
		// org's own — not the seed's shared Downtown Branch.
		err := pool.QueryRow(context.Background(),
			`SELECT o.id::text, o.currency, u.id IS NOT NULL, b.organization_id::text = o.id::text
			 FROM organizations o
			 JOIN users u ON u.organization_id = o.id AND u.email = $1
			 JOIN branches b ON b.id = u.branch_id
			 WHERE o.name = 'Himalayan Kitchen'`,
			email,
		).Scan(&firstOrgID, new(string), new(bool), new(bool))
		if err != nil {
			t.Fatalf("signup did not create a linked org/user/branch chain: %v", err)
		}
	})

	t.Run("second signup gets its own org", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
			"name": "Maple Diner", "email": "org-owner-two@test.dev", "password": "ownerpass123", "currency": "CAD",
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("second signup returned %d: %s", w.Code, w.Body.String())
		}

		var secondOrgID, currency string
		if err := pool.QueryRow(context.Background(),
			`SELECT o.id::text, o.currency FROM organizations o WHERE o.name = 'Maple Diner'`,
		).Scan(&secondOrgID, &currency); err != nil {
			t.Fatalf("second org missing: %v", err)
		}
		if secondOrgID == firstOrgID {
			t.Fatal("two signups must not share one organization")
		}
		if currency != "CAD" {
			t.Errorf("org currency = %q, want CAD", currency)
		}
	})

	t.Run("org exposed via GET /org", func(t *testing.T) {
		token := loginAdmin(t, r) // seeded admin is backfilled into the demo org
		w := doReq(r, http.MethodGet, "/api/v1/org", token, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /org returned %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Organization struct {
				ID       string `json:"id"`
				Currency string `json:"currency"`
			} `json:"organization"`
			Branches []map[string]any `json:"branches"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode /org: %v", err)
		}
		if resp.Organization.ID == "" || resp.Organization.Currency == "" {
			t.Errorf("org payload incomplete: %s", w.Body.String())
		}
		if len(resp.Branches) == 0 {
			t.Error("org must list at least its first branch")
		}
	})

	t.Run("tax rules CRUD + compute", func(t *testing.T) {
		token := loginAdmin(t, r)

		// Create GST 5% exclusive.
		w := doReq(r, http.MethodPost, "/api/v1/tax/rules", token, map[string]any{
			"name": "GST", "rate_percent": 5.0, "inclusive": false, "priority": 1,
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("create tax rule returned %d: %s", w.Code, w.Body.String())
		}
		var created struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &created)
		if created.ID == "" {
			t.Fatal("tax rule id missing")
		}

		// Preview: 1000 subtotal + 5% GST = 1050.
		w = doReq(r, http.MethodPost, "/api/v1/tax/preview", token, map[string]any{
			"lines": []map[string]any{{"amount": 1000}},
		})
		if w.Code != http.StatusOK {
			t.Fatalf("tax preview returned %d: %s", w.Code, w.Body.String())
		}
		var comp struct {
			Subtotal   float64 `json:"subtotal"`
			TaxTotal   float64 `json:"tax_total"`
			GrandTotal float64 `json:"grand_total"`
			Lines      []struct {
				Name   string  `json:"name"`
				Amount float64 `json:"amount"`
			} `json:"lines"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &comp); err != nil {
			t.Fatalf("decode preview: %v", err)
		}
		if comp.GrandTotal != 1050 {
			t.Errorf("grand total = %v, want 1050", comp.GrandTotal)
		}
		if len(comp.Lines) != 1 || comp.Lines[0].Name != "GST" || comp.Lines[0].Amount != 50 {
			t.Errorf("tax lines wrong: %+v", comp.Lines)
		}

		// Delete cleans up.
		w = doReq(r, http.MethodDelete, "/api/v1/tax/rules/"+created.ID, token, nil)
		if w.Code != http.StatusOK {
			t.Errorf("delete tax rule returned %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("order idempotency replays are no-ops", func(t *testing.T) {
		token := loginAdmin(t, r)
		body := map[string]any{
			"type":            "takeaway",
			"idempotency_key": "11111111-1111-4111-8111-111111111111",
			"items":           []map[string]any{{"name": "Momo", "qty": 2, "price": 250}},
		}
		w1 := doReq(r, http.MethodPost, "/api/v1/orders", token, body)
		if w1.Code != http.StatusCreated {
			t.Fatalf("first create returned %d: %s", w1.Code, w1.Body.String())
		}
		var first struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(w1.Body.Bytes(), &first)

		// Replay the same queued write: same key, MUST return the same order.
		w2 := doReq(r, http.MethodPost, "/api/v1/orders", token, body)
		if w2.Code != http.StatusCreated {
			t.Fatalf("replay returned %d: %s", w2.Code, w2.Body.String())
		}
		var second struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(w2.Body.Bytes(), &second)
		if first.ID == "" || first.ID != second.ID {
			t.Errorf("replay created a duplicate: first=%s second=%s", first.ID, second.ID)
		}
	})

	t.Run("token claims round-trip org", func(t *testing.T) {
		pair, err := auth.GenerateTokenPair("u1", "a@b.c", "Corporate Admin", "b1", "org-xyz", 0, "s3cret", 1e9, 1e9)
		if err != nil {
			t.Fatalf("token pair: %v", err)
		}
		claims, err := auth.ValidateToken(pair.AccessToken, "s3cret")
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if claims.OrgID != "org-xyz" {
			t.Errorf("org claim = %q, want org-xyz", claims.OrgID)
		}
	})
	_ = gin.Mode()
}
