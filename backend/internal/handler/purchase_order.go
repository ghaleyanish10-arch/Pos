package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
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
	branch := ""
	if b, ok := branchID.(string); ok {
		branch = b
	}

	var total float64
	for _, item := range req.Items {
		if item.Qty <= 0 || item.UnitCost < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "line item quantities and costs must be positive"})
			return
		}
		total += item.Qty * item.UnitCost
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase order must have at least one line item"})
		return
	}

	var expected *time.Time
	if req.ExpectedDate != "" {
		if parsed, err := time.Parse("2006-01-02", req.ExpectedDate); err == nil {
			expected = &parsed
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expected_date must be a valid YYYY-MM-DD date"})
			return
		}
	}

	po := &model.PurchaseOrder{
		Supplier:     req.Supplier,
		Total:        total,
		ExpectedDate: expected,
		BranchID:     strPtr(branch),
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
	var req model.ReceivePORequest
	_ = c.ShouldBindJSON(&req) // body optional — empty = receive everything

	ctx := c.Request.Context()

	received := map[string]float64{}
	if len(req.ReceivedItems) > 0 {
		for _, it := range req.ReceivedItems {
			name := strings.TrimSpace(it.Ingredient)
			if name == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "received_items entries need an ingredient name"})
				return
			}
			if it.Qty < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "received quantities cannot be negative"})
				return
			}
			if it.Qty > 0 {
				received[name] = it.Qty
			}
		}
	}

	po, skipped, err := h.repo.Receive(ctx, c.Param("id"), received)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "purchase order not found"})
			return
		}
		if errors.Is(err, repo.ErrExceedsOrderedQty) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, repo.ErrAlreadyReceived) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	message := "purchase order marked " + po.Status
	if skipped > 0 {
		message += " (" + fmt.Sprintf("%d", skipped) + " ingredient(s) not tracked in inventory)"
	}
	c.JSON(http.StatusOK, gin.H{"message": message, "po": po, "skipped_inventory": skipped})
}
