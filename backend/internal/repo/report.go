package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type ReportRepo struct {
	db *pgxpool.Pool
}

func NewReportRepo(db *pgxpool.Pool) *ReportRepo {
	return &ReportRepo{db: db}
}

func (r *ReportRepo) RevenueByDay(ctx context.Context, branchID string) ([]model.RevenueDataPoint, error) {
	query := `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as day, SUM(amount) FROM transactions WHERE status = 'Success'`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

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

func (r *ReportRepo) TopSellers(ctx context.Context, branchID string) ([]model.TopSeller, error) {
	query := `SELECT oi.name, SUM(oi.qty) as cnt FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND o.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` GROUP BY oi.name ORDER BY cnt DESC LIMIT 10`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sellers []model.TopSeller
	for rows.Next() {
		var s model.TopSeller
		if err := rows.Scan(&s.Name, &s.Count); err != nil {
			return nil, err
		}
		sellers = append(sellers, s)
	}
	return sellers, nil
}

func (r *ReportRepo) SlowMovers(ctx context.Context, branchID string) ([]model.TopSeller, error) {
	query := `SELECT oi.name, SUM(oi.qty) as cnt FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND o.branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` GROUP BY oi.name ORDER BY cnt ASC LIMIT 10`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sellers []model.TopSeller
	for rows.Next() {
		var s model.TopSeller
		if err := rows.Scan(&s.Name, &s.Count); err != nil {
			return nil, err
		}
		sellers = append(sellers, s)
	}
	return sellers, nil
}

func (r *ReportRepo) Summary(ctx context.Context, branchID string) (float64, int, float64, error) {
	query := `SELECT COALESCE(SUM(amount), 0), COUNT(*), COALESCE(AVG(amount), 0) FROM transactions WHERE status = 'Success'`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	var totalRevenue float64
	var totalOrders int
	var avgOrder float64
	err := r.db.QueryRow(ctx, query, args...).Scan(&totalRevenue, &totalOrders, &avgOrder)
	return totalRevenue, totalOrders, avgOrder, err
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
