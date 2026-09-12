package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type FeedbackRepo struct {
	db *pgxpool.Pool
}

func NewFeedbackRepo(db *pgxpool.Pool) *FeedbackRepo {
	return &FeedbackRepo{db: db}
}

func (r *FeedbackRepo) List(ctx context.Context, resolved *bool) ([]model.SurveyResponse, error) {
	query := `SELECT id, guest_id::text, COALESCE(guest_name, ''), table_id::text, rating, COALESCE(comment, ''), resolved, escalated, branch_id::text, created_at FROM survey_responses WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if resolved != nil {
		query += ` AND resolved = $` + itoa(argIdx)
		args = append(args, *resolved)
		argIdx++
	}

	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var responses []model.SurveyResponse
	for rows.Next() {
		var r2 model.SurveyResponse
		if err := rows.Scan(&r2.ID, &r2.GuestID, &r2.GuestName, &r2.TableID, &r2.Rating, &r2.Comment, &r2.Resolved, &r2.Escalated, &r2.BranchID, &r2.CreatedAt); err != nil {
			return nil, err
		}
		responses = append(responses, r2)
	}
	return responses, nil
}

func (r *FeedbackRepo) Resolve(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE survey_responses SET resolved = true WHERE id = $1`, id)
	return err
}

func (r *FeedbackRepo) Escalate(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE survey_responses SET escalated = true WHERE id = $1`, id)
	return err
}
