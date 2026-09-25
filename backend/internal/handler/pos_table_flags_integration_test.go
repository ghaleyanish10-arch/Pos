package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

// Integration coverage for the DERIVED FOH table states ('Check dropped' and
// 'Needs attention') and their backing endpoints, all through the HTTP stack
// against a disposable DB:
//
//	GET  /api/v1/tables                      derivation (ListTables)
//	POST /api/v1/pos/tables/:id/drop-check / clear-check / flag / unflag
//	PUT  /api/v1/pos/tables/:id/close        resets both flags on turnover
//
// Precedence under test:
//
//	needs_attention + note -> 'Needs attention' (always wins; bill_dropped
//	                          survives beneath it)
//	bill_dropped + open order -> 'Check dropped' (beats open-order 'Seated')
//	open order only -> 'Seated'
//	neither -> stored manual state / 'Open'
func TestTableFlagStates(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	seatTable := func(tableID string) {
		t.Helper()
		w := doReq(r, http.MethodPost, "/api/v1/orders", token, map[string]any{
			"type":     "dine-in",
			"table_id": tableID,
			"items": []map[string]any{
				{"menu_item_id": menuItemID, "name": "Momo", "qty": 1, "price": 100},
			},
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("seat table %s: %d: %s", tableID, w.Code, w.Body.String())
		}
	}

	flagResp := func(method, path string, body any) derivedTable {
		t.Helper()
		w := doReq(r, method, path, token, body)
		if w.Code != http.StatusOK {
			t.Fatalf("%s %s returned %d: %s", method, path, w.Code, w.Body.String())
		}
		var resp struct {
			Data derivedTable `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode %s %s: %v", method, path, err)
		}
		return resp.Data
	}

	// --- regression: the flag alone is NOT 'Check dropped' without an order ---
	t2 := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	if t2.ID == "" {
		t.Fatal("no vacant seeded table to test against")
	}

	dt := flagResp(http.MethodPost, "/api/v1/pos/tables/"+t2.ID+"/drop-check", nil)
	if dt.State != "Open" {
		t.Errorf("drop-check on vacant table derived %q, want Open (flag stored, no order)", dt.State)
	}
	if !dt.BillDropped {
		t.Error("drop-check on vacant table did not store bill_dropped flag")
	}

	seatTable(t2.ID)
	assertFloor(t, r, token, t2.ID, "Check dropped") // flag + open order beats seat-only

	dt = flagResp(http.MethodPost, "/api/v1/pos/tables/"+t2.ID+"/clear-check", nil)
	if dt.State != "Seated" || dt.BillDropped {
		t.Errorf("clear-check derived %q bill_dropped=%v, want Seated false", dt.State, dt.BillDropped)
	}

	// unknown ids are a 404, never a false success
	if w := doReq(r, http.MethodPost, "/api/v1/pos/tables/00000000-0000-0000-0000-000000000000/drop-check", token, nil); w.Code != http.StatusNotFound {
		t.Errorf("drop-check on unknown table returned %d, want 404", w.Code)
	}
	if w := doReq(r, http.MethodPost, "/api/v1/pos/tables/00000000-0000-0000-0000-000000000000/flag", token, map[string]string{"note": "nope"}); w.Code != http.StatusNotFound {
		t.Errorf("flag on unknown table returned %d, want 404", w.Code)
	}

	// closing turns the order over AND resets the flag
	if w := doReq(r, http.MethodPut, "/api/v1/pos/tables/"+t2.ID+"/close", token, nil); w.Code != http.StatusOK {
		t.Fatalf("close %s returned %d: %s", t2.ID, w.Code, w.Body.String())
	}
	assertFloor(t, r, token, t2.ID, "Open")

	// --- full lifecycle on a fresh table ---------------------------------------
	t1 := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != t2.ID })
	if t1.ID == "" {
		t.Fatalf("need a second vacant table, only found %+v", t2)
	}

	seatTable(t1.ID)
	assertFloor(t, r, token, t1.ID, "Seated")

	dt = flagResp(http.MethodPost, "/api/v1/pos/tables/"+t1.ID+"/drop-check", nil)
	if dt.State != "Check dropped" || !dt.BillDropped {
		t.Errorf("drop-check derived %q bill_dropped=%v, want Check dropped true", dt.State, dt.BillDropped)
	}
	assertFloor(t, r, token, t1.ID, "Check dropped")

	// the flag wins the badge while bill_dropped survives underneath
	dt = flagResp(http.MethodPost, "/api/v1/pos/tables/"+t1.ID+"/flag", map[string]string{"note": "peanuts allergy"})
	if dt.State != "Needs attention" || !dt.NeedsAttention || !dt.BillDropped || dt.AttentionNote != "peanuts allergy" {
		t.Errorf("flag derived %q attention=%v dropped=%v note=%q", dt.State, dt.NeedsAttention, dt.BillDropped, dt.AttentionNote)
	}
	assertFloor(t, r, token, t1.ID, "Needs attention")

	// clearing the check must NOT drop the needs-attention badge
	dt = flagResp(http.MethodPost, "/api/v1/pos/tables/"+t1.ID+"/clear-check", nil)
	if dt.State != "Needs attention" || dt.BillDropped || !dt.NeedsAttention {
		t.Errorf("clear-check under flag derived %q dropped=%v, want Needs attention false", dt.State, dt.BillDropped)
	}
	if dt.AttentionNote != "peanuts allergy" {
		t.Errorf("clear-check wiped the note: %q", dt.AttentionNote)
	}

	// unflag -> plain seated again (order still open)
	dt = flagResp(http.MethodPost, "/api/v1/pos/tables/"+t1.ID+"/unflag", nil)
	if dt.State != "Seated" || dt.NeedsAttention {
		t.Errorf("unflag derived %q attention=%v, want Seated false", dt.State, dt.NeedsAttention)
	}
	assertFloor(t, r, token, t1.ID, "Seated")

	// closure resets both flags to a clean turnover
	if w := doReq(r, http.MethodPut, "/api/v1/pos/tables/"+t1.ID+"/close", token, nil); w.Code != http.StatusOK {
		t.Fatalf("close %s returned %d: %s", t1.ID, w.Code, w.Body.String())
	}
	assertFloor(t, r, token, t1.ID, "Open")
	var dropped, attention bool
	var note string
	if err := pool.QueryRow(context.Background(),
		`SELECT bill_dropped, needs_attention, attention_note FROM floor_tables WHERE id = $1`, t1.ID,
	).Scan(&dropped, &attention, &note); err != nil {
		t.Fatalf("read flags after close: %v", err)
	}
	if dropped || attention || note != "" {
		t.Errorf("close did not reset flags: dropped=%v attention=%v note=%q", dropped, attention, note)
	}
}

type derivedTable struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	State          string  `json:"state"`
	BillDropped    bool    `json:"bill_dropped"`
	NeedsAttention bool    `json:"needs_attention"`
	AttentionNote  string  `json:"attention_note"`
	OrderID        *string `json:"order_id"`
	OrderTotal     float64 `json:"order_total"`
	ItemCount      int     `json:"item_count"`
}

// floorTable fetches the floor and returns the first table matching want, or
// an empty derivedTable when none match.
func floorTable(t *testing.T, r *gin.Engine, token string, want func(derivedTable) bool) derivedTable {
	t.Helper()
	w := doReq(r, http.MethodGet, "/api/v1/tables", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list tables returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []derivedTable `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tables: %v", err)
	}
	for _, td := range resp.Data {
		if want(td) {
			return td
		}
	}
	return derivedTable{}
}

// assertFloor checks the LIVE floor state for a table by id.
func assertFloor(t *testing.T, r *gin.Engine, token, id, want string) {
	t.Helper()
	td := floorTable(t, r, token, func(x derivedTable) bool { return x.ID == id })
	if td.ID == "" {
		t.Fatalf("table %s missing from floor", id)
	}
	if td.State != want {
		t.Errorf("floor state for %s = %q, want %q", td.Name, td.State, want)
	}
}
