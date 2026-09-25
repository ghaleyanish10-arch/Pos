package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

// ErrPaymentExceedsOrder is returned when a payment would push the confirmed
// total paid on an order past its total — a double-click or duplicate submit.
var ErrPaymentExceedsOrder = errors.New("payment exceeds order total")

type TransactionRepo struct {
	db *pgxpool.Pool
}

func NewTransactionRepo(db *pgxpool.Pool) *TransactionRepo {
	return &TransactionRepo{db: db}
}

func (r *TransactionRepo) List(ctx context.Context, branchID string) ([]model.Transaction, error) {
	query := `
		SELECT t.id, t.order_id::text, COALESCE(t.ref, ''),
		       COALESCE(ft.name, ''), t.method, t.amount, t.status,
		       COALESCE(t.fiscal_id, ''), t.certified,
		       COALESCE(t.bill_split_id::text, ''), COALESCE(t.split_note, ''),
		       t.branch_id::text, t.created_at
		FROM transactions t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND t.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` ORDER BY t.created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []model.Transaction
	for rows.Next() {
		var t model.Transaction
		if err := rows.Scan(&t.ID, &t.OrderID, &t.Ref, &t.TableName, &t.Method, &t.Amount, &t.Status, &t.FiscalID, &t.Certified, &t.SplitID, &t.SplitNote, &t.BranchID, &t.CreatedAt); err != nil {
			return nil, err
		}
		txs = append(txs, t)
	}
	return txs, nil
}

// Create records a confirmed payment against an order (or, for a manual
// register drop, against no order at all). It returns orderFullyPaid = true
// only when this payment settled the LAST rupee of the order — the single
// moment it is safe to auto-close the order and vacate the table. Split bills
// send one Create per share against the same order_id; guest 1 of 3 paying in
// returns false so the order stays open and the table keeps showing 'Seated'
// until every share has landed. Both the overpayment guard and this decision
// live under the order's FOR UPDATE row lock, so concurrent split payments
// serialize: they neither over-charge nor double-close.
func (r *TransactionRepo) Create(ctx context.Context, t *model.Transaction) (orderFullyPaid bool, err error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	// Never let an order be over-paid: a double-click or a duplicated request
	// that lands twice must be rejected, not silently recorded as two charges.
	// The order row is locked so concurrent payments serialize correctly.
	var total float64
	orderScoped := t.OrderID != nil && *t.OrderID != ""
	if orderScoped {
		var paid float64
		err = tx.QueryRow(ctx,
			`SELECT total FROM orders WHERE id = $1 FOR UPDATE`, *t.OrderID).Scan(&total)
		if err != nil {
			return false, fmt.Errorf("order lookup failed: %w", err)
		}
		if err := tx.QueryRow(ctx,
			`SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE order_id = $1 AND status = 'Success'`, *t.OrderID).
			Scan(&paid); err != nil {
			return false, err
		}
		if t.Amount+paid > total {
			return false, ErrPaymentExceedsOrder
		}
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO transactions (order_id, ref, method, amount, status, bill_split_id, split_note, branch_id)
		 VALUES (NULLIF($1,'')::uuid, $2, $3, $4, 'Success', NULLIF($5,'')::uuid, $6, NULLIF($7,'')::uuid)
		 RETURNING id, created_at`,
		t.OrderID, t.Ref, t.Method, t.Amount, t.SplitID, t.SplitNote, t.BranchID,
	).Scan(&t.ID, &t.CreatedAt)
	if err != nil {
		return false, err
	}
	t.Status = "Success"

	// Decide "fully paid" inside this transaction: the row we just inserted is
	// visible here, and the order row is still locked, so the sum is exact and
	// no concurrent share can drift between the insert and this check.
	if orderScoped {
		var paid float64
		if err := tx.QueryRow(ctx,
			`SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE order_id = $1 AND status = 'Success'`, *t.OrderID).
			Scan(&paid); err != nil {
			return false, err
		}
		orderFullyPaid = paid >= total
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return orderFullyPaid, nil
}

func (r *TransactionRepo) GetByID(ctx context.Context, id string) (*model.Transaction, error) {
	var t model.Transaction
	err := r.db.QueryRow(ctx,
		`SELECT t.id, t.order_id::text, COALESCE(t.ref,''),
		       COALESCE(ft.name, ''), t.method, t.amount, t.status,
		       COALESCE(t.fiscal_id,''), t.certified,
		       COALESCE(t.bill_split_id::text,''), COALESCE(t.split_note,''),
		       t.branch_id::text, t.created_at
		FROM transactions t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE t.id = $1`, id,
	).Scan(&t.ID, &t.OrderID, &t.Ref, &t.TableName, &t.Method, &t.Amount, &t.Status, &t.FiscalID, &t.Certified, &t.SplitID, &t.SplitNote, &t.BranchID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TransactionRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE transactions SET status = $1 WHERE id = $2`, status, id)
	return err
}
