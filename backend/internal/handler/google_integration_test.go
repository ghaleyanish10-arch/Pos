package handler_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/router"
	"github.com/mesa-os/backend/internal/testutil"
)

// fakeGoogle is a stand-in for Google's OAuth server: POST /token exchanges a
// known authorization code (anything else is rejected) for an access token,
// and GET /userinfo maps any bearer token back to a fixed profile. The backend
// is pointed at it via cfg.GoogleTokenURL / GoogleUserInfoURL, so the whole
// sign-in/sign-up path runs without network access.
type fakeGoogle struct {
	server           *httptest.Server
	sub, email, name string
}

func newFakeGoogle(t *testing.T, sub, email, name string) *fakeGoogle {
	t.Helper()
	f := &fakeGoogle{sub: sub, email: email, name: name}
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		code := r.FormValue("code")
		if code == "" || code == "bad" {
			http.Error(w, `{"error": "invalid_grant"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"access_token": "fake-token-%s", "token_type": "Bearer"}`, code)
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer fake-token-") {
			http.Error(w, `{"error": "invalid_token"}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id": %q, "email": %q, "name": %q, "verified_email": true}`, f.sub, f.email, f.name)
	})
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

// newGoogleRouter wires the app over a fresh test DB, with Google OAuth
// pointed at the fake server.
func newGoogleRouter(t *testing.T, fake *fakeGoogle) (*gin.Engine, *pgxpool.Pool) {
	t.Helper()
	pool := testutil.NewTestPool(t, "mesa_os_handler_test")
	cfg := &config.Config{
		DatabaseURL:        "unused-in-tests",
		JWTSecret:          "handler-test-secret",
		JWTAccessExpiry:    15 * time.Minute,
		JWTRefreshExpiry:   24 * time.Hour,
		CORSOrigin:         "http://localhost:5173",
		AppURL:             "http://localhost:5173",
		GoogleClientID:     "test-client",
		GoogleClientSecret: "test-secret",
		GoogleRedirectURL:  "http://localhost:5173/api/v1/auth/google/callback",
		GoogleTokenURL:     fake.server.URL + "/token",
		GoogleUserInfoURL:  fake.server.URL + "/userinfo",
	}
	return router.Setup(pool, cfg), pool
}

// googleAuthStart simulates the first leg of the browser trip: the SPA sends
// the visitor to GET /auth/google, which answers 307 to Google's consent page
// and plants a short-lived oauth_state cookie. The real state is returned so
// the test can replay it exactly (or prove that tampering is rejected).
func googleAuthStart(t *testing.T, r *gin.Engine) string {
	t.Helper()
	first := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, first)
	if rec.Code != http.StatusTemporaryRedirect {
		t.Fatalf("GET /auth/google returned %d, want 307: %s", rec.Code, rec.Body.String())
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == "oauth_state" {
			return c.Value
		}
	}
	t.Fatal("no oauth_state cookie issued")
	return ""
}

// googleCallback hits the callback the way Google's redirect back would, with
// an explicit state query and Cookie header for the caller to control.
func googleCallback(t *testing.T, r *gin.Engine, code, queryState, cookieHeader string) *httptest.ResponseRecorder {
	t.Helper()
	cbPath := "/api/v1/auth/google/callback?code=" + url.QueryEscape(code) + "&state=" + url.QueryEscape(queryState)
	cb := httptest.NewRequest(http.MethodGet, cbPath, nil)
	cb.Header.Set("Cookie", cookieHeader)
	cbRec := httptest.NewRecorder()
	r.ServeHTTP(cbRec, cb)
	return cbRec
}

// googleBounce is the happy-path wrapper: legitimate state from the issued
// cookie. Empty queryState/cookieHeader mean "use the real ones"; non-empty
// values deliberately tamper with that leg, which lets the negative tests
// prove the CSRF/state guard actually refuses forged callbacks.
func googleBounce(t *testing.T, r *gin.Engine, code, queryState, cookieHeader string) *httptest.ResponseRecorder {
	t.Helper()
	real := googleAuthStart(t, r)
	if queryState == "" {
		queryState = real
	}
	if cookieHeader == "" {
		cookieHeader = "oauth_state=" + real
	}
	return googleCallback(t, r, code, queryState, cookieHeader)
}

// locationSession parses the token+email Google sign-in bounces to the SPA.
func locationSession(t *testing.T, w *httptest.ResponseRecorder) (token, email string) {
	t.Helper()
	if w.Code != http.StatusFound {
		t.Fatalf("callback returned %d, want 302: %s", w.Code, w.Body.String())
	}
	u, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse Location %q: %v", w.Header().Get("Location"), err)
	}
	tok := u.Query().Get("token")
	em := u.Query().Get("email")
	if tok == "" || em == "" {
		t.Fatalf("redirect Location %q missing token or email", u.String())
	}
	return tok, em
}

