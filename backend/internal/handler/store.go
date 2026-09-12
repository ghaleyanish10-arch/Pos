package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type StoreHandler struct {
	repo *repo.StoreRepo
}

func NewStoreHandler(r *repo.StoreRepo) *StoreHandler {
	return &StoreHandler{repo: r}
}

func (h *StoreHandler) GetSettings(c *gin.Context) {
	branchID := c.Query("branch_id")
	if branchID == "" {
		if v, ok := c.Get("branch_id"); ok {
			branchID = v.(string)
		}
	}

	settings, err := h.repo.GetSettings(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "store settings not found"})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *StoreHandler) UpdateSettings(c *gin.Context) {
	var req model.UpdateStoreSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID := ""
	if v, ok := c.Get("branch_id"); ok {
		branchID = v.(string)
	}

	settings := &model.StoreSettings{
		BranchID:       strPtr(branchID),
		Theme:          req.Theme,
		DeliveryZones:  req.DeliveryZones,
		PaymentMethods: req.PaymentMethods,
	}

	if err := h.repo.UpsertSettings(c.Request.Context(), settings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "store settings updated"})
}
