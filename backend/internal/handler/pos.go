package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type POSHandler struct {
	repo *repo.POSRepo
}

func NewPOSHandler(r *repo.POSRepo) *POSHandler {
	return &POSHandler{repo: r}
}

func (h *POSHandler) UpdateTableState(c *gin.Context) {
	var req model.UpdateTableStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateTableState(c.Request.Context(), c.Param("id"), req.State, req.Detail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "table state updated"})
}

func (h *POSHandler) GetTableBill(c *gin.Context) {
	items, total, err := h.repo.GetTableBill(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no open bill for this table"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": total,
	})
}
