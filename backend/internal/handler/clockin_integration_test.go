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
		"user_id": managerID, "pin": managerPIN, "branch_id": bossBranchSeed,
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
	registerAndLogin(t, r, adminToken, "Auditor Kiran", "kiran@test.dev", "password123", "Inventory Auditor")
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

	expected := map[string]bool{"Mesa Admin": false, "Auditor Kiran": false, "Cashier Mina": false}
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

	registerAndLogin(t, r, adminToken, "Auditor Kiran", "kiran@test.dev", "password123", "Inventory Auditor")
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
	if claims.UserID != kiranID || claims.Role != "Inventory Auditor" {
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

	// The PIN holder must be an elevation-eligible role (Store Manager /
	// Corporate Admin) since Elevate now rejects cashier PINs outright.
	registerAndLogin(t, r, adminToken, "Mina", "mina@test.dev", "password123", "Store Manager")
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

	registerAndLogin(t, r, adminToken, "Shift Cook", "shift@test.dev", "password123", "Inventory Auditor")
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

func TestRosterIsScopedToApproverBranchAndIgnoresClientClaims(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	// A second branch with its own manager + cashier.
	var branchB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO branches (name, status) VALUES ('Branch B', 'Online') RETURNING id::text`).Scan(&branchB); err != nil {
		t.Fatal(err)
	}
	registerBranch(t, r, adminToken, "Beta Manager", "beta-mgr@test.dev", "password123", "Store Manager", branchB)
	registerBranch(t, r, adminToken, "Beta Cashier", "beta-cash@test.dev", "password123", "Cashier", branchB)
	betaMgr := uid("beta-mgr@test.dev")
	setPINFor(t, r, adminToken, betaMgr, "7417", "admin123")

	termID := "term-cross-1"

	// The client declares the boss's branch (A) as the terminal's intended
	// tenant, but the approving manager belongs to Branch B. The approval must
	// be REJECTED — a device is never bound to a branch its approver doesn't
	// actually belong to, no matter what the client claims.
	w := doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", termID, map[string]string{
		"user_id": betaMgr, "pin": "7417", "branch_id": bossBranchSeed,
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("cross-branch enable returned %d, want 403: %s", w.Code, w.Body.String())
	}
	var rejectBody struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &rejectBody)
	if rejectBody.Code != "TERMINAL_BRANCH_MISMATCH" {
		t.Fatalf("cross-branch enable code = %q, want TERMINAL_BRANCH_MISMATCH", rejectBody.Code)
	}

	// The rejected attempt must leave the device UNBOUND: status still
	// disabled and the roster still gated — never served.
	enabled, _ := terminalStatus(t, r, termID, "")
	if enabled {
		t.Fatal("cross-branch rejected enable still bound the device")
	}
	if w := doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", termID, nil); w.Code != http.StatusForbidden {
		t.Fatalf("roster after rejected enable returned %d, want 403: %s", w.Code, w.Body.String())
	}

	// A device is only bound when the declared branch matches the approver's
	// own branch (the B-manager standing at a B terminal declares B).
	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", termID, map[string]string{
		"user_id": betaMgr, "pin": "7417", "branch_id": branchB,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("matching-branch enable returned %d: %s", w.Code, w.Body.String())
	}
	var enableResp struct {
		Device struct {
			BranchID string `json:"branch_id"`
		} `json:"device"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &enableResp); err != nil {
		t.Fatal(err)
	}
	if enableResp.Device.BranchID != branchB {
		t.Fatalf("device bound to %s, want declared/approver branch %s", enableResp.Device.BranchID, branchB)
	}

	// Roster served for the device is branch B's staff even when the CLIENT
	// asks for branch A in the query string. It must never include the boss.
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster?branch_id="+bossBranchSeed, termID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("roster returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []struct {
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, u := range resp.Data {
		names[u.Name] = true
	}
	if !names["Beta Manager"] || !names["Beta Cashier"] {
		t.Fatalf("roster missing branch B staff: %v", names)
	}
	if names["Mesa Admin"] {
		t.Fatalf("roster leaked branch A staff into a branch B terminal: %v", names)
	}
}

func TestApprovedButUnboundDeviceGetsSetupNotRoster(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	mgrID, _ := newManager(t, r, "Approver Ana", "approver@test.dev")

	// Manufacture a device approved under the OLD pre-binding behavior: a
	// devices row with branch_id NULL (the migration backfills resolvable
	// ones; this simulates an unresolvable leftover).
	termID := "term-orphan-1"
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO devices (id, branch_id, enabled_at, enabled_by_user_id) VALUES ($1, NULL, now(), $2)`,
		termID, mgrID); err != nil {
		t.Fatal(err)
	}

	// Status: a devices row exists but no branch → setup state, and the
	// approvers list is empty (no branch to scope it to).
	enabled, names := terminalStatus(t, r, termID, "")
	if enabled {
		t.Fatal("orphan device reported enabled")
	}
	if len(names) != 0 {
		t.Fatalf("orphan device leaked approvers across branches: %v", names)
	}

	// The roster must be setup state (409), never a dump.
	w := doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", termID, nil)
	if w.Code != http.StatusConflict {
		t.Fatalf("roster on unbound device returned %d, want 409: %s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{"Mesa Admin", "Approver Ana"} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("roster on unbound device leaked %q: %s", forbidden, w.Body.String())
		}
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "TERMINAL_MISSING_BRANCH" {
		t.Fatalf("code = %q, want TERMINAL_MISSING_BRANCH", body.Code)
	}
}

func TestTerminalEnableRejectsBranchlessApproverAndAcceptsEmail(t *testing.T) {
	r, _ := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	// A floating Corporate Admin (no branch, like the old fixtures) cannot
	// bind a terminal — there is no honest branch to bind it to.
	registerBranch(t, r, adminToken, "Floating Boss", "floating-boss@test.dev", "password123", "Corporate Admin", "")
	floID := uid("floating-boss@test.dev")
	setPINFor(t, r, adminToken, floID, "7417", "admin123")

	// With no declared branch at all the enable is refused before any account
	// state is considered — a terminal must state what it serves.
	w := doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", "term-flo-1", map[string]string{
		"user_id": floID, "pin": "7417",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("enable without a branch returned %d, want 400: %s", w.Code, w.Body.String())
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "TERMINAL_BRANCH_REQUIRED" {
		t.Fatalf("code = %q, want TERMINAL_BRANCH_REQUIRED", body.Code)
	}

	// Even WITH a valid declared branch, a branchless approver cannot bind.
	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", "term-flo-1", map[string]string{
		"user_id": floID, "pin": "7417", "branch_id": bossBranchSeed,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("branchless approver enable returned %d, want 400: %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "TERMINAL_SETUP_NO_BRANCH" {
		t.Fatalf("code = %q, want TERMINAL_SETUP_NO_BRANCH", body.Code)
	}

	// Email identity works for the first-run path (drag a branch-bound
	// manager in by account email when the approvers list is empty). The
	// declared branch must match the anchor account's branch.
	registerBranch(t, r, adminToken, "Ema Manager", "ema-mgr@test.dev", "password123", "Store Manager", bossBranchSeed)
	emaID := uid("ema-mgr@test.dev")
	setPINFor(t, r, adminToken, emaID, "7417", "admin123")

	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", "term-email-1", map[string]string{
		"email": "ema-mgr@test.dev", "pin": "7417", "branch_id": bossBranchSeed,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("email enable returned %d: %s", w.Code, w.Body.String())
	}
	var enableResp struct {
		Device struct {
			BranchID string `json:"branch_id"`
		} `json:"device"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &enableResp); err != nil {
		t.Fatal(err)
	}
	if enableResp.Device.BranchID != bossBranchSeed {
		t.Fatalf("email enable bound device to %s, want approver branch %s", enableResp.Device.BranchID, bossBranchSeed)
	}

	// Roster is reachable afterwards on the email-approved device.
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", "term-email-1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("roster after email enable returned %d", w.Code)
	}

	// user_id AND email together is rejected — identity must be unambiguous.
	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", "term-both-1", map[string]string{
		"user_id": emaID, "email": "ema-mgr@test.dev", "pin": "7417",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("both identities accepted: %d: %s", w.Code, w.Body.String())
	}
}

