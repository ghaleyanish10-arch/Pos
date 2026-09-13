package testutil

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/db"
)

const AdminURL = "postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable"

// NewTestPool creates a disposable database named dbName (dropped/recreated),
// runs the migration and seed over it, and returns a connected pool.
// Tests are skipped when Postgres is not reachable on 127.0.0.1:5433.
//
// NOTE: the db package's own tests must not use this helper (it would create
// an import cycle in that test binary); they bootstrap locally instead.
func NewTestPool(t *testing.T, dbName string) *pgxpool.Pool {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		admin, err := pgxpool.New(context.Background(), AdminURL)
		if err != nil || admin.Ping(context.Background()) != nil {
			t.Skip("postgres not available at 127.0.0.1:5433; skipping integration tests")
		}
		defer admin.Close()

		if _, err := admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+dbName); err != nil {
			t.Fatalf("drop test db: %v", err)
		}
		if _, err := admin.Exec(context.Background(), "CREATE DATABASE "+dbName); err != nil {
			t.Fatalf("create test db: %v", err)
		}
		url = "postgres://postgres:postgres@127.0.0.1:5433/" + dbName + "?sslmode=disable"
	}

	pool, err := db.Connect(url)
	if err != nil {
		t.Fatalf("connect to test db: %v", err)
	}
	t.Cleanup(pool.Close)

	// Apply every migration in order so new schemas exist in test DBs too.
	migrations, err := filepath.Glob("../../migrations/*.sql")
	if err != nil || len(migrations) == 0 {
		t.Fatalf("list migrations: %v", err)
	}
	sort.Strings(migrations)
	for _, m := range migrations {
		b, err := os.ReadFile(m)
		if err != nil {
			t.Fatalf("read migration %s: %v", m, err)
		}
		if _, err := pool.Exec(context.Background(), string(b)); err != nil {
			if !strings.Contains(err.Error(), "already exists") {
				t.Fatalf("run migration %s: %v", m, err)
			}
		}
	}
	if err := db.Seed(pool); err != nil {
		t.Fatalf("seed: %v", err)
	}

	return pool
}
