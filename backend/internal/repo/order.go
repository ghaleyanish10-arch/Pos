package repo

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

// Transfer-guard errors, returned by OrderRepo.TransferTable so the handler
// can map each rejection to the right status code.
var (
	// ErrOrderNotFound fires when the order id is unknown (or deleted).
	ErrOrderNotFound = errors.New("order not found")
	// ErrOrderNotOpen fires when the order is no longer open (closed/voided).
	ErrOrderNotOpen = errors.New("only open orders can be transferred")
	// ErrOrderNotSeated fires when the anchor order is open but not on any
	// floor table (a takeaway/delivery or table-less order) — there is no
	// source table for it to vacate.
	ErrOrderNotSeated = errors.New("order is not seated at a table")
	// ErrTargetTableNotFound fires when the target table does not exist.
	ErrTargetTableNotFound = errors.New("target table not found")
	// ErrCrossBranchTransfer fires when the target table belongs to a
	// different branch than the order.
	ErrCrossBranchTransfer = errors.New("target table must be in the same branch")
	// ErrTargetTableOccupied fires when the target already hosts a different
	// open order — moving onto it would strand two parties on one seat.
	ErrTargetTableOccupied = errors.New("target table already has an open order")
	// ErrSameTable fires when the source and target tables are identical.
	ErrSameTable = errors.New("order is already on that table")
)

// Merge-guard errors, returned by OrderRepo.MergeTables so the handler can map
// each rejection to the right status code.
var (
	// ErrSourceTableNotFound fires when the source (folded-in) table does not
	// exist.
	ErrSourceTableNotFound = errors.New("source table not found")
	// ErrMergeSameTable fires when the source and target tables are identical.
	ErrMergeSameTable = errors.New("cannot merge a table into itself")
	// ErrSourceNotOccupied fires when the source table has no open order to
	// fold into the target.
	ErrSourceNotOccupied = errors.New("source table has no open order to merge")
	// ErrMultipleOpenOrders fires when either side hosts more than one open
	// order, so there is no single check to fold into / onto.
	ErrMultipleOpenOrders = errors.New("table has more than one open order — cannot pick a single check to merge")
	// ErrAlreadyMerged fires when either table is already part of a merged
	// group (as the child pointing at another table, or as a parent other
	// tables already point at).
	ErrAlreadyMerged = errors.New("table is already part of a merged group")
)

type OrderRepo struct {
	db *pgxpool.Pool
}

func NewOrderRepo(db *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{db: db}
}

func (r *OrderRepo) List(ctx context.Context, branchID string, status string) ([]model.Order, error) {
	query := `SELECT id, type, table_id::text, guest_id::text, status, total, branch_id::text, created_at, updated_at FROM orders WHERE deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}
	if status != "" {
		query += ` AND status = $` + itoa(argIdx)
		args = append(args, status)
		argIdx++
	}

	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []model.Order
	for rows.Next() {
		var o model.Order
		if err := rows.Scan(&o.ID, &o.Type, &o.TableID, &o.GuestID, &o.Status, &o.Total, &o.BranchID, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *OrderRepo) GetByID(ctx context.Context, id string) (*model.Order, error) {
	var o model.Order
	err := r.db.QueryRow(ctx,
		`SELECT id, type, table_id::text, guest_id::text, status, total, branch_id::text, created_at, updated_at FROM orders WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&o.ID, &o.Type, &o.TableID, &o.GuestID, &o.Status, &o.Total, &o.BranchID, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}

	items, _ := r.GetItems(ctx, id)
	o.Items = items
	return &o, nil
}

