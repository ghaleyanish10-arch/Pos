package repo

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/testutil"
)

func setupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	return testutil.NewTestPool(t, "mesa_os_test")
}

func TestOrderCreateCreatesKDSTicket(t *testing.T) {
	pool := setupTestDB(t)
	ctx := context.Background()

	orderRepo := NewOrderRepo(pool)
	ticketRepo := NewTicketRepo(pool)

	var branchID, menuItemID string
	if err := pool.QueryRow(ctx, `SELECT id FROM branches ORDER BY created_at LIMIT 1`).Scan(&branchID); err != nil {
		t.Fatalf("get branch: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM menu_items ORDER BY name LIMIT 1`).Scan(&menuItemID); err != nil {
		t.Fatalf("get menu item: %v", err)
	}

	order := &model.Order{Type: "dine-in", BranchID: &branchID}
	items := []model.CreateOrderItemReq{
		{MenuItemID: menuItemID, Name: "Chicken Momo", Qty: 2, Price: 390},
		{MenuItemID: menuItemID, Name: "Dal Bhat", Qty: 1, Price: 720},
	}

	if err := orderRepo.Create(ctx, order, items); err != nil {
		t.Fatalf("OrderRepo.Create: %v", err)
	}
	if order.ID == "" {
		t.Fatal("expected created order to have an ID")
	}
	if order.Total != 2*390+720 {
		t.Errorf("order.Total = %v, want %v", order.Total, 2.0*390+720)
	}

	tickets, err := ticketRepo.List(ctx, "", "incoming")
	if err != nil {
		t.Fatalf("TicketRepo.List: %v", err)
	}
	if len(tickets) != 1 {
		t.Fatalf("expected exactly 1 incoming ticket, got %d", len(tickets))
	}
	tk := tickets[0]
	if tk.OrderID != order.ID {
		t.Errorf("ticket order_id = %q, want %q", tk.OrderID, order.ID)
	}
	if tk.Station != "Kitchen" || tk.Status != "incoming" || tk.Fired {
		t.Errorf("unexpected ticket defaults: station=%q status=%q fired=%v", tk.Station, tk.Status, tk.Fired)
	}
	if len(tk.Items) != 2 {
		t.Errorf("expected 2 ticket items, got %d", len(tk.Items))
	}

	if err := ticketRepo.Fire(ctx, tk.ID); err != nil {
		t.Fatalf("TicketRepo.Fire: %v", err)
	}
	if err := ticketRepo.UpdateStatus(ctx, tk.ID, "preparing"); err != nil {
		t.Fatalf("TicketRepo.UpdateStatus: %v", err)
	}

	got, err := ticketRepo.GetByID(ctx, tk.ID)
	if err != nil {
		t.Fatalf("TicketRepo.GetByID: %v", err)
	}
	if !got.Fired || got.Status != "preparing" {
		t.Errorf("after fire+bump: fired=%v status=%q", got.Fired, got.Status)
	}
}

func TestMenuRepoCRUD(t *testing.T) {
	pool := setupTestDB(t)
	ctx := context.Background()

	repo := NewMenuRepo(pool)

	var branchID, catID string
	if err := pool.QueryRow(ctx, `SELECT id FROM branches ORDER BY created_at LIMIT 1`).Scan(&branchID); err != nil {
		t.Fatalf("get branch: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM menu_categories ORDER BY sort_order LIMIT 1`).Scan(&catID); err != nil {
		t.Fatalf("get category: %v", err)
	}

	item := &model.MenuItem{Name: "Test Item ABC", Price: 250, BranchID: &branchID, Available: true}
	cat := catID
	item.CategoryID = &cat

	if err := repo.CreateItem(ctx, item); err != nil {
		t.Fatalf("CreateItem: %v", err)
	}
	if item.ID == "" {
		t.Fatal("expected created item to have an ID")
	}

	list, err := repo.ListItems(ctx, "", "")
	if err != nil {
		t.Fatalf("ListItems: %v", err)
	}
	found := false
	for _, it := range list {
		if it.ID == item.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("created item not present in ListItems")
	}

	got, err := repo.GetItem(ctx, item.ID)
	if err != nil {
		t.Fatalf("GetItem: %v", err)
	}
	if got.Name != item.Name || got.Price != 250 {
		t.Errorf("GetItem mismatch: name=%q price=%v", got.Name, got.Price)
	}

	upd := &model.UpdateMenuItemRequest{Name: "Test Item ABC 2", Price: 260, Available: boolPtr(false)}
	if err := repo.UpdateItem(ctx, item.ID, upd); err != nil {
		t.Fatalf("UpdateItem: %v", err)
	}
	got, _ = repo.GetItem(ctx, item.ID)
	if got.Name != "Test Item ABC 2" || got.Price != 260 || got.Available {
		t.Errorf("after update: name=%q price=%v available=%v", got.Name, got.Price, got.Available)
	}

	if err := repo.DeleteItem(ctx, item.ID); err != nil {
		t.Fatalf("DeleteItem: %v", err)
	}
	if _, err := repo.GetItem(ctx, item.ID); err == nil {
		t.Fatal("expected error fetching deleted item")
	}
}

func TestAuthServiceLoginAndRegister(t *testing.T) {
	pool := setupTestDB(t)
	ctx := context.Background()

	svc := auth.NewService(pool)

	id, email, role, branchID, _, err := svc.Login(ctx, "admin@mesa.os", "admin123")
	if err != nil {
		t.Fatalf("Login with seeded admin failed: %v", err)
	}
	if id == "" || email != "admin@mesa.os" || role != "Corporate Admin" || branchID == "" {
		t.Errorf("unexpected login result: id=%q email=%q role=%q branch=%q", id, email, role, branchID)
	}

	if _, _, _, _, _, err := svc.Login(ctx, "admin@mesa.os", "wrong-password"); err == nil {
		t.Fatal("expected login failure for wrong password")
	}
	if _, _, _, _, _, err := svc.Login(ctx, "nobody@mesa.os", "admin123"); err == nil {
		t.Fatal("expected login failure for unknown user")
	}

	newID, err := svc.Register(ctx, "Test Cashier", "cashier@test.dev", "password123", "Cashier", "")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if newID == "" {
		t.Fatal("expected registered user id")
	}
	if _, err := svc.Register(ctx, "Test Cashier", "cashier@test.dev", "password123", "Cashier", ""); err == nil {
		t.Fatal("expected duplicate email to fail")
	}
}

func boolPtr(b bool) *bool { return &b }
