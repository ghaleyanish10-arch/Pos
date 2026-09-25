package repo

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

// ErrTableAlreadyReserved is returned when a new reservation overlaps an
// existing active one on the same table — a double-booked table.
var ErrTableAlreadyReserved = errors.New("table already has a reservation in that time window")

type BookingRepo struct {
	db *pgxpool.Pool
}

func NewBookingRepo(db *pgxpool.Pool) *BookingRepo {
	return &BookingRepo{db: db}
}

// ListTables returns every floor table with its occupancy DERIVED from open
// orders rather than from the FloorTable.State column it was seeded with:
// `orders WHERE status='open' AND deleted_at IS NULL` is the single source of
// truth for whether a table is seated. This is what keeps the floor in sync —
// a register charge or a table-QR order immediately seats the table, and only
// an explicit "close table" (which flips the open orders to 'closed') turns it
// back to Vacant, on every device, with no drift.
// floorTableColumns is the shared SELECT list that DERIVES a floor table's
// state from its stored flags and newest open order. ListTables and GetTable
// both use it so the floor plan and any single-table response always agree.
// Precedence (confirmed with the operator):
//   1. needs_attention            -> 'Needs attention' — a manual flag always
//                                    wins, so an open flag can never be buried
//                                    behind another state; bill_dropped stays
//                                    set beneath it for the 'Check out' hint.
//   2. bill_dropped + open order  -> 'Check dropped' — the waiter dropped the
//                                    paper check while the table is still
//                                    being served.
//   3. any open order             -> 'Seated'.
//   4. otherwise the stored manual state passes through ('Reserved', a legacy
//      'Needs attention'/'Check dropped', 'Open'), with a stale stored
//      'Seated' demoted to 'Open' — occupancy is order-derived.
const floorTableColumns = `
	ft.id, ft.name, ft.seats,
	CASE
	    WHEN COALESCE(ft.needs_attention, false) THEN 'Needs attention'
	    WHEN o.id IS NOT NULL AND COALESCE(ft.bill_dropped, false) THEN 'Check dropped'
	    WHEN o.id IS NOT NULL THEN 'Seated'
	    ELSE CASE WHEN ft.state IN ('Reserved', 'Needs attention', 'Check dropped', 'Open')
	              THEN ft.state ELSE 'Open' END
	END AS state,
	COALESCE(ft.detail, ''), ft.branch_id::text,
	o.id, COALESCE(o.total, 0), COALESCE(items.cnt, 0),
	COALESCE(ft.bill_dropped, false), COALESCE(ft.needs_attention, false), COALESCE(ft.attention_note, ''),
	m.merged_names::text[], COALESCE(m.merged_seats, 0)`

// floorTableFrom is the sharing clause: the newest open order on a table
// (single source of truth for occupancy) plus its line-item count. The
// merged lateral gathers the names/seats of any tables merged INTO this one,
// so a merged group is returned as ONE row (the children are filtered out in
// ListTables) carrying everything the frontend needs to draw a single card.
const floorTableFrom = `
FROM floor_tables ft
LEFT JOIN LATERAL (
    SELECT id, total FROM orders o2
    WHERE o2.table_id = ft.id AND o2.status = 'open' AND o2.deleted_at IS NULL
    ORDER BY o2.created_at DESC
    LIMIT 1
) o ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt FROM order_items oi WHERE oi.order_id = o.id
) items ON TRUE
LEFT JOIN LATERAL (
    SELECT
        COALESCE(ARRAY_AGG(c.name ORDER BY c.name), '{}'::text[])::text[] AS merged_names,
        COALESCE(SUM(c.seats), 0)::int AS merged_seats
    FROM floor_tables c
    WHERE c.merged_into = ft.id
) m ON TRUE`

const floorTableBase = "SELECT" + floorTableColumns + floorTableFrom

type scanRow interface{ Scan(dest ...any) error }

func scanFloorTable(r scanRow) (*model.FloorTable, error) {
	var t model.FloorTable
	if err := r.Scan(&t.ID, &t.Name, &t.Seats, &t.State, &t.Detail, &t.BranchID, &t.OrderID, &t.OrderTotal, &t.ItemCount, &t.BillDropped, &t.NeedsAttention, &t.AttentionNote, &t.MergedWith, &t.MergedSeats); err != nil {
		return nil, err
	}
	if len(t.MergedWith) == 0 {
		t.MergedWith = nil
	}
	return &t, nil
}

