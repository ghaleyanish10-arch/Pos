package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/router"
	"github.com/mesa-os/backend/internal/testutil"
)

// newTestRouter builds a fully wired gin engine (via router.Setup) over a
// freshly migrated+seeded disposable database. Skips when Postgres is down.
func newTestRouter(t *testing.T) (*gin.Engine, *pgxpool.Pool) {
	t.Helper()

	pool := testutil.NewTestPool(t, "mesa_os_handler_test")

	cfg := &config.Config{
		DatabaseURL:      "unused-in-tests",
		JWTSecret:        "handler-test-secret",
		JWTAccessExpiry:  15 * time.Minute,
		JWTRefreshExpiry: 24 * time.Hour,
		CORSOrigin:       "http://localhost:5173",
	}

	return router.Setup(pool, cfg), pool
}

func doReq(r *gin.Engine, method, path, token string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func loginAdmin(t *testing.T, r *gin.Engine) string {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": "admin@mesa.os", "password": "admin123"})
	if w.Code != http.StatusOK {
		t.Fatalf("admin login returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	if resp.Tokens.AccessToken == "" {
		t.Fatal("login response missing access_token")
	}
	return resp.Tokens.AccessToken
}

func TestHealthEndpoint(t *testing.T) {
	r, _ := newTestRouter(t)

	w := doReq(r, http.MethodGet, "/api/v1/health", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("health returned %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode health: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("health status = %q, want ok", body.Status)
	}
	if body.Message == "" {
		t.Error("health message is empty")
	}
}

func TestLoginEndpoint(t *testing.T) {
	r, _ := newTestRouter(t)

	t.Run("valid credentials", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": "admin@mesa.os", "password": "admin123"})
		if w.Code != http.StatusOK {
			t.Fatalf("login returned %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			User struct {
				Email string `json:"email"`
				Role  string `json:"role"`
			} `json:"user"`
			Tokens struct {
				AccessToken  string `json:"access_token"`
				RefreshToken string `json:"refresh_token"`
			} `json:"tokens"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode login: %v", err)
		}
		if resp.User.Email != "admin@mesa.os" || resp.User.Role != "Corporate Admin" {
			t.Errorf("unexpected user: %+v", resp.User)
		}
		if resp.Tokens.AccessToken == "" || resp.Tokens.RefreshToken == "" {
			t.Error("expected both tokens")
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": "admin@mesa.os", "password": "nope"})
		if w.Code != http.StatusUnauthorized {
			t.Errorf("wrong password returned %d, want 401", w.Code)
		}
	})

	t.Run("unknown user", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": "ghost@mesa.os", "password": "nope"})
		if w.Code != http.StatusUnauthorized {
			t.Errorf("unknown user returned %d, want 401", w.Code)
		}
	})

	t.Run("bad body", func(t *testing.T) {
		w := doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": ""})
		if w.Code != http.StatusBadRequest {
			t.Errorf("bad body returned %d, want 400", w.Code)
		}
	})
}

func TestProtectedRouteRequiresToken(t *testing.T) {
	r, _ := newTestRouter(t)

	w := doReq(r, http.MethodGet, "/api/v1/menu", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("protected route without token returned %d, want 401 (%s)", w.Code, w.Body.String())
	}

	w = doReq(r, http.MethodGet, "/api/v1/menu", "", "not-a-token")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("protected route with garbage token returned %d, want 401", w.Code)
	}
}

func TestMenuEndpoints(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var catID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_categories ORDER BY sort_order LIMIT 1`).Scan(&catID); err != nil {
		t.Fatalf("get category: %v", err)
	}

	// Create
	createBody := map[string]any{
		"name":        "Handler Test Item",
		"price":       155,
		"category_id": catID,
		"photo_url":   "https://example.com/img.png",
		"available":   true,
	}
	w := doReq(r, http.MethodPost, "/api/v1/menu", token, createBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("create item returned %d: %s", w.Code, w.Body.String())
	}
	var created struct {
		ID       string  `json:"id"`
		Name     string  `json:"name"`
		PhotoURL string  `json:"photo_url"`
		Price    float64 `json:"price"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.ID == "" || created.Name != "Handler Test Item" || created.PhotoURL != "https://example.com/img.png" || created.Price != 155 {
		t.Errorf("unexpected created item: %+v", created)
	}

	// List contains it
	w = doReq(r, http.MethodGet, "/api/v1/menu", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list items returned %d", w.Code)
	}
	var list struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	found := false
	for _, it := range list.Data {
		if it.ID == created.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("created item missing from list")
	}

	// Update
	updateBody := map[string]any{
		"name":      "Handler Test Item 2",
		"price":     160,
		"photo_url": "https://example.com/img2.png",
		"available": false,
	}
	w = doReq(r, http.MethodPut, "/api/v1/menu/"+created.ID, token, updateBody)
	if w.Code != http.StatusOK {
		t.Fatalf("update item returned %d: %s", w.Code, w.Body.String())
	}

	// Get by id reflects update
	w = doReq(r, http.MethodGet, "/api/v1/menu/"+created.ID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get item returned %d", w.Code)
	}
	var got struct {
		Name      string  `json:"name"`
		Price     float64 `json:"price"`
		PhotoURL  string  `json:"photo_url"`
		Available bool    `json:"available"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode item: %v", err)
	}
	if got.Name != "Handler Test Item 2" || got.Price != 160 || got.PhotoURL != "https://example.com/img2.png" || got.Available {
		t.Errorf("update not reflected: %+v", got)
	}

	// Delete, then 404
	w = doReq(r, http.MethodDelete, "/api/v1/menu/"+created.ID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete item returned %d: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodGet, "/api/v1/menu/"+created.ID, token, nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("deleted item returned %d, want 404", w.Code)
	}

	// Validation: missing name
	w = doReq(r, http.MethodPost, "/api/v1/menu", token, map[string]any{"price": 10})
	if w.Code != http.StatusBadRequest {
		t.Errorf("create without name returned %d, want 400", w.Code)
	}
}

func TestOrderFlowsToKDS(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	orderBody := map[string]any{
		"type": "dine-in",
		"items": []map[string]any{
			{"menu_item_id": menuItemID, "name": "Momo", "qty": 2, "price": 390},
			{"menu_item_id": menuItemID, "name": "Dal Bhat", "qty": 1, "price": 720},
		},
	}
	w := doReq(r, http.MethodPost, "/api/v1/orders", token, orderBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("create order returned %d: %s", w.Code, w.Body.String())
	}
	var order struct {
		ID    string  `json:"id"`
		Total float64 `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &order); err != nil {
		t.Fatalf("decode order: %v", err)
	}
	if order.ID == "" {
		t.Fatal("order has no id")
	}
	if order.Total != 2*390+720 {
		t.Errorf("order total = %v, want 1500", order.Total)
	}

	// A KDS ticket should exist in incoming state
	w = doReq(r, http.MethodGet, "/api/v1/kds/tickets", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list tickets returned %d: %s", w.Code, w.Body.String())
	}
	var tickets struct {
		Data []struct {
			ID      string `json:"id"`
			OrderID string `json:"order_id"`
			Status  string `json:"status"`
			Station string `json:"station"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &tickets); err != nil {
		t.Fatalf("decode tickets: %v", err)
	}
	var ticketID string
	for _, tk := range tickets.Data {
		if tk.OrderID == order.ID {
			ticketID = tk.ID
			if tk.Status != "incoming" || tk.Station != "Kitchen" {
				t.Errorf("unexpected ticket state: status=%q station=%q", tk.Status, tk.Station)
			}
		}
	}
	if ticketID == "" {
		t.Fatal("no KDS ticket created for order")
	}

	// Fire it
	w = doReq(r, http.MethodPut, "/api/v1/kds/tickets/"+ticketID+"/fire", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("fire ticket returned %d: %s", w.Code, w.Body.String())
	}

	// Now refund transaction for the order
	txBody := map[string]any{
		"order_id": order.ID,
		"ref":      "TXN-HTTP-1",
		"method":   "cash",
		"amount":   1500,
	}
	w = doReq(r, http.MethodPost, "/api/v1/transactions", token, txBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("create transaction returned %d: %s", w.Code, w.Body.String())
	}
}

func TestStoreSettingsEndpoints(t *testing.T) {
	r, _ := newTestRouter(t)
	token := loginAdmin(t, r)

	w := doReq(r, http.MethodGet, "/api/v1/store/settings", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get settings returned %d: %s", w.Code, w.Body.String())
	}

	updateBody := map[string]any{
		"theme": "dark",
		"payment_methods": []map[string]any{
			{"id": "cash", "enabled": true},
			{"id": "card", "enabled": true},
		},
	}
	w = doReq(r, http.MethodPut, "/api/v1/store/settings", token, updateBody)
	if w.Code != http.StatusOK {
		t.Fatalf("update settings returned %d: %s", w.Code, w.Body.String())
	}

	// Partial update must not wipe other columns / crash
	w = doReq(r, http.MethodPut, "/api/v1/store/settings", token, map[string]any{"theme": "light"})
	if w.Code != http.StatusOK {
		t.Fatalf("partial update returned %d: %s", w.Code, w.Body.String())
	}

	w = doReq(r, http.MethodGet, "/api/v1/store/settings", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get settings after update returned %d", w.Code)
	}
}

func TestRegisterEndpoint(t *testing.T) {
	r, _ := newTestRouter(t)
	token := loginAdmin(t, r)

	registerBody := map[string]any{
		"name":     "HTTP Cashier",
		"email":    "http-cashier@test.dev",
		"password": "password123",
		"role":     "Cashier",
	}
	w := doReq(r, http.MethodPost, "/api/v1/auth/register", token, registerBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("register returned %d: %s", w.Code, w.Body.String())
	}

	// Duplicate email
	w = doReq(r, http.MethodPost, "/api/v1/auth/register", token, registerBody)
	if w.Code != http.StatusBadRequest {
		t.Errorf("duplicate register returned %d, want 400", w.Code)
	}

	// Register requires Corporate Admin role
	cashierToken := registerCashier(t, r, token)
	w = doReq(r, http.MethodPost, "/api/v1/auth/register", cashierToken, map[string]any{
		"name": "C", "email": "c@test.dev", "password": "password123", "role": "Cashier",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-admin register returned %d, want 403", w.Code)
	}
}

func registerCashier(t *testing.T, r *gin.Engine, adminToken string) string {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/auth/register", adminToken, map[string]any{
		"name": "Role Test Cashier", "email": "role-cashier@test.dev", "password": "password123", "role": "Cashier",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("register cashier returned %d: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"email": "role-cashier@test.dev", "password": "password123"})
	if w.Code != http.StatusOK {
		t.Fatalf("cashier login returned %d", w.Code)
	}
	var resp struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode cashier login: %v", err)
	}
	return resp.Tokens.AccessToken
}
