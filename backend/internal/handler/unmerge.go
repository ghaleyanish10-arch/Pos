package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/repo"
)

// Unmerge releases every table merged INTO the target (c.Param("id")) back to
// its own card. The open check stays with the target — items already folded
// onto it are not un-folded; unmerging is a floor-plan operation, not a bill
// split. Reversible complement of Merge.
func (h *OrderHandler) Unmerge(c *gin.Context) {
	tableID := c.Param("id")
	if !validUUID(tableID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "table id is invalid"})
		return
	}

	released, err := h.repo.UnmergeTables(c.Request.Context(), tableID)
	if err != nil {
		switch {
		case errors.Is(err, repo.ErrTargetTableNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "tables unmerged",
		"released_tables": released,
	})
}
