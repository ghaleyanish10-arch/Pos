package db

import "testing"

func TestSeedMenuData_Valid(t *testing.T) {
	if len(seedMenuData) == 0 {
		t.Fatal("seedMenuData must not be empty")
	}

	seen := map[string]bool{}
	for _, item := range seedMenuData {
		if item.Name == "" {
			t.Error("menu item with empty name")
		}
		if item.Price <= 0 {
			t.Errorf("menu item %q has non-positive price %v", item.Name, item.Price)
		}
		if item.Category == "" {
			t.Errorf("menu item %q has empty category", item.Name)
		}
		if item.Photo == "" {
			t.Errorf("menu item %q has no photo", item.Name)
		} else if item.Photo[0] != '/' {
			t.Errorf("menu item %q photo %q should be a rooted asset path", item.Name, item.Photo)
		}
		if seen[item.Name] {
			t.Errorf("duplicate menu item name %q", item.Name)
		}
		seen[item.Name] = true
	}
}

func TestSeedInventoryData_Valid(t *testing.T) {
	if len(seedInventoryData) == 0 {
		t.Fatal("seedInventoryData must not be empty")
	}

	for _, item := range seedInventoryData {
		if item.Name == "" {
			t.Error("inventory item with empty name")
		}
		if item.Capacity <= 0 {
			t.Errorf("inventory item %q has non-positive capacity", item.Name)
		}
		if item.Stock < 0 {
			t.Errorf("inventory item %q has negative stock", item.Name)
		}
		if item.Threshold < 0 {
			t.Errorf("inventory item %q has negative threshold", item.Name)
		}
		if item.Unit == "" {
			t.Errorf("inventory item %q has empty unit", item.Name)
		}
	}
}

func TestSeedMenuCategories(t *testing.T) {
	allowed := map[string]bool{"Momo & Snacks": true, "Mains": true, "Grill": true, "Bar": true, "Dessert": true}
	for _, item := range seedMenuData {
		if !allowed[item.Category] {
			t.Errorf("menu item %q uses unexpected category %q", item.Name, item.Category)
		}
	}
}
