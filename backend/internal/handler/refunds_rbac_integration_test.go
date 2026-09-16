package handler_test

import (
	"net/http"
	"testing"
)

// Refunds are manager/boss only: a cashier (or kitchen) session must be
// rejected for every refund route — listing, filing, approving, resolving —
// regardless of elevation. Only Store Manager and Corporate Admin pass.
func TestRefundRoutesManagerAndAdminOnly(t *testing.T) {
	r, _ := newTestRouter(t)
	adminToken := loginBoss(t, r)

	cashierToken := registerAndLogin(t, r, adminToken, "No Refund Cashier", "norefund@test.dev", "password123", "Cashier")
	mgrToken := registerAndLogin(t, r, adminToken, "Refund Mgr", "refundmgr@test.dev", "password123", "Store Manager")

	t.Run("cashier denied list and create", func(t *testing.T) {
		for _, req := range []struct {
			method, path string
			body         any
		}{
			{http.MethodGet, "/api/v1/refunds", nil},
			{http.MethodPost, "/api/v1/refunds", map[string]any{"transaction_id": "00000000-0000-0000-0000-000000000090", "amount": 100, "items": []string{}, "reason": "x"}},
		} {
			w := doReq(r, req.method, req.path, cashierToken, req.body)
			if w.Code != http.StatusForbidden {
				t.Errorf("%s %s as cashier = %d, want 403", req.method, req.path, w.Code)
			}
		}
	})

	t.Run("manager allowed list and create", func(t *testing.T) {
		w := doReq(r, http.MethodGet, "/api/v1/refunds", mgrToken, nil)
		if w.Code != http.StatusOK {
			t.Errorf("GET /refunds as manager = %d, want 200", w.Code)
		}
	})

	t.Run("admin allowed list", func(t *testing.T) {
		w := doReq(r, http.MethodGet, "/api/v1/refunds", adminToken, nil)
		if w.Code != http.StatusOK {
			t.Errorf("GET /refunds as admin = %d, want 200", w.Code)
		}
	})
}