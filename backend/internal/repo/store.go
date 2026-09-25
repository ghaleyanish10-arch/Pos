package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type StoreRepo struct {
	db *pgxpool.Pool
}

func NewStoreRepo(db *pgxpool.Pool) *StoreRepo {
	return &StoreRepo{db: db}
}

func (r *StoreRepo) GetSettings(ctx context.Context, branchID string) (*model.StoreSettings, error) {
	var s model.StoreSettings
	err := r.db.QueryRow(ctx,
		`SELECT id, branch_id::text, theme, delivery_zones, payment_methods, tax_rate, updated_at FROM store_settings WHERE branch_id = $1`, branchID,
	).Scan(&s.ID, &s.BranchID, &s.Theme, &s.DeliveryZones, &s.PaymentMethods, &s.TaxRate, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *StoreRepo) UpsertSettings(ctx context.Context, s *model.StoreSettings) error {
	var theme, zones, methods *string
	if s.Theme != "" {
		theme = &s.Theme
	}
	if s.DeliveryZones != nil {
		tmp := string(s.DeliveryZones)
		zones = &tmp
	}
	if s.PaymentMethods != nil {
		tmp := string(s.PaymentMethods)
		methods = &tmp
	}

	_, err := r.db.Exec(ctx,
		`INSERT INTO store_settings (branch_id, theme, delivery_zones, payment_methods, tax_rate)
		 VALUES ($1, COALESCE($2, 'default'), COALESCE($3::jsonb, '[]'::jsonb), COALESCE($4::jsonb, '[]'::jsonb), COALESCE($5, 13))
		 ON CONFLICT (branch_id) DO UPDATE SET
		   theme = COALESCE($2, store_settings.theme),
		   delivery_zones = COALESCE($3::jsonb, store_settings.delivery_zones),
		   payment_methods = COALESCE($4::jsonb, store_settings.payment_methods),
		   tax_rate = COALESCE($5, store_settings.tax_rate),
		   updated_at = now()`,
		s.BranchID, theme, zones, methods, s.TaxRate,
	)
	return err
}
