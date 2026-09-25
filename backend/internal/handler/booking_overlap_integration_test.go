package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"sync"
	"testing"
	"time"
)

// TestReservationOverlapConcurrency is the regression test for the booking
// overlap guard: two near-simultaneous POST /reservations for the SAME table
// and OVERLAPPING windows must serialize so only one lands. Before the
// advisory xact lock this raced — both transactions observed an empty window
// and double-booked the table.
func TestReservationOverlapConcurrency(t *testing.T) {
	r, pool := newTestRouter(t)
	token := loginAdmin(t, r)

	var resp struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	w := doReq(r, http.MethodGet, "/api/v1/tables", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list tables returned %d: %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data) == 0 {
		t.Fatal("no floor tables seeded")
	}
	tableID := resp.Data[0].ID

	start := time.Now().UTC().Add(1 * time.Hour).Format(time.RFC3339)
	body := map[string]any{
		"guest_name": "Overlap Race Guest",
		"covers":     2,
		"table_id":   tableID,
		"start_time": start,
		"duration":   60,
	}

	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- doReq(r, http.MethodPost, "/api/v1/reservations", token, body).Code
		}()
	}
	wg.Wait()
	close(codes)

	got := map[int]int{}
	for c := range codes {
		got[c]++
	}

	want := map[int]int{http.StatusCreated: 1, http.StatusConflict: 1}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("concurrent overlap codes = %v, want one 201 and one 409", got)
	}

	var active int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM reservations WHERE table_id = $1 AND status NOT IN ('Cancelled','Completed')`,
		tableID).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != 1 {
		t.Fatalf("expected exactly 1 active reservation on the table, got %d", active)
	}
}