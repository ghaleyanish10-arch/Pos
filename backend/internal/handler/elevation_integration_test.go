package handler_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)
// --- helpers specific to elevation tests ---

func registerAndLogin(t *testing.T, r *gin.Engine, adminToken, name, email, password, role string) string {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/register", adminToken, map[string]string{
		"name": name, "email": email, "password": password, "role": role,
		// Test staff belong to the boss's branch (like production staff) —
		// never branch-less, so terminal enablement can bind to their branch.
		"branch_id": bossBranchSeed,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("register %s returned %d: %s", email, w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"email": email, "password": password,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("login %s returned %d: %s", email, w.Code, w.Body.String())
	}
	var resp struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := jsonUnmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	if resp.Tokens.AccessToken == "" || resp.User.ID == "" {
		t.Fatal("login response missing token or user id")
	}
	// Stash the user id for later lookup.
	userIDs.Store(email, resp.User.ID)
	return resp.Tokens.AccessToken
}

func setPINFor(t *testing.T, r *gin.Engine, bossToken, targetUserID, pin, bossPassword string) {
	t.Helper()
	w := doReq(r, http.MethodPut, "/api/v1/staff/"+targetUserID+"/pin", bossToken, map[string]string{
		"pin": pin, "password": bossPassword,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("set PIN returned %d: %s", w.Code, w.Body.String())
	}
}

func elevate(t *testing.T, r *gin.Engine, sessionToken, holderID, pin, action, resourceID string) (int, string) {
	t.Helper()
	body := map[string]string{
		"pin_holder_user_id": holderID,
		"pin":                pin,
		"action":             action,
	}
	if resourceID != "" {
		body["resource_id"] = resourceID
	}
	w := doReq(r, http.MethodPost, "/api/v1/auth/elevate", sessionToken, body)
	var resp struct {
		ElevationToken string `json:"elevation_token"`
	}
	_ = jsonUnmarshal(w.Body.Bytes(), &resp)
	return w.Code, resp.ElevationToken
}

// --- tests ---

func TestElevationHappyPath(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	// A cashier session and a manager PIN: the exact shared-terminal scenario.
	mgrToken := registerAndLogin(t, r, adminToken, "Elev Manager", "elev-mgr@test.dev", "password123", "Store Manager")
	setPINFor(t, r, adminToken, bossID, "9981", "admin123")

	code, token := elevate(t, r, mgrToken, bossID, "9981", "refund.approve", "")
	if code != http.StatusOK || token == "" {
		t.Fatalf("elevate returned %d, want 200 with token: %s", code, token)
	}

	// The token must appear consumed in the DB only after use; before use it is pending.
	var pending int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM elevation_tokens WHERE used_at IS NULL`).Scan(&pending); err != nil {
		t.Fatal(err)
	}
	if pending != 1 {
		t.Fatalf("expected 1 pending elevation token, got %d", pending)
	}
}

func TestElevationWrongPIN(t *testing.T) {
	r, _ := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	cashierToken := registerAndLogin(t, r, adminToken, "Wrong PIN Cashier", "wrongpin@test.dev", "password123", "Cashier")
	setPINFor(t, r, adminToken, bossID, "7733", "admin123")

	code, token := elevate(t, r, cashierToken, bossID, "0000", "refund.approve", "")
	if code != http.StatusUnauthorized || token != "" {
		t.Fatalf("wrong PIN elevate returned %d, want 401", code)
	}
}

func TestElevationLockoutLifecycle(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "Lockout Mgr", "lockout-mgr@test.dev", "password123", "Store Manager")
	setPINFor(t, r, adminToken, bossID, "5522", "admin123")

	// 5 wrong attempts lock the account.
	for i := 1; i <= 5; i++ {
		code, _ := elevate(t, r, mgrToken, bossID, "1111", "refund.approve", "")
		if i < 5 && code != http.StatusUnauthorized {
			t.Fatalf("attempt %d returned %d, want 401", i, code)
		}
		if i == 5 && code != http.StatusLocked {
			t.Fatalf("attempt 5 returned %d, want 423 locked", code)
		}
	}

	// Even the CORRECT PIN is rejected while locked.
	code, _ := elevate(t, r, mgrToken, bossID, "5522", "refund.approve", "")
	if code != http.StatusLocked {
		t.Fatalf("locked account with correct PIN returned %d, want 423", code)
	}

	// Exactly one lockout notification for the manager/admin PIN.
	var notifs int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM notifications WHERE type = 'pin.lockout' AND payload->>'user_id' = $1`,
		bossID).Scan(&notifs); err != nil {
		t.Fatal(err)
	}
	if notifs != 1 {
		t.Fatalf("expected exactly 1 lockout notification, got %d", notifs)
	}

	// Audit trail captured the lockout.
	var audits int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_events WHERE event_type = 'elevation.lockout'`).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Fatalf("expected 1 lockout audit row, got %d", audits)
	}
}

func TestElevationTokenBindingAndSingleUse(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "Binding Mgr", "binding-mgr@test.dev", "password123", "Store Manager")
	setPINFor(t, r, adminToken, bossID, "4417", "admin123")

	// Seed a transaction + refund to get a real resource id.
	var refundID string
	var txID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO transactions (ref, method, amount, status) VALUES ('TXN-ELEV', 'cash', 500, 'Success') RETURNING id`,
	).Scan(&txID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO refunds (transaction_id, items, amount, status, created_by) VALUES ($1, '[]', 500, 'Requested', $2) RETURNING id`,
		txID, bossID).Scan(&refundID); err != nil {
		t.Fatal(err)
	}

	code, token := elevate(t, r, mgrToken, bossID, "4417", "refund.approve", refundID)
	if code != http.StatusOK || token == "" {
		t.Fatalf("elevate returned %d", code)
	}

	// Token bound to refund.approve cannot drive refund.resolve.
	w := doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/"+refundID+"/resolve", mgrToken, token)
	if w.Code != http.StatusForbidden {
		t.Errorf("token replayed for wrong action returned %d, want 403", w.Code)
	}

	// Correct action + resource: approval works and consumes the token.
	w = doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/"+refundID+"/approve", mgrToken, token)
	if w.Code != http.StatusOK {
		t.Errorf("approved with elevation returned %d: %s", w.Code, w.Body.String())
	}

	// Single use: replaying the same token fails even for the same action.
	w = doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/"+refundID+"/approve", mgrToken, token)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("replayed token returned %d, want 401", w.Code)
	}
}

func TestRefundSelfApprovalBlocked(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "SoD Mgr", "sod-mgr@test.dev", "password123", "Store Manager")
	mgrID := uid("sod-mgr@test.dev")
	setPINFor(t, r, adminToken, bossID, "3312", "admin123")

	var txID, refundID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO transactions (ref, method, amount, status) VALUES ('TXN-SOD', 'cash', 500, 'Success') RETURNING id`,
	).Scan(&txID); err != nil {
		t.Fatal(err)
	}
	// The manager filed this refund themselves.
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO refunds (transaction_id, items, amount, status, created_by) VALUES ($1, '[]', 500, 'Requested', $2) RETURNING id`,
		txID, mgrID).Scan(&refundID); err != nil {
		t.Fatal(err)
	}

	code, token := elevate(t, r, mgrToken, bossID, "3312", "refund.approve", refundID)
	if code != http.StatusOK || token == "" {
		t.Fatalf("elevate returned %d", code)
	}

	w := doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/"+refundID+"/approve", mgrToken, token)
	if w.Code != http.StatusForbidden {
		t.Fatalf("self-approval returned %d, want 403: %s", w.Code, w.Body.String())
	}

	// Someone else's refund approves fine with the same setup.
	var refundID2 string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO refunds (transaction_id, items, amount, status, created_by) VALUES ($1, '[]', 500, 'Requested', $2) RETURNING id`,
		txID, bossID).Scan(&refundID2); err != nil {
		t.Fatal(err)
	}
	code, token2 := elevate(t, r, mgrToken, bossID, "3312", "refund.approve", refundID2)
	if code != http.StatusOK {
		t.Fatalf("second elevate returned %d", code)
	}
	w = doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/"+refundID2+"/approve", mgrToken, token2)
	if w.Code != http.StatusOK {
		t.Fatalf("non-self approval returned %d: %s", w.Code, w.Body.String())
	}
}

