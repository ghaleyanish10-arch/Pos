package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type RecipeHandler struct {
	repo *repo.RecipeRepo
}

func NewRecipeHandler(r *repo.RecipeRepo) *RecipeHandler {
	return &RecipeHandler{repo: r}
}

func (h *RecipeHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	recipes, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": recipes})
}

func (h *RecipeHandler) GetByID(c *gin.Context) {
	recipe, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}
	c.JSON(http.StatusOK, recipe)
}

func (h *RecipeHandler) Create(c *gin.Context) {
	var req model.CreateRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	recipe := &model.Recipe{
		Name:       req.Name,
		MenuItemID: strPtr(req.MenuItemID),
		TargetCost: req.TargetCost,
		BranchID:   strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), recipe, req.Lines); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, recipe)
}

func (h *RecipeHandler) Update(c *gin.Context) {
	var req model.UpdateRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "recipe updated"})
}

// Delete soft-deletes a recipe. Idempotent in the repo: a second delete of
// the same id still answers 200.
func (h *RecipeHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "recipe deleted"})
}
