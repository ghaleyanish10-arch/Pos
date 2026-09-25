package handler_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Regression coverage for tables auto-vacating after FULL payment:
//
//	POST /api/v1/transactions  ->  order closes ONLY once the running sum of
//	                              successful payments reaches the order total,
//	                              so the floor (GET /api/v1/tables, order-derived
//	                              occupancy) flips the tile back to 'Open'.
//
// Two paths are locked in:
//  1. A single payment for the whole bill closes the order in the DB AND the
//     table derives 'Open' immediately (not after a poll).
//  2. A 3-way split: each partial share keeps the order 'open' and the table
//     'Seated'; only the final share closes it and frees the table. Paying
//     again after close is refused by the over-payment guard.
func TestPaymentAutoVacatesTableSingle(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	table := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	if table.ID == "" {
		t.Fatal("no vacant seeded table to test against")
	}

	orderID := seatTable(t, r, token, table.ID, menuItemID, 1, 300)
	assertFloor(t, r, token, table.ID, "Seated")

	// Full payment in one shot: the final rupee lands, so it must close.
	w := doReq(r, http.MethodPost, "/api/v1/transactions", token, map[string]any{
		"order_id": orderID, "method": "cash", "amount": 300, "ref": "TXN-AUTO-1",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("pay returned %d: %s", w.Code, w.Body.String())
	}
	var pay struct {
		OrderClosed bool   `json:"order_closed"`
		Warning     string `json:"warning"`
	}
	jsonDecode(t, w.Body.Bytes(), &pay)
	if !pay.OrderClosed {
		t.Error("single full payment did not close the order (order_closed=false)")
	}
	if pay.Warning != "" {
		t.Errorf("single full payment surfaced a warning: %q", pay.Warning)
	}

	orderStatus(t, pool, orderID, "closed")
	assertFloor(t, r, token, table.ID, "Open")
}

func TestPaymentAutoVacatesTableSplit(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	table := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	if table.ID == "" {
		t.Fatal("no vacant seeded table to test against")
	}

	// Three shares of 100 each against a 300 bill.
	orderID := seatTable(t, r, token, table.ID, menuItemID, 3, 100)
	assertFloor(t, r, token, table.ID, "Seated")

	for i := 1; i <= 2; i++ {
		w := doReq(r, http.MethodPost, "/api/v1/transactions", token, map[string]any{
			"order_id": orderID, "method": "card", "amount": 100,
			"ref": "TXN-SPLIT-" + strconv.Itoa(i),
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("partial share %d returned %d: %s", i, w.Code, w.Body.String())
		}
		var pay struct {
			OrderClosed bool `json:"order_closed"`
		}
		jsonDecode(t, w.Body.Bytes(), &pay)
		if pay.OrderClosed {
			t.Fatalf("partial share %d closed the order prematurely", i)
		}
		orderStatus(t, pool, orderID, "open")
		assertFloor(t, r, token, table.ID, "Seated")
	}

	// The LAST share settles the remaining rupee: order closes, table vacates.
	w := doReq(r, http.MethodPost, "/api/v1/transactions", token, map[string]any{
		"order_id": orderID, "method": "cash", "amount": 100, "ref": "TXN-SPLIT-3",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("final share returned %d: %s", w.Code, w.Body.String())
	}
	var pay struct {
		OrderClosed bool `json:"order_closed"`
	}
	jsonDecode(t, w.Body.Bytes(), &pay)
	if !pay.OrderClosed {
		t.Error("final split share did not close the order")
	}
	orderStatus(t, pool, orderID, "closed")
	assertFloor(t, r, token, table.ID, "Open")

	// The over-payment guard still bites on the now-closed order.
	w = doReq(r, http.MethodPost, "/api/v1/transactions", token, map[string]any{
		"order_id": orderID, "method": "cash", "amount": 50, "ref": "TXN-SPLIT-4",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("extra share after close returned %d, want 400 (over-payment guard)", w.Code)
	}
}

// --- helpers for this test ---

// seatTable creates a dine-in order on a table via the HTTP stack and returns
// the order id. The handler seeds the total from qty*price, so the bill is
// exactly what the caller dictates.
func seatTable(t *testing.T, r *gin.Engine, token, tableID, menuItemID string, qty, price int) string {
	t.Helper()
	w := doReq(r, http.MethodPost, "/api/v1/orders", token, map[string]any{
		"type":     "dine-in",
		"table_id": tableID,
		"items": []map[string]any{
			{"menu_item_id": menuItemID, "name": "Momo", "qty": qty, "price": price},
		},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("seat table %s: %d: %s", tableID, w.Code, w.Body.String())
	}
	var order struct {
		ID string `json:"id"`
	}
	jsonDecode(t, w.Body.Bytes(), &order)
	if order.ID == "" {
		t.Fatal("order create returned no id")
	}
	return order.ID
}

func orderStatus(t *testing.T, pool *pgxpool.Pool, orderID, want string) {
	t.Helper()
	var status string
	if err := pool.QueryRow(context.Background(),
		`SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("read order status: %v", err)
	}
	if status != want {
		t.Errorf("order status = %q, want %q", status, want)
	}
}

func jsonDecode(t *testing.T, b []byte, v any) {
	t.Helper()
	if err := jsonUnmarshal(b, v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}