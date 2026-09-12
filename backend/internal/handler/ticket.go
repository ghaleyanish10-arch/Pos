package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type TicketHandler struct {
	repo *repo.TicketRepo
}

func NewTicketHandler(r *repo.TicketRepo) *TicketHandler {
	return &TicketHandler{repo: r}
}

func (h *TicketHandler) List(c *gin.Context) {
	station := c.Query("station")
	status := c.Query("status")

	tickets, err := h.repo.List(c.Request.Context(), station, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": tickets})
}

func (h *TicketHandler) Fire(c *gin.Context) {
	if err := h.repo.Fire(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ticket fired"})
}

func (h *TicketHandler) Bump(c *gin.Context) {
	var req model.UpdateTicketStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ticket bumped"})
}
