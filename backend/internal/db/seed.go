package db

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var seedMenuData = []struct {
	Name      string
	Category  string
	Price     float64
	Photo     string
	Available bool
}{
	{Name: "Chicken Momo", Category: "Momo & Snacks", Price: 390, Photo: "/4caa9d6c-3170-483a-b58c-9d3af445393f.jpg", Available: true},
	{Name: "Momo Jhol", Category: "Momo & Snacks", Price: 420, Photo: "/4caa9d6c-3170-483a-b58c-9d3af445393f.jpg", Available: true},
	{Name: "Veg Momo", Category: "Momo & Snacks", Price: 320, Photo: "/4caa9d6c-3170-483a-b58c-9d3af445393f.jpg", Available: false},
	{Name: "Thakali Set", Category: "Mains", Price: 995, Photo: "/05d31d73-f590-4f11-b69b-acf220eb9721.jpg", Available: true},
	{Name: "Dal Bhat", Category: "Mains", Price: 720, Photo: "/05d31d73-f590-4f11-b69b-acf220eb9721.jpg", Available: true},
	{Name: "Buff Sekuwa", Category: "Grill", Price: 680, Photo: "/47998fc4-c2c1-4afd-ac79-8f2ac4bb1b53.jpg", Available: true},
	{Name: "Chicken Chilli", Category: "Grill", Price: 520, Photo: "/47998fc4-c2c1-4afd-ac79-8f2ac4bb1b53.jpg", Available: true},
	{Name: "Mint Mojito", Category: "Bar", Price: 450, Photo: "/ddfcee9d-8785-4548-a263-37d152418943.jpg", Available: true},
	{Name: "Old Fashioned", Category: "Bar", Price: 750, Photo: "/ddfcee9d-8785-4548-a263-37d152418943.jpg", Available: false},
	{Name: "Cheesecake", Category: "Dessert", Price: 480, Photo: "/f687e08d-0c8d-4a98-be44-503c99a75d88.jpg", Available: true},
	{Name: "Tiramisu", Category: "Dessert", Price: 520, Photo: "/f687e08d-0c8d-4a98-be44-503c99a75d88.jpg", Available: true},
}

// Seed bootstraps idempotent demo data: a default branch, a Corporate Admin
// account, and a starter menu with categories. Safe to run on every startup.
func Seed(pool *pgxpool.Pool) error {
	ctx := context.Background()

	branchID, err := ensureBranch(ctx, pool)
	if err != nil {
		return err
	}

	if err := ensureAdmin(ctx, pool, branchID); err != nil {
		return err
	}

	if err := seedMenu(ctx, pool, branchID); err != nil {
		return err
	}

	if err := ensureStoreSettings(ctx, pool, branchID); err != nil {
		return err
	}

	if err := seedTables(ctx, pool, branchID); err != nil {
		return err
	}

	if err := seedInventory(ctx, pool, branchID); err != nil {
		return err
	}

	if err := seedInvoices(ctx, pool, branchID); err != nil {
		return err
	}

	log.Println("Seed data ready")
	return nil
}

func ensureBranch(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	var branchID string
	err := pool.QueryRow(ctx, `SELECT id FROM branches ORDER BY created_at LIMIT 1`).Scan(&branchID)
	if err == nil {
		return branchID, nil
	}

	err = pool.QueryRow(ctx,
		`INSERT INTO branches (name, status, address) VALUES ('Downtown Branch', 'Online', 'Jyatha, Kathmandu') RETURNING id`,
	).Scan(&branchID)
	if err != nil {
		return "", err
	}
	return branchID, nil
}

func ensureAdmin(ctx context.Context, pool *pgxpool.Pool, branchID string) error {
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE email = 'admin@mesa.os')`,
	).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), 12)
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO users (name, email, password_hash, role, branch_id) VALUES ('Mesa Admin', 'admin@mesa.os', $1, 'Corporate Admin', $2)`,
		string(hash), branchID,
	)
	return err
}

