package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/repo"
)

type AuditHandler struct {
	repo *repo.AuditRepo
}

func NewAuditHandler(r *repo.AuditRepo) *AuditHandler {
	return &AuditHandler{repo: r}
}

func (h *AuditHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")
	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	events, err := h.repo.List(c.Request.Context(), branchID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": events})
}
