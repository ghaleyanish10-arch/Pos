-- =============================================================
-- Split billing, local payment gateways, payroll, printer config.
-- Restronp-style color language applies on the UI side; this migration
-- only adds the data these features need.
-- =============================================================

-- 1. Split bills: every payment segment is its own transactions row; they
--    share order_id (already a column) and are grouped by bill_split_id so
--    the register can show "2 of 3 segments paid" at a glance.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bill_split_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_note TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_transactions_split ON transactions (bill_split_id);

-- 2. Payment gateways (eSewa / Khalti / IME Pay). Merchant credentials are
--    stored server-side only; keys never travel to the browser. The API
--    answers are stubbed in the handler until real SDKs are wired.
CREATE TABLE IF NOT EXISTS payment_gateways (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id    UUID REFERENCES branches(id),
    provider     TEXT NOT NULL CHECK (provider IN ('esewa', 'khalti', 'imepay')),
    merchant_id  TEXT NOT NULL DEFAULT '',
    api_key      TEXT NOT NULL DEFAULT '',
    sandbox      BOOLEAN NOT NULL DEFAULT true,
    enabled      BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (branch_id, provider)
);

-- 3. Payroll: hourly rate lives on staff_members; periods snapshot the
--    computed line items so history survives later rate edits.
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS payroll_periods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label      TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    branch_id  UUID REFERENCES branches(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_line_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id      UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    staff_id       UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    staff_name     TEXT NOT NULL,
    hours          NUMERIC(7,2) NOT NULL DEFAULT 0,
    hourly_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
    amount         NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_period ON payroll_line_items (period_id);

-- 4. Printer configuration: which physical printer a station's KOT or
--    receipt output goes to. Config-only until real driver integration.
CREATE TABLE IF NOT EXISTS printer_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id   UUID REFERENCES branches(id),
    station     TEXT NOT NULL,
    printer     TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('kot', 'receipt')),
    UNIQUE (branch_id, station, role)
);