func TestPINManagementPermissions(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "PIN Guard Mgr", "pinmgr@test.dev", "password123", "Store Manager")
	mgrID := uid("pinmgr@test.dev")

	// Manager cannot set any PIN.
	w := doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", mgrToken, map[string]string{
		"pin": "1212", "password": "password123",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("manager set PIN returned %d, want 403", w.Code)
	}

	// Boss CAN set the manager's PIN with their own password.
	setPINFor(t, r, adminToken, mgrID, "9090", "admin123")

	var hash *string
	if err := pool.QueryRow(context.Background(),
		`SELECT pin_hash FROM users WHERE id = $1`, mgrID).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if hash == nil || *hash == "" {
		t.Fatal("PIN hash was not stored")
	}
	if len(*hash) < 50 || (*hash)[:4] != "$2a$" && (*hash)[:4] != "$2b$" {
		t.Errorf("PIN hash is not bcrypt: %q", (*hash)[:min(10, len(*hash))])
	}

	// No endpoint ever returns the PIN or its hash.
	w = doReq(r, http.MethodGet, "/api/v1/staff/pin-holders", mgrToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("pin-holders returned %d", w.Code)
	}
	if contains(w.Body.String(), "pin_hash") || contains(w.Body.String(), "9090") {
		t.Error("pin-holders leaked secret material")
	}

	// Weak PINs are rejected.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{
		"pin": "1234", "password": "admin123",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("weak PIN accepted, got %d want 400", w.Code)
	}

	// Wrong boss password blocks the reset even with a valid session.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+bossID+"/pin", adminToken, map[string]string{
		"pin": "8181", "password": "not-my-password",
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("PIN reset with wrong password returned %d, want 401", w.Code)
	}
}

