package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type MenuHandler struct {
	repo *repo.MenuRepo
}

func NewMenuHandler(r *repo.MenuRepo) *MenuHandler {
	return &MenuHandler{repo: r}
}

func (h *MenuHandler) ListCategories(c *gin.Context) {
	branchID := c.Query("branch_id")
	cats, err := h.repo.ListCategories(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cats})
}

func (h *MenuHandler) ListItems(c *gin.Context) {
	branchID := c.Query("branch_id")
	categoryID := c.Query("category_id")

	items, err := h.repo.ListItems(c.Request.Context(), branchID, categoryID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *MenuHandler) GetItem(c *gin.Context) {
	item, err := h.repo.GetItem(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "menu item not found"})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *MenuHandler) CreateItem(c *gin.Context) {
	var req model.CreateMenuItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	item := &model.MenuItem{
		Name:       req.Name,
		Price:      req.Price,
		CategoryID: strPtr(req.CategoryID),
		PhotoURL:   req.PhotoURL,
		Available:  req.Available,
		BranchID:   strPtr(branchID.(string)),
	}

	if err := h.repo.CreateItem(c.Request.Context(), item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, item)
}

func (h *MenuHandler) UpdateItem(c *gin.Context) {
	var req model.UpdateMenuItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateItem(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "menu item updated"})
}

func (h *MenuHandler) DeleteItem(c *gin.Context) {
	if err := h.repo.DeleteItem(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "menu item deleted"})
}
