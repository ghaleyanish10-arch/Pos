package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type OrgHandler struct {
	repo   *repo.OrgRepo
	branch *repo.BranchesRepo
}

func NewOrgHandler(orgRepo *repo.OrgRepo, branchRepo *repo.BranchesRepo) *OrgHandler {
	return &OrgHandler{repo: orgRepo, branch: branchRepo}
}

// Get returns the caller's organization with its branches. The org context
// middleware stamps org_id on every protected request, so this is always the
// caller's own org — no id parameter to guess.
func (h *OrgHandler) Get(c *gin.Context) {
	orgID, _ := c.Get("org_id")
	id, _ := orgID.(string)
	if id == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no organization for this account"})
		return
	}
	org, err := h.repo.Get(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}
	branches, _ := h.repo.ListBranches(c.Request.Context(), id)
	c.JSON(http.StatusOK, gin.H{"organization": org, "branches": branches})
}

// Update renames the org or changes its currency. Corporate Admin only —
// currency changes reprice every report in the org.
func (h *OrgHandler) Update(c *gin.Context) {
	orgID, _ := c.Get("org_id")
	id, _ := orgID.(string)
	var req model.UpdateOrganizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Currency != "" && !model.SupportedCurrencies[req.Currency] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported currency"})
		return
	}
	org, err := h.repo.Update(c.Request.Context(), id, req.Name, req.Currency)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update organization"})
		return
	}
	c.JSON(http.StatusOK, org)
}

// ListBranches shows the org's branches (Corporate Admin sees all of them).
func (h *OrgHandler) ListBranches(c *gin.Context) {
	orgID, _ := c.Get("org_id")
	id, _ := orgID.(string)
	branches, err := h.repo.ListBranches(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list branches"})
		return
	}
	c.JSON(http.StatusOK, branches)
}
