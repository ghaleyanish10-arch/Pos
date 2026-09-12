package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type MarketingRepo struct {
	db *pgxpool.Pool
}

func NewMarketingRepo(db *pgxpool.Pool) *MarketingRepo {
	return &MarketingRepo{db: db}
}

func (r *MarketingRepo) List(ctx context.Context, branchID string) ([]model.Campaign, error) {
	query := `SELECT id, name, channel, COALESCE(audience,''), status, COALESCE(stat,''), ai_generated, branch_id::text, created_at FROM campaigns WHERE 1=1`
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

	var campaigns []model.Campaign
	for rows.Next() {
		var c model.Campaign
		if err := rows.Scan(&c.ID, &c.Name, &c.Channel, &c.Audience, &c.Status, &c.Stat, &c.AIGenerated, &c.BranchID, &c.CreatedAt); err != nil {
			return nil, err
		}
		campaigns = append(campaigns, c)
	}
	return campaigns, nil
}

func (r *MarketingRepo) Create(ctx context.Context, c *model.Campaign) error {
	err := r.db.QueryRow(ctx,
		`INSERT INTO campaigns (name, channel, audience, status, branch_id) VALUES ($1, $2, $3, 'Draft', NULLIF($4,'')::uuid) RETURNING id, created_at`,
		c.Name, c.Channel, c.Audience, c.BranchID,
	).Scan(&c.ID, &c.CreatedAt)
	return err
}

func (r *MarketingRepo) Update(ctx context.Context, id string, c *model.UpdateCampaignRequest) error {
	_, err := r.db.Exec(ctx,
		`UPDATE campaigns SET name = COALESCE(NULLIF($1,''), name), status = COALESCE(NULLIF($2,''), status) WHERE id = $3`,
		c.Name, c.Status, id,
	)
	return err
}
