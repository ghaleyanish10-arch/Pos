package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type AuditRepo struct {
	db *pgxpool.Pool
}

func NewAuditRepo(db *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{db: db}
}

func (r *AuditRepo) List(ctx context.Context, branchID string, limit int) ([]model.AuditEvent, error) {
	if limit <= 0 {
		limit = 100
	}

	query := `SELECT id, actor_id::text, actor_name, actor_role, event_type, summary, before_json, after_json, branch_id::text, created_at FROM audit_events WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if branchID != "" {
		query += ` AND branch_id = $` + itoa(argIdx)
		args = append(args, branchID)
		argIdx++
	}

	query += ` ORDER BY created_at DESC LIMIT $` + itoa(argIdx)
	args = append(args, limit)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []model.AuditEvent
	for rows.Next() {
		var e model.AuditEvent
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorName, &e.ActorRole, &e.EventType, &e.Summary, &e.BeforeJSON, &e.AfterJSON, &e.BranchID, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (r *AuditRepo) Create(ctx context.Context, e *model.AuditEvent) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO audit_events (actor_id, actor_name, actor_role, event_type, summary, before_json, after_json, branch_id) VALUES (NULLIF($1,'')::uuid, $2, $3, $4, $5, $6, $7, NULLIF($8,'')::uuid) RETURNING id, created_at`,
		e.ActorID, e.ActorName, e.ActorRole, e.EventType, e.Summary, e.BeforeJSON, e.AfterJSON, e.BranchID,
	).Scan(&e.ID, &e.CreatedAt)
	return err
}
