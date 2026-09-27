package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type TaxHandler struct {
	repo *repo.TaxRepo
}

func NewTaxHandler(r *repo.TaxRepo) *TaxHandler {
	return &TaxHandler{repo: r}
}

// branchID resolves the request's branch: explicit query param when the
// caller is Corporate Admin (org-wide view), otherwise the caller's own.
func taxBranchID(c *gin.Context) string {
	if q := c.Query("branch_id"); q != "" {
		role, _ := c.Get("role")
		if role == "Corporate Admin" {
			return q
		}
	}
	b, _ := c.Get("branch_id")
	id, _ := b.(string)
	return id
}

func (h *TaxHandler) List(c *gin.Context) {
	rules, err := h.repo.ListAll(c.Request.Context(), taxBranchID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list tax rules"})
		return
	}
	c.JSON(http.StatusOK, rules)
}

func (h *TaxHandler) Create(c *gin.Context) {
	var req model.UpsertTaxRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rule, err := h.repo.Create(c.Request.Context(), taxBranchID(c), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, rule)
}

func (h *TaxHandler) Update(c *gin.Context) {
	var req model.UpsertTaxRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rule, err := h.repo.Update(c.Request.Context(), c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rule)
}

func (h *TaxHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete tax rule"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "tax rule deleted"})
}

// PreviewInput is either explicit lines or an order id to price.
type TaxPreviewInput struct {
	OrderID string                `json:"order_id"`
	Lines   []model.TaxLineInput  `json:"lines"`
}

// Preview computes the bill's tax breakdown for the branch. The register
// calls it at charge time and snapshots the result into the transaction, so
// later rule edits never rewrite history.
func (h *TaxHandler) Preview(c *gin.Context) {
	var req TaxPreviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	branchID := taxBranchID(c)
	if branchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no branch context"})
		return
	}

	if req.OrderID != "" {
		lines, err := h.repo.OrderLines(c.Request.Context(), req.OrderID)
		if err == nil && len(lines) > 0 {
			req.Lines = lines
		}
	}

	comp, err := h.repo.Compute(c.Request.Context(), branchID, req.Lines)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to compute taxes"})
		return
	}
	c.JSON(http.StatusOK, comp)
}
