package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Migrate applies every migrations/*.sql file in sorted filename order so new
// migrations run on databases that already have the earlier ones. Statements
// are idempotent (IF NOT EXISTS); any residual "already exists" errors from
// the base migration are tolerated so re-running is always safe.
func Migrate(pool *pgxpool.Pool) error {
	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		return fmt.Errorf("failed to list migrations: %w", err)
	}
	if len(files) == 0 {
		return fmt.Errorf("no migration files found in migrations/")
	}
	sort.Strings(files)

	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("failed to read migration %s: %w", f, err)
		}
		if _, err := pool.Exec(context.Background(), string(content)); err != nil {
			if strings.Contains(err.Error(), "already exists") {
				log.Printf("Migration %s: objects already exist, skipping", filepath.Base(f))
				continue
			}
			return fmt.Errorf("failed to run migration %s: %w", f, err)
		}
		log.Printf("Migration applied: %s", filepath.Base(f))
	}

	log.Println("Migrations applied successfully")
	return nil
}
