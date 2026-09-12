package repo

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type GuestRepo struct {
	db *pgxpool.Pool
}

func NewGuestRepo(db *pgxpool.Pool) *GuestRepo {
	return &GuestRepo{db: db}
}

func (r *GuestRepo) List(ctx context.Context, branchID, tier string) ([]model.Guest, error) {
	query := `SELECT id, name, COALESCE(email,''), COALESCE(phone,''), COALESCE(initials,''), visits, last_visit, avg_spend, tier, segments, COALESCE(note,''), branch_id::text, created_at FROM guests WHERE deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}
	if tier != "" {
		query += ` AND tier = $` + itoa(argIdx)
		args = append(args, tier)
		argIdx++
	}

	query += ` ORDER BY name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var guests []model.Guest
	for rows.Next() {
		var g model.Guest
		if err := rows.Scan(&g.ID, &g.Name, &g.Email, &g.Phone, &g.Initials, &g.Visits, &g.LastVisit, &g.AvgSpend, &g.Tier, &g.Segments, &g.Note, &g.BranchID, &g.CreatedAt); err != nil {
			return nil, err
		}
		guests = append(guests, g)
	}
	return guests, nil
}

func (r *GuestRepo) GetByID(ctx context.Context, id string) (*model.Guest, error) {
	var g model.Guest
	err := r.db.QueryRow(ctx,
		`SELECT id, name, COALESCE(email,''), COALESCE(phone,''), COALESCE(initials,''), visits, last_visit, avg_spend, tier, segments, COALESCE(note,''), branch_id::text, created_at FROM guests WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&g.ID, &g.Name, &g.Email, &g.Phone, &g.Initials, &g.Visits, &g.LastVisit, &g.AvgSpend, &g.Tier, &g.Segments, &g.Note, &g.BranchID, &g.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *GuestRepo) Create(ctx context.Context, g *model.Guest) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO guests (name, email, phone, initials, tier, segments, note, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8,'')::uuid) RETURNING id, created_at`,
		g.Name, g.Email, g.Phone, g.Initials, g.Tier, g.Segments, g.Note, g.BranchID,
	).Scan(&g.ID, &g.CreatedAt)
	return err
}

func (r *GuestRepo) Update(ctx context.Context, id string, g *model.UpdateGuestRequest) error {
	segments := "[]"
	if len(g.Segments) > 0 {
		b, _ := marshalJSON(g.Segments)
		segments = string(b)
	}
	_, err := r.db.Exec(ctx,
		`UPDATE guests SET name = COALESCE(NULLIF($1,''), name), email = COALESCE(NULLIF($2,''), email), phone = COALESCE(NULLIF($3,''), phone), tier = COALESCE(NULLIF($4,''), tier), segments = $5::jsonb, note = COALESCE(NULLIF($6,''), note) WHERE id = $7`,
		g.Name, g.Email, g.Phone, g.Tier, segments, g.Note, id,
	)
	return err
}

func (r *GuestRepo) Timeline(ctx context.Context, guestID string) ([]model.GuestTimelineEntry, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, guest_id, event_type, COALESCE(detail, ''), created_at FROM guest_timeline WHERE guest_id = $1 ORDER BY created_at DESC`, guestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.GuestTimelineEntry
	for rows.Next() {
		var e model.GuestTimelineEntry
		if err := rows.Scan(&e.ID, &e.GuestID, &e.EventType, &e.Detail, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func marshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}