func meProfile(t *testing.T, r *gin.Engine, token string) (role, email string) {
	t.Helper()
	w := doReq(r, http.MethodGet, "/api/v1/auth/me", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/me returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		User struct {
			Role  string `json:"role"`
			Email string `json:"email"`
		} `json:"user"`
	}
	_ = jsonUnmarshal(w.Body.Bytes(), &resp)
	return resp.User.Role, resp.User.Email
}

func countAuditType(t *testing.T, pool *pgxpool.Pool, eventType string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_events WHERE event_type = $1`, eventType).Scan(&n); err != nil {
		t.Fatalf("count audit %s: %v", eventType, err)
	}
	return n
}

// TestGoogleFlowNewUserCreatesOwner: a brand-new Google identity signs up —
// user row + oauth binding + org + branch, all in the normal signup path.
func TestGoogleFlowNewUserCreatesOwner(t *testing.T) {
	fake := newFakeGoogle(t, "google-sub-1", "google-owner@test.dev", "Google Owner")
	r, pool := newGoogleRouter(t, fake)

	w := googleBounce(t, r, "good", "", "")
	token, email := locationSession(t, w)
	if email != "google-owner@test.dev" {
		t.Errorf("session email = %q, want google-owner@test.dev", email)
	}

	// Profile hydrates from /auth/me with the Corporate Admin role.
	role, meEmail := meProfile(t, r, token)
	if role != "Corporate Admin" {
		t.Errorf("me role = %q, want Corporate Admin", role)
	}
	if meEmail != "google-owner@test.dev" {
		t.Errorf("me email = %q", meEmail)
	}

	// The account was created like an email signup: owner role, verified,
	// attached to an org + branch, and OAuth-trusted (no password).
	var userID, dbRole string
	var dbBranchID, dbOrgID *string
	var verified bool
	var passHash string
	if err := pool.QueryRow(context.Background(),
		`SELECT id::text, role, branch_id::text, organization_id::text, email_verified_at IS NOT NULL, password_hash
		 FROM users WHERE email = $1`, "google-owner@test.dev",
	).Scan(&userID, &dbRole, &dbBranchID, &dbOrgID, &verified, &passHash); err != nil {
		t.Fatalf("read google user: %v", err)
	}
	if dbRole != "Corporate Admin" {
		t.Errorf("role = %q, want Corporate Admin", dbRole)
	}
	if dbBranchID == nil || *dbBranchID == "" {
		t.Error("google owner not attached to a branch")
	}
	if dbOrgID == nil || *dbOrgID == "" {
		t.Error("google owner not attached to an organization")
	}
	if !verified {
		t.Error("google owner must be email-verified (Google owns verified addresses)")
	}
	if passHash != "" {
		t.Error("google owner must have no password hash")
	}

	// The binding is the stable key for the next sign-in.
	var providerSub string
	if err := pool.QueryRow(context.Background(),
		`SELECT provider_sub FROM oauth_accounts WHERE user_id = $1 AND provider = 'google'`, userID,
	).Scan(&providerSub); err != nil {
		t.Fatalf("oauth binding missing: %v", err)
	}
	if providerSub != "google-sub-1" {
		t.Errorf("provider_sub = %q, want google-sub-1", providerSub)
	}

	// The audit trail recorded the sign-up.
	if n := countAuditType(t, pool, "auth.google.signup"); n != 1 {
		t.Errorf("auth.google.signup audits = %d, want 1", n)
	}
}

// TestGoogleFlowExistingUserReusesAccount: the same Google identity signs in
// a second time — no duplicate account, fresh session, sign-in audited.
func TestGoogleFlowExistingUserReusesAccount(t *testing.T) {
	fake := newFakeGoogle(t, "google-sub-2", "returning-owner@test.dev", "Returning Owner")
	r, pool := newGoogleRouter(t, fake)

	// First trip creates the account.
	w1 := googleBounce(t, r, "good", "", "")
	tok1, _ := locationSession(t, w1)
	var firstID string
	if err := pool.QueryRow(context.Background(),
		`SELECT id::text FROM users WHERE email = $1`, "returning-owner@test.dev").Scan(&firstID); err != nil {
		t.Fatalf("get first user: %v", err)
	}

	// Second trip must reuse the exact same row.
	w2 := googleBounce(t, r, "good", "", "")
	tok2, _ := locationSession(t, w2)
	if tok2 == "" || tok1 == "" {
		t.Fatal("expected sessions on both trips")
	}
	var count int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM users WHERE email = $1`, "returning-owner@test.dev").Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 1 {
		t.Errorf("users with google email = %d, want exactly 1 (no duplicate signup)", count)
	}
	var secondID string
	if err := pool.QueryRow(context.Background(),
		`SELECT user_id::text FROM oauth_accounts WHERE provider = 'google' AND provider_sub = $1`, "google-sub-2").Scan(&secondID); err != nil {
		t.Fatalf("read binding: %v", err)
	}
	if secondID != firstID {
		t.Errorf("binding points at %s, want %s (same account)", secondID, firstID)
	}

	if n := countAuditType(t, pool, "auth.google.signup"); n != 1 {
		t.Errorf("auth.google.signup audits = %d, want 1 (only the first trip)", n)
	}
	if n := countAuditType(t, pool, "auth.google.login"); n != 2 {
		t.Errorf("auth.google.login audits = %d, want 2 (one per trip)", n)
	}

	// Both sessions belong to the account.
	role, _ := meProfile(t, r, tok2)
	if role != "Corporate Admin" {
		t.Errorf("second session role = %q, want Corporate Admin", role)
	}
}

