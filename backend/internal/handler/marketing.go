package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type MarketingHandler struct {
	repo *repo.MarketingRepo
}

func NewMarketingHandler(r *repo.MarketingRepo) *MarketingHandler {
	return &MarketingHandler{repo: r}
}

func (h *MarketingHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	campaigns, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": campaigns})
}

func (h *MarketingHandler) Create(c *gin.Context) {
	var req model.CreateCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	campaign := &model.Campaign{
		Name:     req.Name,
		Channel:  req.Channel,
		Audience: req.Audience,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), campaign); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, campaign)
}

func (h *MarketingHandler) Update(c *gin.Context) {
	var req model.UpdateCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "campaign updated"})
}
