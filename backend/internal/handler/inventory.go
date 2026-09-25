package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type InventoryHandler struct {
	repo *repo.InventoryRepo
}

func NewInventoryHandler(r *repo.InventoryRepo) *InventoryHandler {
	return &InventoryHandler{repo: r}
}

func (h *InventoryHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	items, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *InventoryHandler) GetByID(c *gin.Context) {
	item, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "inventory item not found"})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *InventoryHandler) Create(c *gin.Context) {
	var req model.CreateInventoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	item := &model.InventoryItem{
		Name:     req.Name,
		Category: req.Category,
		Stock:    req.Stock,
		Capacity: req.Capacity,
		Unit:     req.Unit,
		Threshold: req.Threshold,
		Supplier: req.Supplier,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, item)
}

func (h *InventoryHandler) Update(c *gin.Context) {
	var req model.UpdateInventoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "inventory updated"})
}

func (h *InventoryHandler) AdjustStock(c *gin.Context) {
	var req model.AdjustStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Delta == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "adjustment delta cannot be zero"})
		return
	}

	if err := h.repo.AdjustStock(c.Request.Context(), c.Param("id"), req.Delta); err != nil {
		if errors.Is(err, repo.ErrInsufficientStock) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "stock adjusted"})
}

// Summary powers the Inventory exception board: bucket counts + stock value.
func (h *InventoryHandler) Summary(c *gin.Context) {
	branchID := c.Query("branch_id")
	s, err := h.repo.Summary(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

// RecordWaste writes off stock (spoiled, broken, staff meal…) — the stock
// decrement and the waste row commit together.
func (h *InventoryHandler) RecordWaste(c *gin.Context) {
	var req model.RecordWasteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !validUUID(req.ItemID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "item_id must be a valid UUID"})
		return
	}
	ctx := c.Request.Context()
	if ok, err := h.repo.Exists(ctx, req.ItemID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "inventory item not found"})
		return
	}

	actor, _ := c.Get("user_id")
	w := &model.WasteEntry{
		ItemID:    req.ItemID,
		Qty:       req.Qty,
		Reason:    req.Reason,
		CreatedBy: actorString(actor),
	}
	if err := h.repo.RecordWaste(ctx, w, 0); err != nil {
		if errors.Is(err, repo.ErrInsufficientStock) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, w)
}

func (h *InventoryHandler) WasteLog(c *gin.Context) {
	entries, err := h.repo.WasteLog(c.Request.Context(), limitParam(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entries})
}

func (h *InventoryHandler) ReorderSuggestions(c *gin.Context) {
	branchID := c.Query("branch_id")

	suggestions, err := h.repo.ReorderSuggestions(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": suggestions})
}

func limitParam(c *gin.Context) int {
	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	return limit
}
