-- PIN-based role elevation (step-up auth) for privileged actions.
-- The login password authenticates a session; the PIN authorizes a single
-- privileged action on a shared terminal. The two are fully independent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

-- Single-use elevation tokens: signature proves authenticity, the jti row
-- proves non-replay (consumed atomically on first use).
CREATE TABLE IF NOT EXISTS elevation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jti TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_id TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elevation_tokens_user ON elevation_tokens(user_id);

-- Server-persisted notifications (lockouts, high-risk approvals).
-- target_role filters who sees the event; payload is typed jsonb.
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_role TEXT NOT NULL DEFAULT 'Store Manager',
    branch_id UUID REFERENCES branches (id),
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Minimal refund integrity for separation of duties: record who created the
-- refund so approval can reject self-approval. Backfill is not possible for
-- historical rows, so existing refunds keep NULL (they predate the feature).
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users (id);

-- audit_events already carries actor_id/actor_name/actor_role/event_type/
-- summary/before_json/after_json/branch_id — elevation attempts (success and
-- failure) fit without schema changes, reusing the existing audit trail.
