package handler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

// mergedFloorTable is the floor-plane row shape for merge assertions: the
// derived occupancy fields plus the merged-group info the parent row now
// carries (children excluded from the listing, their names/seats on the head).
type mergedFloorTable struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Seats       int      `json:"seats"`
	State       string   `json:"state"`
	OrderID     *string  `json:"order_id"`
	OrderTotal  float64  `json:"order_total"`
	ItemCount   int      `json:"item_count"`
	MergedWith  []string `json:"merged_with"`
	MergedSeats int      `json:"merged_seats"`
}

func listAll(t *testing.T, r *gin.Engine, token string) []mergedFloorTable {
	t.Helper()
	w := doReq(r, http.MethodGet, "/api/v1/tables", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list tables returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []mergedFloorTable `json:"data"`
	}
	jsonDecode(t, w.Body.Bytes(), &resp)
	return resp.Data
}

func findMerged(t *testing.T, r *gin.Engine, token, id string) mergedFloorTable {
	t.Helper()
	for _, td := range listAll(t, r, token) {
		if td.ID == id {
			return td
		}
	}
	return mergedFloorTable{}
}

// TestTableMergeCombinesAndUnlinks locks in the REAL merge lifecycle: two
// occupied tables fold into ONE combined check and ONE floor card ("T8 + T9"),
// items/total consolidate, the source order closes as 'merged', the source
// table disappears from the listing (rendered as a single spanning card), and
// paying off the combined check unlinks BOTH tables back to independent vacant.
func TestTableMergeCombinesAndUnlinks(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	a := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	b := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != a.ID })

	orderA := seatTable(t, r, token, a.ID, menuItemID, 2, 480) // 960
	orderB := seatTable(t, r, token, b.ID, menuItemID, 1, 150) // 150
	assertFloor(t, r, token, a.ID, "Seated")
	assertFloor(t, r, token, b.ID, "Seated")

	// Fold A into B.
	w := doReq(r, http.MethodPut, "/api/v1/pos/tables/"+b.ID+"/merge", token, map[string]string{"source_table_id": a.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("merge returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Message        string `json:"message"`
		TargetTableID  string `json:"target_table_id"`
		SourceTableID  string `json:"source_table_id"`
		OrderID        string `json:"order_id"`
		ItemsMoved     int    `json:"items_moved"`
	}
	jsonDecode(t, w.Body.Bytes(), &resp)
	if resp.Message != "tables merged" || resp.TargetTableID != b.ID || resp.SourceTableID != a.ID {
		t.Errorf("unexpected merge response: %+v", resp)
	}
	if resp.OrderID != orderB {
		t.Errorf("combined order = %q, want target's open order %q", resp.OrderID, orderB)
	}
	if resp.ItemsMoved != 1 {
		t.Errorf("items_moved = %d, want 1 (the single 2× item row)", resp.ItemsMoved)
	}

	// Source order is closed down with the distinguishable 'merged' status;
	// the target order stays open and is the surviving combined check.
	orderStatus(t, pool, orderA, "merged")
	orderStatus(t, pool, orderB, "open")

	// Items consolidated under ONE check; both totals recomputed server-side.
	var srcItems, tgtItems int
	var srcSum, tgtSum float64
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*), COALESCE(SUM(price*qty), 0) FROM order_items WHERE order_id = $1`, orderA).Scan(&srcItems, &srcSum); err != nil {
		t.Fatalf("count source items: %v", err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*), COALESCE(SUM(price*qty), 0) FROM order_items WHERE order_id = $1`, orderB).Scan(&tgtItems, &tgtSum); err != nil {
		t.Fatalf("count target items: %v", err)
	}
	if srcItems != 0 {
		t.Errorf("source order still holds %d items after merge", srcItems)
	}
	if tgtItems != 2 || tgtSum != 1110 {
		t.Errorf("combined order items = %d sum = %.0f, want 2 rows summing 1110", tgtItems, tgtSum)
	}
	var storedTotal float64
	if err := pool.QueryRow(context.Background(), `SELECT total FROM orders WHERE id = $1`, orderB).Scan(&storedTotal); err != nil {
		t.Fatalf("read combined total: %v", err)
	}
	if storedTotal != 1110 {
		t.Errorf("combined order total = %.0f, want 1110", storedTotal)
	}

	// Kitchen tickets follow the food to the combined table.
	var wrongTag int
	if err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM kds_tickets WHERE order_id = $1 AND tag <> 'Table ' || $2`,
		orderB, b.Name).Scan(&wrongTag); err != nil {
		t.Fatalf("count mismatched tickets: %v", err)
	}
	if wrongTag != 0 {
		t.Errorf("%d kds tickets not relabelled to %q", wrongTag, "Table "+b.Name)
	}
	var movedTicketCount int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM kds_tickets WHERE order_id = $1`, orderB).Scan(&movedTicketCount); err != nil {
		t.Fatalf("count tickets: %v", err)
	}
	if movedTicketCount != 2 {
		t.Errorf("combined order has %d kds tickets, want 2 (both parties)", movedTicketCount)
	}

	// Floor: B is the head of ONE merged group carrying A's name + seats; A is
	// no longer an independent row (the frontend renders one spanning card).
	srcSeats := findMerged(t, r, token, a.ID).Seats
	merged := findMerged(t, r, token, b.ID)
	if merged.ID == "" {
		t.Fatal("target table missing from floor after merge")
	}
	if merged.State != "Seated" {
		t.Errorf("merged head state = %q, want Seated", merged.State)
	}
	if len(merged.MergedWith) != 1 || merged.MergedWith[0] != a.Name {
		t.Errorf("merged_with = %v, want [%q]", merged.MergedWith, a.Name)
	}
	if merged.MergedSeats != srcSeats {
		t.Errorf("merged_seats = %d, want %d (source's seats)", merged.MergedSeats, srcSeats)
	}
	for _, td := range listAll(t, r, token) {
		if td.ID == a.ID {
			t.Errorf("merged-away source %s still listed as an independent row", a.Name)
		}
	}

	// Natural end: fully paying the combined check turns BOTH tables over.
	w = doReq(r, http.MethodPost, "/api/v1/transactions", token, map[string]any{
		"order_id": orderB, "method": "cash", "amount": 1110, "ref": "TXN-MERGE-1",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("pay combined order returned %d: %s", w.Code, w.Body.String())
	}
	var pay struct {
		OrderClosed bool `json:"order_closed"`
	}
	jsonDecode(t, w.Body.Bytes(), &pay)
	if !pay.OrderClosed {
		t.Error("full payment of the combined check did not close the order")
	}
	orderStatus(t, pool, orderB, "closed")

	// Both tables independently vacant again; the link is gone.
	assertFloor(t, r, token, a.ID, "Open")
	assertFloor(t, r, token, b.ID, "Open")
	var link *string
	if err := pool.QueryRow(context.Background(), `SELECT merged_into::text FROM floor_tables WHERE id = $1`, a.ID).Scan(&link); err != nil {
		t.Fatalf("read source merged_into: %v", err)
	}
	if link != nil {
		t.Errorf("source table still merged_into %q after close", *link)
	}
}

