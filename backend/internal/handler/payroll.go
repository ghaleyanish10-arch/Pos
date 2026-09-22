package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

// PayrollHandler serves hourly rates and payroll periods. Every route is
// gated Store-Manager-and-up by RequireRole in the router (payroll is
// sensitive: rates and totals are not for every staff session).
type PayrollHandler struct {
	repo *repo.PayrollRepo
}

func NewPayrollHandler(r *repo.PayrollRepo) *PayrollHandler {
	return &PayrollHandler{repo: r}
}

// SetRate stores one staff member's hourly rate.
func (h *PayrollHandler) SetRate(c *gin.Context) {
	var req struct {
		Rate float64 `json:"rate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Rate < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rate must be a positive number"})
		return
	}
	if err := h.repo.SetHourlyRate(c.Request.Context(), c.Param("id"), req.Rate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save rate"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "hourly rate updated"})
}

// Rates lists staff with their hourly rates.
func (h *PayrollHandler) Rates(c *gin.Context) {
	branchID := c.Query("branch_id")
	out, err := h.repo.ListRates(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list rates"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// CreatePeriod snapshots hours × rate per staff into a new draft period.
func (h *PayrollHandler) CreatePeriod(c *gin.Context) {
	var req model.CreatePayrollPeriodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "label, start_date, end_date and lines are required"})
		return
	}
	branchID, _ := c.Get("branch_id")

	p := &model.PayrollPeriod{
		Label:     req.Label,
		StartDate: req.StartDate,
		EndDate:   req.EndDate,
		BranchID:  strPtr(branchID.(string)),
	}
	if err := h.repo.CreatePeriod(c.Request.Context(), p, req.Lines); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create payroll period"})
		return
	}
	c.JSON(http.StatusCreated, p)
}

func (h *PayrollHandler) ListPeriods(c *gin.Context) {
	branchID := c.Query("branch_id")
	out, err := h.repo.ListPeriods(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list payroll periods"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *PayrollHandler) GetPeriod(c *gin.Context) {
	p, err := h.repo.GetPeriod(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load payroll period"})
		return
	}
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "payroll period not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p})
}

// SetStatus advances a period draft → approved → paid.
func (h *PayrollHandler) SetStatus(c *gin.Context) {
	var req model.UpdatePayrollStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}
	switch req.Status {
	case "approved", "paid", "draft":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be draft, approved or paid"})
		return
	}
	if err := h.repo.SetPeriodStatus(c.Request.Context(), c.Param("id"), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update payroll period"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "payroll period " + req.Status})
}
