-- Multi-tenant layer: an organization (the business) owns many branches.
-- Every signup now creates an org + its first branch; users carry org_id so
-- RBAC can scope access organization-first, branch-second. Currency lives on
-- the organization (ISO 4217) so all branches of one business report in the
-- same money format.
CREATE TABLE IF NOT EXISTS organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    currency   TEXT NOT NULL DEFAULT 'NPR' CHECK (currency IN ('NPR', 'CAD', 'EUR', 'USD', 'GBP')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every branch belongs to exactly one organization.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;

-- Users carry their organization so a JWT claim can authorize org-wide
-- actions (reports across branches, staff management) before branch scoping.
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE SET NULL;

-- Audit events are org-scoped too so cross-branch exports stay filterable.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_branches_org ON branches (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users (organization_id);

-- Backfill: any branch/user created before this migration belongs to a single
-- implicit organization. Create it once and link everything to it so the
-- demo/seed DB keeps working with zero manual steps.
DO $$
DECLARE
    org_id UUID;
    has_rows BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM branches) OR EXISTS (SELECT 1 FROM users) INTO has_rows;
    IF NOT has_rows THEN
        RETURN; -- fresh install: no backfill needed, signup creates the first org
    END IF;

    SELECT id INTO org_id FROM organizations LIMIT 1;
    IF org_id IS NULL THEN
        INSERT INTO organizations (name, currency) VALUES ('Mesa OS Demo', 'NPR') RETURNING id INTO org_id;
    END IF;

    UPDATE branches SET organization_id = org_id WHERE organization_id IS NULL;
    UPDATE users SET organization_id = org_id WHERE organization_id IS NULL;
    UPDATE audit_events SET organization_id = org_id WHERE organization_id IS NULL;
END $$;