func (r *OrderRepo) GetItems(ctx context.Context, orderID string) ([]model.OrderItem, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, order_id, menu_item_id::text, name, qty, price, COALESCE(notes, '') FROM order_items WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.OrderItem
	for rows.Next() {
		var i model.OrderItem
		if err := rows.Scan(&i.ID, &i.OrderID, &i.MenuItemID, &i.Name, &i.Qty, &i.Price, &i.Notes); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

func (r *OrderRepo) ResolveTableID(ctx context.Context, table string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `SELECT id FROM floor_tables WHERE name = $1`, table).Scan(&id)
	return id, err
}

// ResolveTable maps a table name (e.g. "T4") to its id and branch so a public
// (customer) order can attach to the right table and branch without a session.
func (r *OrderRepo) ResolveTable(ctx context.Context, name string) (string, string, error) {
	var id, branch string
	err := r.db.QueryRow(ctx,
		`SELECT id::text, COALESCE(branch_id::text, '') FROM floor_tables WHERE name = $1`, name,
	).Scan(&id, &branch)
	return id, branch, err
}

// ResolveTableByUUID returns the branch for an existing floor table id
// (usually resolved from a QR-scanned table name). pgx.ErrNoRows when the id
// does not exist.
func (r *OrderRepo) ResolveTableByUUID(ctx context.Context, id string) (string, error) {
	var branch string
	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(branch_id::text, '') FROM floor_tables WHERE id = $1`, id,
	).Scan(&branch)
	return branch, err
}

// GuestExists reports whether a guest record with the given id exists.
func (r *OrderRepo) GuestExists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM guests WHERE id = $1)`, id).Scan(&exists)
	return exists, err
}