// TestTableMergeGuard rails every rejection path and the target-vacant fold
// (an occupied source merged into an empty target creates the combined check).
func TestTableMergeGuard(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	openA := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	openB := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != openA.ID })
	openC := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != openA.ID && x.ID != openB.ID })
	seatTable(t, r, token, openA.ID, menuItemID, 1, 300)
	assertFloor(t, r, token, openA.ID, "Seated")

	// Same-table merge is meaningless.
	w := doReq(r, http.MethodPut, "/api/v1/pos/tables/"+openA.ID+"/merge", token, map[string]string{"source_table_id": openA.ID})
	if w.Code != http.StatusBadRequest {
		t.Errorf("same-table merge returned %d, want 400: %s", w.Code, w.Body.String())
	}

	// Ghost source / ghost target / missing body.
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+openB.ID+"/merge", token, map[string]string{"source_table_id": "00000000-0000-0000-0000-000000000000"})
	if w.Code != http.StatusNotFound {
		t.Errorf("merge of ghost source returned %d, want 404: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/00000000-0000-0000-0000-000000000000/merge", token, map[string]string{"source_table_id": openA.ID})
	if w.Code != http.StatusNotFound {
		t.Errorf("merge into ghost target returned %d, want 404: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+openB.ID+"/merge", token, map[string]string{})
	if w.Code != http.StatusBadRequest {
		t.Errorf("merge without source_table_id returned %d, want 400: %s", w.Code, w.Body.String())
	}

	// Source without any open order has nothing to fold.
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+openA.ID+"/merge", token, map[string]string{"source_table_id": openC.ID})
	if w.Code != http.StatusBadRequest {
		t.Errorf("merge of unoccupied source returned %d, want 400: %s", w.Code, w.Body.String())
	}

	// Target-vacant fold: the combined check is CREATED on the empty target.
	// openA is used because it is guaranteed to hold exactly ONE open order
	// (the one seated above) — a seeded "Seated" table might already host one.
	vacantE := floorTable(t, r, token, func(x derivedTable) bool {
		return x.State == "Open" && x.ID != openA.ID && x.ID != openB.ID && x.ID != openC.ID
	})
	if vacantE.ID == "" {
		t.Fatal("need a vacant table for the target-vacant fold")
	}
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+vacantE.ID+"/merge", token, map[string]string{"source_table_id": openA.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("target-vacant merge returned %d: %s", w.Code, w.Body.String())
	}
	var ev struct {
		OrderID string `json:"order_id"`
		Items   int    `json:"items_moved"`
	}
	jsonDecode(t, w.Body.Bytes(), &ev)
	if ev.OrderID == "" || ev.Items != 1 {
		t.Errorf("target-vacant merge response odd: %+v", ev)
	}
	assertFloor(t, r, token, vacantE.ID, "Seated")
	merged := findMerged(t, r, token, vacantE.ID)
	if merged.ID == "" || len(merged.MergedWith) != 1 || merged.MergedWith[0] != openA.Name {
		t.Errorf("target-vacant fold not reflected on floor: %+v", merged)
	}

	// A MERGED table (parent OR child) cannot merge again.
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+vacantE.ID+"/merge", token, map[string]string{"source_table_id": openB.ID})
	if w.Code != http.StatusConflict {
		t.Errorf("merge onto existing merged parent returned %d, want 409: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+openB.ID+"/merge", token, map[string]string{"source_table_id": openA.ID})
	if w.Code != http.StatusConflict {
		t.Errorf("merge of already-merged child returned %d, want 409: %s", w.Code, w.Body.String())
	}

	// A source holding MULTIPLE open checks has no single check to fold.
	multi := floorTable(t, r, token, func(x derivedTable) bool { return x.State != "Seated" && x.State != "Check dropped" && x.ID != openB.ID && x.ID != openC.ID && x.ID != vacantE.ID })
	targetG := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != openA.ID && x.ID != openB.ID && x.ID != openC.ID && x.ID != vacantE.ID && x.ID != multi.ID })
	if multi.ID == "" || targetG.ID == "" {
		t.Fatal("need a fresh table pair for the multi-order guard")
	}
	seatTable(t, r, token, multi.ID, menuItemID, 1, 120)
	seatTable(t, r, token, multi.ID, menuItemID, 1, 160)
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+targetG.ID+"/merge", token, map[string]string{"source_table_id": multi.ID})
	if w.Code != http.StatusConflict {
		t.Errorf("merge of multi-order source returned %d, want 409: %s", w.Code, w.Body.String())
	}

	// Cross-branch merge is refused exactly like a cross-branch transfer.
	var branchB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO branches (name, status) VALUES ('Branch Merge', 'Online') RETURNING id::text`).Scan(&branchB); err != nil {
		t.Fatal(err)
	}
	var foreign string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO floor_tables (name, branch_id, state, seats) VALUES ('TM-FOREIGN', $1, 'Open', 4) RETURNING id::text`,
		branchB).Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	seatTable(t, r, token, foreign, menuItemID, 1, 90)
	home := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != openA.ID && x.ID != openB.ID && x.ID != openC.ID && x.ID != vacantE.ID && x.ID != targetG.ID })
	if home.ID == "" {
		t.Fatal("need a vacant home-branch table for the cross-branch guard")
	}
	w = doReq(r, http.MethodPut, "/api/v1/pos/tables/"+home.ID+"/merge", token, map[string]string{"source_table_id": foreign})
	if w.Code != http.StatusBadRequest {
		t.Errorf("cross-branch merge returned %d, want 400: %s", w.Code, w.Body.String())
	}
}