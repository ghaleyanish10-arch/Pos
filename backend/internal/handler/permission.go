package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type PermissionHandler struct {
	repo *repo.PermissionRepo
}

func NewPermissionHandler(r *repo.PermissionRepo) *PermissionHandler {
	return &PermissionHandler{repo: r}
}

func (h *PermissionHandler) List(c *gin.Context) {
	perms, err := h.repo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	permissionMap := make(map[string]map[string]bool)
	for _, p := range perms {
		if _, ok := permissionMap[p.Role]; !ok {
			permissionMap[p.Role] = make(map[string]bool)
		}
		permissionMap[p.Role][p.Action] = p.Granted
	}

	c.JSON(http.StatusOK, gin.H{"data": permissionMap})
}

func (h *PermissionHandler) GetByRole(c *gin.Context) {
	perms, err := h.repo.GetByRole(c.Request.Context(), c.Param("role"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": perms})
}

func (h *PermissionHandler) Update(c *gin.Context) {
	var permissions []model.Permission
	if err := c.ShouldBindJSON(&permissions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := c.Param("role")
	if err := h.repo.Upsert(c.Request.Context(), role, permissions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "permissions updated"})
}
