package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/model"
)

type OrgRepo struct {
	db *pgxpool.Pool
}

func NewOrgRepo(db *pgxpool.Pool) *OrgRepo {
	return &OrgRepo{db: db}
}

func (r *OrgRepo) Create(ctx context.Context, name, currency string) (model.Organization, error) {
	if currency == "" {
		currency = "NPR"
	}
	var org model.Organization
	err := r.db.QueryRow(ctx,
		`INSERT INTO organizations (name, currency) VALUES ($1, $2) RETURNING id::text, name, currency, created_at`,
		name, currency,
	).Scan(&org.ID, &org.Name, &org.Currency, &org.CreatedAt)
	return org, err
}

func (r *OrgRepo) Get(ctx context.Context, id string) (model.Organization, error) {
	var org model.Organization
	err := r.db.QueryRow(ctx,
		`SELECT id::text, name, currency, created_at FROM organizations WHERE id = $1::uuid`, id,
	).Scan(&org.ID, &org.Name, &org.Currency, &org.CreatedAt)
	return org, err
}

func (r *OrgRepo) List(ctx context.Context) ([]model.Organization, error) {
	rows, err := r.db.Query(ctx, `SELECT id::text, name, currency, created_at FROM organizations ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Organization
	for rows.Next() {
		var o model.Organization
		if err := rows.Scan(&o.ID, &o.Name, &o.Currency, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

func (r *OrgRepo) Update(ctx context.Context, id, name, currency string) (model.Organization, error) {
	var org model.Organization
	err := r.db.QueryRow(ctx,
		`UPDATE organizations SET name = COALESCE(NULLIF($2, ''), name), currency = COALESCE(NULLIF($3, ''), currency) WHERE id = $1::uuid RETURNING id::text, name, currency, created_at`,
		id, name, currency,
	).Scan(&org.ID, &org.Name, &org.Currency, &org.CreatedAt)
	return org, err
}

// BranchOrg returns the organization a branch belongs to. Used by the RBAC
// middleware to resolve which org a branch-scoped request touches.
func (r *OrgRepo) BranchOrg(ctx context.Context, branchID string) (string, error) {
	var orgID string
	err := r.db.QueryRow(ctx,
		`SELECT organization_id::text FROM branches WHERE id = $1::uuid AND organization_id IS NOT NULL`,
		branchID,
	).Scan(&orgID)
	return orgID, err
}

// UserOrg returns the organization a user belongs to.
func (r *OrgRepo) UserOrg(ctx context.Context, userID string) (string, error) {
	var orgID string
	err := r.db.QueryRow(ctx,
		`SELECT organization_id::text FROM users WHERE id = $1::uuid AND organization_id IS NOT NULL`,
		userID,
	).Scan(&orgID)
	return orgID, err
}

// ListBranches returns the branches of one organization.
func (r *OrgRepo) ListBranches(ctx context.Context, orgID string) ([]model.Branch, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id::text, name, status, COALESCE(address, '') FROM branches WHERE organization_id = $1::uuid ORDER BY name`,
		orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Branch
	for rows.Next() {
		var b model.Branch
		if err := rows.Scan(&b.ID, &b.Name, &b.Status, &b.Address); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}
