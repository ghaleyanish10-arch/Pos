package repo

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type PrinterRepo struct {
	db *pgxpool.Pool
}

func NewPrinterRepo(db *pgxpool.Pool) *PrinterRepo {
	return &PrinterRepo{db: db}
}

// List returns every printer assignment for a branch.
func (r *PrinterRepo) List(ctx context.Context, branchID string) ([]model.PrinterAssignment, error) {
	query := `SELECT id::text, branch_id::text, station, printer, role FROM printer_assignments WHERE 1=1`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND (branch_id = $1 OR branch_id IS NULL)`
		args = append(args, branchID)
	}
	query += ` ORDER BY station, role`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.PrinterAssignment
	for rows.Next() {
		var p model.PrinterAssignment
		if err := rows.Scan(&p.ID, &p.BranchID, &p.Station, &p.Printer, &p.Role); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// Save upserts one station→printer→role assignment.
func (r *PrinterRepo) Save(ctx context.Context, branchID string, req model.SavePrinterRequest) (*model.PrinterAssignment, error) {
	p := &model.PrinterAssignment{Station: req.Station, Printer: req.Printer, Role: req.Role}
	err := r.db.QueryRow(ctx,
		`INSERT INTO printer_assignments (branch_id, station, printer, role)
		 VALUES (NULLIF($1,'')::uuid, $2, $3, $4)
		 ON CONFLICT (branch_id, station, role) DO UPDATE SET printer = EXCLUDED.printer
		 RETURNING id::text, branch_id::text`,
		branchID, req.Station, req.Printer, req.Role,
	).Scan(&p.ID, &p.BranchID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

// Delete removes an assignment.
func (r *PrinterRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM printer_assignments WHERE id = $1`, id)
	return err
}
