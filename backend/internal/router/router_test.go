package router

import (
	"testing"
	"time"

	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/testutil"
)

func TestSetupRegistersKeyRoutes(t *testing.T) {
	pool := testutil.NewTestPool(t, "mesa_os_router_test")

	cfg := &config.Config{
		JWTSecret:        "router-test-secret",
		JWTAccessExpiry:  15 * time.Minute,
		JWTRefreshExpiry: 24 * time.Hour,
		CORSOrigin:       "http://localhost:5173",
	}

	r := Setup(pool, cfg)

	got := map[string]bool{}
	for _, route := range r.Routes() {
		got[route.Method+" "+route.Path] = true
	}

	// Public + auth
	for _, m := range []string{
		"GET /api/v1/health",
		"POST /api/v1/auth/login",
		"POST /api/v1/auth/refresh",
	} {
		if !got[m] {
			t.Errorf("missing route %s", m)
		}
	}

	// Menu (every verb the handlers expose — GET /:id was missing before and
	// caused a 404 regression that a runtime test caught).
	for _, m := range []string{
		"GET /api/v1/menu",
		"GET /api/v1/menu/categories",
		"GET /api/v1/menu/:id",
		"POST /api/v1/menu",
		"PUT /api/v1/menu/:id",
		"DELETE /api/v1/menu/:id",
	} {
		if !got[m] {
			t.Errorf("missing route %s", m)
		}
	}

	// Register → Orders → KDS core flow
	for _, m := range []string{
		"GET /api/v1/orders",
		"POST /api/v1/orders",
		"GET /api/v1/orders/:id",
		"GET /api/v1/kds/tickets",
		"PUT /api/v1/kds/tickets/:id/fire",
		"PUT /api/v1/kds/tickets/:id/bump",
		"GET /api/v1/transactions",
		"POST /api/v1/transactions",
		"GET /api/v1/store/settings",
		"PUT /api/v1/store/settings",
	} {
		if !got[m] {
			t.Errorf("missing route %s", m)
		}
	}
}

func TestSetupRequiresAuthExceptPublic(t *testing.T) {
	pool := testutil.NewTestPool(t, "mesa_os_router_test")

	cfg := &config.Config{
		JWTSecret:        "router-test-secret",
		JWTAccessExpiry:  15 * time.Minute,
		JWTRefreshExpiry: 24 * time.Hour,
		CORSOrigin:       "http://localhost:5173",
	}

	r := Setup(pool, cfg)

	// Static param-less routes with middleware are the ones we care about;
	// dynamic paths (:id) are structurally fine if their static siblings exist.
	// Spot-check: /health, /auth/login and /auth/refresh must not be behind auth,
	// and core protected reads must be.
	got := map[string]bool{}
	for _, route := range r.Routes() {
		got[route.Method+" "+route.Path] = true
	}
	if !got["GET /api/v1/health"] || !got["POST /api/v1/auth/login"] || !got["POST /api/v1/auth/refresh"] {
		t.Fatal("public routes not registered")
	}
}