// ListTables returns the floor plan with LIVE, order-derived state. The
// newest open order on a table plus its stored flags decide the state
// (see floorTableColumns for the precedence); with no open order and no
// flags, a stale 'Seated' stored in floor_tables is demoted to 'Open' while
// genuine manual states ('Reserved', ...) pass through untouched.
// Tables that were merged INTO another are excluded — their names/seats ride
// on the parent row's merged_with/merged_seats so the floor draws ONE card.
func (r *BookingRepo) ListTables(ctx context.Context, branchID string) ([]model.FloorTable, error) {
	query := floorTableBase
	conds := []string{"ft.merged_into IS NULL"}
	args := []interface{}{}
	if branchID != "" {
		conds = append(conds, "ft.branch_id = $1")
		args = append(args, branchID)
	}
	query += " WHERE " + strings.Join(conds, " AND ")
	query += ` ORDER BY ft.name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []model.FloorTable
	for rows.Next() {
		t, err := scanFloorTable(rows)
		if err != nil {
			return nil, err
		}
		tables = append(tables, *t)
	}
	return tables, nil
}

// GetTable returns one floor table with the same derived state as ListTables,
// so a flag-toggle response reports exactly what the floor will show. Returns
// pgx.ErrNoRows when the id is unknown.
func (r *BookingRepo) GetTable(ctx context.Context, id string) (*model.FloorTable, error) {
	return scanFloorTable(r.db.QueryRow(ctx, floorTableBase+` WHERE ft.id = $1`, id))
}

func (r *BookingRepo) ListReservations(ctx context.Context, branchID string) ([]model.Reservation, error) {
	query := `SELECT res.id, res.guest_id::text, COALESCE(res.guest_name, ''), res.covers, res.table_id::text, res.start_time, res.duration, res.status, res.branch_id::text, res.created_at FROM reservations res WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND res.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` ORDER BY res.start_time`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []model.Reservation
	for rows.Next() {
		var r2 model.Reservation
		if err := rows.Scan(&r2.ID, &r2.GuestID, &r2.GuestName, &r2.Covers, &r2.TableID, &r2.StartTime, &r2.Duration, &r2.Status, &r2.BranchID, &r2.CreatedAt); err != nil {
			return nil, err
		}
		reservations = append(reservations, r2)
	}
	return reservations, nil
}

func (r *BookingRepo) CreateReservation(ctx context.Context, res *model.Reservation) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Never double-book a table: refuse a reservation whose window overlaps
	// an existing active one (Confirmed or Seated) on the same table.
	// Cancelled/Completed bookings release the time. Without a table_id the
	// reservation is walk-up (seated later), so no conflict applies.
	if res.TableID != nil && *res.TableID != "" {
		// Serialize concurrent bookings per table with an advisory xact lock,
		// so two near-simultaneous creates cannot both observe an empty
		// window and double-book the same table. The lock is transaction-
		// scoped: it releases on commit/rollback like the row itself.
		if _, err := tx.Exec(ctx,
			`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
			*res.TableID,
		); err != nil {
			return err
		}
		var conflict bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS(
				SELECT 1 FROM reservations
				WHERE table_id = $1
				  AND status NOT IN ('Cancelled', 'Completed')
				  AND start_time < $2::timestamptz + make_interval(mins => $3::int)
				  AND $2::timestamptz < start_time + make_interval(mins => duration)
			)`,
			*res.TableID, res.StartTime, res.Duration,
		).Scan(&conflict); err != nil {
			return err
		}
		if conflict {
			return ErrTableAlreadyReserved
		}
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO reservations (guest_id, guest_name, covers, table_id, start_time, duration, status, branch_id) VALUES (NULLIF($1,'')::uuid, $2, $3, NULLIF($4,'')::uuid, $5, $6, $7, NULLIF($8,'')::uuid) RETURNING id, created_at`,
		res.GuestID, res.GuestName, res.Covers, res.TableID, res.StartTime, res.Duration, res.Status, res.BranchID,
	).Scan(&res.ID, &res.CreatedAt)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *BookingRepo) UpdateReservation(ctx context.Context, id string, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE reservations SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *BookingRepo) SeatReservation(ctx context.Context, id, tableID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE reservations SET table_id = $1::uuid, status = 'Seated' WHERE id = $2`, tableID, id)
	if err != nil {
		return err
	}

	// Table occupancy is derived from open orders (see ListTables), so seating
	// a reservation must NOT poke floor_tables.state — that flag is what used
	// to drift out of sync with reality.
	return tx.Commit(ctx)
}

func (r *BookingRepo) ListWaitlist(ctx context.Context, branchID string) ([]model.WaitlistEntry, error) {
	query := `SELECT id, guest_id::text, guest_name, covers, branch_id::text, created_at FROM waitlist`
	args := []interface{}{}
	if branchID != "" {
		query += ` WHERE branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY created_at`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.WaitlistEntry
	for rows.Next() {
		var e model.WaitlistEntry
		if err := rows.Scan(&e.ID, &e.GuestID, &e.GuestName, &e.Covers, &e.BranchID, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *BookingRepo) CreateWaitlist(ctx context.Context, e *model.WaitlistEntry) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO waitlist (guest_id, guest_name, covers, branch_id) VALUES (NULLIF($1,'')::uuid, $2, $3, NULLIF($4,'')::uuid) RETURNING id, created_at`,
		e.GuestID, e.GuestName, e.Covers, e.BranchID,
	).Scan(&e.ID, &e.CreatedAt)
	return err
}

func (r *BookingRepo) DeleteWaitlist(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM waitlist WHERE id = $1`, id)
	return err
}
