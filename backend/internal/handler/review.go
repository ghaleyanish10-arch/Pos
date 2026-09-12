package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/repo"
)

type ReviewHandler struct {
	repo *repo.ReviewRepo
}

func NewReviewHandler(r *repo.ReviewRepo) *ReviewHandler {
	return &ReviewHandler{repo: r}
}

func (h *ReviewHandler) List(c *gin.Context) {
	platform := c.Query("platform")

	reviews, err := h.repo.List(c.Request.Context(), platform)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": reviews})
}

func (h *ReviewHandler) Reply(c *gin.Context) {
	var req struct {
		Reply string `json:"reply" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Reply(c.Request.Context(), c.Param("id"), req.Reply); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "reply sent"})
}