func seedMenu(ctx context.Context, pool *pgxpool.Pool, branchID string) error {
	catID := map[string]string{}
	for sort, cat := range []string{"Momo & Snacks", "Mains", "Grill", "Bar", "Dessert"} {
		var id string
		err := pool.QueryRow(ctx, `SELECT id FROM menu_categories WHERE name = $1 AND branch_id = $2`, cat, branchID).Scan(&id)
		if err != nil {
			if err = pool.QueryRow(ctx,
				`INSERT INTO menu_categories (name, branch_id, sort_order) VALUES ($1, $2, $3) RETURNING id`,
				cat, branchID, sort,
			).Scan(&id); err != nil {
				return err
			}
		}
		catID[cat] = id
	}

	for _, item := range seedMenuData {
		var exists bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM menu_items WHERE branch_id = $1 AND name = $2)`,
			branchID, item.Name,
		).Scan(&exists); err != nil {
			return err
		}

		if exists {
			// Keep existing rows in sync with the seed definition (photo, price, availability).
			if _, err := pool.Exec(ctx,
				`UPDATE menu_items SET photo_url = $1, price = $2, available = $3 WHERE branch_id = $4 AND name = $5`,
				item.Photo, item.Price, item.Available, branchID, item.Name,
			); err != nil {
				return err
			}
			continue
		}

		if _, err := pool.Exec(ctx,
			`INSERT INTO menu_items (name, price, category_id, photo_url, available, branch_id) VALUES ($1, $2, $3, $4, $5, $6)`,
			item.Name, item.Price, catID[item.Category], item.Photo, item.Available, branchID,
		); err != nil {
			return err
		}
	}

	return nil
}

func ensureStoreSettings(ctx context.Context, pool *pgxpool.Pool, branchID string) error {
	var exists bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM store_settings WHERE branch_id = $1)`, branchID,
	).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	_, err := pool.Exec(ctx,
		`INSERT INTO store_settings (branch_id, theme, delivery_zones, payment_methods)
		 VALUES ($1, 'default', '[]', '[{"name":"Cash"},{"name":"Card"},{"name":"QR/Wallet"}]')`,
		branchID,
	)
	return err
}

func seedTables(ctx context.Context, pool *pgxpool.Pool, branchID string) error {
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM floor_tables)`).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	for _, t := range []struct {
		Name   string
		Seats  int
		State  string
		Detail string
	}{
		{Name: "T1", Seats: 2, State: "Open", Detail: "Window"},
		{Name: "T2", Seats: 4, State: "Open", Detail: ""},
		{Name: "T3", Seats: 4, State: "Open", Detail: ""},
		{Name: "T4", Seats: 6, State: "Occupied", Detail: "Riya"},
		{Name: "Bar", Seats: 0, State: "Open", Detail: "Counter"},
	} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO floor_tables (name, seats, state, detail, branch_id) VALUES ($1, $2, $3, $4, $5)`,
			t.Name, t.Seats, t.State, t.Detail, branchID,
		); err != nil {
			return err
		}
	}
	return nil
}

var seedInventoryData = []struct {
	Name, Category  string
	Stock, Capacity float64
	Unit            string
	Threshold       float64
	Supplier        string
}{
	{Name: "Chicken (kg)", Category: "Proteins", Stock: 28, Capacity: 50, Unit: "kg", Threshold: 10, Supplier: "KTM Agro"},
	{Name: "Momo wrappers", Category: "Dry Goods", Stock: 120, Capacity: 400, Unit: "pcs", Threshold: 60, Supplier: "Cereal Distributors"},
	{Name: "Dal (kg)", Category: "Dry Goods", Stock: 35, Capacity: 80, Unit: "kg", Threshold: 15, Supplier: "Cereal Distributors"},
	{Name: "Mint leaves", Category: "Produce", Stock: 6, Capacity: 20, Unit: "kg", Threshold: 4, Supplier: "Green Valley Farm"},
	{Name: "Buff (kg)", Category: "Proteins", Stock: 12.5, Capacity: 40, Unit: "kg", Threshold: 8, Supplier: "KTM Agro"},
	{Name: "Whipping cream", Category: "Dairy", Stock: 9, Capacity: 24, Unit: "lt", Threshold: 6, Supplier: "Nepal Dairy"},
}

