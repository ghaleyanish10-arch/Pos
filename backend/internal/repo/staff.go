package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type StaffRepo struct {
	db *pgxpool.Pool
}

func NewStaffRepo(db *pgxpool.Pool) *StaffRepo {
	return &StaffRepo{db: db}
}

func (r *StaffRepo) List(ctx context.Context, branchID string) ([]model.StaffMember, error) {
	query := `SELECT id, name, role, branch_id::text FROM staff_members WHERE 1=1`
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

	var members []model.StaffMember
	for rows.Next() {
		var m model.StaffMember
		if err := rows.Scan(&m.ID, &m.Name, &m.Role, &m.BranchID); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (r *StaffRepo) Create(ctx context.Context, m *model.StaffMember) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO staff_members (name, role, branch_id) VALUES ($1, $2, NULLIF($3,'')::uuid) RETURNING id`,
		m.Name, m.Role, m.BranchID,
	).Scan(&m.ID)
	return err
}

// Get returns one staff member; pgx.ErrNoRows when the id is unknown.
func (r *StaffRepo) Get(ctx context.Context, id string) (*model.StaffMember, error) {
	var m model.StaffMember
	err := r.db.QueryRow(ctx,
		`SELECT id, name, role, branch_id::text FROM staff_members WHERE id = $1`, id,
	).Scan(&m.ID, &m.Name, &m.Role, &m.BranchID)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *StaffRepo) Update(ctx context.Context, id, name, role string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE staff_members SET name = COALESCE(NULLIF($1,''), name), role = COALESCE(NULLIF($2,''), role) WHERE id = $3`,
		name, role, id,
	)
	return err
}

func (r *StaffRepo) ListShifts(ctx context.Context, branchID string) ([]model.Shift, error) {
	query := `SELECT s.id, s.staff_id, sm.name, s.day, s.start_time, s.end_time, s.role, s.branch_id::text FROM shifts s JOIN staff_members sm ON s.staff_id = sm.id WHERE 1=1`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND s.branch_id = $1`
		args = append(args, branchID)
	}
	query += ` ORDER BY CASE s.day WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3 WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7 END, s.start_time`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shifts []model.Shift
	for rows.Next() {
		var s model.Shift
		if err := rows.Scan(&s.ID, &s.StaffID, &s.StaffName, &s.Day, &s.StartTime, &s.EndTime, &s.Role, &s.BranchID); err != nil {
			return nil, err
		}
		shifts = append(shifts, s)
	}
	return shifts, nil
}

func (r *StaffRepo) CreateShift(ctx context.Context, s *model.Shift) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO shifts (staff_id, day, start_time, end_time, role, branch_id) VALUES ($1, $2, $3, $4, $5, NULLIF($6,'')::uuid) RETURNING id`,
		s.StaffID, s.Day, s.StartTime, s.EndTime, s.Role, s.BranchID,
	).Scan(&s.ID)
	return err
}

func (r *StaffRepo) UpdateShift(ctx context.Context, id string, s *model.UpdateShiftRequest) error {
	_, err := r.db.Exec(ctx,
		`UPDATE shifts SET day = COALESCE(NULLIF($1,''), day), start_time = COALESCE(NULLIF($2,''), start_time), end_time = COALESCE(NULLIF($3,''), end_time), role = COALESCE(NULLIF($4,''), role) WHERE id = $5`,
		s.Day, s.StartTime, s.EndTime, s.Role, id,
	)
	return err
}

func (r *StaffRepo) DeleteShift(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM shifts WHERE id = $1`, id)
	return err
}
