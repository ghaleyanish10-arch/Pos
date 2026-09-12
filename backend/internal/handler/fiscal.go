package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type FiscalHandler struct {
	repo *repo.FiscalRepo
}

func NewFiscalHandler(r *repo.FiscalRepo) *FiscalHandler {
	return &FiscalHandler{repo: r}
}

func (h *FiscalHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	entries, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entries})
}

func (h *FiscalHandler) GetByTransaction(c *gin.Context) {
	entry, err := h.repo.GetByTransaction(c.Request.Context(), c.Param("transaction_id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "fiscal entry not found"})
		return
	}
	c.JSON(http.StatusOK, entry)
}

func (h *FiscalHandler) Create(c *gin.Context) {
	var entry model.FiscalEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")
	entry.BranchID = strPtr(branchID.(string))

	if err := h.repo.Create(c.Request.Context(), &entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, entry)
}
