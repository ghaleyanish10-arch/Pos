-- Configurable tax rules replace the single tax_rate on store_settings.
-- A branch can layer multiple simultaneous taxes (GST + QST, VAT), price
-- tax-inclusive or tax-exclusive, and override the rate per menu category.
CREATE TABLE IF NOT EXISTS tax_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id     UUID REFERENCES branches (id) ON DELETE CASCADE,
    name          TEXT NOT NULL,            -- "GST", "QST", "VAT"
    rate_percent  NUMERIC(6, 3) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
    -- inclusive: the menu price already contains this tax (VAT-style display).
    -- exclusive: the tax is added on top of the price at checkout.
    inclusive     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Optional per-category override: applies only to items in these
    -- menu_categories (NULL = applies to every category).
    category_ids  UUID[] ,
    priority      INT NOT NULL DEFAULT 0,   -- application order when several rules stack
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rules_branch ON tax_rules (branch_id);

-- Transactions snapshot the exact tax breakdown used at charge time so
-- historical receipts never change when rules are edited later.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tax_breakdown JSONB;
