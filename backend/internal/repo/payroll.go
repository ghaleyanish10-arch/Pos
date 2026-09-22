package repo

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type PayrollRepo struct {
	db *pgxpool.Pool
}

func NewPayrollRepo(db *pgxpool.Pool) *PayrollRepo {
	return &PayrollRepo{db: db}
}

// SetHourlyRate stores a staff member's hourly rate.
func (r *PayrollRepo) SetHourlyRate(ctx context.Context, staffID string, rate float64) error {
	_, err := r.db.Exec(ctx,
		`UPDATE staff_members SET hourly_rate = $2 WHERE id = $1`, staffID, rate)
	return err
}

// ListRates returns every staff member with their rate (unfilled = 0).
func (r *PayrollRepo) ListRates(ctx context.Context, branchID string) ([]model.PayrollLine, error) {
	query := `SELECT id::text, name, COALESCE(hourly_rate, 0) FROM staff_members WHERE 1=1`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.PayrollLine
	for rows.Next() {
		var l model.PayrollLine
		if err := rows.Scan(&l.StaffID, &l.StaffName, &l.HourlyRate); err != nil {
			return nil, err
		}
		l.ID = l.StaffID
		out = append(out, l)
	}
	return out, nil
}

// CreatePeriod persists a payroll period and its snapshot line items in one
// transaction, so history survives later rate edits.
func (r *PayrollRepo) CreatePeriod(ctx context.Context, p *model.PayrollPeriod, lines []model.PayrollLineIn) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // read-only on rollback

	if err := tx.QueryRow(ctx,
		`INSERT INTO payroll_periods (label, start_date, end_date, status, branch_id)
		 VALUES ($1, $2, $3, 'draft', NULLIF($4,'')::uuid) RETURNING id::text, 'draft', created_at`,
		p.Label, p.StartDate, p.EndDate, p.BranchID,
	).Scan(&p.ID, &p.Status, &p.CreatedAt); err != nil {
		return err
	}

	for _, l := range lines {
		if _, err := tx.Exec(ctx,
			`INSERT INTO payroll_line_items (period_id, staff_id, staff_name, hours, hourly_rate, amount)
			 VALUES ($1, $2, $3, $4, $5, $4 * $5)`,
			p.ID, l.StaffID, l.StaffName, l.Hours, l.HourlyRate,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ListPeriods returns periods (without line items) newest first.
func (r *PayrollRepo) ListPeriods(ctx context.Context, branchID string) ([]model.PayrollPeriod, error) {
	query := `SELECT id::text, label, start_date::text, end_date::text, status, branch_id::text, created_at
	          FROM payroll_periods WHERE 1=1`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.PayrollPeriod
	for rows.Next() {
		var p model.PayrollPeriod
		if err := rows.Scan(&p.ID, &p.Label, &p.StartDate, &p.EndDate, &p.Status, &p.BranchID, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// GetPeriod returns one period with its line items.
func (r *PayrollRepo) GetPeriod(ctx context.Context, id string) (*model.PayrollPeriod, error) {
	p := &model.PayrollPeriod{}
	err := r.db.QueryRow(ctx,
		`SELECT id::text, label, start_date::text, end_date::text, status, branch_id::text, created_at
		 FROM payroll_periods WHERE id = $1`, id,
	).Scan(&p.ID, &p.Label, &p.StartDate, &p.EndDate, &p.Status, &p.BranchID, &p.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	lines, err := r.linesFor(ctx, id)
	if err != nil {
		return nil, err
	}
	p.Lines = lines
	return p, nil
}

func (r *PayrollRepo) linesFor(ctx context.Context, periodID string) ([]model.PayrollLine, error) {
	rows, err := r.db.Query(ctx,
		`SELECT staff_id::text, staff_name, hours, hourly_rate, amount
		 FROM payroll_line_items WHERE period_id = $1 ORDER BY staff_name`, periodID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.PayrollLine
	for rows.Next() {
		var l model.PayrollLine
		if err := rows.Scan(&l.StaffID, &l.StaffName, &l.Hours, &l.HourlyRate, &l.Amount); err != nil {
			return nil, err
		}
		l.ID = l.StaffID
		out = append(out, l)
	}
	return out, nil
}

// SetPeriodStatus advances a period: draft → approved → paid.
func (r *PayrollRepo) SetPeriodStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE payroll_periods SET status = $2 WHERE id = $1`, id, status)
	return err
}
