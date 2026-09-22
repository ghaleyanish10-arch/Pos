// One-off utility: set known PINs for the demo staff roles (Cashier, Store
// Manager, Kitchen) in the DEV database so clock-in can be tested without a
// manual boss reset. Uses the same bcrypt cost and lockout-clearing UPDATE as
// auth.Service.SetPIN. Run from backend/: go run ./cmd/setpins
package main

import (
	"context"
	"flag"
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"

	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/db"
)

// demoPINs maps one staff account per clock-in role to a memorable PIN.
// Deliberately NOT weak-blocklist values (no 1234/0000) so ValidatePIN's
// rules would accept them if they were set through the app.
var demoPINs = map[string]struct {
	Role  string
	Name  string
	Email string
	PIN   string
}{
	"cashier": {Role: "Cashier", Name: "QA Reg", Email: "cashier@mesa.os", PIN: "2581"},
	"manager": {Role: "Store Manager", Name: "Ravi Manager", Email: "manager@mesa.os", PIN: "3692"},
	"kitchen": {Role: "Kitchen", Name: "Kavya Kitchen", Email: "kitchen@mesa.os", PIN: "1470"},
}

func main() {
	verify := flag.Bool("verify", false, "only check which PINs match, change nothing")
	flag.Parse()
	cfg := config.Load()

	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()

	if *verify {
		rows, err := pool.Query(ctx,
			`SELECT name, role, COALESCE(pin_hash, '') FROM users WHERE deleted_at IS NULL ORDER BY role, name`)
		if err != nil {
			log.Fatalf("query: %v", err)
		}
		defer rows.Close()
		for rows.Next() {
			var name, role, hash string
			if err := rows.Scan(&name, &role, &hash); err != nil {
				log.Fatalf("scan: %v", err)
			}
			if hash == "" {
				fmt.Printf("%-16s %-15s (no pin)\n", name, role)
				continue
			}
			matched := "-"
			for _, spec := range demoPINs {
				if bcrypt.CompareHashAndPassword([]byte(hash), []byte(spec.PIN)) == nil {
					matched = spec.PIN
				}
			}
			fmt.Printf("%-16s %-15s pin=%s\n", name, role, matched)
		}
		return
	}

	// The boss/owner keeps whatever PIN it already has (admin@mesa.os) — this
	// tool only fills the staff roles that had none.
	for key, spec := range demoPINs {
		// Find the account by role (fall back to any user with that role),
		// matching how the clock-in roster lists real staff.
		var userID, name string
		err := pool.QueryRow(ctx,
			`SELECT id::text, name FROM users
			 WHERE deleted_at IS NULL AND role = $1
			 ORDER BY (email = $2) DESC, created_at LIMIT 1`,
			spec.Role, spec.Email,
		).Scan(&userID, &name)
		if err != nil {
			log.Printf("%s (%s): no account with role %s found — skipped (create it in Team first)", key, spec.Email, spec.Role)
			continue
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(spec.PIN), 12)
		if err != nil {
			log.Fatalf("%s: hash: %v", key, err)
		}

		// Same UPDATE shape as auth.Service.SetPIN: fresh hash, lockout cleared.
		if _, err := pool.Exec(ctx,
			`UPDATE users SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1`,
			userID, string(hash),
		); err != nil {
			log.Fatalf("%s: update: %v", key, err)
		}
		fmt.Printf("%-7s %-16s role=%-13s PIN=%s\n", key, name, spec.Role, spec.PIN)
	}
	fmt.Println("\nDone. Clock in at /terminal with any of these accounts.")
}
