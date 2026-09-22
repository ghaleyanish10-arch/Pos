package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// latestAuditActor returns the actor_id of the most recent audit event of the
// given type — used to pin down exactly who enabled/disabled a terminal.
func latestAuditActor(t *testing.T, pool *pgxpool.Pool, eventType string) string {
	t.Helper()
	var actor string
	if err := pool.QueryRow(context.Background(),
		`SELECT COALESCE(actor_id::text, '') FROM audit_events
		 WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1`, eventType).Scan(&actor); err != nil {
		t.Fatalf("read audit actor for %s: %v", eventType, err)
	}
	return actor
}

// pinFailureCount reads the shared lockout counter for a user.
func pinFailureCount(t *testing.T, pool *pgxpool.Pool, userID string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT pin_failed_attempts FROM users WHERE id = $1`, userID).Scan(&n); err != nil {
		t.Fatalf("read pin failures: %v", err)
	}
	return n
}

// terminalStatus hits GET /staff/terminal-status for a device.
func terminalStatus(t *testing.T, r *gin.Engine, deviceID string) (bool, []string) {
	t.Helper()
	w := doDeviceReq(r, http.MethodGet, "/api/v1/staff/terminal-status", deviceID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("terminal-status returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Enabled   bool `json:"enabled"`
		Approvers []struct {
			Name string `json:"name"`
		} `json:"approvers"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode terminal-status: %v", err)
	}
	names := make([]string, 0, len(resp.Approvers))
	for _, a := range resp.Approvers {
		names = append(names, a.Name)
	}
	return resp.Enabled, names
}

func TestTerminalEnableManagerApprovesAndUnlocksRoster(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	mgrID, _ := newManager(t, r, "Approver Ana", "approver@test.dev")
	termID := "term-approve-1"

	// Not yet approved: status says so, roster is gated away.
	enabled, _ := terminalStatus(t, r, termID)
	if enabled {
		t.Fatal("terminal-status reported enabled before any approval")
	}
	w := doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", termID, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("roster on unapproved device returned %d, want 403", w.Code)
	}

	// A manager approves the terminal with their PIN.
	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", termID, map[string]string{
		"user_id": mgrID, "pin": "7417",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("terminal-enable returned %d: %s", w.Code, w.Body.String())
	}

	// Audit: exactly one enable row, acted by the manager.
	if n := countAudit(t, pool, "terminal.enabled"); n != 1 {
		t.Fatalf("expected exactly 1 terminal.enabled row, got %d", n)
	}
	if actor := latestAuditActor(t, pool, "terminal.enabled"); actor != mgrID {
		t.Fatalf("terminal.enabled actor = %s, want manager %s", actor, mgrID)
	}

	// The roster is immediately available on the same device — the setup
	// screen continues straight into clock-in, no reload needed.
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster", termID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("roster after enable returned %d: %s", w.Code, w.Body.String())
	}

	// A fresh status check (e.g. a page reload) skips the setup screen.
	enabled, _ = terminalStatus(t, r, termID)
	if !enabled {
		t.Fatal("terminal-status still reported disabled after approval")
	}
}

func TestTerminalStatusListsOnlyManagersAndBossesAsApprovers(t *testing.T) {
	r, _ := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)
	registerAndLogin(t, r, adminToken, "Cashier Mina", "mina@test.dev", "password123", "Cashier")
	registerAndLogin(t, r, adminToken, "Stock Kiran", "kiran@test.dev", "password123", "Inventory Auditor")
	mgrID, _ := newManager(t, r, "Approver Ana", "approver@test.dev")
	_ = mgrID

	// The boss (Corporate Admin) already exists in the seed, so the approvers
	// list must contain the manager and the boss but never the cashier/auditor.
	_, names := terminalStatus(t, r, "term-approvers-1")
	for _, n := range names {
		if n == "Cashier Mina" || n == "Stock Kiran" {
			t.Fatalf("approvers leaked non-manager %q: %v", n, names)
		}
	}
	found := map[string]bool{"Approver Ana": false}
	for _, n := range names {
		if n == "Approver Ana" {
			found["Approver Ana"] = true
		}
	}
	for name, ok := range found {
		if !ok {
			t.Fatalf("approvers missing %s: %v", name, names)
		}
	}
}

