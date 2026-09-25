package repo

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type ReportRepo struct {
	db *pgxpool.Pool
}

func NewReportRepo(db *pgxpool.Pool) *ReportRepo {
	return &ReportRepo{db: db}
}

// windowPred builds the time-window predicate shared by the report queries.
// days > 0 SELECTs the last N days; offsetHours slides that window back (e.g.
// days=1, offset=24 is exactly yesterday). Returns '' (all time) otherwise.
// It is literal SQL — no placeholders — so it composes with the $N branch
// placeholder that precedes it.
func windowPred(alias string, days, offsetHours int) string {
	if days > 0 {
		return fmt.Sprintf(` AND %screated_at > now() - INTERVAL '%d days' - INTERVAL '%d hours'`, alias, days, offsetHours)
	}
	if offsetHours > 0 {
		return fmt.Sprintf(` AND %screated_at > now() - INTERVAL '%d hours'`, alias, offsetHours)
	}
	return ""
}

func (r *ReportRepo) RevenueByDay(ctx context.Context, branchID string, days, offsetHours int) ([]model.RevenueDataPoint, error) {
	query := `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as day, SUM(amount) FROM transactions WHERE status = 'Success'`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += windowPred("", days, offsetHours)

	query += ` GROUP BY day ORDER BY day DESC LIMIT 30`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []model.RevenueDataPoint
	for rows.Next() {
		var p model.RevenueDataPoint
		if err := rows.Scan(&p.Date, &p.Amount); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, nil
}

func (r *ReportRepo) TopSellers(ctx context.Context, branchID string, days, offsetHours int) ([]model.TopSeller, error) {
	query := `SELECT oi.name, SUM(oi.qty) as cnt, COALESCE(SUM(oi.qty * oi.price), 0) as rev FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND o.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += windowPred("o.", days, offsetHours)

	query += ` GROUP BY oi.name ORDER BY cnt DESC LIMIT 10`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sellers []model.TopSeller
	for rows.Next() {
		var s model.TopSeller
		if err := rows.Scan(&s.Name, &s.Count, &s.Revenue); err != nil {
			return nil, err
		}
		sellers = append(sellers, s)
	}
	return sellers, nil
}

func (r *ReportRepo) SlowMovers(ctx context.Context, branchID string, days, offsetHours int) ([]model.TopSeller, error) {
	query := `SELECT oi.name, SUM(oi.qty) as cnt, COALESCE(SUM(oi.qty * oi.price), 0) as rev FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND o.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += windowPred("o.", days, offsetHours)

	query += ` GROUP BY oi.name ORDER BY cnt ASC LIMIT 10`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sellers []model.TopSeller
	for rows.Next() {
		var s model.TopSeller
		if err := rows.Scan(&s.Name, &s.Count, &s.Revenue); err != nil {
			return nil, err
		}
		sellers = append(sellers, s)
	}
	return sellers, nil
}

func (r *ReportRepo) Summary(ctx context.Context, branchID string, days, offsetHours int) (*model.ReportSummary, error) {
	summary := &model.ReportSummary{}
	query := `SELECT COALESCE(SUM(amount), 0), COUNT(*), COALESCE(AVG(amount), 0) FROM transactions WHERE status = 'Success'`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += windowPred("", days, offsetHours)

	if err := r.db.QueryRow(ctx, query, args...).Scan(&summary.TotalRevenue, &summary.TotalOrders, &summary.AvgOrderValue); err != nil {
		return nil, err
	}

	// The dashboard summary is the same three lists the dedicated report
	// endpoints serve, so the Home revenue sparkline/top sellers render from
	// real data instead of staying empty. Headline numbers and rankings follow
	// the requested window (the handler defaults to Today); the revenue series
	// spans the last 7 days so Home's "Last 7 periods" trend has a line.
	revenue, err := r.RevenueByDay(ctx, branchID, 7, 0)
	if err != nil {
		return nil, err
	}
	summary.Revenue = revenue

	sellers, err := r.TopSellers(ctx, branchID, days, offsetHours)
	if err != nil {
		return nil, err
	}
	summary.TopSellers = sellers

	slow, err := r.SlowMovers(ctx, branchID, days, offsetHours)
	if err != nil {
		return nil, err
	}
	summary.SlowMovers = slow

	return summary, nil
}

// Overview powers the Reports page in one round trip. days <= 0 means "all
// time". Refunds counted regardless of resolution status — a refund request
// is still money the guest did not keep paying.
func (r *ReportRepo) Overview(ctx context.Context, branchID string, days int, offsetHours int) (*model.ReportOverview, error) {
	// Two window fragments: one for the joined transaction source (alias t),
	// one for plain single-table queries (refunds, order products).
	// offsetHours slides the window back (yesterday = days=1, offset 24).
	txnSince := ""
	plainSince := ""
	if days > 0 {
		txnSince = fmt.Sprintf(` AND t.created_at > now() - INTERVAL '%d days' - INTERVAL '%d hours'`, days, offsetHours)
		plainSince = fmt.Sprintf(` AND created_at > now() - INTERVAL '%d days' - INTERVAL '%d hours'`, days, offsetHours)
	} else if offsetHours > 0 {
		txnSince = fmt.Sprintf(` AND t.created_at > now() - INTERVAL '%d hours'`, offsetHours)
		plainSince = fmt.Sprintf(` AND created_at > now() - INTERVAL '%d hours'`, offsetHours)
	}
	plainBranchCond := ""
	plainArgs := []interface{}{}
	if branchID != "" {
		plainBranchCond = ` AND branch_id = $1`
		plainArgs = append(plainArgs, branchID)
	}

	var o model.ReportOverview

	// table_name lives on the order's floor table, not on transactions — join
	// through orders the same way TransactionRepo.List does.
	txnSource := ` FROM transactions t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN floor_tables ft ON ft.id = o.table_id
		WHERE t.status = 'Success'`
	txnBranchCond := ""
	txnArgs := []interface{}{}
	if branchID != "" {
		txnBranchCond = ` AND t.branch_id = $1`
		txnArgs = append(txnArgs, branchID)
	}
	headQuery := `SELECT
		COALESCE(SUM(t.amount), 0), COUNT(*), COALESCE(AVG(t.amount), 0)
		` + txnSource + txnBranchCond + txnSince
	if err := r.db.QueryRow(ctx, headQuery, txnArgs...).Scan(&o.Sales, &o.Orders, &o.AvgOrderValue); err != nil {
		return nil, err
	}

	refundQuery := `SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM refunds WHERE 1=1` + plainBranchCond + plainSince
	if err := r.db.QueryRow(ctx, refundQuery, plainArgs...).Scan(&o.RefundsTotal, &o.RefundsCount); err != nil {
		return nil, err
	}

	// VAT collected is derived from the window's settled sales and the branch's
	// configured tax rate (store_settings.tax_rate, default 13). Actual per-item
	// tax is not stored on transactions, so this mirrors the Finance page's
	// client-side derivation: round(sales * rate / 100). Net sales are what the
	// business actually keeps after refunds.
	taxRate := 13.0
	if branchID != "" {
		if err := r.db.QueryRow(ctx, `SELECT tax_rate FROM store_settings WHERE branch_id = $1`, branchID).Scan(&taxRate); err != nil {
			taxRate = 13.0
		}
	}
	o.TaxCollected = math.Round(o.Sales * taxRate / 100)
	o.NetSales = o.Sales - o.RefundsTotal

	mixRows, err := r.db.Query(ctx,
		`SELECT t.method, COALESCE(SUM(t.amount), 0), COUNT(*)`+txnSource+txnBranchCond+txnSince+` GROUP BY t.method ORDER BY 2 DESC`, txnArgs...)
	if err != nil {
		return nil, err
	}
	defer mixRows.Close()
	for mixRows.Next() {
		var m model.PaymentMixSlice
		if err := mixRows.Scan(&m.Method, &m.Amount, &m.Count); err != nil {
			return nil, err
		}
		o.PaymentMix = append(o.PaymentMix, m)
	}

	prodRows, err := r.db.Query(ctx,
		`SELECT oi.name, SUM(oi.qty), COALESCE(SUM(oi.qty * oi.price), 0)
		FROM order_items oi JOIN orders o ON oi.order_id = o.id
		WHERE o.deleted_at IS NULL`+plainBranchCond+plainSince+`
		GROUP BY oi.name ORDER BY 2 DESC LIMIT 8`, plainArgs...)
	if err != nil {
		return nil, err
	}
	defer prodRows.Close()
	for prodRows.Next() {
		var p model.TopSeller
		if err := prodRows.Scan(&p.Name, &p.Count, &p.Revenue); err != nil {
			return nil, err
		}
		o.TopProducts = append(o.TopProducts, p)
	}

	hourRows, err := r.db.Query(ctx,
		`SELECT EXTRACT(HOUR FROM t.created_at)::int, COALESCE(SUM(t.amount), 0), COUNT(*)`+txnSource+txnBranchCond+txnSince+`
		GROUP BY 1 ORDER BY 1`, txnArgs...)
	if err != nil {
		return nil, err
	}
	defer hourRows.Close()
	for hourRows.Next() {
		var h model.HourSlice
		if err := hourRows.Scan(&h.Hour, &h.Amount, &h.Orders); err != nil {
			return nil, err
		}
		o.PeakHours = append(o.PeakHours, h)
	}

	tableRows, err := r.db.Query(ctx,
		`SELECT COALESCE(NULLIF(ft.name, ''), 'Other'), COUNT(*), COALESCE(SUM(t.amount), 0)`+txnSource+txnBranchCond+txnSince+`
		GROUP BY 1 ORDER BY 3 DESC LIMIT 12`, txnArgs...)
	if err != nil {
		return nil, err
	}
	defer tableRows.Close()
	for tableRows.Next() {
		var t model.TableUsageSlice
		if err := tableRows.Scan(&t.Table, &t.Orders, &t.Revenue); err != nil {
			return nil, err
		}
		if t.Orders > 0 {
			t.AvgTicket = t.Revenue / float64(t.Orders)
		}
		o.TableUsage = append(o.TableUsage, t)
	}

	dailyRows, err := r.db.Query(ctx,
		`SELECT TO_CHAR(t.created_at, 'YYYY-MM-DD'), COALESCE(SUM(t.amount), 0)`+txnSource+txnBranchCond+txnSince+`
		GROUP BY 1 ORDER BY 1`, txnArgs...)
	if err != nil {
		return nil, err
	}
	defer dailyRows.Close()
	for dailyRows.Next() {
		var p model.RevenueDataPoint
		if err := dailyRows.Scan(&p.Date, &p.Amount); err != nil {
			return nil, err
		}
		o.DailyRevenue = append(o.DailyRevenue, p)
	}

	return &o, nil
}

func (r *ReportRepo) ListBranches(ctx context.Context) ([]model.BranchHealth, error) {
	rows, err := r.db.Query(ctx, `SELECT name, status FROM branches ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []model.BranchHealth
	for rows.Next() {
		var b model.BranchHealth
		if err := rows.Scan(&b.Name, &b.Status); err != nil {
			return nil, err
		}
		branches = append(branches, b)
	}
	return branches, nil
}