// TestGoogleFlowLinksPasswordAccount: an email already owned by a password
// signup is LINKED (chosen collision policy) — the Google identity is bound to
// the existing account and signs into it, never a new one.
func TestGoogleFlowLinksPasswordAccount(t *testing.T) {
	fake := newFakeGoogle(t, "google-sub-3", "linked-owner@test.dev", "Linked Owner")
	r, pool := newGoogleRouter(t, fake)

	// Password owner first: the existing email-signup path.
	w := doReq(r, http.MethodPost, "/api/v1/auth/signup", "", map[string]string{
		"name": "Pass Owner", "email": "linked-owner@test.dev", "password": "ownerpass123",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("password signup returned %d: %s", w.Code, w.Body.String())
	}
	var passID string
	if err := pool.QueryRow(context.Background(),
		`SELECT id::text FROM users WHERE email = $1`, "linked-owner@test.dev").Scan(&passID); err != nil {
		t.Fatalf("get password user: %v", err)
	}

	// Google now signs in with the same email.
	gw := googleBounce(t, r, "good", "", "")
	gtok, _ := locationSession(t, gw)

	role, meEmail := meProfile(t, r, gtok)
	if role != "Corporate Admin" || meEmail != "linked-owner@test.dev" {
		t.Errorf("linked google session: role=%q email=%q", role, meEmail)
	}

	// The google identity is bound to the ORIGINAL password row — no dupe.
	var boundID string
	if err := pool.QueryRow(context.Background(),
		`SELECT user_id::text FROM oauth_accounts WHERE provider = 'google' AND provider_sub = $1`, "google-sub-3").Scan(&boundID); err != nil {
		t.Fatalf("oauth binding missing after link: %v", err)
	}
	if boundID != passID {
		t.Errorf("google bound to %s, want %s (the password account)", boundID, passID)
	}
	var users int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM users WHERE email = $1`, "linked-owner@test.dev").Scan(&users); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if users != 1 {
		t.Errorf("users = %d, want 1 (link must not create a second account)", users)
	}

	if n := countAuditType(t, pool, "auth.google.link"); n != 1 {
		t.Errorf("auth.google.link audits = %d, want 1", n)
	}
	if n := countAuditType(t, pool, "auth.google.signup"); n != 0 {
		t.Errorf("auth.google.signup audits = %d, want 0 (no new account on link)", n)
	}

	// Password sign-in still works after linking.
	w = doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"email": "linked-owner@test.dev", "password": "ownerpass123",
	})
	if w.Code != http.StatusOK {
		t.Errorf("password login after link returned %d, want 200", w.Code)
	}
}

// TestGoogleFlowRejectsInvalidInput: garbage codes and tampered state must
// never create or touch an account.
func TestGoogleFlowRejectsInvalidInput(t *testing.T) {
	fake := newFakeGoogle(t, "google-sub-4", "never-created@test.dev", "No Account")
	r, pool := newGoogleRouter(t, fake)

	t.Run("bad code", func(t *testing.T) {
		w := googleBounce(t, r, "bad", "", "")
		if w.Code != http.StatusBadGateway {
			t.Errorf("bad code returned %d, want 502", w.Code)
		}
	})

	t.Run("state mismatch", func(t *testing.T) {
		w := googleBounce(t, r, "good", "tampered-state", "")
		if w.Code != http.StatusBadRequest {
			t.Errorf("state mismatch returned %d, want 400", w.Code)
		}
	})

	t.Run("missing state cookie", func(t *testing.T) {
		w := googleBounce(t, r, "good", "", "oauth_state=stale")
		if w.Code != http.StatusBadRequest {
			t.Errorf("stale cookie returned %d, want 400", w.Code)
		}
	})

	var count int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM users WHERE email = $1`, "never-created@test.dev").Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 0 {
		t.Errorf("rejected flows created %d users, want 0", count)
	}
	if n := countAuditType(t, pool, "auth.google.signup"); n != 0 {
		t.Errorf("signup audits = %d for rejected flows, want 0", n)
	}
}
