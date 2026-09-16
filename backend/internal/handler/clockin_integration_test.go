package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/router"
	"github.com/mesa-os/backend/internal/testutil"
)

// newClockInRouter builds a router with a configurable shift TTL for
// clock-in session tokens.
func newClockInRouter(t *testing.T, shiftTTL time.Duration) (*gin.Engine, *pgxpool.Pool) {
	t.Helper()
	pool := testutil.NewTestPool(t, "mesa_os_clockin_test")
	cfg := &config.Config{
		DatabaseURL:      "unused-in-tests",
		JWTSecret:        "clockin-test-secret",
		JWTAccessExpiry:  15 * time.Minute,
		JWTRefreshExpiry: 24 * time.Hour,
		CORSOrigin:       "http://localhost:5173",
		ShiftTTL:         shiftTTL,
	}
	return router.Setup(pool, cfg), pool
}

// doDeviceReq mirrors doReq but also carries the terminal identity the
// clock-in family requires (the X-Device-Id header, a client-generated UUID).
func doDeviceReq(r *gin.Engine, method, path string, deviceID string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if deviceID != "" {
		req.Header.Set("X-Device-Id", deviceID)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func countAudit(t *testing.T, pool *pgxpool.Pool, eventType string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_events WHERE event_type = $1`, eventType).Scan(&n); err != nil {
		t.Fatalf("count audit %s: %v", eventType, err)
	}
	return n
}

// newManager registers a Store Manager with a known PIN (and returns their id
// plus session token) — managers are who approve terminals for clock-in.
func newManager(t *testing.T, r *gin.Engine, name, email string) (string, string) {
	t.Helper()
	adminToken := loginBoss(t, r)
	token := registerAndLogin(t, r, adminToken, name, email, "password123", "Store Manager")
	id := uid(email)
	setPINFor(t, r, adminToken, id, "7417", "admin123")
	return id, token
}

// enableTerminal approves a device for clock-in by presenting a manager's PIN
// — exactly what the "Set up this terminal" flow on the clock-in screen does.
func enableTerminal(t *testing.T, r *gin.Engine, deviceID, managerID, managerPIN string) {
	t.Helper()
	w := doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", deviceID, map[string]string{
		"user_id": managerID, "pin": managerPIN,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("terminal-enable returned %d: %s", w.Code, w.Body.String())
	}
}

// clockIn performs a clock-in and returns the http status plus the token.
func clockIn(t *testing.T, r *gin.Engine, userID, pin string) (int, string) {
	t.Helper()
	w := doDeviceReq(r, http.MethodPost, "/api/v1/auth/clock-in", "terminal-1", map[string]string{
		"user_id": userID, "pin": pin, "device_id": "terminal-1",
	})
	var resp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return w.Code, resp.Token
}

func TestRosterReturnsNoPINMaterial(t *testing.T) {
	r, _ := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)
	registerAndLogin(t, r, adminToken, "Kitchen Kiran", "kiran@test.dev", "password123", "Kitchen")
	registerAndLogin(t, r, adminToken, "Cashier Mina", "mina@test.dev", "password123", "Cashier")
	mgrID, _ := newManager(t, r, "Approver Ana", "approver@test.dev")

	// The roster must not be reachable without a valid X-Device-Id header.
	w := doReq(r, http.MethodGet, "/api/v1/staff/roster", "", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("roster without device id returned %d, want 400", w.Code)
	}

	// An unapproved terminal gets the setup gate, not the roster.
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster?branch_id=", "term-roster", nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("roster on unapproved device returned %d, want 403 (got: %s)", w.Code, w.Body.String())
	}

	// Manager approves the terminal, then the roster is served.
	enableTerminal(t, r, "term-roster", mgrID, "7417")
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster?branch_id=", "term-roster", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("roster returned %d: %s", w.Code, w.Body.String())
	}

	body := w.Body.String()
	for _, forbidden := range []string{"pin_hash", "pin_failed", "pin_locked", "has_pin", "hash"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("roster leaked %q material: %s", forbidden, body)
		}
	}

	var resp struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Role string `json:"role"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode roster: %v", err)
	}

	expected := map[string]bool{"Mesa Admin": false, "Kitchen Kiran": false, "Cashier Mina": false}
	for _, u := range resp.Data {
		if _, ok := expected[u.Name]; ok {
			expected[u.Name] = true
		}
		if u.ID == "" || u.Name == "" || u.Role == "" {
			t.Fatalf("roster member missing required field: %+v", u)
		}
	}
	for name, found := range expected {
		if !found {
			t.Fatalf("roster missing %s", name)
		}
	}
}

func TestClockInCorrectAndWrongPIN(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	registerAndLogin(t, r, adminToken, "Kitchen Kiran", "kiran@test.dev", "password123", "Kitchen")
	kiranID := uid("kiran@test.dev")
	setPINFor(t, r, adminToken, kiranID, "7417", "admin123")
	mgrID, _ := newManager(t, r, "Approver Ana", "approver@test.dev")
	enableTerminal(t, r, "terminal-1", mgrID, "7417")

	// Wrong PIN: 401, counter increments, exactly one audit row.
	code, _ := clockIn(t, r, kiranID, "0000")
	if code != http.StatusUnauthorized {
		t.Fatalf("wrong PIN clock-in returned %d, want 401", code)
	}
	if n := countAudit(t, pool, "clockin.failed"); n != 1 {
		t.Fatalf("expected exactly 1 clockin.failed row, got %d", n)
	}

	// Correct PIN: 200 with a session token carrying the real identity.
	code, token := clockIn(t, r, kiranID, "7417")
	if code != http.StatusOK || token == "" {
		t.Fatalf("correct PIN clock-in returned %d", code)
	}

	claims, err := auth.ValidateToken(token, "clockin-test-secret")
	if err != nil {
		t.Fatalf("session token failed validation: %v", err)
	}
	if claims.UserID != kiranID || claims.Role != "Kitchen" {
		t.Fatalf("session claims wrong: user=%s role=%s", claims.UserID, claims.Role)
	}

	// The token works as a normal session token on an authenticated route.
	orders := doReq(r, http.MethodGet, "/api/v1/orders", token, nil)
	if orders.Code != http.StatusOK {
		t.Fatalf("session token on /orders returned %d, want 200", orders.Code)
	}

	if n := countAudit(t, pool, "clockin.success"); n != 1 {
		t.Fatalf("expected exactly 1 clockin.success row, got %d", n)
	}
	// Success + failure both reset/set but the counter shouldn't conflate:
	// exactly one success, one failure here.
	if n := countAudit(t, pool, "clockin.failed"); n != 1 {
		t.Fatalf("expected 1 clockin.failed row, got %d", n)
	}
}

func TestClockInSharesLockoutCounterWithElevation(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	registerAndLogin(t, r, adminToken, "Cashier Mina", "mina@test.dev", "password123", "Cashier")
	minaID := uid("mina@test.dev")
	setPINFor(t, r, adminToken, minaID, "7417", "admin123")

	// Approve the terminal first (with a separate manager's PIN) so the
	// failure counting below is purely about mina's PIN.
	_, mgrToken := newManager(t, r, "Flow Mgr", "flow-mgr@test.dev")
	enableTerminal(t, r, "terminal-1", uid("flow-mgr@test.dev"), "7417")

	// 2 failed clock-ins + 2 failed elevation attempts against the SAME PIN
	// share one counter, so attempt 5 (any flow) locks the account.
	for i := 0; i < 2; i++ {
		if code, _ := clockIn(t, r, minaID, "0000"); code != http.StatusUnauthorized {
			t.Fatalf("clock-in failure %d returned %d, want 401", i+1, code)
		}
	}
	for i := 0; i < 2; i++ {
		if code, _ := elevate(t, r, mgrToken, minaID, "0000", "refund.approve", ""); code != http.StatusUnauthorized {
			t.Fatalf("elevation failure %d returned %d, want 401", i+1, code)
		}
	}

	// The 5th failure across both flows trips the lockout.
	if code, _ := clockIn(t, r, minaID, "0000"); code != http.StatusLocked {
		t.Fatalf("clock-in that trips lockout returned %d, want 423", code)
	}
	if n := countAudit(t, pool, "clockin.lockout"); n != 1 {
		t.Fatalf("expected exactly 1 clockin.lockout row, got %d", n)
	}

	// Even the correct PIN is rejected while locked.
	if code, _ := clockIn(t, r, minaID, "7417"); code != http.StatusLocked {
		t.Fatalf("clock-in while locked with correct PIN returned %d, want 423", code)
	}
	if n := countAudit(t, pool, "clockin.locked"); n != 1 {
		t.Fatalf("expected exactly 1 clockin.locked row, got %d", n)
	}

	// Confirmed: the counter was shared with elevation (2 elevation failures),
	// not two independent counters.
	if n := countAudit(t, pool, "elevation.failed"); n != 2 {
		t.Fatalf("expected 2 elevation.failed rows, got %d (counter not shared)", n)
	}
}

func TestClockInSessionExpiresAfterShiftTTL(t *testing.T) {
	r, _ := newClockInRouter(t, 600*time.Millisecond)
	adminToken := loginBoss(t, r)

	registerAndLogin(t, r, adminToken, "Shift Cook", "shift@test.dev", "password123", "Kitchen")
	cookID := uid("shift@test.dev")
	setPINFor(t, r, adminToken, cookID, "7417", "admin123")
	mgrID, _ := newManager(t, r, "Approver Ana", "approver@test.dev")
	enableTerminal(t, r, "terminal-1", mgrID, "7417")

	code, token := clockIn(t, r, cookID, "7417")
	if code != http.StatusOK || token == "" {
		t.Fatalf("clock-in returned %d", code)
	}

	time.Sleep(900 * time.Millisecond)
	orders := doReq(r, http.MethodGet, "/api/v1/orders", token, nil)
	if orders.Code != http.StatusUnauthorized {
		t.Fatalf("expired shift token on /orders returned %d, want 401", orders.Code)
	}
}

func TestClockOutWritesExactlyOneAuditRow(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	registerAndLogin(t, r, adminToken, "Close Out", "close@test.dev", "password123", "Cashier")
	userID := uid("close@test.dev")
	setPINFor(t, r, adminToken, userID, "7417", "admin123")

	w := doDeviceReq(r, http.MethodPost, "/api/v1/auth/clock-out", "terminal-1", map[string]string{
		"user_id": userID, "device_id": "terminal-1",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("clock-out returned %d: %s", w.Code, w.Body.String())
	}
	if n := countAudit(t, pool, "clockout"); n != 1 {
		t.Fatalf("expected exactly 1 clockout row, got %d", n)
	}

	// Without the X-Device-Id the terminal family is refused.
	w2 := doReq(r, http.MethodPost, "/api/v1/auth/clock-out", "", map[string]string{"user_id": userID})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("clock-out without device id returned %d, want 400", w2.Code)
	}
}