package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

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
// a register charge or a table-QR order immediately seats the table, and
// paying/closing the check (which flips the order to 'closed') turns it back
// to Vacant, on every device, with no drift.
// ListTables returns the floor plan with LIVE, order-derived state. The
// newest open order on a table forces 'Seated' and carries that order's
// id/total/item-count; with no open order, a stale 'Seated' stored in
// floor_tables is demoted to 'Open' while genuine manual states ('Reserved',
// 'Needs attention', ...) pass through untouched.
func (r *BookingRepo) ListTables(ctx context.Context, branchID string) ([]model.FloorTable, error) {
	query := `
		SELECT ft.id, ft.name, ft.seats,
		       CASE WHEN o.id IS NOT NULL THEN 'Seated'
		            ELSE CASE WHEN ft.state IN ('Reserved', 'Needs attention', 'Check dropped', 'Open')
		                      THEN ft.state ELSE 'Open' END END AS state,
		       COALESCE(ft.detail,''), ft.branch_id::text,
		       o.id, COALESCE(o.total, 0), COALESCE(items.cnt, 0)
		FROM floor_tables ft
		LEFT JOIN LATERAL (
		    SELECT id, total FROM orders o2
		    WHERE o2.table_id = ft.id AND o2.status = 'open' AND o2.deleted_at IS NULL
		    ORDER BY o2.created_at DESC
		    LIMIT 1
		) o ON TRUE
		LEFT JOIN LATERAL (
		    SELECT COUNT(*)::int AS cnt FROM order_items oi WHERE oi.order_id = o.id
		) items ON TRUE`
	args := []interface{}{}
	if branchID != "" {
		query += ` WHERE ft.branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY ft.name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []model.FloorTable
	for rows.Next() {
		var t model.FloorTable
		if err := rows.Scan(&t.ID, &t.Name, &t.Seats, &t.State, &t.Detail, &t.BranchID, &t.OrderID, &t.OrderTotal, &t.ItemCount); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, nil
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
	err := r.db.QueryRow(ctx,
		`INSERT INTO reservations (guest_id, guest_name, covers, table_id, start_time, duration, status, branch_id) VALUES (NULLIF($1,'')::uuid, $2, $3, NULLIF($4,'')::uuid, $5, $6, $7, NULLIF($8,'')::uuid) RETURNING id, created_at`,
		res.GuestID, res.GuestName, res.Covers, res.TableID, res.StartTime, res.Duration, res.Status, res.BranchID,
	).Scan(&res.ID, &res.CreatedAt)
	return err
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