func seedInventory(ctx context.Context, pool *pgxpool.Pool, branchID string) error {
	for _, it := range seedInventoryData {
		var exists bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM inventory_items WHERE branch_id = $1 AND name = $2)`,
			branchID, it.Name,
		).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
if _, err := pool.Exec(ctx,
		`INSERT INTO inventory_items (name, category, stock, capacity, unit, threshold, supplier, branch_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		it.Name, it.Category, it.Stock, it.Capacity, it.Unit, it.Threshold, it.Supplier, branchID,
	); err != nil {
		return err
	}
	}
	return nil
}

var seedInvoiceData = []struct {
	Party   string
	DueIn   int
	Status  string
	Items   []struct{ Desc string; Qty int; Rate float64 }
}{
	{Party: "Yeti Airlines — corporate dinner", DueIn: 7, Status: "Sent", Items: []struct{ Desc string; Qty int; Rate float64 }{
		{Desc: "Set dinner — 40 covers", Qty: 40, Rate: 1850},
		{Desc: "Welcome drinks", Qty: 40, Rate: 250},
		{Desc: "Terrace hire (3 hrs)", Qty: 1, Rate: 12000},
	}},
	{Party: "Everest Meats (vendor)", DueIn: -7, Status: "Overdue", Items: []struct{ Desc string; Qty int; Rate float64 }{
		{Desc: "Buff fillet (kg)", Qty: 120, Rate: 340},
		{Desc: "Beef shank (kg)", Qty: 40, Rate: 310},
	}},
	{Party: "Himalayan Roast (vendor)", DueIn: -9, Status: "Overdue", Items: []struct{ Desc string; Qty int; Rate float64 }{
		{Desc: "Roast chicken (pcs)", Qty: 80, Rate: 180},
		{Desc: "Cooking oil (lt)", Qty: 20, Rate: 260},
	}},
	{Party: "Thamel Hostel — group booking", DueIn: 1, Status: "Sent", Items: []struct{ Desc string; Qty int; Rate float64 }{
		{Desc: "Buffet evening — 50 pax", Qty: 50, Rate: 560},
		{Desc: "Soft drinks", Qty: 50, Rate: 92},
	}},
	{Party: "Valley Greens (vendor)", DueIn: -13, Status: "Paid", Items: []struct{ Desc string; Qty int; Rate float64 }{
		{Desc: "Seasonal vegetables (kg)", Qty: 120, Rate: 65},
		{Desc: "Herbs bundle", Qty: 10, Rate: 145},
	}},
	{Party: "Private event — Rai wedding", DueIn: -17, Status: "Paid", Items: []struct{ Desc string; Qty int; Rate float64 }{
		{Desc: "Wedding buffet — 140 pax", Qty: 140, Rate: 850},
		{Desc: "Decor & stage hire", Qty: 1, Rate: 24000},
		{Desc: "Welcome mocktails", Qty: 90, Rate: 120},
	}},
}

func seedInvoices(ctx context.Context, pool *pgxpool.Pool, branchID string) error {
	now := time.Now()
	for _, inv := range seedInvoiceData {
		var invoiceID string
		err := pool.QueryRow(ctx,
			`SELECT id FROM invoices WHERE party = $1 AND branch_id = $2`, inv.Party, branchID,
		).Scan(&invoiceID)
		if err == nil {
			continue
		}

		var total float64
		for _, item := range inv.Items {
			total += float64(item.Qty) * item.Rate
		}
		due := now.AddDate(0, 0, inv.DueIn).Format("2006-01-02")
		if err := pool.QueryRow(ctx,
			`INSERT INTO invoices (party, amount, due_date, status, branch_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			inv.Party, total, due, inv.Status, branchID,
		).Scan(&invoiceID); err != nil {
			return err
		}
		for _, item := range inv.Items {
			if _, err := pool.Exec(ctx,
				`INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price) VALUES ($1, $2, $3, $4)`,
				invoiceID, item.Desc, item.Qty, item.Rate,
			); err != nil {
				return err
			}
		}
	}
	return nil
}
