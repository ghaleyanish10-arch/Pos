package handler_test

import (
	"context"
	"net/http"
	"testing"
)

// TestOrderTransferRealMove locks in the REAL table-transfer: PUT
// /api/v1/orders/:id/transfer moves the source table's WHOLE open tab, so the
// order-derived floor plan flips the source to Vacant (no order — that is the
// core requirement) and the target to Seated (with the transferred order's
// id/total/item count) on the very next poll.
func TestOrderTransferRealMove(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	source := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	if source.ID == "" {
		t.Fatal("no vacant seeded table to seat")
	}
	target := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != source.ID })
	if target.ID == "" {
		t.Fatal("no second vacant seeded table to transfer onto")
	}

	// TWO open orders share the source table (the system allows this): the
	// transfer must move BOTH so the source truly vacates.
	orderID := seatTable(t, r, token, source.ID, menuItemID, 2, 480)
	orderID2 := seatTable(t, r, token, source.ID, menuItemID, 1, 150)
	if orderID == orderID2 {
		t.Fatal("two seatings produced the same order id")
	}
	assertFloor(t, r, token, source.ID, "Seated")
	assertFloor(t, r, token, target.ID, "Open")

	w := doReq(r, http.MethodPut, "/api/v1/orders/"+orderID+"/transfer", token, map[string]string{"table_id": target.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("transfer returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Message     string `json:"message"`
		TableID     string `json:"table_id"`
		TableName   string `json:"table_name"`
		OrdersMoved int    `json:"orders_moved"`
	}
	jsonDecode(t, w.Body.Bytes(), &resp)
	if resp.Message != "order transferred" || resp.TableID != target.ID || resp.TableName != target.Name {
		t.Errorf("unexpected transfer response: %+v", resp)
	}
	if resp.OrdersMoved != 2 {
		t.Errorf("orders_moved = %d, want 2 (the whole tab)", resp.OrdersMoved)
	}

	// Source vacates: 'Open', no order id left anywhere on it.
	assertFloor(t, r, token, source.ID, "Open")
	src := floorTable(t, r, token, func(x derivedTable) bool { return x.ID == source.ID })
	if src.OrderID != nil {
		t.Errorf("source still carries order %q after transfer", *src.OrderID)
	}
	var leftOnSource int
	if err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM orders WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL`,
		source.ID).Scan(&leftOnSource); err != nil {
		t.Fatalf("count source orders: %v", err)
	}
	if leftOnSource != 0 {
		t.Errorf("source still has %d open orders after transfer", leftOnSource)
	}

	// Target carries the newest moved order's bill on the tile.
	tgt := floorTable(t, r, token, func(x derivedTable) bool { return x.ID == target.ID })
	if tgt.State != "Seated" {
		t.Fatalf("target state = %q, want Seated", tgt.State)
	}
	if tgt.OrderID == nil || (*tgt.OrderID != orderID && *tgt.OrderID != orderID2) {
		t.Errorf("target order id = %v, want one of the moved orders", tgt.OrderID)
	}

	// Both order rows and their KDS tags moved to the target.
	for _, oid := range []string{orderID, orderID2} {
		var gotTable string
		if err := pool.QueryRow(context.Background(), `SELECT table_id::text FROM orders WHERE id = $1`, oid).Scan(&gotTable); err != nil {
			t.Fatalf("read order %s table: %v", oid, err)
		}
		if gotTable != target.ID {
			t.Errorf("orders.table_id for %s = %q, want %q", oid, gotTable, target.ID)
		}
		var tag string
		if err := pool.QueryRow(context.Background(), `SELECT tag FROM kds_tickets WHERE order_id = $1`, oid).Scan(&tag); err != nil {
			t.Fatalf("read kds tag: %v", err)
		}
		if want := "Table " + target.Name; tag != want {
			t.Errorf("kds tag for %s = %q, want %q", oid, tag, want)
		}
	}
}

// TestOrderTransferGuard rails: a transfer must never strand two parties on
// one seat, move a closed or table-less order, cross branches, or go to a
// ghost table.
func TestOrderTransferGuard(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var menuItemID string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	openA := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	openB := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" && x.ID != openA.ID })
	if openA.ID == "" || openB.ID == "" {
		t.Fatal("need two vacant seeded tables")
	}

	orderA := seatTable(t, r, token, openA.ID, menuItemID, 1, 300)
	assertFloor(t, r, token, openA.ID, "Seated")

	// Occupied target: seat a second party, then refuse the move onto them.
	seatTable(t, r, token, openB.ID, menuItemID, 1, 450)
	w := doReq(r, http.MethodPut, "/api/v1/orders/"+orderA+"/transfer", token, map[string]string{"table_id": openB.ID})
	if w.Code != http.StatusConflict {
		t.Errorf("transfer onto occupied table returned %d, want 409: %s", w.Code, w.Body.String())
	}
	// The reject must not have touched the order.
	var stillOn string
	if err := pool.QueryRow(context.Background(), `SELECT table_id::text FROM orders WHERE id = $1`, orderA).Scan(&stillOn); err != nil {
		t.Fatalf("read order table: %v", err)
	}
	if stillOn != openA.ID {
		t.Errorf("order moved to %q despite rejection", stillOn)
	}

	// Same-table, missing table_id, ghost order and ghost target — all still
	// on the OPEN order so each guard fires exactly where it should.
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+orderA+"/transfer", token, map[string]string{"table_id": openA.ID})
	if w.Code != http.StatusBadRequest {
		t.Errorf("same-table transfer returned %d, want 400: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+orderA+"/transfer", token, map[string]string{})
	if w.Code != http.StatusBadRequest {
		t.Errorf("transfer without table_id returned %d, want 400: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/orders/00000000-0000-0000-0000-000000000000/transfer", token, map[string]string{"table_id": openB.ID})
	if w.Code != http.StatusNotFound {
		t.Errorf("transfer of ghost order returned %d, want 404: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+orderA+"/transfer", token, map[string]string{"table_id": "00000000-0000-0000-0000-000000000000"})
	if w.Code != http.StatusNotFound {
		t.Errorf("transfer to ghost table returned %d, want 404: %s", w.Code, w.Body.String())
	}

	// Closed order: closing the order, then any transfer must be refused.
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+orderA, token, map[string]string{"status": "closed"})
	if w.Code != http.StatusOK {
		t.Fatalf("close order returned %d: %s", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+orderA+"/transfer", token, map[string]string{"table_id": openB.ID})
	if w.Code != http.StatusConflict {
		t.Errorf("transfer of closed order returned %d, want 409: %s", w.Code, w.Body.String())
	}

	// Table-less order (takeaway) has no source to vacate.
	takeaway := doReq(r, http.MethodPost, "/api/v1/orders", token, map[string]any{
		"type": "takeaway",
		"items": []map[string]any{
			{"menu_item_id": menuItemID, "name": "Momo", "qty": 1, "price": 200},
		},
	})
	if takeaway.Code != http.StatusCreated {
		t.Fatalf("create takeaway returned %d: %s", takeaway.Code, takeaway.Body.String())
	}
	var tk struct {
		ID string `json:"id"`
	}
	jsonDecode(t, takeaway.Body.Bytes(), &tk)
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+tk.ID+"/transfer", token, map[string]string{"table_id": openB.ID})
	if w.Code != http.StatusBadRequest {
		t.Errorf("transfer of table-less order returned %d, want 400: %s", w.Code, w.Body.String())
	}

	// Cross-branch: a table in a second branch must be refused for an order
	// belonging to the first branch.
	var branchB string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO branches (name, status) VALUES ('Branch Xfer', 'Online') RETURNING id::text`).Scan(&branchB); err != nil {
		t.Fatal(err)
	}
	var foreign string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO floor_tables (name, branch_id, state, seats) VALUES ('TX-FOREIGN', $1, 'Open', 4) RETURNING id::text`,
		branchB).Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	orderC := seatTable(t, r, token, openB.ID, menuItemID, 1, 120)
	w = doReq(r, http.MethodPut, "/api/v1/orders/"+orderC+"/transfer", token, map[string]string{"table_id": foreign})
	if w.Code != http.StatusBadRequest {
		t.Errorf("cross-branch transfer returned %d, want 400: %s", w.Code, w.Body.String())
	}
}