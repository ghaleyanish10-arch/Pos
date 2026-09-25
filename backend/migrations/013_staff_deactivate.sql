-- 013_staff_deactivate.sql
-- Staff deactivation. A deactivated staff member keeps their row (shift and
-- payroll history stay intact and queryable) but is hidden from the active
-- roster and the payroll rate list. NULL = active, mirroring users.deleted_at.
ALTER TABLE staff_members
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;