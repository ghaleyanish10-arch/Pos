-- 014_terminal_branch_binding.sql
--
-- Enforces that approved terminals are bound to exactly one branch, resolved
-- server-side from the APPROVER's account at approval time.
-- The roster, clock-in and terminal-status routes all read tenant scope
-- from this binding. Devices approved under the OLD pre-binding behavior have
-- branch_id NULL; bind them to their approver's branch where that account
-- still resolves and still has a branch. Unresolvable ones stay NULL — they
-- present a setup state (never a cross-tenant roster) until a branch manager
-- re-approves them from the terminal.
--
-- This is intentionally DML (idempotent) rather than a structure change: it
-- repairs live rows so existing approved terminals keep working after the
-- binding contract ships.

UPDATE devices d
SET branch_id = u.branch_id
FROM users u
WHERE d.branch_id IS NULL
  AND d.enabled_by_user_id = u.id
  AND u.branch_id IS NOT NULL
  AND u.deleted_at IS NULL;