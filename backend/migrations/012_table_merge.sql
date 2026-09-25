-- 012_table_merge.sql
-- Merged-table grouping. When two floor tables are merged the SOURCE table's
-- row keeps existing but points at the target: merged_into = target table id.
-- BookingRepo.ListTables excludes child rows (merged_into IS NOT NULL) and
-- enriches the parent with the child names/seats so the frontend can render
-- ONE combined card ("T8 + T9"). Closing or fully paying the combined check
-- clears the link on both sides, so both tables return to independently
-- vacant.
ALTER TABLE floor_tables
    ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES floor_tables(id);