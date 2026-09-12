package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type GuestHandler struct {
	repo *repo.GuestRepo
}

func NewGuestHandler(r *repo.GuestRepo) *GuestHandler {
	return &GuestHandler{repo: r}
}

func (h *GuestHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")
	tier := c.Query("tier")

	guests, err := h.repo.List(c.Request.Context(), branchID, tier)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": guests})
}

func (h *GuestHandler) GetByID(c *gin.Context) {
	guest, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "guest not found"})
		return
	}
	c.JSON(http.StatusOK, guest)
}

func (h *GuestHandler) Create(c *gin.Context) {
	var req model.CreateGuestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")
	segments, _ := json.Marshal(req.Segments)

	guest := &model.Guest{
		Name:     req.Name,
		Email:    req.Email,
		Phone:    req.Phone,
		Tier:     req.Tier,
		Segments: segments,
		Note:     req.Note,
		BranchID: strPtr(branchID.(string)),
	}

	if guest.Tier == "" {
		guest.Tier = "New"
	}

	if err := h.repo.Create(c.Request.Context(), guest); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, guest)
}

func (h *GuestHandler) Update(c *gin.Context) {
	var req model.UpdateGuestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "guest updated"})
}

func (h *GuestHandler) Timeline(c *gin.Context) {
	entries, err := h.repo.Timeline(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entries})
}