func (r *OrderRepo) Create(ctx context.Context, o *model.Order, items []model.CreateOrderItemReq) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx,
		`INSERT INTO orders (type, table_id, guest_id, status, branch_id) VALUES ($1, NULLIF($2,'')::uuid, NULLIF($3,'')::uuid, 'open', NULLIF($4,'')::uuid) RETURNING id, created_at, updated_at`,
		o.Type, o.TableID, o.GuestID, o.BranchID,
	).Scan(&o.ID, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return err
	}
	o.Status = "open"

	var total float64
	for _, item := range items {
		_, err = tx.Exec(ctx,
			`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, notes) VALUES ($1, NULLIF($2,'')::uuid, $3, $4, $5, $6)`,
			o.ID, item.MenuItemID, item.Name, item.Qty, item.Price, item.Notes,
		)
		if err != nil {
			return err
		}
		total += float64(item.Qty) * item.Price
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET total = $1 WHERE id = $2`, total, o.ID)
	if err != nil {
		return err
	}
	o.Total = total

	// Every order creates a KDS ticket so it shows up on the kitchen display.
	// Dine-in tickets are named after their table so the staff Orders board and
	// KDS read "Table T4" rather than a generic label — a QR-scanned order is
	// stored with the floor-table id, so join for the display name.
	tag := "Dine-in"
	if o.Type == "takeaway" {
		tag = "Takeaway"
	} else if o.Type == "delivery" {
		tag = "Delivery"
	} else if o.TableID != nil && *o.TableID != "" {
		var tableName string
		_ = tx.QueryRow(ctx, `SELECT name FROM floor_tables WHERE id = NULLIF($1,'')::uuid`, *o.TableID).Scan(&tableName)
		if tableName != "" {
			tag = "Table " + tableName
		}
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO kds_tickets (order_id, tag, station, status, ai_phone, allergy, fired) VALUES ($1, $2, 'Kitchen', 'incoming', false, '', false)`,
		o.ID, tag,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *OrderRepo) Update(ctx context.Context, id string, status string) error {
	if status != "closed" {
		_, err := r.db.Exec(ctx,
			`UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`, status, id)
		return err
	}

	// Closing a check is the natural end of a merged group: paying off / closing
	// the combined check must clear floor_tables.merged_into on BOTH sides so
	// the merged-away source table reverts to an independently vacant row
	// instead of pointing at a now-empty target forever.
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var tableID *string
	if err := tx.QueryRow(ctx,
		`SELECT table_id FROM orders WHERE id = $1 FOR UPDATE`, id).Scan(&tableID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`, status, id); err != nil {
		return err
	}
	if tableID != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE floor_tables SET merged_into = NULL WHERE id = $1 OR merged_into = $1`, *tableID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// TransferTable moves an open order — and with it EVERY other open order on
// that same source table — to another floor table in one transaction. Table
// occupancy is derived from open orders (see BookingRepo.ListTables), so once
// the tab is gone the source has NO open order left referencing it and derives
// 'Open' with zero items and zero total on every device; the target derives
// 'Seated' with the newest moved order's bill. Moving the whole tab (not one
// order) is what guarantees the source always vacates, even when a table
// holds several open orders. The KDS ticket tags are relabelled to the new
// table so the kitchen reads the seat the food will be served on.
func (r *OrderRepo) TransferTable(ctx context.Context, orderID, targetTableID string) (int, string, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, "", err
	}
	defer tx.Rollback(ctx)

	// The anchor order only identifies the SOURCE table; the whole open tab
	// on that table is what actually moves.
	var status, sourceTableID, branchID, targetBranch, targetName string
	if err := tx.QueryRow(ctx,
		`SELECT status, COALESCE(table_id::text, ''), COALESCE(branch_id::text, '')
		 FROM orders WHERE id = $1 AND deleted_at IS NULL`, orderID,
	).Scan(&status, &sourceTableID, &branchID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", ErrOrderNotFound
		}
		return 0, "", err
	}

	if status != "open" {
		return 0, "", ErrOrderNotOpen
	}
	if sourceTableID == "" {
		return 0, "", ErrOrderNotSeated
	}
	if sourceTableID == targetTableID {
		return 0, "", ErrSameTable
	}

	if err := tx.QueryRow(ctx,
		`SELECT name, COALESCE(branch_id::text, '') FROM floor_tables WHERE id = $1`, targetTableID,
	).Scan(&targetName, &targetBranch); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", ErrTargetTableNotFound
		}
		return 0, "", err
	}

	if branchID != "" && targetBranch != "" && branchID != targetBranch {
		return 0, "", ErrCrossBranchTransfer
	}

	// Serialize concurrent transfers per target table so two near-simultaneous
	// moves cannot both observe the target vacant and double-book it.
	if _, err := tx.Exec(ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, targetTableID,
	); err != nil {
		return 0, "", err
	}

	// Reject seating two parties together: the target must host NO open order
	// of its own. The orders being moved all live on the source table, which
	// is a different table (checked above), so every open order found on the
	// target is necessarily somebody else's — a merge, not a transfer.
	var occupied bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM orders
			WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL
		)`, targetTableID,
	).Scan(&occupied); err != nil {
		return 0, "", err
	}
	if occupied {
		return 0, "", ErrTargetTableOccupied
	}

	// Collect the whole open tab on the source, then move every order and its
	// KDS ticket tag in the same transaction.
	var moved []string
	rows, err := tx.Query(ctx,
		`SELECT id::text FROM orders
		 WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL
		 FOR UPDATE`, sourceTableID)
	if err != nil {
		return 0, "", err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, "", err
		}
		moved = append(moved, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, "", err
	}
	if len(moved) == 0 {
		return 0, "", ErrOrderNotFound
	}

	if _, err := tx.Exec(ctx,
		`UPDATE orders SET table_id = $1::uuid, updated_at = now()
		 WHERE table_id = $2 AND status = 'open' AND deleted_at IS NULL`,
		targetTableID, sourceTableID); err != nil {
		return 0, "", err
	}

	if targetName != "" {
		if _, err := tx.Exec(ctx,
			`UPDATE kds_tickets SET tag = 'Table ' || $1
			 WHERE order_id = ANY($2::uuid[])`,
			targetName, moved); err != nil {
			return 0, "", err
		}
	}

	return len(moved), targetName, tx.Commit(ctx)
}

// MergeTables folds the source table's single open check into the target's
// open check — or creates the combined check on the target when it is vacant —
// in one transaction. Unlike a transfer (which requires a VACANT target), a
// merge lands ON an occupied table: the fold is consolidating, not relabelling.
//
//   - order_items and kds_tickets from the source check are moved onto the
//     target check, and the target check's total is recomputed from the items
//     that now live under it — the combined bill the operator expects on the
//     merged card.
//   - the source check is closed with the distinguishable status 'merged'
//     (not 'closed') so reporting can tell a folded-away check from a
//     genuinely paid one, while the audit trail stays intact.
//   - the source table row keeps existing but points at the target via
//     merged_into, which is what lets the floor derive ONE card for the group
//     (children are excluded from listing; the parent carries their names).
//
// Guard rails mirror the transfer: both tables must exist in the same branch,
// neither may already be part of a merged group, and the SOURCE must hold
// exactly one open order. The TARGET may hold zero (combined check created) or
// one (the fold goes into it); more than one is ambiguous and rejected.
func (r *OrderRepo) MergeTables(ctx context.Context, targetTableID, sourceTableID string) (orderID string, itemsMoved int, targetName, sourceName string, err error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", 0, "", "", err
	}
	defer tx.Rollback(ctx)

	// Read both floor rows up front so every guard below fires with the same
	// "table not found" shape for either side.
	readTable := func(id string) (name string, seats int, branchID, mergedInto string, err error) {
		err = tx.QueryRow(ctx,
			`SELECT name, seats, COALESCE(branch_id::text, ''), COALESCE(merged_into::text, '')
			 FROM floor_tables WHERE id = $1`, id,
		).Scan(&name, &seats, &branchID, &mergedInto)
		return name, seats, branchID, mergedInto, err
	}
	targetName, _, targetBranch, targetMerged, err := readTable(targetTableID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", 0, "", "", ErrTargetTableNotFound
		}
		return "", 0, "", "", err
	}
	sourceName, _, sourceBranch, sourceMerged, err := readTable(sourceTableID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", 0, "", "", ErrSourceTableNotFound
		}
		return "", 0, "", "", err
	}
	if targetTableID == sourceTableID {
		return "", 0, "", "", ErrMergeSameTable
	}

	// A merge is a cross-table grouping — it must never cross branches any
	// more than a transfer does.
	if targetBranch != "" && sourceBranch != "" && targetBranch != sourceBranch {
		return "", 0, "", "", ErrCrossBranchTransfer
	}

	// Neither table may already be part of a merged group — as the child of
	// another merge, or as a parent other tables already point at.
	if targetMerged != "" || sourceMerged != "" {
		return "", 0, "", "", ErrAlreadyMerged
	}
	var hasChild bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM floor_tables WHERE merged_into = $1 OR merged_into = $2)`,
		targetTableID, sourceTableID).Scan(&hasChild); err != nil {
		return "", 0, "", "", err
	}
	if hasChild {
		return "", 0, "", "", ErrAlreadyMerged
	}

	// Serialize concurrent merges per pair so two near-simultaneous requests
	// cannot both read the same single open check and fold it twice.
	if _, err := tx.Exec(ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, targetTableID); err != nil {
		return "", 0, "", "", err
	}
	if _, err := tx.Exec(ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, sourceTableID); err != nil {
		return "", 0, "", "", err
	}

	// Source must hold EXACTLY one open check — the one being folded. Multiple
	// open checks on the source is the same collision the transfer refuses:
	// there is no single check to fold.
	type orderRow struct{ id, guest string }
	var sourceOrders []orderRow
	rows, err := tx.Query(ctx,
		`SELECT id::text, COALESCE(guest_id::text, '') FROM orders
		 WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL
		 FOR UPDATE`, sourceTableID)
	if err != nil {
		return "", 0, "", "", err
	}
	for rows.Next() {
		var o orderRow
		if err := rows.Scan(&o.id, &o.guest); err != nil {
			rows.Close()
			return "", 0, "", "", err
		}
		sourceOrders = append(sourceOrders, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return "", 0, "", "", err
	}
	var srcID, srcGuest string
	switch n := len(sourceOrders); {
	case n == 0:
		return "", 0, "", "", ErrSourceNotOccupied
	case n == 1:
		srcID, srcGuest = sourceOrders[0].id, sourceOrders[0].guest
	default:
		return "", 0, "", "", ErrMultipleOpenOrders
	}

	// Target may hold zero (a fresh combined check is created) or one (the
	// source items fold into it). More than one is ambiguous — rejected.
	var targetOrderIDs []string
	rows, err = tx.Query(ctx,
		`SELECT id::text FROM orders
		 WHERE table_id = $1 AND status = 'open' AND deleted_at IS NULL
		 FOR UPDATE`, targetTableID)
	if err != nil {
		return "", 0, "", "", err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return "", 0, "", "", err
		}
		targetOrderIDs = append(targetOrderIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return "", 0, "", "", err
	}
	var tgtID string
	branchArg := nullableText(targetBranch)
	guestArg := nullableText(srcGuest)
	switch n := len(targetOrderIDs); {
	case n == 0:
		if err := tx.QueryRow(ctx,
			`INSERT INTO orders (type, table_id, branch_id, guest_id, status, total)
			 VALUES ('dine-in', $1, $2, $3, 'open', 0)
			 RETURNING id::text`,
			targetTableID, branchArg, guestArg).Scan(&tgtID); err != nil {
			return "", 0, "", "", err
		}
	case n == 1:
		tgtID = targetOrderIDs[0]
	default:
		return "", 0, "", "", ErrMultipleOpenOrders
	}

	// Consolidate: pull every source line item onto the combined check, then
	// recompute the combined total from the items that now live under it.
	itag, err := tx.Exec(ctx,
		`UPDATE order_items SET order_id = $1 WHERE order_id = $2`, tgtID, srcID)
	if err != nil {
		return "", 0, "", "", err
	}
	itemsMoved = int(itag.RowsAffected())

	if _, err := tx.Exec(ctx,
		`UPDATE orders SET total = (
		     SELECT COALESCE(SUM(price * qty), 0) FROM order_items WHERE order_id = $1
		 ), updated_at = now()
		 WHERE id = $1`, tgtID); err != nil {
		return "", 0, "", "", err
	}

	// The kitchen tickets follow the food: relabel to the combined table.
	if targetName != "" {
		if _, err := tx.Exec(ctx,
			`UPDATE kds_tickets SET order_id = $1, tag = 'Table ' || $2
			 WHERE order_id = $3`,
			tgtID, targetName, srcID); err != nil {
			return "", 0, "", "", err
		}
	}

	// Fold the source check away with a distinguishably-'merged' status, keep
	// the row for audit/reporting.
	if _, err := tx.Exec(ctx,
		`UPDATE orders SET status = 'merged', updated_at = now() WHERE id = $1`, srcID); err != nil {
		return "", 0, "", "", err
	}

	// Point the source table at the target — this is what makes the floor
	// render ONE combined card instead of two.
	if _, err := tx.Exec(ctx,
		`UPDATE floor_tables SET merged_into = $1::uuid WHERE id = $2`, targetTableID, sourceTableID); err != nil {
		return "", 0, "", "", err
	}

	// Carry the source's manual flags onto the target so 'Check dropped' /
	// 'Needs attention' survive the fold and stay visible on the combined card.
	if _, err := tx.Exec(ctx,
		`UPDATE floor_tables ft SET
		     bill_dropped    = ft.bill_dropped OR s.bill_dropped,
		     needs_attention = ft.needs_attention OR s.needs_attention,
		     attention_note  = CASE WHEN ft.attention_note = '' AND s.attention_note <> '' THEN s.attention_note ELSE ft.attention_note END
		 FROM floor_tables s
		 WHERE ft.id = $1 AND s.id = $2`,
		targetTableID, sourceTableID); err != nil {
		return "", 0, "", "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", 0, "", "", err
	}
	return tgtID, itemsMoved, targetName, sourceName, nil
}

func (r *OrderRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE orders SET deleted_at = now() WHERE id = $1`, id)
	return err
}

func itoa(i int) string {
	return strconv.Itoa(i)
}

// nullableText maps an empty string to a NULL-compatible nil pointer so a
// UUID column can accept "" as "not set" without a cast dance.
func nullableText(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
