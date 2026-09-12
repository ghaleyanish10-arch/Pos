package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type LoyaltyHandler struct {
	repo *repo.LoyaltyRepo
}

func NewLoyaltyHandler(r *repo.LoyaltyRepo) *LoyaltyHandler {
	return &LoyaltyHandler{repo: r}
}

func (h *LoyaltyHandler) ListTiers(c *gin.Context) {
	tiers, err := h.repo.ListTiers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": tiers})
}

func (h *LoyaltyHandler) ListLedger(c *gin.Context) {
	entries, err := h.repo.ListLedger(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entries})
}

func (h *LoyaltyHandler) Earn(c *gin.Context) {
	var req model.EarnPointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Earn(c.Request.Context(), req.GuestID, req.Points, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "points earned"})
}

func (h *LoyaltyHandler) Redeem(c *gin.Context) {
	var req model.RedeemPointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Redeem(c.Request.Context(), req.GuestID, req.Points, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "points redeemed"})
}