// TestTerminalEnableRejectsCrossBranchEmailBinding is the first-run email
// verdict: an email of a real manager of ANOTHER branch (B) presented at a
// terminal DECLARING branch A must be rejected and must leave the device
// unbound. It also checks the device-route branch picker surface.
func TestTerminalEnableRejectsCrossBranchEmailBinding(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	var branchB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO branches (name, status) VALUES ('Branch B', 'Online') RETURNING id::text`).Scan(&branchB); err != nil {
		t.Fatal(err)
	}
	registerBranch(t, r, adminToken, "Beta Manager", "beta-mgr@test.dev", "password123", "Store Manager", branchB)
	betaMgr := uid("beta-mgr@test.dev")
	setPINFor(t, r, adminToken, betaMgr, "7417", "admin123")

	termID := "term-xemail-1"

	// The terminal declares the boss's branch (A). The email resolves to a
	// real manager of branch B. Even with the CORRECT PIN this must be
	// rejected — never a silent bind to the account's own (wrong) branch.
	w := doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", termID, map[string]string{
		"email": "beta-mgr@test.dev", "pin": "7417", "branch_id": bossBranchSeed,
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("cross-branch email enable returned %d, want 403: %s", w.Code, w.Body.String())
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "TERMINAL_BRANCH_MISMATCH" {
		t.Fatalf("code = %q, want TERMINAL_BRANCH_MISMATCH", body.Code)
	}

	// The device stays unbound and the roster stays gated.
	enabled, _ := terminalStatus(t, r, termID, "")
	if enabled {
		t.Fatal("cross-branch email approval bound the device anyway")
	}
	if w := doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", termID, nil); w.Code != http.StatusForbidden {
		t.Fatalf("roster after rejected email enable returned %d, want 403", w.Code)
	}
	if n := countAudit(t, pool, "terminal.enabled"); n != 0 {
		t.Fatalf("rejected email enable wrote a terminal.enabled row: %d", n)
	}

	// The same email, presented at a terminal that correctly declares branch
	// B, approves normally — the rejection was about branch, not about email.
	termOK := "term-xemail-ok"
	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", termOK, map[string]string{
		"email": "beta-mgr@test.dev", "pin": "7417", "branch_id": branchB,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("matching email enable returned %d: %s", w.Code, w.Body.String())
	}
	var enableResp struct {
		Device struct {
			BranchID string `json:"branch_id"`
		} `json:"device"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &enableResp); err != nil {
		t.Fatal(err)
	}
	if enableResp.Device.BranchID != branchB {
		t.Fatalf("device bound to %s, want branch B", enableResp.Device.BranchID)
	}

	// The device-route branch picker exposes id+name only (so a terminal can
	// declare itself) — and never staff.
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/branches", "term-xemail-1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("branch list returned %d: %s", w.Code, w.Body.String())
	}
	var branches struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &branches); err != nil {
		t.Fatal(err)
	}
	foundIDs := map[string]bool{}
	for _, b := range branches.Data {
		if b.ID == "" || b.Name == "" {
			t.Fatalf("branch row missing id/name: %+v", b)
		}
		foundIDs[b.ID] = true
	}
	if !foundIDs[branchB] || !foundIDs[bossBranchSeed] {
		t.Fatalf("branch picker missing the two test branches: %v", foundIDs)
	}
}

// TestTerminalEnableUnknownEmailFailsCleanly pins the typo path: an email that
// matches no account fails like a wrong PIN (401, same shape — never a hint
// about whether the email exists) and leaves the device fully unbound.
func TestTerminalEnableUnknownEmailFailsCleanly(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)

	termID := "term-unk-1"
	w := doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", termID, map[string]string{
		"email": "no-such-person@test.dev", "pin": "7417", "branch_id": bossBranchSeed,
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("unknown-email enable returned %d, want 401: %s", w.Code, w.Body.String())
	}

	enabled, _ := terminalStatus(t, r, termID, "")
	if enabled {
		t.Fatal("unknown-email enable bound the device")
	}
	if w := doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", termID, nil); w.Code != http.StatusForbidden {
		t.Fatalf("roster after unknown-email enable returned %d, want 403", w.Code)
	}
	if n := countAudit(t, pool, "terminal.enabled"); n != 0 {
		t.Fatalf("unknown-email enable wrote a terminal.enabled row: %d", n)
	}
}