package handler

import (
	"errors"
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

// Transfer moves an open order's whole tab to another floor table. The
// target is accepted as a table name ("T4") or its UUID; both resolve to the
// same floor row. The anchor order only names the SOURCE table — every open
// order on it moves, so the source always ends with no open order and derives
// Vacant. Guards: the order must be OPEN and seated at a table; the target
// must exist in the SAME branch and must NOT host any open order of its own —
// merging two parties into one tab is a MERGE (see Merge), not a transfer.
func (h *OrderHandler) Transfer(c *gin.Context) {
	var req model.TransferOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tableID := strings.TrimSpace(req.TableID)
	if tableID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "table_id is required"})
		return
	}
	if !tableUUIDRe.MatchString(tableID) {
		resolved, err := h.repo.ResolveTableID(c.Request.Context(), tableID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "table not found"})
			return
		}
		tableID = resolved
	}
	if !validUUID(tableID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "table_id must be a table name or UUID"})
		return
	}

	ordersMoved, targetName, err := h.repo.TransferTable(c.Request.Context(), c.Param("id"), tableID)
	if err != nil {
		switch {
		case errors.Is(err, repo.ErrOrderNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrTargetTableNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrSameTable):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrCrossBranchTransfer):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrOrderNotSeated):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrOrderNotOpen):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrTargetTableOccupied):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error() + " — close it or use a merge instead"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "order transferred",
		"order_id":     c.Param("id"),
		"orders_moved": ordersMoved,
		"table_id":     tableID,
		"table_name":   targetName,
	})
}

// Merge folds an occupied source table's open check into the target table
// (c.Param("id")) — the two parties become ONE combined check on ONE combined
// floor card. Unlike a transfer (which requires a VACANT target), a merge
// lands ON an occupied table: the source order's items and kitchen tickets
// move onto the target's open check, the source order closes as 'merged', and
// the source table row points at the target via merged_into so the floor draws
// one spanning card ("T8 + T9"). The target may also be vacant, in which case
// the combined check is created there. Guards: both tables must exist in the
// same branch, neither may already be part of a merge, and the source must
// hold exactly one open order to fold.
func (h *OrderHandler) Merge(c *gin.Context) {
	var req model.MergeTablesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	targetTableID := strings.TrimSpace(c.Param("id"))
	sourceTableID := strings.TrimSpace(req.SourceTableID)
	if sourceTableID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_table_id is required"})
		return
	}
	if !validUUID(targetTableID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target table id is invalid"})
		return
	}
	if !tableUUIDRe.MatchString(sourceTableID) {
		resolved, err := h.repo.ResolveTableID(c.Request.Context(), sourceTableID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "source table not found"})
			return
		}
		sourceTableID = resolved
	}
	if !validUUID(sourceTableID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_table_id must be a table name or UUID"})
		return
	}

	orderID, itemsMoved, targetName, sourceName, err := h.repo.MergeTables(c.Request.Context(), targetTableID, sourceTableID)
	if err != nil {
		switch {
		case errors.Is(err, repo.ErrTargetTableNotFound), errors.Is(err, repo.ErrSourceTableNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrMergeSameTable):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrCrossBranchTransfer):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrSourceNotOccupied):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrMultipleOpenOrders):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, repo.ErrAlreadyMerged):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":           "tables merged",
		"target_table_id":   targetTableID,
		"target_table_name": targetName,
		"source_table_id":   sourceTableID,
		"source_table_name": sourceName,
		"order_id":          orderID,
		"items_moved":       itemsMoved,
	})
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
