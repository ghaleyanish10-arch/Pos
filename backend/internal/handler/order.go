package handler

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

var tableUUIDRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// orderTypes is the allowlist for order.kind. Public customers pick
// dine-in (table QR) or takeaway (online store); delivery is staff only.
var orderTypes = map[string]bool{
	"dine-in":  true,
	"takeaway": true,
	"delivery": true,
}

type OrderHandler struct {
	repo *repo.OrderRepo
	menu *repo.MenuRepo
}

func NewOrderHandler(r *repo.OrderRepo) *OrderHandler {
	return &OrderHandler{repo: r}
}

// SetMenuRepo attaches the menu catalog so public orders are priced from the
// live menu instead of trusting client-supplied numbers.
func (h *OrderHandler) SetMenuRepo(m *repo.MenuRepo) { h.menu = m }

func (h *OrderHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")
	status := c.Query("status")

	orders, err := h.repo.List(c.Request.Context(), branchID, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": orders})
}

func (h *OrderHandler) GetByID(c *gin.Context) {
	order, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, order)
}

// CreatePublic lets a customer submit an order from the table-QR register or
// the online store with NO session — a customer has no credentials. The order
// is written exactly like a POS order and surfaces on the staff Orders/KDS as
// an incoming ticket for that table (or a takeaway when no table is given).
func (h *OrderHandler) CreatePublic(c *gin.Context) {
	var req model.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "items are required"})
		return
	}

	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	if req.Type == "" {
		req.Type = "dine-in"
	}
	if !orderTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported order type: " + req.Type})
		return
	}

	ctx := c.Request.Context()

	guestID := strings.TrimSpace(req.GuestID)
	if guestID != "" && !validUUID(guestID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "guest_id must be a valid UUID"})
		return
	}
	if guestID != "" {
		if ok, err := h.repo.GuestExists(ctx, guestID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		} else if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "guest not found"})
			return
		}
	}

	// Resolve the table: a QR/name like "T4" maps to a floor-table id; an id
	// that is already a UUID must exist on the floor before the order is kept.
	tableID := strings.TrimSpace(req.TableID)
	branchID := ""
	if tableID != "" {
		switch {
		case tableUUIDRe.MatchString(tableID):
			branch, err := h.repo.ResolveTableByUUID(ctx, tableID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "table not found"})
				return
			}
			branchID = branch
		default:
			resolved, branch, err := h.repo.ResolveTable(ctx, tableID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "table not found"})
				return
			}
			tableID = resolved
			branchID = branch
		}
	}

	// Price every line from the live catalog when it references a menu item;
	// client-supplied prices are ignored for catalog items (a customer cannot
	// set the price of a dish). Lines without a menu_item_id keep the client
	// name/price (custom items) but still require sane values.
	var prices map[string]*model.MenuItem
	ids := []string{}
	for _, it := range req.Items {
		if strings.TrimSpace(it.MenuItemID) != "" {
			ids = append(ids, strings.TrimSpace(it.MenuItemID))
		}
	}
	if len(ids) > 0 {
		if h.menu == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "menu catalog unavailable"})
			return
		}
		found, err := h.menu.GetItemsByIDs(ctx, ids)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		for _, id := range ids {
			if found[id] == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "menu item not found: " + id})
				return
			}
		}
		prices = found
	}

	for i := range req.Items {
		if req.Items[i].Qty <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "item quantities must be greater than zero"})
			return
		}
		id := strings.TrimSpace(req.Items[i].MenuItemID)
		if catalog := prices[id]; catalog != nil {
			// Catalog item: authoritative price and display name.
			req.Items[i].Name = catalog.Name
			req.Items[i].Price = catalog.Price
		} else {
			// Custom line: name is required and the price must be non-negative.
			if strings.TrimSpace(req.Items[i].Name) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "item name is required"})
				return
			}
			if req.Items[i].Price < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "item price cannot be negative"})
				return
			}
		}
	}

	order := &model.Order{
		Type:     req.Type,
		TableID:  &tableID,
		GuestID:  &guestID,
		BranchID: strPtr(branchID),
	}

	if err := h.repo.Create(ctx, order, req.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) Create(c *gin.Context) {
	var req model.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	tableID := req.TableID
	if tableID != "" && !tableUUIDRe.MatchString(tableID) {
		if resolved, err := h.repo.ResolveTableID(c.Request.Context(), tableID); err == nil {
			tableID = resolved
		} else {
			tableID = ""
		}
	}

	order := &model.Order{
		Type:     req.Type,
		TableID:  &tableID,
		GuestID:  &req.GuestID,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), order, req.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) Update(c *gin.Context) {
	var req model.UpdateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "order updated"})
}

func (h *OrderHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "order deleted"})
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
