package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/repo"
)

type BranchesHandler struct {
	repo *repo.BranchesRepo
}

func NewBranchesHandler(r *repo.BranchesRepo) *BranchesHandler {
	return &BranchesHandler{repo: r}
}

func (h *BranchesHandler) List(c *gin.Context) {
	branches, err := h.repo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": branches})
}