package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/repo"
)

type FeedbackHandler struct {
	repo *repo.FeedbackRepo
}

func NewFeedbackHandler(r *repo.FeedbackRepo) *FeedbackHandler {
	return &FeedbackHandler{repo: r}
}

func (h *FeedbackHandler) List(c *gin.Context) {
	var resolved *bool
	if r := c.Query("resolved"); r == "true" {
		t := true
		resolved = &t
	} else if r == "false" {
		f := false
		resolved = &f
	}

	responses, err := h.repo.List(c.Request.Context(), resolved)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": responses})
}

func (h *FeedbackHandler) Resolve(c *gin.Context) {
	if err := h.repo.Resolve(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "feedback resolved"})
}

func (h *FeedbackHandler) Escalate(c *gin.Context) {
	if err := h.repo.Escalate(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "feedback escalated"})
}
