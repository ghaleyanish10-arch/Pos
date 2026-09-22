package handler_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// --- PIN-verified role switching (POST /auth/switch-role) ---

func switchRole(t *testing.T, r *gin.Engine, token, role, pin string) (int, string) {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/switch-role", token, map[string]string{
		"role": role, "pin": pin,
	})
	var resp struct {
		User struct {
			ID   string `json:"id"`
			Role string `json:"role"`
		} `json:"user"`
		Token     string `json:"token"`
		ExpiresAt int64  `json:"expires_at"`
	}
	_ = jsonUnmarshal(w.Body.Bytes(), &resp)
	return w.Code, resp.User.Role
}

func TestRoleSwitchBossWearsEveryHat(t *testing.T) {
	r, pool := newClockInRouter(t, time.Hour)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")
	setPINFor(t, r, adminToken, bossID, "9977", "admin123")

	// Boss switches into the kitchen realm with their PIN.
	code, got := switchRole(t, r, adminToken, "kitchen", "9977")
	if code != http.StatusOK || got != "Kitchen" {
		t.Fatalf("kitchen switch returned %d: %q", code, got)
	}

	// ...and into cashier and manager as well.
	for _, want := range []struct{ key, label string }{{"cashier", "Cashier"}, {"manager", "Store Manager"}} {
		code, got := switchRole(t, r, adminToken, want.key, "9977")
		if code != http.StatusOK || got != want.label {
			t.Fatalf("%s switch returned %d: %q", want.key, code, got)
		}
	}

	// Switching back to the boss realm is allowed and keeps working.
	code, got = switchRole(t, r, adminToken, "admin", "9977")
	if code != http.StatusOK || got != "Corporate Admin" {
		t.Fatalf("admin switch returned %d: %q", code, got)
	}

	// Every successful switch is audited.
	if n := countAudit(t, pool, "role-switch.success"); n < 4 {
		t.Fatalf("expected >=4 role-switch.success audit rows, got %d", n)
	}
}

func TestRoleSwitchWrongPINFailsAndLocks(t *testing.T) {
	r, pool := newClockInRouter(t, time.Hour)
	adminToken := loginBoss(t, r)
	bossID := uid("admin@mesa.os")
	setPINFor(t, r, adminToken, bossID, "6644", "admin123")

	// Four wrong PINs answer 401; the fifth locks (423) and so does the
	// correct PIN from then on — the shared clock-in lockout counter.
	for i := 0; i < 4; i++ {
		code, _ := switchRole(t, r, adminToken, "kitchen", "0000")
		if code != http.StatusUnauthorized {
			t.Fatalf("wrong PIN attempt %d returned %d, want 401", i+1, code)
		}
	}
	code, _ := switchRole(t, r, adminToken, "kitchen", "0000")
	if code != http.StatusLocked {
		t.Fatalf("fifth wrong PIN returned %d, want 423", code)
	}
	code, _ = switchRole(t, r, adminToken, "kitchen", "6644")
	if code != http.StatusLocked {
		t.Fatalf("locked correct PIN returned %d, want 423", code)
	}
	if n := countAudit(t, pool, "role-switch.lockout"); n != 1 {
		t.Fatalf("expected exactly 1 role-switch lockout audit row, got %d", n)
	}
}

func TestRoleSwitchCashierCannotWearManager(t *testing.T) {
	r, _ := newClockInRouter(t, time.Hour)
	adminToken := loginBoss(t, r)
	token := registerAndLogin(t, r, adminToken, "Cashier Casey", "casey@mesa.os", "password123", "Cashier")
	id := uid("casey@mesa.os")
	setPINFor(t, r, adminToken, id, "7331", "admin123")

	// Correct PIN but a permission boundary: 403, not a lockout.
	code, _ := switchRole(t, r, token, "manager", "7331")
	if code != http.StatusForbidden {
		t.Fatalf("cashier->manager returned %d, want 403", code)
	}
	// Their own realm still works.
	code, got := switchRole(t, r, token, "cashier", "7331")
	if code != http.StatusOK || got != "Cashier" {
		t.Fatalf("cashier->cashier returned %d: %q", code, got)
	}
	// The forbidden attempt never counts against the PIN lockout, so a wrong
	// PIN still answers plain 401 (not 423) and a right one still succeeds.
	code, _ = switchRole(t, r, token, "kitchen", "wrong")
	if code != http.StatusUnauthorized {
		t.Fatalf("wrong PIN after a 403 returned %d, want 401", code)
	}
	// Same-tier working realms (cashier <-> kitchen) are interchangeable —
	// handy when the floor is short-staffed — but authority never leaks down.
	code, got = switchRole(t, r, token, "kitchen", "7331")
	if code != http.StatusOK || got != "Kitchen" {
		t.Fatalf("cashier->kitchen (same tier) returned %d: %q", code, got)
	}
	// And the boss realm is out of reach for everyone below it.
	code, _ = switchRole(t, r, token, "admin", "7331")
	if code != http.StatusForbidden {
		t.Fatalf("cashier->admin returned %d, want 403", code)
	}
}

func TestRoleSwitchRequiresAuth(t *testing.T) {
	r, _ := newClockInRouter(t, time.Hour)
	code, _ := switchRole(t, r, "", "kitchen", "1234")
	if code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated switch returned %d, want 401", code)
	}
}
