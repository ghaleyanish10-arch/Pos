-- Offline-first: order payloads are written to durable storage before the
-- network attempt and replayed on reconnect. Postgres-side idempotency: a
-- client-generated order key (UUID) makes replays of the same queued write a
-- no-op instead of a duplicate order. The column is also stamped on existing
-- orders so old clients (no key) stay compatible.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency
    ON orders (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;
