-- VAT rate per branch, used by the reports Overview to derive tax collected
-- from settled sales. 13 is the Nepal standard rate and the app's default.
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 13;