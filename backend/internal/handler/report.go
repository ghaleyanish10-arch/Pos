package handler

import (
	"net/http"
	"strconv"

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
	days, offsetHours := parseWindow(c)

	data, err := h.repo.RevenueByDay(c.Request.Context(), branchID, days, offsetHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *ReportHandler) TopSellers(c *gin.Context) {
	branchID := c.Query("branch_id")
	days, offsetHours := parseWindow(c)

	data, err := h.repo.TopSellers(c.Request.Context(), branchID, days, offsetHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *ReportHandler) SlowMovers(c *gin.Context) {
	branchID := c.Query("branch_id")
	days, offsetHours := parseWindow(c)

	data, err := h.repo.SlowMovers(c.Request.Context(), branchID, days, offsetHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// parseWindow reads the ?days / ?offsetHours window shared by the report
// endpoints. Absent values mean "all time" (days=0).
func parseWindow(c *gin.Context) (days, offsetHours int) {
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed >= 0 {
			days = parsed
		}
	}
	if oh := c.Query("offsetHours"); oh != "" {
		if parsed, err := strconv.Atoi(oh); err == nil && parsed >= 0 {
			offsetHours = parsed
		}
	}
	return days, offsetHours
}

// Overview returns the full Reports payload for a ?days= window in one call.
// ?offsetHours shifts the whole window back in time (e.g. offsetHours=24 with
// days=1 selects exactly yesterday) so the Peak Hours card can offer
// Today / Yesterday without a separate endpoint.
func (h *ReportHandler) Overview(c *gin.Context) {
	branchID := c.Query("branch_id")
	days, offsetHours := parseWindow(c)

	o, err := h.repo.Overview(c.Request.Context(), branchID, days, offsetHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, o)
}

func (h *ReportHandler) Summary(c *gin.Context) {
	branchID := c.Query("branch_id")
	// The dashboard summary feeds Home's "today" block — default to today's
	// window unless an explicit ?days= overrides it (days=0 = all time).
	days, offsetHours := parseWindow(c)
	if c.Query("days") == "" {
		days = 1
	}

	summary, err := h.repo.Summary(c.Request.Context(), branchID, days, offsetHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, summary)
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
