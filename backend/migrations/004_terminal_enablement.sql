-- Terminal enablement: a device must be explicitly approved for its branch by
-- a manager or boss before staff can clock in on it. This replaces the old
-- static "device token" env credential — there is no secret material here:
-- a terminal identifies itself with a client-generated UUID (X-Device-Id),
-- and approval is simply a row in this table.
CREATE TABLE IF NOT EXISTS devices (
    id                 TEXT PRIMARY KEY,
    branch_id          UUID REFERENCES branches(id) ON DELETE SET NULL,
    enabled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    enabled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_branch ON devices (branch_id);
