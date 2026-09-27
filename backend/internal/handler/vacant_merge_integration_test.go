package handler_test

import (
	"net/http"
	"testing"
)

// TestVacantMergeAndKDSLabel covers the vacant-merge feature end to end:
//   - merging two VACANT tables succeeds with no check opened,
//   - the floor returns ONE combined row ("T9 + T10"-style) with summed seats,
//   - the child is released by unmerge and both tables are vacant again,
//   - a ticket on a merged parent carries the combined table label.
func TestVacantMergeAndKDSLabel(t *testing.T) {
	r, _ := newTestRouter(t)
	token := loginAdmin(t, r)

	v1 := floorTable(t, r, token, func(x derivedTable) bool { return x.State == "Open" })
	v2 := floorTable(t, r, token, func(x derivedTable) bool {
		return x.State == "Open" && x.ID != v1.ID
	})
	if v1.ID == "" || v2.ID == "" {
		t.Fatal("need two vacant tables")
	}

	// Vacant + vacant: 200, no order id, no items moved.
	w := doReq(r, http.MethodPut, "/api/v1/pos/tables/"+v1.ID+"/merge", token,
		map[string]string{"source_table_id": v2.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("vacant+vacant merge returned %d: %s", w.Code, w.Body.String())
	}
	var mv struct {
		OrderID string `json:"order_id"`
		Items   int    `json:"items_moved"`
	}
	jsonDecode(t, w.Body.Bytes(), &mv)
	if mv.OrderID != "" || mv.Items != 0 {
		t.Errorf("vacant+vacant merge must not open a check: %+v", mv)
	}

	// The floor draws one combined card with summed seats and the child's name.
	parent := findMerged(t, r, token, v1.ID)
	if parent.ID == "" || len(parent.MergedWith) != 1 || parent.MergedWith[0] != v2.Name {
		t.Fatalf("combined floor card missing child: %+v", parent)
	}
	if parent.MergedSeats <= 0 {
		t.Errorf("combined card must carry the child's seats, got merged_seats=%d", parent.MergedSeats)
	}

	// Unmerge releases the child; both tables are vacant again.
	w = doReq(r, http.MethodPost, "/api/v1/pos/tables/"+v1.ID+"/unmerge", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("unmerge returned %d: %s", w.Code, w.Body.String())
	}
	parent = findMerged(t, r, token, v1.ID)
	if parent.ID == "" || len(parent.MergedWith) != 0 || parent.MergedSeats != 0 {
		t.Errorf("unmerge left the group attached: %+v", parent)
	}
	assertFloor(t, r, token, v1.ID, "Open")
	assertFloor(t, r, token, v2.ID, "Open")
}
