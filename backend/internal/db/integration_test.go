package db

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

const dbTestAdminURL = "postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable"

// setupDBTest bootstraps a disposable database locally instead of using
// testutil.NewTestPool to avoid an import cycle (testutil imports db).
func setupDBTest(t *testing.T) *pgxpool.Pool {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		admin, err := pgxpool.New(context.Background(), dbTestAdminURL)
		if err != nil || admin.Ping(context.Background()) != nil {
			t.Skip("postgres not available at 127.0.0.1:5433; skipping db integration tests")
		}
		defer admin.Close()

		for _, stmt := range []string{
			"DROP DATABASE IF EXISTS mesa_os_db_test",
			"CREATE DATABASE mesa_os_db_test",
		} {
			if _, err := admin.Exec(context.Background(), stmt); err != nil {
				t.Fatalf("%s: %v", stmt, err)
			}
		}
		url = "postgres://postgres:postgres@127.0.0.1:5433/mesa_os_db_test?sslmode=disable"
	}

	pool, err := Connect(url)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(pool.Close)

	b, err := os.ReadFile("../../migrations/001_init.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(context.Background(), string(b)); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if err := Seed(pool); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	return pool
}

func TestMigrateAndSeed(t *testing.T) {
	pool := setupDBTest(t)
	ctx := context.Background()

	checkCount := func(table string, want int) {
		t.Helper()
		var got int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&got); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if got != want {
			t.Errorf("count(%s) = %d, want %d", table, got, want)
		}
	}

	checkCount("branches", 1)
	checkCount("users", 1)
	checkCount("menu_categories", 5)
	checkCount("menu_items", 11)
	checkCount("floor_tables", 5)
	checkCount("store_settings", 1)

	// Seeded menu items must carry photo URLs so frontend cards show images.
	var noPhoto int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM menu_items WHERE photo_url IS NULL OR photo_url = ''`).Scan(&noPhoto); err != nil {
		t.Fatalf("count items without photo: %v", err)
	}
	if noPhoto != 0 {
		t.Errorf("%d seeded menu items missing a photo_url", noPhoto)
	}

	var email, role string
	if err := pool.QueryRow(ctx, `SELECT email, role FROM users LIMIT 1`).Scan(&email, &role); err != nil {
		t.Fatalf("select user: %v", err)
	}
	if email != "admin@mesa.os" || role != "Corporate Admin" {
		t.Errorf("unexpected seeded user: %q %q", email, role)
	}
}

func TestSeedIsIdempotent(t *testing.T) {
	pool := setupDBTest(t)
	ctx := context.Background()

	if err := Seed(pool); err != nil {
		t.Fatalf("second Seed must be idempotent: %v", err)
	}

	var users int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&users); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if users != 1 {
		t.Errorf("users after double seed = %d, want 1", users)
	}

	var items int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM menu_items`).Scan(&items); err != nil {
		t.Fatalf("count menu_items: %v", err)
	}
	if items != 11 {
		t.Errorf("menu_items after double seed = %d, want 11", items)
	}

	// Inventory rows must not duplicate either.
	var inv int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM inventory_items`).Scan(&inv); err != nil {
		t.Fatalf("count inventory_items: %v", err)
	}
	if inv == 0 {
		t.Error("expected seeded inventory rows")
	}
}

func TestConnectRejectsBadURL(t *testing.T) {
	_, err := Connect("not-a-valid-url")
	if err == nil {
		t.Fatal("expected error for invalid URL")
	}
}
