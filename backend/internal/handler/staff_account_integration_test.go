package handler_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mesa-os/backend/internal/handler"
)

func TestStaffAccountDelete(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")

	mgrToken := registerAndLogin(t, r, adminToken, "Delete Target Mgr", "deleteme@test.dev", "password123", "Store Manager")
	mgrID := uid("deleteme@test.dev")

	// A manager cannot delete staff accounts.
	w := doReq(r, http.MethodDelete, "/api/v1/staff/"+mgrID, mgrToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("manager delete returned %d, want 403", w.Code)
	}

	// Give the account a PIN, an approved-terminal link and a pending
	// elevation grant so deletion has orphaned state to clean up.
	setPINFor(t, r, adminToken, mgrID, "3388", "admin123")
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO devices (id, enabled_by_user_id) VALUES ('del-device-1', $1)`, mgrID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO elevation_tokens (jti, user_id, action, resource_id, expires_at)
		 VALUES ('del-jti-1', $1, 'refund.approve', '', now() + interval '1 hour')`, mgrID); err != nil {
		t.Fatal(err)
	}

	w = doReq(r, http.MethodDelete, "/api/v1/staff/"+mgrID, adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("boss delete returned %d: %s", w.Code, w.Body.String())
	}

	var deletedAt *time.Time
	var pinHash *string
	if err := pool.QueryRow(context.Background(),
		`SELECT deleted_at, pin_hash FROM users WHERE id = $1`, mgrID).Scan(&deletedAt, &pinHash); err != nil {
		t.Fatal(err)
	}
	if deletedAt == nil {
		t.Error("account was not soft-deleted (deleted_at is NULL)")
	}
	if pinHash != nil {
		t.Error("PIN hash was not cleared on delete")
	}

	var enabledBy *string
	if err := pool.QueryRow(context.Background(),
		`SELECT enabled_by_user_id FROM devices WHERE id = 'del-device-1'`).Scan(&enabledBy); err != nil {
		t.Fatal(err)
	}
	if enabledBy != nil {
		t.Errorf("terminal approval link survived delete: %v", enabledBy)
	}

	var grants int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM elevation_tokens WHERE user_id = $1`, mgrID).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 0 {
		t.Errorf("elevation grants survived delete: %d", grants)
	}

	// The account disappears from the boss's PIN-account list and cannot log in.
	w = doReq(r, http.MethodGet, "/api/v1/staff/pin-accounts", adminToken, nil)
	if w.Code != http.StatusOK || contains(w.Body.String(), "deleteme@test.dev") {
		t.Errorf("deleted account still listed in pin-accounts (code %d)", w.Code)
	}
	w = doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"email": "deleteme@test.dev", "password": "password123",
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("deleted account could log in, got %d", w.Code)
	}

	// Deleting again, or deleting your own account, both fail cleanly.
	w = doReq(r, http.MethodDelete, "/api/v1/staff/"+mgrID, adminToken, nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("second delete returned %d, want 404", w.Code)
	}
	w = doReq(r, http.MethodDelete, "/api/v1/staff/"+bossID, adminToken, nil)
	if w.Code != http.StatusBadRequest {
		t.Errorf("self-delete returned %d, want 400", w.Code)
	}

	// The deletion landed in the audit trail.
	var audits int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_events WHERE event_type = 'staff.deleted'`).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Errorf("expected 1 staff.deleted audit row, got %d", audits)
	}
}

func TestPINSetReauthGrace(t *testing.T) {
	r, _ := newTestRouter(t)
	adminToken := loginBoss(t, r)

	mgrToken := registerAndLogin(t, r, adminToken, "Grace Mgr", "grace-mgr@test.dev", "password123", "Store Manager")
	mgrID := uid("grace-mgr@test.dev")

	// No password and no fresh grant: refused.
	w := doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "8181"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("bare set-pin with no grant returned %d, want 401", w.Code)
	}

	// First change demands the password...
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "8181", "password": "admin123"})
	if w.Code != http.StatusOK {
		t.Fatalf("set-pin with password returned %d: %s", w.Code, w.Body.String())
	}

	// ...and a bare set inside the fresh window is accepted.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "6264"})
	if w.Code != http.StatusOK {
		t.Fatalf("bare set-pin within fresh grant returned %d: %s", w.Code, w.Body.String())
	}

	// A wrong password is still refused, even inside a fresh window.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "5353", "password": "nope"})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("set-pin with wrong password returned %d, want 401", w.Code)
	}

	// Weak PINs stay blocked regardless of the re-auth path.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "1234", "password": "admin123"})
	if w.Code != http.StatusBadRequest {
		t.Errorf("weak PIN returned %d, want 400", w.Code)
	}

	// Manager is still blocked from setting PINs entirely.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", mgrToken, map[string]string{"pin": "7474", "password": "password123"})
	if w.Code != http.StatusForbidden {
		t.Errorf("manager set-pin returned %d, want 403", w.Code)
	}

	// Refresh the grant explicitly, then let the window expire: the bare path
	// must demand the password again.
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "6264", "password": "admin123"})
	if w.Code != http.StatusOK {
		t.Fatalf("grant refresh returned %d: %s", w.Code, w.Body.String())
	}
	orig := handler.PINReauthWindow
	handler.PINReauthWindow = time.Millisecond
	defer func() { handler.PINReauthWindow = orig }()
	time.Sleep(5 * time.Millisecond)
	w = doReq(r, http.MethodPut, "/api/v1/staff/"+mgrID+"/pin", adminToken, map[string]string{"pin": "8987"})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("bare set-pin after window expiry returned %d, want 401", w.Code)
	}
}
