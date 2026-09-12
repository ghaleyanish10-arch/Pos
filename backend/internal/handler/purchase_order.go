package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type PurchaseOrderHandler struct {
	repo *repo.PurchaseOrderRepo
}

func NewPurchaseOrderHandler(r *repo.PurchaseOrderRepo) *PurchaseOrderHandler {
	return &PurchaseOrderHandler{repo: r}
}

func (h *PurchaseOrderHandler) List(c *gin.Context) {
	status := c.Query("status")

	pos, err := h.repo.List(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": pos})
}

func (h *PurchaseOrderHandler) GetByID(c *gin.Context) {
	po, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase order not found"})
		return
	}
	c.JSON(http.StatusOK, po)
}

func (h *PurchaseOrderHandler) Create(c *gin.Context) {
	var req model.CreatePORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	var total float64
	for _, item := range req.Items {
		total += item.Qty * item.UnitCost
	}

	po := &model.PurchaseOrder{
		Supplier: req.Supplier,
		Total:    total,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), po, req.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, po)
}

func (h *PurchaseOrderHandler) Update(c *gin.Context) {
	var req model.UpdatePORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "purchase order updated"})
}

func (h *PurchaseOrderHandler) Receive(c *gin.Context) {
	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), "Received"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "purchase order received"})
}
