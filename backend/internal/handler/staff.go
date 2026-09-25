package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

// rbacRoles are the four privileged roles that gate route access via
// RequireRole on JWTs. New accounts — which can include PIN-created logins —
// may only be minted with one of these; a role a person cannot actually log
// in under must never be stamped on a fresh users row.
var rbacRoles = map[string]bool{
	"Cashier":           true,
	"Store Manager":     true,
	"Inventory Auditor": true,
	"Corporate Admin":   true,
}

// allowedStaffRoles are the supported roster roles. The four privileged roles
// gate terminal access via the users table (RequireRole on JWTs); the rest are
// legacy/display roles the roster and shifts screens already use — real rows
// exist with these labels, so PROFILE UPDATES must never reject them. Creation
// stays strict (rbacRoles); only editing an existing legacy profile may keep a
// legacy label.
var allowedStaffRoles = map[string]bool{
	"Cashier":           true,
	"Store Manager":     true,
	"Inventory Auditor": true,
	"Corporate Admin":   true,
	"Service":           true,
	"Waiter":            true,
	"Kitchen":           true,
	"Bar":               true,
	"Host":              true,
}

type StaffHandler struct {
	repo     *repo.StaffRepo
	authSvc  *auth.Service
	userRepo *repo.UserRepo
}

func NewStaffHandler(r *repo.StaffRepo) *StaffHandler {
	return &StaffHandler{repo: r}
}

// branchIDFromCtx returns the caller's branch from the validated JWT (set by
// AuthMiddleware), never from a client-controlled query string. An account
// with no branch yields "" so the repos scope to branch-less rows instead of
// the whole table.
func branchIDFromCtx(c *gin.Context) string {
	branchID, _ := c.Get("branch_id")
	b, _ := branchID.(string)
	return b
}

// SetAuthDeps injects the services needed to create PIN-login users from the
// Team screen. Optional: when not set, the legacy staff_members-only flow runs.
func (h *StaffHandler) SetAuthDeps(svc *auth.Service, userRepo *repo.UserRepo) {
	h.authSvc = svc
	h.userRepo = userRepo
}

func (h *StaffHandler) List(c *gin.Context) {
	branchID := branchIDFromCtx(c)

	members, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": members})
}

// ListDeactivated is the explicit "show deactivated staff" view the Team
// screen's deactivated section reads from. Everything else (Team roster,
// payroll rates) must use the active-only List.
func (h *StaffHandler) ListDeactivated(c *gin.Context) {
	branchID := branchIDFromCtx(c)

	members, err := h.repo.ListDeactivated(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": members})
}

// Deactivate stamps deactivated_at on a staff member: they vanish from the
// active roster and the payroll rate list, but their row (shift/payroll
// history) survives. Router-gated Store-Manager-and-up.
func (h *StaffHandler) Deactivate(c *gin.Context) {
	ctx := c.Request.Context()
	id := strings.TrimSpace(c.Param("id"))
	if !validUUID(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid staff member id"})
		return
	}
	if err := h.repo.Deactivate(ctx, id); err != nil {
		if errors.Is(err, repo.ErrStaffNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "staff member deactivated"})
}

// Reactivate clears deactivated_at. Router-gated Store-Manager-and-up.
func (h *StaffHandler) Reactivate(c *gin.Context) {
	ctx := c.Request.Context()
	id := strings.TrimSpace(c.Param("id"))
	if !validUUID(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid staff member id"})
		return
	}
	if err := h.repo.Reactivate(ctx, id); err != nil {
		if errors.Is(err, repo.ErrStaffNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "staff member reactivated"})
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
	if !rbacRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported role — pick Cashier, Store Manager, Inventory Auditor or Corporate Admin"})
		return
	}

	branch := branchIDFromCtx(c)

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
		if errors.Is(err, repo.ErrStaffNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
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
	branchID := branchIDFromCtx(c)

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
