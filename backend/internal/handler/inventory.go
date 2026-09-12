package handler

import (
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

	if err := h.repo.AdjustStock(c.Request.Context(), c.Param("id"), req.Delta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "stock adjusted"})
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
