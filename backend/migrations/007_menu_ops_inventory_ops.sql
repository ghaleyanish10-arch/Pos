-- Operational upgrades for menu management and inventory control.
-- Idempotent: safe to re-run against any environment.

-- ── Menu: unit cost for stock valuation, scheduling, variants, modifiers ──
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS schedule_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6'; -- 0=Sun..6=Sat
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS schedule_start TEXT NOT NULL DEFAULT '00:00';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS schedule_end TEXT NOT NULL DEFAULT '23:59';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifiers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;

-- ── Waste log ──
CREATE TABLE IF NOT EXISTS waste_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    qty         NUMERIC(10,2) NOT NULL,
    reason      TEXT NOT NULL,
    cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
    branch_id   UUID REFERENCES branches(id),
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waste_log_created ON waste_log(created_at DESC);