func TestTerminalEnableCashierForbiddenWithoutLockout(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)
	registerAndLogin(t, r, adminToken, "Cashier Mina", "mina@test.dev", "password123", "Cashier")
	cashierID := uid("mina@test.dev")
	setPINFor(t, r, adminToken, cashierID, "7417", "admin123")

	// A cashier with the CORRECT PIN is 403: identity proven, but the role
	// cannot approve. Crucially, no lockout is applied.
	w := doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", "term-no-1", map[string]string{
		"user_id": cashierID, "pin": "7417",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("cashier enable returned %d, want 403: %s", w.Code, w.Body.String())
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "TERMINAL_SETUP_FORBIDDEN" {
		t.Fatalf("cashier enable code = %q, want TERMINAL_SETUP_FORBIDDEN", body.Code)
	}
	if n := pinFailureCount(t, pool, cashierID); n != 0 {
		t.Fatalf("cashier role rejection incremented the lockout counter to %d, want 0 (lockout is for wrong PINs only)", n)
	}
	if n := countAudit(t, pool, "terminal.enabled"); n != 0 {
		t.Fatalf("cashier approval wrote a terminal.enabled row: %d", n)
	}
	if n := countAudit(t, pool, "terminal.forbidden"); n != 1 {
		t.Fatalf("expected exactly 1 terminal.forbidden row, got %d", n)
	}

	// A cashier with a WRONG PIN is still throttled like any other flow —
	// lockouts are about wrong PINs, not about role.
	w = doDeviceReq(r, http.MethodPost, "/api/v1/staff/terminal-enable", "term-no-1", map[string]string{
		"user_id": cashierID, "pin": "0000",
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("cashier wrong-PIN enable returned %d, want 401", w.Code)
	}
	if n := pinFailureCount(t, pool, cashierID); n != 1 {
		t.Fatalf("wrong-PIN attempt did not increment the shared counter: got %d, want 1", n)
	}
	if n := countAudit(t, pool, "terminal.failed"); n != 1 {
		t.Fatalf("expected exactly 1 terminal.failed row, got %d", n)
	}
}

func TestTerminalDisableBossOnlyReturnsToSetup(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	mgrID, mgrToken := newManager(t, r, "Approver Ana", "approver@test.dev")
	termID := "term-disable-1"
	enableTerminal(t, r, termID, mgrID, "7417")

	bossToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	// Boss sees the approved terminal in the management list.
	w := doReq(r, http.MethodGet, "/api/v1/staff/devices", bossToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("device list returned %d: %s", w.Code, w.Body.String())
	}
	var list struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode device list: %v", err)
	}
	found := false
	for _, d := range list.Data {
		if d.ID == termID {
			found = true
		}
	}
	if !found {
		t.Fatalf("approved terminal %s not in boss device list: %s", termID, w.Body.String())
	}

	// A manager cannot disable — boss only.
	w = doReq(r, http.MethodDelete, "/api/v1/staff/devices/"+termID, mgrToken, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("manager disable returned %d, want 403", w.Code)
	}

	// The boss disables the terminal.
	w = doReq(r, http.MethodDelete, "/api/v1/staff/devices/"+termID, bossToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("boss disable returned %d: %s", w.Code, w.Body.String())
	}

	// Exactly one enable + one disable audit row, each with the right actor.
	if n := countAudit(t, pool, "terminal.enabled"); n != 1 {
		t.Fatalf("expected exactly 1 terminal.enabled row, got %d", n)
	}
	if actor := latestAuditActor(t, pool, "terminal.enabled"); actor != mgrID {
		t.Fatalf("terminal.enabled actor = %s, want %s", actor, mgrID)
	}
	if n := countAudit(t, pool, "terminal.disabled"); n != 1 {
		t.Fatalf("expected exactly 1 terminal.disabled row, got %d", n)
	}
	if actor := latestAuditActor(t, pool, "terminal.disabled"); actor != bossID {
		t.Fatalf("terminal.disabled actor = %s, want boss %s", actor, bossID)
	}

	// The terminal is back on the setup screen on its next load.
	enabled, _ := terminalStatus(t, r, termID)
	if enabled {
		t.Fatal("terminal-status reported enabled after disabling")
	}
}