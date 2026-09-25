-- 010_table_flags.sql
-- Manual floor-table flags that back the derived FOH states 'Check dropped'
-- and 'Needs attention':
--   * bill_dropped     -> 'Check dropped' while the table still holds an open
--                         order (a waiter has dropped the paper check).
--   * needs_attention + attention_note -> 'Needs attention' (allergy, guest
--                         complaint, spill, ...). Always wins the derivation
--                         so an open flag can never be buried behind another
--                         state; bill_dropped stays set beneath it.
ALTER TABLE floor_tables
    ADD COLUMN IF NOT EXISTS bill_dropped    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS attention_note  TEXT    NOT NULL DEFAULT '';