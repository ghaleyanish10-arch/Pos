package handler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

// TestStaffBranchScoping locks the tenant boundary on the staff/user listing
// surfaces: /staff/pin-accounts, /staff (List) and /staff/shifts must only
// ever return the CALLER's own branch, sourced from the validated JWT — never
// from a client-supplied ?branch_id= query, and never every row in the table.
// Floating accounts (no branch) see only their branch-less siblings.
func TestStaffBranchScoping(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)

	var branchA string
	if err := pool.QueryRow(context.Background(),
		`SELECT branch_id::text FROM users WHERE email = 'admin@mesa.os'`).Scan(&branchA); err != nil {
		t.Fatal(err)
	}
	if branchA == "" {
		t.Fatal("seed admin has no branch — cannot scope test")
	}

	var branchB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO branches (name, status) VALUES ('Branch B', 'Online') RETURNING id::text`).Scan(&branchB); err != nil {
		t.Fatal(err)
	}

	// --- users across three tenancies: A, B, and floating (no branch) ---
	registerBranch(t, r, adminToken, "Alice Alpha", "alice-alpha@test.dev", "password123", "Store Manager", branchA)
	registerBranch(t, r, adminToken, "Bosey Beta", "bosey-beta@test.dev", "password123", "Corporate Admin", branchB)
	registerBranch(t, r, adminToken, "Brian Bravo", "brian-bravo@test.dev", "password123", "Store Manager", branchB)
	registerBranch(t, r, adminToken, "Flo Owner", "flo-owner@test.dev", "password123", "Corporate Admin", "")

	tokenB := loginAs(t, r, "bosey-beta@test.dev", "password123")
	tokenF := loginAs(t, r, "flo-owner@test.dev", "password123")

	// --- staff_members + shifts across branches A and B ---
	var staffA, staffB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO staff_members (name, role, branch_id) VALUES ('Staff A Alpha', 'Cashier', $1) RETURNING id`, branchA).Scan(&staffA); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO staff_members (name, role, branch_id) VALUES ('Staff B Bravo', 'Cashier', $1) RETURNING id`, branchB).Scan(&staffB); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO shifts (staff_id, day, start_time, end_time, role, branch_id)
		 VALUES ($1, 'Mon', '09:00', '17:00', 'Cashier', $2)`, staffA, branchA); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO shifts (staff_id, day, start_time, end_time, role, branch_id)
		 VALUES ($1, 'Tue', '10:00', '18:00', 'Cashier', $2)`, staffB, branchB); err != nil {
		t.Fatal(err)
	}

	// --- branch A (admin) sees only branch A everywhere ---
	body := getBody(t, r, "/api/v1/staff/pin-accounts", adminToken)
	assertBody(t, body, []string{"admin@mesa.os", "alice-alpha@test.dev"},
		[]string{"bosey-beta@test.dev", "brian-bravo@test.dev", "flo-owner@test.dev"})

	body = getBody(t, r, "/api/v1/staff", adminToken)
	assertBody(t, body, []string{"Staff A Alpha"}, []string{"Staff B Bravo"})

	body = getBody(t, r, "/api/v1/shifts", adminToken)
	assertBody(t, body, []string{"Staff A Alpha"}, []string{"Staff B Bravo"})

	// --- branch B (bosey) sees only branch B; the client-supplied branch_id
	// query must be ignored, not honored ---
	body = getBody(t, r, "/api/v1/staff/pin-accounts", tokenB)
	assertBody(t, body, []string{"bosey-beta@test.dev", "brian-bravo@test.dev"},
		[]string{"admin@mesa.os", "alice-alpha@test.dev", "flo-owner@test.dev"})

	body = getBody(t, r, "/api/v1/staff?branch_id="+branchA, tokenB)
	assertBody(t, body, []string{"Staff B Bravo"}, []string{"Staff A Alpha"})

	body = getBody(t, r, "/api/v1/shifts", tokenB)
	assertBody(t, body, []string{"Staff B Bravo"}, []string{"Staff A Alpha"})

	// --- floating account sees only branch-less rows: itself in pin-accounts,
	// and none of either branch's staff/shifts ---
	body = getBody(t, r, "/api/v1/staff/pin-accounts", tokenF)
	assertBody(t, body, []string{"flo-owner@test.dev"},
		[]string{"admin@mesa.os", "alice-alpha@test.dev", "bosey-beta@test.dev", "brian-bravo@test.dev"})

	body = getBody(t, r, "/api/v1/staff", tokenF)
	assertBody(t, body, nil, []string{"Staff A Alpha", "Staff B Bravo"})

	body = getBody(t, r, "/api/v1/shifts", tokenF)
	assertBody(t, body, nil, []string{"Staff A Alpha", "Staff B Bravo"})
}

// TestPayrollScopedByJWTNotQuery locks the same tenant boundary on the
// payroll surfaces — /payroll/rates and /payroll/periods — which previously
// read ?branch_id= from the client (empty = every tenant's payroll rows).
func TestPayrollScopedByJWTNotQuery(t *testing.T) {
	r, pool := newTestRouter(t)
	adminToken := loginBoss(t, r)

	var branchA, branchB string
	if err := pool.QueryRow(context.Background(),
		`SELECT branch_id::text FROM users WHERE email = 'admin@mesa.os'`).Scan(&branchA); err != nil {
		t.Fatal(err)
	}
	if branchA == "" {
		t.Fatal("seed admin has no branch — cannot scope test")
	}
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO branches (name, status) VALUES ('Branch P B', 'Online') RETURNING id::text`).Scan(&branchB); err != nil {
		t.Fatal(err)
	}

	registerBranch(t, r, adminToken, "Pay Alice", "pay-alice@test.dev", "password123", "Store Manager", branchA)
	registerBranch(t, r, adminToken, "Pay Bob", "pay-bob@test.dev", "password123", "Store Manager", branchB)

	// Rates live on staff_members rows; create the payroll rows the rates
	// & period-writing surfaces are scoped by.
	var staffA, staffB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO staff_members (name, role, branch_id) VALUES ('Pay Alice', 'Cashier', $1) RETURNING id`, branchA).Scan(&staffA); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO staff_members (name, role, branch_id) VALUES ('Pay Bob', 'Cashier', $1) RETURNING id`, branchB).Scan(&staffB); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ id string; rate float64 }{{staffA, 250}, {staffB, 999}} {
		w := doReq(r, http.MethodPut, "/api/v1/staff/"+tc.id+"/rate", adminToken, map[string]float64{"rate": tc.rate})
		if w.Code != http.StatusOK {
			t.Fatalf("set rate %s returned %d: %s", tc.id, w.Code, w.Body.String())
		}
	}

	// Boss (branch A) requests branch B in the query — the query is ignored,
	// the JWT branch wins: only branch A's staff appear.
	body := getBody(t, r, "/api/v1/payroll/rates?branch_id="+branchB, adminToken)
	assertBody(t, body, []string{"Pay Alice"}, []string{"Pay Bob"})

	// Without any query param: still branch A only.
	body = getBody(t, r, "/api/v1/payroll/rates", adminToken)
	assertBody(t, body, []string{"Pay Alice"}, []string{"Pay Bob"})

	// A branch B manager sees only branch B staff, never A — even when the
	// client asks for A.
	tokenB := loginAs(t, r, "pay-bob@test.dev", "password123")
	body = getBody(t, r, "/api/v1/payroll/rates?branch_id="+branchA, tokenB)
	assertBody(t, body, []string{"Pay Bob"}, []string{"Pay Alice"})

	// Periods: the boss drafts a period in her own branch (CreatePeriod reads
	// the JWT branch), and the listing is scoped the same way.
	w := doReq(r, http.MethodPost, "/api/v1/payroll/periods", adminToken, map[string]any{
		"label": "Sep 2026", "start_date": "2026-09-01", "end_date": "2026-09-30",
		"lines": []map[string]any{{"staff_id": staffA, "staff_name": "Pay Alice", "hours": 8, "hourly_rate": 250}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create period returned %d: %s", w.Code, w.Body.String())
	}
	body = getBody(t, r, "/api/v1/payroll/periods?branch_id="+branchB, adminToken)
	assertBody(t, body, []string{"Sep 2026"}, nil)
	body = getBody(t, r, "/api/v1/payroll/periods", tokenB)
	assertBody(t, body, nil, []string{"Sep 2026"})
}

func registerBranch(t *testing.T, r *gin.Engine, adminToken, name, email, password, role, branchID string) {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/register", adminToken, map[string]string{
		"name": name, "email": email, "password": password, "role": role, "branch_id": branchID,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("register %s returned %d: %s", email, w.Code, w.Body.String())
	}
	loginAs(t, r, email, password) // login just to stash the id for uid(email)
}

func loginAs(t *testing.T, r *gin.Engine, email, password string) string {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
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
		t.Fatal(err)
	}
	if resp.Tokens.AccessToken == "" {
		t.Fatal("login response missing access token")
	}
	if resp.User.ID != "" {
		userIDs.Store(email, resp.User.ID)
	}
	return resp.Tokens.AccessToken
}

func getBody(t *testing.T, r *gin.Engine, path, token string) string {
	t.Helper()
	w := doReq(r, http.MethodGet, path, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s returned %d: %s", path, w.Code, w.Body.String())
	}
	return w.Body.String()
}

func assertBody(t *testing.T, body string, mustContain, mustNotContain []string) {
	t.Helper()
	for _, needle := range mustContain {
		if !contains(body, needle) {
			t.Errorf("body missing %q\nbody: %s", needle, body)
		}
	}
	for _, needle := range mustNotContain {
		if contains(body, needle) {
			t.Errorf("body leaked %q across branches\nbody: %s", needle, body)
		}
	}
}