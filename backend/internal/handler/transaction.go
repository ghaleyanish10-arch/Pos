package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type TransactionHandler struct {
	repo *repo.TransactionRepo
}

func NewTransactionHandler(r *repo.TransactionRepo) *TransactionHandler {
	return &TransactionHandler{repo: r}
}

func (h *TransactionHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	txs, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": txs})
}

func (h *TransactionHandler) Create(c *gin.Context) {
	var req model.CreateTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	tx := &model.Transaction{
		OrderID:  &req.OrderID,
		Ref:      req.Ref,
		Method:   req.Method,
		Amount:   req.Amount,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, tx)
}

func (h *TransactionHandler) ManualPayment(c *gin.Context) {
	var req model.ManualPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	tx := &model.Transaction{
		Method:   req.Method,
		Amount:   req.Amount,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, tx)
}
