package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/model"
)

// switchableRoles maps a requested frontend role to the DB role that backs it.
// "admin" is what the UI calls the boss realm — it maps to the Corporate Admin
// account role, so an owner can reach both the admin dashboard and every
// staff-level view from one login.
var switchableRoles = map[string]string{
	"kitchen": "Kitchen",
	"cashier": "Cashier",
	"manager": "Store Manager",
	"admin":   "Corporate Admin",
}

// SwitchRole implements "same login, different hat": a logged-in staff member
// re-enters THEIR OWN PIN to re-mint their session as another role. The PIN
// is the same one clock-in uses (never the login password), verified through
// the exact same LoadPIN / lockout / audit path — no second PIN-check
// implementation. Authorization is identity, not elevation: you may only
// switch into roles backed by your own DB role (a Cashier session cannot mint
// itself a Manager hat), so the switch never grants authority the account
// does not hold.
func (h *ClockInHandler) SwitchRole(c *gin.Context) {
	var req model.SwitchRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role and pin are required"})
		return
	}

	dbRole, ok := switchableRoles[req.Role]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown role — pick kitchen, cashier, manager or admin"})
		return
	}

	callerID := c.GetString("user_id")
	if callerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no session"})
		return
	}

	status, err := h.repo.LoadPIN(c.Request.Context(), callerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			h.clockAudit(c, "", "", "", "role-switch.failed",
				"role switch failed: unknown account", map[string]any{"role": req.Role})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or staff member"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "role switch lookup failed"})
		return
	}

	// A Google-signed-up owner has no PIN (and no password to verify one
	// against). Answer 409 so the modal offers first-time PIN creation
	// instead of counting failed attempts the user can never get right.
	if status.PINHash == nil {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "pin.missing",
			"role switch attempt on account without a PIN", map[string]any{"flow": "role-switch"})
		c.JSON(http.StatusConflict, gin.H{
			"error": "No PIN is set for your account yet. Create one to continue.",
			"code":  "NO_PIN_SET",
		})
		return
	}

	base := map[string]any{"user_id": status.UserID, "name": status.Name, "role": status.Role, "target_role": dbRole}

	if isLocked(status) {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "role-switch.locked",
			"role switch attempt while PIN locked", base)
		c.JSON(http.StatusLocked, gin.H{
			"error":        "PIN locked — too many failed attempts. Ask the boss to reset it.",
			"locked_until": status.LockedUntil,
		})
		return
	}

	if !auth.VerifyPIN(status.PINHash, req.PIN) {
		pinFailure(c, h.repo, h.clockAudit,		status, base, "role-switch")
		return
	}

	// Correct PIN proves identity. Authority check: the requested role must
	// be backed by an account role the caller actually holds. An account can
	// always keep its own realm; anything beyond that is denied 403 with no
	// lockout (the PIN was right — this was a permission boundary, not a
	// brute-force attempt).
	if !callerHoldsRole(status.Role, dbRole) {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "role-switch.forbidden",
			"role switch denied: account role "+status.Role+" cannot act as "+dbRole, base)
		c.JSON(http.StatusForbidden, gin.H{
			"error": "your account cannot act as that role",
			"code":  "ROLE_SWITCH_FORBIDDEN",
		})
		return
	}

	if serr := h.repo.ResetFailures(c.Request.Context(), status.UserID); serr != nil {
		ginLog("role switch pin reset failed: " + serr.Error())
	}

	// Same shift-length session as clock-in, just worn as a different role.
	token, expiresAt, terr := auth.GenerateSessionToken(status.UserID, status.Email, dbRole, status.BranchID, h.config.JWTSecret, h.config.ShiftTTL)
	if terr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue session token"})
		return
	}

	h.clockAudit(c, status.UserID, status.Name, status.Role, "role-switch.success",
		"session switched to "+dbRole+" after PIN re-entry", base)

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":        status.UserID,
			"name":      status.Name,
			"email":     status.Email,
			"role":      dbRole,
			"branch_id": status.BranchID,
		},
		"token":      token,
		"expires_at": expiresAt,
	})
}

// SetOwnPIN lets any signed-in user create their first PIN without leaving
// the switch-role modal. Scope is deliberately narrow: it succeeds only when
// the account has NO PIN yet (a 409 otherwise — a forgotten PIN still goes
// through the boss reset, which is password-re-authenticated), it validates
// strength with the same weak-PIN blocklist as every other PIN path, and it
// is audited. A fresh Google owner walks: click role → "no PIN" 409 → pick
// a PIN → switch, with no second implementation of PIN hashing.
func (h *ClockInHandler) SetOwnPIN(c *gin.Context) {
	callerID := c.GetString("user_id")
	if callerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no session"})
		return
	}
	var req model.SetOwnPINRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PIN == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a 4–6 digit PIN is required"})
		return
	}
	if verr := auth.ValidatePIN(req.PIN); verr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": verr.Error()})
		return
	}
	status, err := h.repo.LoadPIN(c.Request.Context(), callerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "PIN lookup failed"})
		return
	}
	if status.PINHash != nil {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "pin.setown.denied",
			"first-time PIN set denied: PIN already exists", map[string]any{"user_id": status.UserID})
		c.JSON(http.StatusConflict, gin.H{
			"error": "A PIN already exists for this account. Ask the boss to reset it.",
			"code":  "PIN_ALREADY_SET",
		})
		return
	}
	if serr := h.authSvc.SetPIN(c.Request.Context(), callerID, req.PIN); serr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store PIN"})
		return
	}
	h.clockAudit(c, status.UserID, status.Name, status.Role, "pin.created",
		"first-time PIN created by the account holder", map[string]any{"user_id": status.UserID})
	c.JSON(http.StatusOK, gin.H{"message": "PIN created"})
}

// callerHoldsRole decides whether an account may wear a given DB role. It
// mirrors middleware.roleHierarchy: a Corporate Admin outranks everything, a
// Store Manager covers the manager realm, and single-role staff keep their
// own hat only.
var roleRank = map[string]int{
	"Cashier":           1,
	"Store Manager":     2,
	"Inventory Auditor": 3,
	"Corporate Admin":   4,
	"Kitchen":           1, // same tier as cashier: a working realm, not authority
}

func callerHoldsRole(accountRole, wantedRole string) bool {
	return roleRank[accountRole] >= roleRank[wantedRole]
}
