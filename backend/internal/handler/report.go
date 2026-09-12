package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type ReportHandler struct {
	repo *repo.ReportRepo
}

func NewReportHandler(r *repo.ReportRepo) *ReportHandler {
	return &ReportHandler{repo: r}
}

func (h *ReportHandler) Revenue(c *gin.Context) {
	branchID := c.Query("branch_id")

	data, err := h.repo.RevenueByDay(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *ReportHandler) TopSellers(c *gin.Context) {
	branchID := c.Query("branch_id")

	data, err := h.repo.TopSellers(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *ReportHandler) SlowMovers(c *gin.Context) {
	branchID := c.Query("branch_id")

	data, err := h.repo.SlowMovers(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *ReportHandler) Summary(c *gin.Context) {
	branchID := c.Query("branch_id")

	totalRevenue, totalOrders, avgOrder, err := h.repo.Summary(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, model.ReportSummary{
		TotalRevenue:  totalRevenue,
		TotalOrders:   totalOrders,
		AvgOrderValue: avgOrder,
	})
}

func (h *ReportHandler) SystemHealth(c *gin.Context) {
	branches, err := h.repo.ListBranches(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	totalOnline := 0
	for _, b := range branches {
		if b.Status == "Online" {
			totalOnline++
		}
	}

	c.JSON(http.StatusOK, model.HealthResponse{
		Branches:    branches,
		TotalOnline: totalOnline,
	})
}