func TestElevationAuditRowsForSuccessAndFailure(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "Audit Mgr", "audit-mgr@test.dev", "password123", "Store Manager")
	setPINFor(t, r, adminToken, bossID, "2299", "admin123")

	// One failure...
	elevate(t, r, mgrToken, bossID, "9999", "refund.approve", "")
	// ...and one success.
	code, _ := elevate(t, r, mgrToken, bossID, "2299", "refund.approve", "")
	if code != http.StatusOK {
		t.Fatalf("success elevate returned %d", code)
	}

	var fails, successes int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_events WHERE event_type = 'elevation.failed'`).Scan(&fails); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_events WHERE event_type = 'elevation.success'`).Scan(&successes); err != nil {
		t.Fatal(err)
	}
	if fails < 1 || successes < 1 {
		t.Fatalf("audit rows missing: failures=%d successes=%d", fails, successes)
	}
}

func TestElevationExpiredTokenRejected(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "Expiry Mgr", "expiry-mgr@test.dev", "password123", "Store Manager")
	setPINFor(t, r, adminToken, bossID, "6161", "admin123")

	// The token must fail at the single-use guard (expiry), not at resource
	// binding — so it is bound to a real refund id that exists first.
	var txID, refundID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO transactions (ref, method, amount, status) VALUES ('TXN-EXP', 'cash', 500, 'Success') RETURNING id`,
	).Scan(&txID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO refunds (transaction_id, items, amount, status, created_by) VALUES ($1, '[]', 500, 'Requested', $2) RETURNING id`,
		txID, bossID).Scan(&refundID); err != nil {
		t.Fatal(err)
	}

	code, token := elevate(t, r, mgrToken, bossID, "6161", "refund.approve", refundID)
	if code != http.StatusOK {
		t.Fatalf("elevate returned %d", code)
	}

	// Force-expire the token server-side (TTL is 3 min; do not wait).
	if _, err := pool.Exec(context.Background(),
		`UPDATE elevation_tokens SET expires_at = now() - interval '1 minute'`,
	); err != nil {
		t.Fatal(err)
	}

	w := doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/"+refundID+"/approve", mgrToken, token)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expired token returned %d, want 401", w.Code)
	}
	_ = time.Now()
}

func TestElevationRejectsSessionAndViceVersa(t *testing.T) {
	r, _ := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "Type Mgr", "typemgr@test.dev", "password123", "Store Manager")
	setPINFor(t, r, adminToken, bossID, "7771", "admin123")

	// A session access token must not work as an elevation token.
	w := doReqWithElevation(r, http.MethodPut, "/api/v1/refunds/00000000-0000-0000-0000-00000000000e/approve", mgrToken, mgrToken)
	if w.Code != http.StatusForbidden {
		t.Errorf("session token used as elevation returned %d, want 403", w.Code)
	}

	// An elevation token must not authenticate a session route.
	_, elevTok := elevate(t, r, mgrToken, bossID, "7771", "refund.approve", "")
	w = doReq(r, http.MethodGet, "/api/v1/menu", elevTok, nil)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("elevation token used as session returned %d, want 401", w.Code)
	}
}

func TestWithoutTokenElevationRequired(t *testing.T) {
	r, _ := newTestRouter(t)
	adminToken := loginBoss(t, r)
	registerAndLogin(t, r, adminToken, "No Token Mgr", "notoken@test.dev", "password123", "Store Manager")

	w := doReq(r, http.MethodPut, "/api/v1/refunds/00000000-0000-0000-0000-00000000000d/approve", adminToken, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("approve without elevation returned %d, want 403", w.Code)
	}
	if !contains(w.Body.String(), "ELEVATION_REQUIRED") {
		t.Errorf("response missing ELEVATION_REQUIRED marker: %s", w.Body.String())
	}
}
