package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type ReviewRepo struct {
	db *pgxpool.Pool
}

func NewReviewRepo(db *pgxpool.Pool) *ReviewRepo {
	return &ReviewRepo{db: db}
}

func (r *ReviewRepo) List(ctx context.Context, platform string) ([]model.Review, error) {
	query := `SELECT id, author, platform, rating, COALESCE(text, ''), answered, COALESCE(reply, ''), branch_id::text, created_at FROM reviews WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if platform != "" {
		query += ` AND platform = $` + itoa(argIdx)
		args = append(args, platform)
		argIdx++
	}

	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []model.Review
	for rows.Next() {
		var rv model.Review
		if err := rows.Scan(&rv.ID, &rv.Author, &rv.Platform, &rv.Rating, &rv.Text, &rv.Answered, &rv.Reply, &rv.BranchID, &rv.CreatedAt); err != nil {
			return nil, err
		}
		reviews = append(reviews, rv)
	}
	return reviews, nil
}

func (r *ReviewRepo) Reply(ctx context.Context, id, reply string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE reviews SET reply = $1, answered = true WHERE id = $2`, reply, id,
	)
	return err
}
