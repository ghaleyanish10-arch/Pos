package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

// allowedStaffRoles are the exhaustively supported RBAC roles. A staff member
// is exactly one of these — never a self-invented label.
var allowedStaffRoles = map[string]bool{
	"Cashier":          true,
	"Store Manager":    true,
	"Inventory Auditor": true,
	"Corporate Admin":  true,
}

type StaffHandler struct {
	repo     *repo.StaffRepo
	authSvc  *auth.Service
	userRepo *repo.UserRepo
}

func NewStaffHandler(r *repo.StaffRepo) *StaffHandler {
	return &StaffHandler{repo: r}
}

// SetAuthDeps injects the services needed to create PIN-login users from the
// Team screen. Optional: when not set, the legacy staff_members-only flow runs.
func (h *StaffHandler) SetAuthDeps(svc *auth.Service, userRepo *repo.UserRepo) {
	h.authSvc = svc
	h.userRepo = userRepo
}

func (h *StaffHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	members, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *StaffHandler) Create(c *gin.Context) {
	var req model.CreateStaffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Role = strings.TrimSpace(req.Role)
	if req.Name == "" || req.Role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and role are required"})
		return
	}
	if !allowedStaffRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported role — pick Cashier, Store Manager, Inventory Auditor or Corporate Admin"})
		return
	}

	branchID, _ := c.Get("branch_id")
	branch := ""
	if b, ok := branchID.(string); ok {
		branch = b
	}

	// A staff PIN upgrades the row into a real users account so the person can
	// clock in at a terminal. Without a PIN we keep the legacy staff_members
	// record (roster-only, no login).
	userID := ""
	if req.Pin != "" {
		if h.authSvc == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "pin provisioning is not configured"})
			return
		}
		id, err := h.authSvc.CreatePINUser(c.Request.Context(), req.Name, req.Email, req.Role, branch, req.Pin)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "pin") {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			}
			return
		}
		userID = id
	}

	member := &model.StaffMember{
		Name:     req.Name,
		Role:     req.Role,
		BranchID: strPtrOrNil(branch),
	}

	if err := h.repo.Create(c.Request.Context(), member); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	message := member.Name + " added as " + member.Role
	if userID != "" {
		message += " — PIN clock-in enabled"
	}

	c.JSON(http.StatusCreated, gin.H{
		"member":  member,
		"user_id": userID,
		"message": message,
	})
}

func (h *StaffHandler) Update(c *gin.Context) {
	var req model.CreateStaffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Role = strings.TrimSpace(req.Role)
	if req.Name == "" && req.Role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name or role is required"})
		return
	}
	if req.Role != "" && !allowedStaffRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported role — pick Cashier, Store Manager, Inventory Auditor or Corporate Admin"})
		return
	}

	ctx := c.Request.Context()
	current, err := h.repo.Get(ctx, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff member not found"})
		return
	}

	if err := h.repo.Update(ctx, c.Param("id"), req.Name, req.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Keep the PIN login (users row) in sync so the change of role actually
	// takes effect on the next log-in, not just in the roster.
	if h.userRepo != nil {
		if serr := h.userRepo.SyncStaffByName(ctx, current.Name, req.Name, req.Role); serr != nil {
			ginLog("staff role sync failed: " + serr.Error())
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "staff updated"})
}

func (h *StaffHandler) ListShifts(c *gin.Context) {
	branchID := c.Query("branch_id")

	shifts, err := h.repo.ListShifts(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": shifts})
}

func (h *StaffHandler) CreateShift(c *gin.Context) {
	var req model.CreateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	shift := &model.Shift{
		StaffID:   req.StaffID,
		Day:       req.Day,
		StartTime: req.StartTime,
		EndTime:   req.EndTime,
		Role:      req.Role,
		BranchID:  strPtr(branchID.(string)),
	}

	if err := h.repo.CreateShift(c.Request.Context(), shift); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, shift)
}

func (h *StaffHandler) UpdateShift(c *gin.Context) {
	var req model.UpdateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateShift(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "shift updated"})
}

func (h *StaffHandler) DeleteShift(c *gin.Context) {
	if err := h.repo.DeleteShift(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "shift deleted"})
}
