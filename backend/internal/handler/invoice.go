package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type InvoiceHandler struct {
	repo *repo.InvoiceRepo
}

func NewInvoiceHandler(r *repo.InvoiceRepo) *InvoiceHandler {
	return &InvoiceHandler{repo: r}
}

func (h *InvoiceHandler) List(c *gin.Context) {
	status := c.Query("status")

	invoices, err := h.repo.List(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": invoices})
}

func (h *InvoiceHandler) GetByID(c *gin.Context) {
	inv, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}
	c.JSON(http.StatusOK, inv)
}

func (h *InvoiceHandler) Create(c *gin.Context) {
	var req model.CreateInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")
	dueDate, _ := time.Parse("2006-01-02", req.DueDate)

	var total float64
	for _, item := range req.Items {
		total += float64(item.Qty) * item.UnitPrice
	}

	inv := &model.Invoice{
		Party:    req.Party,
		Amount:   total,
		DueDate:  dueDate,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), inv, req.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, inv)
}

func (h *InvoiceHandler) Update(c *gin.Context) {
	var req model.UpdateInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := req.Status
	var chasedAt *time.Time
	if req.Chased {
		status = "Overdue"
		ts := time.Now()
		chasedAt = &ts
	}

	if status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}

	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), status, chasedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "invoice updated"})
}
