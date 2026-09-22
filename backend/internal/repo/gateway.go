package repo

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type GatewayRepo struct {
	db *pgxpool.Pool
}

func NewGatewayRepo(db *pgxpool.Pool) *GatewayRepo {
	return &GatewayRepo{db: db}
}

// List returns every configured gateway for a branch (client-safe shapes).
func (r *GatewayRepo) List(ctx context.Context, branchID string) ([]model.GatewayStatus, error) {
	query := `SELECT provider, merchant_id, api_key <> '', sandbox, enabled FROM payment_gateways WHERE 1=1`
	args := []interface{}{}
	if branchID != "" {
		query += ` AND (branch_id = $1 OR branch_id IS NULL)`
		args = append(args, branchID)
	}
	query += ` ORDER BY provider`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.GatewayStatus
	for rows.Next() {
		var g model.GatewayStatus
		if err := rows.Scan(&g.Provider, &g.MerchantID, &g.HasAPIKey, &g.Sandbox, &g.Enabled); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, nil
}

// Save upserts one gateway's credentials. An empty API key keeps the stored
// one, so the UI never needs to echo the secret back.
func (r *GatewayRepo) Save(ctx context.Context, branchID, provider string, req model.SaveGatewayRequest) error {
	tag, err := r.db.Exec(ctx,
		`INSERT INTO payment_gateways (branch_id, provider, merchant_id, api_key, sandbox, enabled)
		 VALUES (NULLIF($1,'')::uuid, $2, $3, $4, $5, $6)
		 ON CONFLICT (branch_id, provider) DO UPDATE SET
		   merchant_id = EXCLUDED.merchant_id,
		   api_key = CASE WHEN EXCLUDED.api_key = '' THEN payment_gateways.api_key ELSE EXCLUDED.api_key END,
		   sandbox = EXCLUDED.sandbox,
		   enabled = EXCLUDED.enabled`,
		branchID, provider, req.MerchantID, req.APIKey, req.Sandbox, req.Enabled,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// IsEnabled reports whether a provider is configured and switched on.
func (r *GatewayRepo) IsEnabled(ctx context.Context, provider string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx,
		`SELECT enabled FROM payment_gateways WHERE provider = $1 ORDER BY branch_id NULLS LAST LIMIT 1`,
		provider,
	).Scan(&ok)
	if err != nil {
		return false, err
	}
	return ok, nil
}
