package db

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Migrate(pool *pgxpool.Pool) error {
	content, err := os.ReadFile("migrations/001_init.sql")
	if err != nil {
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	_, err = pool.Exec(context.Background(), string(content))
	if err != nil {
		return fmt.Errorf("failed to run migration: %w", err)
	}

	log.Println("Migrations applied successfully")
	return nil
}
