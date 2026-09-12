package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type RefundHandler struct {
	repo *repo.RefundRepo
}

func NewRefundHandler(r *repo.RefundRepo) *RefundHandler {
	return &RefundHandler{repo: r}
}

func (h *RefundHandler) List(c *gin.Context) {
	status := c.Query("status")

	refunds, err := h.repo.List(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": refunds})
}

func (h *RefundHandler) Create(c *gin.Context) {
	var req model.CreateRefundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")
	items, _ := json.Marshal(req.Items)

	rf := &model.Refund{
		TransactionID: req.TransactionID,
		Items:         items,
		Reason:        req.Reason,
		Amount:        req.Amount,
		BranchID:      strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), rf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, rf)
}

func (h *RefundHandler) Approve(c *gin.Context) {
	userID, _ := c.Get("user_id")
	if err := h.repo.Lock(c.Request.Context(), c.Param("id"), userID.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), "Approved"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "refund approved"})
}

func (h *RefundHandler) Resolve(c *gin.Context) {
	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), "Resolved"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "refund resolved"})
}
