package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/mesa-os/backend/internal/auth"
)

func TestSignupVerifyFlow(t *testing.T) {
	r, pool := newTestRouter(t)
	email := "new-owner@test.dev"

	t.Run("create account", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
			"name": "New Owner", "email": email, "password": "ownerpass123",
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("signup returned %d: %s", w.Code, w.Body.String())
		}

		// Account is an unverified Corporate Admin attached to a branch.
		var role string
		var branchID *string
		var verified bool
		if err := pool.QueryRow(context.Background(),
			`SELECT role, branch_id::text, email_verified_at IS NOT NULL FROM users WHERE email = $1`, email,
		).Scan(&role, &branchID, &verified); err != nil {
			t.Fatalf("read user: %v", err)
		}
		if role != "Corporate Admin" {
			t.Errorf("role = %q, want Corporate Admin", role)
		}
		if branchID == nil || *branchID == "" {
			t.Error("owner not attached to a branch")
		}
		if verified {
			t.Error("fresh signup must NOT be email-verified")
		}
	})

	t.Run("duplicate email", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
			"name": "Copy", "email": email, "password": "ownerpass123",
		})
		if w.Code != http.StatusConflict {
			t.Errorf("duplicate signup returned %d, want 409", w.Code)
		}
	})

	t.Run("weak password", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
			"name": "Short", "email": "short@test.dev", "password": "123",
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("weak password returned %d, want 400", w.Code)
		}
	})

	t.Run("verify-code happy path + single use", func(t *testing.T) {
		var userID string
		if err := pool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID); err != nil {
			t.Fatalf("get user: %v", err)
		}
		if _, err := pool.Exec(context.Background(),
			`INSERT INTO verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`,
			userID, auth.HashCode("483920"),
		); err != nil {
			t.Fatalf("seed code: %v", err)
		}

		w := doReq(r, http.MethodPost, "/api/v1/auth/verify-code", "", map[string]string{
			"email": email, "code": "483920",
		})
		if w.Code != http.StatusOK {
			t.Fatalf("verify-code returned %d: %s", w.Code, w.Body.String())
		}

		// The same code must not work twice.
		w = doReq(r, http.MethodPost, "/api/v1/auth/verify-code", "", map[string]string{
			"email": email, "code": "483920",
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("reused code returned %d, want 400", w.Code)
		}

		// A made-up code must not work either.
		w = doReq(r, http.MethodPost, "/api/v1/auth/verify-code", "", map[string]string{
			"email": email, "code": "000000",
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("bogus code returned %d, want 400", w.Code)
		}
	})

	t.Run("login reflects verification state", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
			"email": email, "password": "ownerpass123",
		})
		if w.Code != http.StatusOK {
			t.Fatalf("login returned %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			User *struct {
				EmailVerified bool `json:"email_verified"`
			} `json:"user"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode login: %v", err)
		}
		if resp.User == nil || !resp.User.EmailVerified {
			t.Error("login must report email_verified = true after verification")
		}
	})
}

func TestResendCode(t *testing.T) {
	r, pool := newTestRouter(t)
	email := "resend-owner@test.dev"

	w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
		"name": "Resend Owner", "email": email, "password": "ownerpass123",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("signup returned %d", w.Code)
	}

	// Unknown email answers neutrally — no account enumeration.
	w = doReq(r, http.MethodPost, "/api/v1/auth/resend-code", "", map[string]string{"email": "ghost@test.dev"})
	if w.Code != http.StatusOK {
		t.Errorf("resend for unknown email returned %d, want 200", w.Code)
	}

	// A code was just issued at signup time; a resend right away is throttled.
	w = doReq(r, http.MethodPost, "/api/v1/auth/resend-code", "", map[string]string{"email": email})
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("throttled resend returned %d, want 429", w.Code)
	}

	// After the cooldown elapses, resend actually issues a fresh code.
	if _, err := pool.Exec(context.Background(),
		`UPDATE users SET last_code_sent_at = now() - interval '61 seconds' WHERE email = $1`, email,
	); err != nil {
		t.Fatalf("roll back cooldown: %v", err)
	}
	w = doReq(r, http.MethodPost, "/api/v1/auth/resend-code", "", map[string]string{"email": email})
	if w.Code != http.StatusOK {
		t.Errorf("resend after cooldown returned %d, want 200: %s", w.Code, w.Body.String())
	}
}

func TestAdminDashboardGatedByEmailVerification(t *testing.T) {
	r, pool := newTestRouter(t)
	email := "gated-owner@test.dev"

	w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
		"name": "Gated Owner", "email": email, "password": "ownerpass123",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("signup returned %d", w.Code)
	}

	token := loginWith(t, r, email)
	if token == "" {
		t.Fatal("no token from login")
	}

	// Unverified owner: /auth/me is fine, admin-dashboard routes are 403.
	w = doReq(r, http.MethodGet, "/api/v1/auth/me", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("me returned %d: %s", w.Code, w.Body.String())
	}

	w = doReq(r, http.MethodGet, "/api/v1/permissions", token, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("unverified permissions returned %d, want 403", w.Code)
	}

	// Verify, then the same route opens.
	var userID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID); err != nil {
		t.Fatalf("get user: %v", err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`,
		userID, auth.HashCode("123456"),
	); err != nil {
		t.Fatalf("seed code: %v", err)
	}
	w = doReq(r, http.MethodPost, "/api/v1/auth/verify-code", "", map[string]string{"email": email, "code": "123456"})
	if w.Code != http.StatusOK {
		t.Fatalf("verify returned %d: %s", w.Code, w.Body.String())
	}

	w = doReq(r, http.MethodGet, "/api/v1/permissions", token, nil)
	if w.Code != http.StatusOK {
		t.Errorf("verified permissions returned %d, want 200: %s", w.Code, w.Body.String())
	}
}

// TestPosRoutesNotGatedByVerification ensures the email-verification gate is
// scoped to the admin dashboard: an unverified owner can still read the menu
// and create orders (the POS terminal must keep working pre-verification).
func TestPosRoutesNotGatedByVerification(t *testing.T) {
	r, pool := newTestRouter(t)
	email := "pos-owner@test.dev"

	w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
		"name": "POS Owner", "email": email, "password": "ownerpass123",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("signup returned %d", w.Code)
	}
	token := loginWith(t, r, email)

	w = doReq(r, http.MethodGet, "/api/v1/menu", token, nil)
	if w.Code != http.StatusOK {
		t.Errorf("unverified owner menu read returned %d, want 200 (POS not gated)", w.Code)
	}

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}
	w = doReq(r, http.MethodPost, "/api/v1/orders", token, map[string]any{
		"items": []map[string]any{
			{"menu_item_id": menuItemID, "name": "Momo", "qty": 1, "price": 195},
		},
	})
	if w.Code != http.StatusCreated {
		t.Errorf("unverified owner order returned %d, want 201 (POS not gated): %s", w.Code, w.Body.String())
	}
}

func loginWith(t *testing.T, r *gin.Engine, email string) string {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": email, "password": "ownerpass123"})
	if w.Code != http.StatusOK {
		t.Fatalf("login for %s returned %d: %s", email, w.Code, w.Body.String())
	}
	var resp struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	return resp.Tokens.AccessToken
}