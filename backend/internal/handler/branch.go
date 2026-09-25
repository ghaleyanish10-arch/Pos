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

// DeviceBranches is the terminal-facing slice of the branch table: only id +
// name, for the first-run setup screen where an operator must declare which
// branch their terminal serves before it can be approved. Names are venue
// identifiers (like the approvers list, they are names, not credentials);
// addresses/status are not exposed on the device route.
func (h *BranchesHandler) DeviceBranches(c *gin.Context) {
	branches, err := h.repo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load branches"})
		return
	}
	type row struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	out := make([]row, 0, len(branches))
	for _, b := range branches {
		out = append(out, row{ID: b.ID, Name: b.Name})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}