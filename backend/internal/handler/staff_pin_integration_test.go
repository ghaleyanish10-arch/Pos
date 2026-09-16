package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/mesa-os/backend/internal/auth"
)

// TestStaffCreatedWithPINCanClockIn validates the Team-screen "add staff with a
// PIN" flow end to end: the staff member becomes a real users row, enters the
// terminal roster, and can clock in with their PIN — no separate PIN setup step.
func TestStaffCreatedWithPINCanClockIn(t *testing.T) {
	r, pool := newClockInRouter(t, 12*time.Hour)
	adminToken := loginBoss(t, r)

	w := doReq(r, http.MethodPost, "/api/v1/staff", adminToken, map[string]string{
		"name": "PIN Staff", "role": "Cashier", "pin": "3693",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create staff with PIN returned %d: %s", w.Code, w.Body.String())
	}
	var created struct {
		UserID string `json:"user_id"`
		Member struct {
			ID string `json:"id"`
		} `json:"member"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.UserID == "" {
		t.Fatal("expected a users row id when a PIN was supplied")
	}

	var userID string
	var role string
	if err := pool.QueryRow(context.Background(),
		`SELECT id::text, role FROM users WHERE name = 'PIN Staff'`).Scan(&userID, &role); err != nil {
		t.Fatalf("read staff user: %v", err)
	}
	if userID != created.UserID {
		t.Fatalf("response user_id %q != db %q", created.UserID, userID)
	}
	if role != "Cashier" {
		t.Errorf("role = %q, want Cashier", role)
	}
	if created.Member.ID == "" {
		t.Fatal("staff_members row missing")
	}

	// No password hash ever — PIN is the only credential for this row.
	var hash string
	if err := pool.QueryRow(context.Background(),
		`SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash); err != nil {
		t.Fatalf("read staff password_hash: %v", err)
	}
	if hash != "" {
		t.Errorf("PIN-created staff must not carry a login password hash, got %q", hash)
	}

	// Weak / blocklisted PINs are rejected before anything is written.
	w = doReq(r, http.MethodPost, "/api/v1/staff", adminToken, map[string]string{
		"name": "Blocklisted", "role": "Cashier", "pin": "1234",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("blocklisted PIN returned %d, want 400: %s", w.Code, w.Body.String())
	}

	// Self-invented roles are rejected (the 4 RBAC roles only).
	w = doReq(r, http.MethodPost, "/api/v1/staff", adminToken, map[string]string{
		"name": "Hosty", "role": "Host", "pin": "3693",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("demo role returned %d, want 400: %s", w.Code, w.Body.String())
	}

	// Clock-in works with the freshly minted PIN, after a manager approves a
	// terminal. No SetPIN step anywhere.
	mgrID, _ := newManager(t, r, "PIN Approver", "pin-appr@test.dev")
	enableTerminal(t, r, "terminal-1", mgrID, "7417")
	code, token := clockIn(t, r, userID, "3693")
	if code != http.StatusOK || token == "" {
		t.Fatalf("clock-in as PIN-created staff returned %d", code)
	}
	claims, err := auth.ValidateToken(token, "clockin-test-secret")
	if err != nil {
		t.Fatalf("validate session: %v", err)
	}
	if claims.Role != "Cashier" || claims.UserID != userID {
		t.Fatalf("session claims wrong: user=%s role=%s", claims.UserID, claims.Role)
	}

	// The roster serves the PIN-created member.
	w = doDeviceReq(r, http.MethodGet, "/api/v1/staff/roster?branch_id=", "terminal-1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("roster returned %d: %s", w.Code, w.Body.String())
	}
	var roster struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &roster); err != nil {
		t.Fatalf("decode roster: %v", err)
	}
	foundRoster := false
	for _, u := range roster.Data {
		if u.ID == userID {
			foundRoster = true
		}
	}
	if !foundRoster {
		t.Fatal("PIN-created staff missing from clock-in roster")
	}
}